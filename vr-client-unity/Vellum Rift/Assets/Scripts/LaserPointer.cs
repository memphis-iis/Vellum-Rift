using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Networking;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// LaserPointer — Push-to-point laser pointer.
    /// Color: host=red, participants=green.
    /// </summary>
    public class LaserPointer : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform controllerTransform;
        [SerializeField] private Transform aimTransform;
        [SerializeField] private LineRenderer localBeamRenderer;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Laser Settings")]
        [SerializeField] private float beamLength = 50f;
        [SerializeField] private float beamStartWidth = 0.005f;
        [SerializeField] private float beamEndWidth = 0.005f;

        /// <summary>
        /// Hit-dot sphere diameter in meters. Deliberately small: a large sphere
        /// centred on the eyes crosses the near plane and fills the Quest view.
        /// </summary>
        private const float HitDotDiameter = 0.06f;

        [Header("Timing")]
        [SerializeField] private float sendInterval = 1f / 30f;
        [SerializeField] private float pollInterval = 1f / 10f;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string playerId;
        [SerializeField] private string userId;
        [SerializeField] private bool isHost;

        private bool laserActive;
        private float lastSendTime;
        private Coroutine pollCoroutine;
        private readonly Dictionary<string, LineRenderer> remoteBeams = new Dictionary<string, LineRenderer>();
        private readonly List<string> beamsToRemove = new List<string>();
        private Material remoteBeamMaterial;
        private GameObject hitMarker;
        private Light hitLight;
        private GameObject beamCylinder;
        private LineRenderer muzzleReticleH;
        private LineRenderer muzzleReticleV;
        private InputAction xrTriggerAction;

        private void Awake()
        {
            // Treat MeshColliders as double-sided so the laser never passes
            // through back-facing triangles on the heightmap surface.
            Physics.queriesHitBackfaces = true;

            xrTriggerAction = new InputAction("XrLaserTrigger", InputActionType.Button);
            xrTriggerAction.AddBinding("<XRController>{RightHand}/triggerPressed");
            xrTriggerAction.AddBinding("<XRController>{RightHand}/trigger");
            xrTriggerAction.AddBinding("<Mouse>/leftButton");
            xrTriggerAction.Enable();

            // Resolve shared materials up front. Nothing in Awake may throw: an
            // exception here used to abort before the hit dot and beam cylinder
            // were hidden, leaving untextured geometry — which renders as a
            // bright gold/yellow square — parked in the headset view.
            remoteBeamMaterial = VellumShaders.TryCreateLineMaterial(Color.white);

            if (localBeamRenderer == null)
            {
                localBeamRenderer = gameObject.AddComponent<LineRenderer>();
                Material beamMaterial = VellumShaders.TryCreateLineMaterial(Color.white);
                if (beamMaterial != null)
                    localBeamRenderer.material = beamMaterial;
                else
                    localBeamRenderer.enabled = false;
            }
            localBeamRenderer.positionCount = 2;
            localBeamRenderer.startWidth = beamStartWidth;
            localBeamRenderer.endWidth = beamEndWidth;
            localBeamRenderer.enabled = false;

            hitMarker = CreateHitDot(Color.red, "LocalLaserDot");
            if (hitMarker != null)
                hitMarker.SetActive(false);

            // Small point light at the end of the beam for a visible glow.
            if (hitMarker != null)
            {
                var lightObj = new GameObject("LaserHitLight");
                lightObj.transform.SetParent(hitMarker.transform, false);
                hitLight = lightObj.AddComponent<Light>();
                hitLight.type = LightType.Point;
                hitLight.range = 1f;
                hitLight.intensity = 2f;
                hitLight.color = Color.red;
            }

            // Cylinder placeholder for the laser beam itself. Only built when a
            // shader resolved, so it can never render as an untinted slab.
            Material cylinderMaterial = VellumShaders.TryCreateLineMaterial(Color.red);
            if (cylinderMaterial != null)
            {
                beamCylinder = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                beamCylinder.name = "LaserBeamCylinder";
                beamCylinder.transform.SetParent(transform, false);
                Destroy(beamCylinder.GetComponent<Collider>());
                var cylRenderer = beamCylinder.GetComponent<Renderer>();
                if (cylRenderer != null)
                    cylRenderer.sharedMaterial = cylinderMaterial;
                beamCylinder.SetActive(false);
            }
        }

        private void Start()
        {
            FindControllerAnchor();
        }

        private void FindControllerAnchor()
        {
            if (controllerTransform != null && controllerTransform != Camera.main?.transform
                && aimTransform != null)
                return;

            if (InputControlSchema.IsXrActive())
            {
                Transform aim = HybridRigBuilder.FindRightLaserAim();
                if (aim != null)
                {
                    aimTransform = aim;
                    controllerTransform = aim.parent;
                    EnsureMuzzleReticle();
                    return;
                }

                var candidates = FindObjectsByType<Transform>(FindObjectsSortMode.None);
                foreach (var t in candidates)
                {
                    if (t.name.Contains("Right") && (t.name.Contains("Controller") || t.name.Contains("Hand")))
                    {
                        controllerTransform = t;
                        Transform childAim = t.Find(HybridRigBuilder.LaserAimName);
                        aimTransform = childAim != null ? childAim : t;
                        EnsureMuzzleReticle();
                        break;
                    }
                }
            }

            if (controllerTransform == null)
            {
                Camera cam = Camera.main;
                if (cam != null)
                {
                    controllerTransform = cam.transform;
                    aimTransform = cam.transform;
                }
            }
        }

        /// <summary>World-space ray axis for VR (LaserAim +Z) or desktop fallback.</summary>
        public static Vector3 ResolveAimDirection(Transform aim, Transform gripFallback)
        {
            Transform t = aim != null ? aim : gripFallback;
            return t != null ? t.forward : Vector3.forward;
        }

        public static Vector3 ResolveAimOrigin(Transform aim, Transform gripFallback)
        {
            Transform t = aim != null ? aim : gripFallback;
            return t != null ? t.position : Vector3.zero;
        }

        private void EnsureMuzzleReticle()
        {
            if (aimTransform == null || muzzleReticleH != null)
                return;
            if (!InputControlSchema.IsXrActive())
                return;

            var root = new GameObject("MuzzleReticle");
            root.transform.SetParent(aimTransform, false);
            root.transform.localPosition = Vector3.zero;
            root.transform.localRotation = Quaternion.identity;

            const float arm = 0.012f;
            const float w = 0.0015f;
            muzzleReticleH = CreateReticleArm(root.transform, "H", arm, w);
            muzzleReticleV = CreateReticleArm(root.transform, "V", arm, w, vertical: true);
        }

        private LineRenderer CreateReticleArm(Transform parent, string name, float halfLen, float width, bool vertical = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var lr = go.AddComponent<LineRenderer>();
            Material mat = VellumShaders.TryCreateLineMaterial(new Color(0.7f, 0.95f, 1f, 0.95f));
            if (mat != null)
                lr.material = mat;
            lr.useWorldSpace = false;
            lr.positionCount = 2;
            lr.startWidth = width;
            lr.endWidth = width;
            Vector3 a = vertical ? new Vector3(0f, -halfLen, 0f) : new Vector3(-halfLen, 0f, 0f);
            Vector3 b = vertical ? new Vector3(0f, halfLen, 0f) : new Vector3(halfLen, 0f, 0f);
            lr.SetPosition(0, a);
            lr.SetPosition(1, b);
            return lr;
        }

        private void Update()
        {
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId)) return;

            if (controllerTransform == null || controllerTransform == Camera.main?.transform)
            {
                if (InputControlSchema.IsXrActive()) FindControllerAnchor();
            }

            bool isVR = controllerTransform != null && controllerTransform != Camera.main?.transform;
            if (isVR)
            {
                bool shouldActivate = xrTriggerAction != null && xrTriggerAction.IsPressed();
                if (shouldActivate && !laserActive) ActivateLaser();
                else if (!shouldActivate && laserActive) DeactivateLaser();
            }

            if (laserActive && Time.time - lastSendTime >= sendInterval)
            {
                lastSendTime = Time.time;
                StartCoroutine(SendLaserState());
            }
            UpdateLocalBeam();
        }

        private void OnEnable() { if (pollCoroutine == null && !string.IsNullOrEmpty(sessionId)) pollCoroutine = StartCoroutine(PollRemoteLasers()); }
        private void OnDisable()
        {
            if (laserActive) DeactivateLaser();
            if (pollCoroutine != null) { StopCoroutine(pollCoroutine); pollCoroutine = null; }
            foreach (var b in remoteBeams.Values) { if (b != null) Destroy(b.gameObject); }
            remoteBeams.Clear();
        }
        private void OnDestroy()
        {
            if (xrTriggerAction != null) { xrTriggerAction.Disable(); xrTriggerAction.Dispose(); }
            if (remoteBeamMaterial != null) { Destroy(remoteBeamMaterial); remoteBeamMaterial = null; }
        }

        public void Initialize(string sessionId, string playerId, string userId, bool isHost)
        {
            this.sessionId = sessionId; this.playerId = playerId; this.userId = userId; this.isHost = isHost;
            if (localBeamRenderer != null) { localBeamRenderer.startColor = isHost ? Color.red : Color.green; localBeamRenderer.endColor = isHost ? Color.red : Color.green; }
            if (pollCoroutine == null && gameObject.activeInHierarchy) pollCoroutine = StartCoroutine(PollRemoteLasers());
        }

        public void SetHost(bool host) { isHost = host; if (localBeamRenderer != null) { localBeamRenderer.startColor = host ? Color.red : Color.green; localBeamRenderer.endColor = host ? Color.red : Color.green; } }
        public void SetBaseUrl(string url) { if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/'); }

        public void ActivateLaser()
        {
            if (laserActive) return;
            laserActive = true;
            lastSendTime = 0f;
            if (localBeamRenderer != null) localBeamRenderer.enabled = true;
            var beamColor = isHost ? Color.red : Color.green;
            if (hitMarker != null) { hitMarker.SetActive(true); UpdateHitDotColor(hitMarker, beamColor); }
            if (hitLight != null) hitLight.color = beamColor;
            if (beamCylinder != null && !InputControlSchema.IsXrActive())
            {
                beamCylinder.SetActive(true);
                var cylRenderer = beamCylinder.GetComponent<Renderer>();
                if (cylRenderer != null) cylRenderer.material.color = beamColor;
            }
            StartCoroutine(SendLaserState());
        }

        public void DeactivateLaser()
        {
            if (!laserActive) return;
            laserActive = false;
            if (localBeamRenderer != null) localBeamRenderer.enabled = false;
            if (hitMarker != null) hitMarker.SetActive(false);
            if (beamCylinder != null) beamCylinder.SetActive(false);
            StartCoroutine(SendDeactivate());
        }

        private (Vector3 origin, Vector3 direction, Vector3 hitPoint) GetLaserOrigin()
        {
            if (controllerTransform == null) return (Vector3.zero, Vector3.forward, Vector3.forward * beamLength);

            Camera cam = controllerTransform.GetComponent<Camera>();
            if (cam != null)
            {
                Vector3 viewportOrigin = new Vector3(0.85f, 0.15f, 0.5f);
                Vector3 worldOrigin = cam.ViewportToWorldPoint(viewportOrigin);
                Vector2 mousePos = Mouse.current?.position.ReadValue() ?? Vector2.zero;
                Ray mouseRay = cam.ScreenPointToRay(new Vector3(mousePos.x, mousePos.y, 0f));
                Vector3 aimDir = mouseRay.direction;

                // Raycast to find where the laser hits the model
                if (Physics.Raycast(worldOrigin, aimDir, out RaycastHit hit, beamLength))
                {
                    return (worldOrigin, aimDir, hit.point);
                }

                return (worldOrigin, aimDir, worldOrigin + aimDir * beamLength);
            }

            Vector3 fwd = ResolveAimDirection(aimTransform, controllerTransform);
            Vector3 pos = ResolveAimOrigin(aimTransform, controllerTransform);
            if (Physics.Raycast(pos, fwd, out RaycastHit vrHit, beamLength))
            {
                return (pos, fwd, vrHit.point);
            }
            return (pos, fwd, pos + fwd * beamLength);
        }

        /// <summary>
        /// Current laser aim origin, direction, and hit (or end-of-beam) point (#287).
        /// </summary>
        public bool TryGetAim(out Vector3 origin, out Vector3 direction, out Vector3 hitPoint)
        {
            origin = Vector3.zero;
            direction = Vector3.forward;
            hitPoint = Vector3.forward * beamLength;
            if (controllerTransform == null)
            {
                FindControllerAnchor();
                if (controllerTransform == null) return false;
            }
            (origin, direction, hitPoint) = GetLaserOrigin();
            return true;
        }

        /// <summary>Aim ray for pin select/delete along the laser (#287).</summary>
        public bool TryGetAimRay(out Ray ray)
        {
            ray = default;
            if (!TryGetAim(out Vector3 origin, out Vector3 direction, out _))
                return false;
            ray = new Ray(origin, direction);
            return true;
        }

        private void UpdateLocalBeam()
        {
            if (!laserActive || localBeamRenderer == null || controllerTransform == null) return;
            var (o, d, hitPoint) = GetLaserOrigin();
            if (localBeamRenderer != null)
            {
                localBeamRenderer.SetPosition(0, o);
                localBeamRenderer.SetPosition(1, hitPoint);
            }

            if (hitMarker != null && hitMarker.activeSelf)
            {
                hitMarker.transform.position = hitPoint;
                hitMarker.transform.localScale = Vector3.one * HitDotDiameter;
            }

            // Desktop-only cylinder; Quest uses the line renderer (phaser beam).
            if (beamCylinder != null && beamCylinder.activeSelf)
            {
                float length = Vector3.Distance(o, hitPoint);
                Vector3 midPoint = (o + hitPoint) * 0.5f;
                beamCylinder.transform.position = midPoint;
                beamCylinder.transform.rotation =
                    Quaternion.FromToRotation(Vector3.up, (hitPoint - o).normalized);
                // Cylinder default height = 2, radius = 0.5. Scale to a thin rod:
                beamCylinder.transform.localScale =
                    new Vector3(beamStartWidth * 3f, length * 0.5f, beamStartWidth * 3f);
            }

        }

        private IEnumerator SendLaserState()
        {
            if (controllerTransform == null) yield break;
            var (o, d, _) = GetLaserOrigin();
            string json = $"{{\"playerId\": \"{playerId}\", \"active\": true, \"origin\": {{\"x\": {o.x:F4}, \"y\": {o.y:F4}, \"z\": {o.z:F4}}}, \"direction\": {{\"dx\": {d.x:F4}, \"dy\": {d.y:F4}, \"dz\": {d.z:F4}}}}}";
            using (var req = new UnityWebRequest($"{baseUrl}/api/game-state/{sessionId}/laser", "PATCH"))
            {
                byte[] b = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
            }
        }

        private IEnumerator SendDeactivate()
        {
            string json = $"{{\"playerId\": \"{playerId}\", \"active\": false}}";
            using (var req = new UnityWebRequest($"{baseUrl}/api/game-state/{sessionId}/laser", "PATCH"))
            {
                byte[] b = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
            }
        }

        private IEnumerator PollRemoteLasers()
        {
            while (true)
            {
                yield return new WaitForSeconds(pollInterval);
                if (string.IsNullOrEmpty(sessionId)) continue;
                using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}/lasers"))
                {
                    req.SetRequestHeader("Accept", "application/json");
                    ApiAuth.ApplyTo(req);
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success)
                        ProcessRemoteLasers(req.downloadHandler.text);
                }
            }
        }

        [Serializable] private class RemoteLaserEntry { public string userId; public bool active; public RemoteLaserOrigin origin; public RemoteLaserDirection direction; public string color; }
        [Serializable] private class RemoteLaserOrigin { public float x; public float y; public float z; }
        [Serializable] private class RemoteLaserDirection { public float dx; public float dy; public float dz; }
        [Serializable] private class RemoteLaserList { public RemoteLaserEntry[] entries; }

        private void ProcessRemoteLasers(string json)
        {
            string wrapped = $"{{\"entries\": {json}}}";
            RemoteLaserList list;
            try { list = JsonUtility.FromJson<RemoteLaserList>(wrapped); }
            catch { return; }
            if (list?.entries == null) return;

            HashSet<string> seen = new HashSet<string>();
            foreach (var e in list.entries)
            {
                if (e == null || e.userId == userId) continue;
                seen.Add(e.userId);
                Color c = e.color == "red" ? Color.red : Color.green;

                if (!remoteBeams.TryGetValue(e.userId, out var beam) || beam == null)
                {
                    beam = CreateRemoteBeam(c);
                    remoteBeams[e.userId] = beam;
                }

                if (e.origin != null && e.direction != null)
                {
                    Vector3 o = new Vector3(e.origin.x, e.origin.y, e.origin.z);
                    Vector3 d = new Vector3(e.direction.dx, e.direction.dy, e.direction.dz).normalized;
                    Vector3 endPt = o + d * beamLength;
                    beam.SetPosition(0, o);
                    beam.SetPosition(1, endPt);
                    beam.enabled = true;

                    var data = beam.GetComponent<RemoteBeamData>();
                    if (data != null && data.hitDot != null)
                    {
                        data.hitDot.transform.position = endPt;
                        data.hitDot.SetActive(true);
                    }
                }
            }

            beamsToRemove.Clear();
            foreach (var kvp in remoteBeams)
                if (!seen.Contains(kvp.Key))
                    beamsToRemove.Add(kvp.Key);

            foreach (var k in beamsToRemove)
            {
                if (remoteBeams.TryGetValue(k, out var b) && b != null)
                    Destroy(b.gameObject);
                remoteBeams.Remove(k);
            }
        }

        /// <summary>
        /// Small hit dot. Returns <c>null</c> — without creating geometry — when
        /// no dot shader resolves, so a missing shader can never leave an
        /// untextured sphere sitting on the camera origin.
        /// </summary>
        private GameObject CreateHitDot(Color color, string name)
        {
            Material material = VellumShaders.TryCreateLineMaterial(color);
            if (material == null)
            {
                Debug.LogWarning($"[LaserPointer] No shader for '{name}' — hit dot skipped.");
                return null;
            }

            var dot = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            dot.name = name;
            dot.transform.SetParent(transform, false);
            // Kept under 10 cm: a large sphere centred on the eyes crosses the
            // near plane and rasterizes as a view-filling square.
            dot.transform.localScale = Vector3.one * HitDotDiameter;
            Destroy(dot.GetComponent<Collider>());
            var r = dot.GetComponent<Renderer>();
            if (r != null)
                r.sharedMaterial = material;
            dot.SetActive(false);
            return dot;
        }

        private void UpdateHitDotColor(GameObject dot, Color color)
        {
            if (dot == null) return;
            var r = dot.GetComponent<Renderer>();
            if (r != null) r.material.color = color;
        }

        private LineRenderer CreateRemoteBeam(Color c)
        {
            GameObject go = new GameObject($"RemoteLaser_{Guid.NewGuid():N}");
            go.transform.SetParent(transform, false);
            LineRenderer lr = go.AddComponent<LineRenderer>();
            lr.positionCount = 2;
            lr.startWidth = beamStartWidth * 2f;
            lr.endWidth = beamEndWidth * 2f;
            if (remoteBeamMaterial != null)
                lr.material = new Material(remoteBeamMaterial);
            lr.startColor = c;
            lr.endColor = c;
            lr.enabled = false;

            var dot = CreateHitDot(c, $"RemoteDot_{Guid.NewGuid():N}"[..16]);
            if (dot != null)
            {
                dot.transform.SetParent(go.transform, false);
                dot.SetActive(false);
            }
            var data = go.AddComponent<RemoteBeamData>();
            data.hitDot = dot;

            return lr;
        }
    }

    /// <summary>Helper to track remote beam hit dot.</summary>
    public class RemoteBeamData : MonoBehaviour
    {
        public GameObject hitDot;
    }
}