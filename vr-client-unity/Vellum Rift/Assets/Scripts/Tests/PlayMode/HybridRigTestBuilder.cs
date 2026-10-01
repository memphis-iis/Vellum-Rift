using UnityEngine;
using VellumRift.Control;

namespace VellumRift.Tests.PlayMode
{
    /// <summary>
    /// Shared Hybrid Rig hierarchy for EditMode + PlayMode fixtures (#191 / #271).
    /// Lives in PlayModeTests (all platforms) so Editor-only VellumRift.Tests can reference it.
    /// </summary>
    public static class HybridRigTestBuilder
    {
        /// <summary>
        /// Minimal Hybrid Rig matching WO-03 architecture (scene wiring / Device Simulator attach point).
        /// </summary>
        public static GameObject BuildHybridRig()
        {
            var player = new GameObject("Player");
            player.AddComponent<PlayerController>();

            var origin = new GameObject("XR Origin");
            origin.transform.SetParent(player.transform, false);

            var offset = new GameObject("Camera Offset");
            offset.transform.SetParent(origin.transform, false);

            var cameraGo = new GameObject("Main Camera");
            cameraGo.transform.SetParent(offset.transform, false);
            cameraGo.tag = "MainCamera";
            cameraGo.AddComponent<Camera>();

            var left = new GameObject("Left Controller");
            left.transform.SetParent(offset.transform, false);

            var right = new GameObject("Right Controller");
            right.transform.SetParent(offset.transform, false);

            return player;
        }
    }
}
