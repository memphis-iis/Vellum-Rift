using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace VellumRift
{
    /// <summary>
    /// Museum wall camera director: follow guests, interrupt on laser aim,
    /// orbit pins, idle on the manuscript. Freecam input pauses the director.
    /// </summary>
    public sealed class WallCameraDirector : MonoBehaviour
    {
        public enum ShotKind
        {
            FollowPlayer,
            FollowLaser,
            OrbitArtifact,
            IdleManuscript,
        }

        [SerializeField] private float followDistance = 2.2f;
        [SerializeField] private float followHeight = 1.5f;
        [SerializeField] private float lookHeight = 1.2f;
        [SerializeField] private float dwellSeconds = 8f;
        [SerializeField] private float artifactDwellSeconds = 10f;
        [SerializeField] private float laserLookDistance = 12f;
        [SerializeField] private float smoothTime = 1.2f;
        [SerializeField] private float freecamPauseSeconds = 10f;
        [SerializeField] private float idleOrbitDegreesPerSecond = 8f;
        [SerializeField] private float idleHeight = 3.5f;
        [SerializeField] private float artifactOrbitHeight = 2.2f;
        [SerializeField] private float artifactOrbitRadius = 3.5f;
        [SerializeField] private float laserInterruptCooldown = 4f;
        [SerializeField] private float laserPollInterval = 0.35f;
        [SerializeField] private int artifactShotEveryNPlayerCuts = 3;

        private Transform cam;
        private PlayerSpawner spawner;
        private RemoteModelLoader modelLoader;
        private ArtifactManager artifactManager;
        private string localPlayerId = "";
        private string baseUrl = "";
        private string sessionId = "";

        private readonly List<Transform> followables = new List<Transform>();
        private readonly List<string> followableIds = new List<string>();
        private readonly List<Transform> orbitTargets = new List<Transform>();
        private readonly List<string> orbitIds = new List<string>();
        private readonly List<LaserAim> activeLasers = new List<LaserAim>();

        private ShotKind shot = ShotKind.IdleManuscript;
        private int playerIndex;
        private int artifactIndex;
        private int playerCutsSinceArtifact;
        private float dwellElapsed;
        private float freecamPauseLeft;
        private float cutCooldownLeft;
        private Vector3 vel;
        private float idleAngle;
        private bool running;
        private Coroutine laserPoll;

        /// <summary>Player or artifact id currently framed (empty when idle).</summary>
        public string CurrentTargetId { get; private set; } = "";

        /// <summary>Active director shot for HUD / tests.</summary>
        public ShotKind CurrentShot => shot;

        public struct LaserAim
        {
            public string playerId;
            public Vector3 origin;
            public Vector3 direction;
        }

        public static WallCameraDirector Ensure(
            Transform cameraTransform,
            PlayerSpawner playerSpawner,
            RemoteModelLoader loader,
            ArtifactManager artifacts,
            string localId,
            string apiBaseUrl,
            string session)
        {
            if (cameraTransform == null)
                return null;
            var existing = cameraTransform.GetComponent<WallCameraDirector>();
            if (existing == null)
                existing = cameraTransform.gameObject.AddComponent<WallCameraDirector>();
            existing.Configure(
                cameraTransform, playerSpawner, loader, artifacts, localId, apiBaseUrl, session);
            return existing;
        }

        public void Configure(
            Transform cameraTransform,
            PlayerSpawner playerSpawner,
            RemoteModelLoader loader,
            ArtifactManager artifacts,
            string localId,
            string apiBaseUrl,
            string session)
        {
            cam = cameraTransform;
            spawner = playerSpawner;
            modelLoader = loader;
            artifactManager = artifacts;
            localPlayerId = localId ?? "";
            baseUrl = string.IsNullOrEmpty(apiBaseUrl) ? "" : apiBaseUrl.TrimEnd('/');
            sessionId = session ?? "";
            running = true;
            dwellElapsed = 0f;
            freecamPauseLeft = 0f;
            cutCooldownLeft = 0f;
            playerIndex = 0;
            artifactIndex = 0;
            playerCutsSinceArtifact = 0;
            CurrentTargetId = "";
            shot = ShotKind.IdleManuscript;

            if (laserPoll != null)
                StopCoroutine(laserPoll);
            if (!string.IsNullOrEmpty(baseUrl) && !string.IsNullOrEmpty(sessionId) && gameObject.activeInHierarchy)
                laserPoll = StartCoroutine(PollLasersLoop());
        }

        private void OnDisable()
        {
            if (laserPoll != null)
            {
                StopCoroutine(laserPoll);
                laserPoll = null;
            }
        }

        /// <summary>Pure helper for tests: pick next followable index.</summary>
        public static int NextIndex(int current, int count)
        {
            if (count <= 0) return 0;
            return (current + 1) % count;
        }

        /// <summary>True when the director should idle on the manuscript.</summary>
        public static bool ShouldIdle(int followableCount) => followableCount <= 0;

        /// <summary>Pick the preferred shot from live signals (tests + runtime).</summary>
        public static ShotKind PickShot(
            bool hasActiveLaser,
            int followableCount,
            int artifactCount,
            bool dueForArtifactOrbit)
        {
            if (hasActiveLaser) return ShotKind.FollowLaser;
            if (followableCount <= 0 && artifactCount <= 0) return ShotKind.IdleManuscript;
            if (followableCount <= 0) return ShotKind.OrbitArtifact;
            if (dueForArtifactOrbit && artifactCount > 0) return ShotKind.OrbitArtifact;
            return ShotKind.FollowPlayer;
        }

        /// <summary>
        /// Whether a laser interrupt is allowed (cooldown + same-target always ok).
        /// </summary>
        public static bool CanInterruptForLaser(
            float cooldownLeft,
            string newTargetId,
            string currentTargetId,
            ShotKind currentShot)
        {
            if (string.IsNullOrEmpty(newTargetId)) return false;
            if (currentShot == ShotKind.FollowLaser
                && string.Equals(newTargetId, currentTargetId, StringComparison.Ordinal))
                return true;
            return cooldownLeft <= 0f;
        }

        private void LateUpdate()
        {
            if (!running || cam == null || !SpectatorMode.IsActive)
                return;

            if (DetectFreecamInput())
                freecamPauseLeft = freecamPauseSeconds;

            if (freecamPauseLeft > 0f)
            {
                freecamPauseLeft -= Time.unscaledDeltaTime;
                return;
            }

            if (cutCooldownLeft > 0f)
                cutCooldownLeft -= Time.unscaledDeltaTime;

            RefreshTargets();
            AdvanceShot();
            ApplyShot();
        }

        private void RefreshTargets()
        {
            if (spawner != null)
                spawner.CollectFollowables(localPlayerId, followables, followableIds);
            else
            {
                followables.Clear();
                followableIds.Clear();
            }

            if (artifactManager != null)
                artifactManager.CollectOrbitTargets(orbitTargets, orbitIds);
            else
            {
                orbitTargets.Clear();
                orbitIds.Clear();
            }
        }

        private void AdvanceShot()
        {
            LaserAim laser;
            bool hasLaser = TryPickLaser(out laser);

            bool dueArtifact = playerCutsSinceArtifact >= artifactShotEveryNPlayerCuts
                && orbitTargets.Count > 0;

            ShotKind desired = PickShot(
                hasLaser && CanInterruptForLaser(
                    cutCooldownLeft, laser.playerId, CurrentTargetId, shot),
                followables.Count,
                orbitTargets.Count,
                dueArtifact);

            // If laser interrupt blocked by cooldown, fall through without laser.
            if (desired == ShotKind.FollowLaser
                && !CanInterruptForLaser(cutCooldownLeft, laser.playerId, CurrentTargetId, shot))
            {
                desired = PickShot(false, followables.Count, orbitTargets.Count, dueArtifact);
            }

            if (desired != shot)
            {
                TransitionTo(desired, hasLaser ? laser.playerId : null);
                return;
            }

            dwellElapsed += Time.unscaledDeltaTime;
            float limit = shot == ShotKind.OrbitArtifact ? artifactDwellSeconds : dwellSeconds;
            if (shot == ShotKind.FollowLaser)
            {
                if (!hasLaser || !string.Equals(laser.playerId, CurrentTargetId, StringComparison.Ordinal))
                    TransitionTo(
                        PickShot(false, followables.Count, orbitTargets.Count, false),
                        null);
                return;
            }

            if (dwellElapsed < limit)
                return;

            if (shot == ShotKind.FollowPlayer)
            {
                playerCutsSinceArtifact++;
                playerIndex = NextIndex(playerIndex, followables.Count);
                dwellElapsed = 0f;
                if (followableIds.Count > 0)
                {
                    if (playerIndex >= followableIds.Count) playerIndex = 0;
                    CurrentTargetId = followableIds[playerIndex];
                }
                // Re-evaluate whether we should cut to an artifact next.
                if (playerCutsSinceArtifact >= artifactShotEveryNPlayerCuts && orbitTargets.Count > 0)
                    TransitionTo(ShotKind.OrbitArtifact, null);
            }
            else if (shot == ShotKind.OrbitArtifact)
            {
                artifactIndex = NextIndex(artifactIndex, orbitTargets.Count);
                dwellElapsed = 0f;
                playerCutsSinceArtifact = 0;
                TransitionTo(
                    PickShot(false, followables.Count, orbitTargets.Count, false),
                    null);
            }
        }

        private void TransitionTo(ShotKind next, string laserPlayerId)
        {
            ShotKind prev = shot;
            shot = next;
            dwellElapsed = 0f;

            if (next == ShotKind.FollowLaser && !string.IsNullOrEmpty(laserPlayerId))
            {
                CurrentTargetId = laserPlayerId;
                cutCooldownLeft = laserInterruptCooldown;
                FocusPlayerIndexById(laserPlayerId);
            }
            else if (next == ShotKind.FollowPlayer)
            {
                if (followables.Count == 0)
                {
                    shot = orbitTargets.Count > 0 ? ShotKind.OrbitArtifact : ShotKind.IdleManuscript;
                    CurrentTargetId = shot == ShotKind.OrbitArtifact && orbitIds.Count > 0
                        ? orbitIds[Mathf.Clamp(artifactIndex, 0, orbitIds.Count - 1)]
                        : "";
                    return;
                }
                if (playerIndex >= followables.Count) playerIndex = 0;
                CurrentTargetId = followableIds.Count > playerIndex ? followableIds[playerIndex] : "";
                if (prev != ShotKind.FollowPlayer)
                    cutCooldownLeft = laserInterruptCooldown;
            }
            else if (next == ShotKind.OrbitArtifact)
            {
                if (orbitTargets.Count == 0)
                {
                    shot = followables.Count > 0 ? ShotKind.FollowPlayer : ShotKind.IdleManuscript;
                    CurrentTargetId = shot == ShotKind.FollowPlayer && followableIds.Count > 0
                        ? followableIds[Mathf.Clamp(playerIndex, 0, followableIds.Count - 1)]
                        : "";
                    return;
                }
                if (artifactIndex >= orbitTargets.Count) artifactIndex = 0;
                CurrentTargetId = orbitIds.Count > artifactIndex ? orbitIds[artifactIndex] : "";
                playerCutsSinceArtifact = 0;
                cutCooldownLeft = laserInterruptCooldown;
            }
            else
            {
                CurrentTargetId = "";
            }
        }

        private void FocusPlayerIndexById(string playerId)
        {
            for (int i = 0; i < followableIds.Count; i++)
            {
                if (followableIds[i] == playerId)
                {
                    playerIndex = i;
                    return;
                }
            }
        }

        private void ApplyShot()
        {
            switch (shot)
            {
                case ShotKind.FollowLaser:
                    ApplyFollowLaser();
                    break;
                case ShotKind.FollowPlayer:
                    ApplyFollowPlayer();
                    break;
                case ShotKind.OrbitArtifact:
                    ApplyOrbitArtifact();
                    break;
                default:
                    ApplyIdleManuscript();
                    break;
            }
        }

        private void ApplyFollowPlayer()
        {
            if (followables.Count == 0)
            {
                ApplyIdleManuscript();
                return;
            }
            if (playerIndex >= followables.Count) playerIndex = 0;
            Transform target = followables[playerIndex];
            if (target == null) return;
            FrameBehind(target, lookAtPoint: null);
        }

        private void ApplyFollowLaser()
        {
            if (!TryPickLaser(out LaserAim laser))
            {
                ApplyFollowPlayer();
                return;
            }

            Transform body = null;
            if (spawner != null)
            {
                var go = spawner.GetPlayerObject(laser.playerId);
                if (go != null) body = go.transform;
            }

            Vector3 lookPoint = laser.origin + laser.direction.normalized * laserLookDistance;
            if (body != null)
                FrameBehind(body, lookPoint);
            else
            {
                Vector3 desiredPos = laser.origin - laser.direction.normalized * followDistance
                    + Vector3.up * followHeight;
                cam.position = Vector3.SmoothDamp(cam.position, desiredPos, ref vel, smoothTime);
                Vector3 to = lookPoint - cam.position;
                if (to.sqrMagnitude > 0.001f)
                {
                    Quaternion desiredRot = Quaternion.LookRotation(to.normalized, Vector3.up);
                    cam.rotation = Quaternion.Slerp(
                        cam.rotation, desiredRot, 1f - Mathf.Exp(-3f * Time.unscaledDeltaTime));
                }
            }
        }

        private void ApplyOrbitArtifact()
        {
            if (orbitTargets.Count == 0)
            {
                ApplyIdleManuscript();
                return;
            }
            if (artifactIndex >= orbitTargets.Count) artifactIndex = 0;
            Transform target = orbitTargets[artifactIndex];
            if (target == null)
            {
                ApplyIdleManuscript();
                return;
            }

            idleAngle += idleOrbitDegreesPerSecond * Time.unscaledDeltaTime;
            float rad = idleAngle * Mathf.Deg2Rad;
            Vector3 center = target.position;
            Vector3 desiredPos = center
                + new Vector3(Mathf.Sin(rad) * artifactOrbitRadius, artifactOrbitHeight, Mathf.Cos(rad) * artifactOrbitRadius);
            cam.position = Vector3.SmoothDamp(cam.position, desiredPos, ref vel, smoothTime);
            Vector3 to = center - cam.position;
            if (to.sqrMagnitude > 0.001f)
            {
                Quaternion desiredRot = Quaternion.LookRotation(to.normalized, Vector3.up);
                cam.rotation = Quaternion.Slerp(
                    cam.rotation, desiredRot, 1f - Mathf.Exp(-2f * Time.unscaledDeltaTime));
            }
        }

        private void FrameBehind(Transform target, Vector3? lookAtPoint)
        {
            Vector3 flatFwd = Vector3.ProjectOnPlane(target.forward, Vector3.up);
            if (flatFwd.sqrMagnitude < 0.001f)
                flatFwd = Vector3.forward;
            flatFwd.Normalize();

            Vector3 desiredPos = target.position - flatFwd * followDistance + Vector3.up * followHeight;
            Vector3 lookAt = lookAtPoint ?? (target.position + Vector3.up * lookHeight);
            cam.position = Vector3.SmoothDamp(cam.position, desiredPos, ref vel, smoothTime);
            Quaternion desiredRot = Quaternion.LookRotation((lookAt - cam.position).normalized, Vector3.up);
            cam.rotation = Quaternion.Slerp(cam.rotation, desiredRot, 1f - Mathf.Exp(-3f * Time.unscaledDeltaTime));
        }

        private void ApplyIdleManuscript()
        {
            Bounds bounds = new Bounds(Vector3.zero, new Vector3(4f, 2f, 4f));
            if (modelLoader != null && modelLoader.TryGetWorldBounds(out Bounds b))
                bounds = b;

            float radius = Mathf.Max(6f, bounds.extents.magnitude + 6f);
            idleAngle += idleOrbitDegreesPerSecond * Time.unscaledDeltaTime;
            float rad = idleAngle * Mathf.Deg2Rad;
            Vector3 center = bounds.center;
            Vector3 desiredPos = center
                + new Vector3(Mathf.Sin(rad) * radius, idleHeight, Mathf.Cos(rad) * radius);
            cam.position = Vector3.SmoothDamp(cam.position, desiredPos, ref vel, smoothTime);
            Vector3 to = center - cam.position;
            if (to.sqrMagnitude > 0.001f)
            {
                Quaternion desiredRot = Quaternion.LookRotation(to.normalized, Vector3.up);
                cam.rotation = Quaternion.Slerp(
                    cam.rotation, desiredRot, 1f - Mathf.Exp(-2f * Time.unscaledDeltaTime));
            }
        }

        private bool TryPickLaser(out LaserAim laser)
        {
            laser = default;
            if (activeLasers.Count == 0) return false;
            // Prefer the laser that matches current target, else first.
            for (int i = 0; i < activeLasers.Count; i++)
            {
                if (!string.IsNullOrEmpty(CurrentTargetId)
                    && activeLasers[i].playerId == CurrentTargetId)
                {
                    laser = activeLasers[i];
                    return true;
                }
            }
            laser = activeLasers[0];
            return !string.IsNullOrEmpty(laser.playerId);
        }

        private IEnumerator PollLasersLoop()
        {
            while (true)
            {
                yield return new WaitForSecondsRealtime(laserPollInterval);
                if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(baseUrl))
                    continue;
                using (var req = UnityWebRequest.Get($"{baseUrl}/api/game-state/{sessionId}/lasers"))
                {
                    req.SetRequestHeader("Accept", "application/json");
                    ApiAuth.ApplyTo(req);
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success)
                        ProcessLasers(req.downloadHandler.text);
                }
            }
        }

        [Serializable] private class RemoteLaserEntry
        {
            public string userId;
            public bool active;
            public RemoteLaserOrigin origin;
            public RemoteLaserDirection direction;
        }
        [Serializable] private class RemoteLaserOrigin { public float x; public float y; public float z; }
        [Serializable] private class RemoteLaserDirection { public float dx; public float dy; public float dz; }
        [Serializable] private class RemoteLaserList { public RemoteLaserEntry[] entries; }

        private void ProcessLasers(string json)
        {
            activeLasers.Clear();
            if (string.IsNullOrEmpty(json)) return;
            string wrapped = $"{{\"entries\": {json}}}";
            RemoteLaserList list;
            try { list = JsonUtility.FromJson<RemoteLaserList>(wrapped); }
            catch { return; }
            if (list?.entries == null) return;

            foreach (var e in list.entries)
            {
                if (e == null || string.IsNullOrEmpty(e.userId)) continue;
                if (!string.IsNullOrEmpty(localPlayerId) && e.userId == localPlayerId) continue;
                if (e.origin == null || e.direction == null) continue;
                Vector3 dir = new Vector3(e.direction.dx, e.direction.dy, e.direction.dz);
                if (dir.sqrMagnitude < 0.0001f) continue;
                activeLasers.Add(new LaserAim
                {
                    playerId = e.userId,
                    origin = new Vector3(e.origin.x, e.origin.y, e.origin.z),
                    direction = dir.normalized,
                });
            }
        }

        /// <summary>Test hook: inject active lasers without HTTP.</summary>
        public void SetActiveLasersForTests(IList<LaserAim> lasers)
        {
            activeLasers.Clear();
            if (lasers == null) return;
            for (int i = 0; i < lasers.Count; i++)
                activeLasers.Add(lasers[i]);
        }

        private static bool DetectFreecamInput()
        {
            if (UnityEngine.InputSystem.Keyboard.current != null)
            {
                var kb = UnityEngine.InputSystem.Keyboard.current;
                if (kb.wKey.isPressed || kb.aKey.isPressed || kb.sKey.isPressed || kb.dKey.isPressed
                    || kb.qKey.isPressed || kb.eKey.isPressed)
                    return true;
            }
            if (UnityEngine.InputSystem.Mouse.current != null
                && UnityEngine.InputSystem.Mouse.current.rightButton.isPressed
                && UnityEngine.InputSystem.Mouse.current.delta.ReadValue().sqrMagnitude > 0.01f)
                return true;
            return false;
        }
    }
}
