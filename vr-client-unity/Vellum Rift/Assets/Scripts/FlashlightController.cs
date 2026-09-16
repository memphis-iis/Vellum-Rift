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
    /// FlashlightController (#244) — toggle a local spot light (L key) and sync
    /// origin/direction so other clients can render remote beams.
    /// Mirrors <see cref="LaserPointer"/> API / poll patterns.
    /// </summary>
    public class FlashlightController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform lightTransform;

        [Header("API Configuration")]
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [Tooltip("Bearer token for Bluekey SSO (attached to every request).")]
        public string authToken = "";

        [Header("Light Settings")]
        [SerializeField] private float spotAngle = 45f;
        [SerializeField] private float spotRange = 40f;
        [SerializeField] private float spotIntensity = 3.5f;
        [SerializeField] private Color spotColor = new Color(1f, 0.95f, 0.85f);

        [Header("Timing")]
        [SerializeField] private float sendInterval = 1f / 15f;
        [SerializeField] private float pollInterval = 1f / 10f;

        [Header("Runtime State")]
        [SerializeField] private string sessionId;
        [SerializeField] private string playerId;

        private bool flashlightOn;
        private float lastSendTime;
        private Coroutine pollCoroutine;
        private Light localLight;
        private readonly Dictionary<string, Light> remoteLights = new Dictionary<string, Light>();
        private readonly List<string> lightsToRemove = new List<string>();

        private void Awake()
        {
            EnsureLocalLight();
        }

        private void Start()
        {
            if (lightTransform == null)
            {
                Camera cam = Camera.main;
                if (cam != null) lightTransform = cam.transform;
            }
            EnsureLocalLight();
        }

        private void Update()
        {
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId)) return;

            // Gate on gameplay input so L while typing in chat does nothing.
            var pc = FindObjectOfType<PlayerController>();
            bool inputOk = pc == null || pc.InputEnabled;
            if (inputOk && WasTogglePressed())
            {
                if (flashlightOn) TurnOff();
                else TurnOn();
            }

            if (flashlightOn && Time.time - lastSendTime >= sendInterval)
            {
                lastSendTime = Time.time;
                StartCoroutine(SendFlashlightState(true));
            }

            UpdateLocalLightPose();
        }

        private void OnEnable()
        {
            if (pollCoroutine == null && !string.IsNullOrEmpty(sessionId))
                pollCoroutine = StartCoroutine(PollRemoteFlashlights());
        }

        private void OnDisable()
        {
            if (flashlightOn) TurnOff();
            if (pollCoroutine != null) { StopCoroutine(pollCoroutine); pollCoroutine = null; }
            foreach (var light in remoteLights.Values)
            {
                if (light != null) Destroy(light.gameObject);
            }
            remoteLights.Clear();
        }

        public void Initialize(string sessionId, string playerId)
        {
            this.sessionId = sessionId;
            this.playerId = playerId;
            if (pollCoroutine == null && gameObject.activeInHierarchy)
                pollCoroutine = StartCoroutine(PollRemoteFlashlights());
        }

        public void SetBaseUrl(string url)
        {
            if (!string.IsNullOrEmpty(url)) baseUrl = url.TrimEnd('/');
        }

        public void TurnOn()
        {
            if (flashlightOn) return;
            flashlightOn = true;
            lastSendTime = 0f;
            EnsureLocalLight();
            if (localLight != null) localLight.enabled = true;
            StartCoroutine(SendFlashlightState(true));
        }

        public void TurnOff()
        {
            if (!flashlightOn) return;
            flashlightOn = false;
            if (localLight != null) localLight.enabled = false;
            StartCoroutine(SendFlashlightState(false));
        }

        /// <summary>Stop sync and clear session binding (Lobby / Logout — gallery only).</summary>
        public void Shutdown()
        {
            if (flashlightOn) TurnOff();
            SetSimpleHudVisible(false);
            sessionId = "";
            playerId = "";
            if (pollCoroutine != null)
            {
                StopCoroutine(pollCoroutine);
                pollCoroutine = null;
            }
            foreach (var light in remoteLights.Values)
            {
                if (light != null) Destroy(light.gameObject);
            }
            remoteLights.Clear();
        }

        private bool prevLeftGrip;

        private bool WasTogglePressed()
        {
            if (Keyboard.current != null && Keyboard.current.lKey.wasPressedThisFrame)
                return true;

            var pad = Gamepad.current;
            if (pad != null && pad.buttonNorth.wasPressedThisFrame) // Y / triangle (Gamer)
                return true;

            // VR / Quest: left-hand grip edge (#244).
            bool gripNow = false;
            var leftDevices = new List<UnityEngine.XR.InputDevice>();
            UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.LeftHand, leftDevices);
            for (int i = 0; i < leftDevices.Count; i++)
            {
                if (leftDevices[i].TryGetFeatureValue(UnityEngine.XR.CommonUsages.gripButton, out bool pressed)
                    && pressed)
                {
                    gripNow = true;
                    break;
                }
            }
            bool gripEdge = gripNow && !prevLeftGrip;
            prevLeftGrip = gripNow;
            if (gripEdge) return true;

#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKeyDown(KeyCode.L)) return true;
#endif
            return false;
        }

        /// <summary>Shell / dashboard Simple Light button (#244).</summary>
        public void OnShellFlashlightToggle(string _)
        {
            if (flashlightOn) TurnOff();
            else TurnOn();
        }

        /// <summary>Optional on-screen Light button for Simple / native gallery.</summary>
        public void SetSimpleHudVisible(bool visible)
        {
            if (WebGlShellMode.UsesExternalShell)
            {
                if (simpleHudRoot != null) simpleHudRoot.SetActive(false);
                return;
            }
            EnsureSimpleHud();
            if (simpleHudRoot != null) simpleHudRoot.SetActive(visible);
        }

        private GameObject simpleHudRoot;

        private void EnsureSimpleHud()
        {
            if (simpleHudRoot != null || WebGlShellMode.UsesExternalShell) return;

            simpleHudRoot = new GameObject("FlashlightSimpleHud");
            simpleHudRoot.transform.SetParent(transform, false);
            var canvas = simpleHudRoot.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 7400;
            var scaler = simpleHudRoot.AddComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            simpleHudRoot.AddComponent<UnityEngine.UI.GraphicRaycaster>();

            var btnGo = new GameObject("LightButton");
            btnGo.transform.SetParent(simpleHudRoot.transform, false);
            var img = btnGo.AddComponent<UnityEngine.UI.Image>();
            img.color = VrTheme.WithAlpha(VrTheme.SurfaceLow, 0.92f);
            var rt = btnGo.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(0f, 0f);
            rt.pivot = new Vector2(0f, 0f);
            rt.anchoredPosition = new Vector2(16f, 16f + VrTheme.MinHitHeightPx + 12f);
            rt.sizeDelta = new Vector2(Mathf.Max(120f, VrTheme.MinHitWidthPx), VrTheme.MinHitHeightPx);

            var btn = btnGo.AddComponent<UnityEngine.UI.Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() =>
            {
                if (flashlightOn) TurnOff();
                else TurnOn();
            });

            var labelGo = new GameObject("Label");
            labelGo.transform.SetParent(btnGo.transform, false);
            var text = labelGo.AddComponent<UnityEngine.UI.Text>();
            text.text = "Light";
            text.alignment = TextAnchor.MiddleCenter;
            text.color = VrTheme.OnSurface;
            text.fontSize = 16;
            VrTheme.ApplyUiFont(text, bold: true);
            var lrt = labelGo.GetComponent<RectTransform>();
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.offsetMin = Vector2.zero;
            lrt.offsetMax = Vector2.zero;
        }

        private void EnsureLocalLight()
        {
            if (localLight != null) return;

            Transform parent = lightTransform;
            if (parent == null)
            {
                Camera cam = Camera.main;
                parent = cam != null ? cam.transform : transform;
            }

            var go = new GameObject("LocalFlashlight");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = Vector3.zero;
            go.transform.localRotation = Quaternion.identity;
            localLight = go.AddComponent<Light>();
            localLight.type = LightType.Spot;
            localLight.spotAngle = spotAngle;
            localLight.range = spotRange;
            localLight.intensity = spotIntensity;
            localLight.color = spotColor;
            localLight.enabled = false;
        }

        private void UpdateLocalLightPose()
        {
            if (!flashlightOn || localLight == null) return;
            if (lightTransform == null)
            {
                Camera cam = Camera.main;
                if (cam != null) lightTransform = cam.transform;
            }
            if (lightTransform == null) return;

            // Keep the spot parented to the camera/main transform; re-parent if needed.
            if (localLight.transform.parent != lightTransform)
            {
                localLight.transform.SetParent(lightTransform, false);
                localLight.transform.localPosition = Vector3.zero;
                localLight.transform.localRotation = Quaternion.identity;
            }
        }

        private (Vector3 origin, Vector3 direction) GetFlashlightPose()
        {
            if (lightTransform == null)
            {
                Camera cam = Camera.main;
                if (cam != null) lightTransform = cam.transform;
            }
            if (lightTransform == null)
                return (Vector3.zero, Vector3.forward);

            return (lightTransform.position, lightTransform.forward);
        }

        private IEnumerator SendFlashlightState(bool on)
        {
            if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(playerId)) yield break;

            string json;
            if (on)
            {
                var (o, d) = GetFlashlightPose();
                json =
                    $"{{\"playerId\": \"{playerId}\", \"on\": true, \"origin\": {{\"x\": {o.x:F4}, \"y\": {o.y:F4}, \"z\": {o.z:F4}}}, \"direction\": {{\"dx\": {d.x:F4}, \"dy\": {d.y:F4}, \"dz\": {d.z:F4}}}}}";
            }
            else
            {
                json = $"{{\"playerId\": \"{playerId}\", \"on\": false}}";
            }

            using (var req = new UnityWebRequest($"{baseUrl}/api/game-state/{sessionId}/flashlight", "PATCH"))
            {
                byte[] b = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(b);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                ApiAuth.ApplyTo(req);
                yield return req.SendWebRequest();
            }
        }

        private IEnumerator PollRemoteFlashlights()
        {
            while (true)
            {
                yield return new WaitForSeconds(pollInterval);
                if (string.IsNullOrEmpty(sessionId)) continue;
                using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}/flashlights"))
                {
                    req.SetRequestHeader("Accept", "application/json");
                    ApiAuth.ApplyTo(req);
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success)
                        ProcessRemoteFlashlights(req.downloadHandler.text);
                }
            }
        }

        [Serializable] private class RemoteFlashlightEntry
        {
            public string playerId;
            public string displayName;
            public RemoteFlashlightOrigin origin;
            public RemoteFlashlightDirection direction;
        }

        [Serializable] private class RemoteFlashlightOrigin { public float x; public float y; public float z; }
        [Serializable] private class RemoteFlashlightDirection { public float dx; public float dy; public float dz; }
        [Serializable] private class RemoteFlashlightList { public RemoteFlashlightEntry[] entries; }

        private void ProcessRemoteFlashlights(string json)
        {
            string wrapped = $"{{\"entries\": {json}}}";
            RemoteFlashlightList list;
            try { list = JsonUtility.FromJson<RemoteFlashlightList>(wrapped); }
            catch { return; }
            if (list?.entries == null) return;

            HashSet<string> seen = new HashSet<string>();
            foreach (var e in list.entries)
            {
                if (e == null || string.IsNullOrEmpty(e.playerId) || e.playerId == playerId) continue;
                seen.Add(e.playerId);

                if (!remoteLights.TryGetValue(e.playerId, out var light) || light == null)
                {
                    light = CreateRemoteLight(e.playerId);
                    remoteLights[e.playerId] = light;
                }

                if (e.origin != null && e.direction != null)
                {
                    Vector3 o = new Vector3(e.origin.x, e.origin.y, e.origin.z);
                    Vector3 d = new Vector3(e.direction.dx, e.direction.dy, e.direction.dz);
                    if (d.sqrMagnitude < 1e-6f) d = Vector3.forward;
                    light.transform.position = o;
                    light.transform.rotation = Quaternion.LookRotation(d.normalized);
                    light.enabled = true;
                }
            }

            lightsToRemove.Clear();
            foreach (var kvp in remoteLights)
                if (!seen.Contains(kvp.Key))
                    lightsToRemove.Add(kvp.Key);

            foreach (var k in lightsToRemove)
            {
                if (remoteLights.TryGetValue(k, out var light) && light != null)
                    Destroy(light.gameObject);
                remoteLights.Remove(k);
            }
        }

        private Light CreateRemoteLight(string remotePlayerId)
        {
            var go = new GameObject($"RemoteFlashlight_{remotePlayerId}");
            go.transform.SetParent(transform, false);
            var light = go.AddComponent<Light>();
            light.type = LightType.Spot;
            light.spotAngle = spotAngle;
            light.range = spotRange;
            light.intensity = spotIntensity * 0.85f;
            light.color = spotColor;
            light.enabled = false;
            return light;
        }
    }
}
