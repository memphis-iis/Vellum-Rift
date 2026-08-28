using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// WebGL shell / dashboard embed pin naming bridge (#163).
    /// </summary>
    public static class ShellPinBridge
    {
        public enum PinNameMode
        {
            Place,
            Rename,
        }

        [Serializable]
        private class PinRequestPayload
        {
            public string mode;
            public float x;
            public float y;
            public float z;
            public string artifactId;
            public string currentLabel;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void RequestShellPinName(string json);

        [DllImport("__Internal")]
        private static extern void RegisterPinHandoffTarget(string gameObjectName);
#endif

        public static void RegisterTarget(string gameObjectName)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RegisterPinHandoffTarget(gameObjectName);
#endif
        }

        public static bool TryRequestPinName(
            PinNameMode mode,
            Vector3 worldPosition,
            string artifactId,
            string currentLabel)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!WebGlShellMode.UsesExternalShell)
                return false;

            string json = JsonUtility.ToJson(new PinRequestPayload
            {
                mode = mode == PinNameMode.Rename ? "rename" : "place",
                x = worldPosition.x,
                y = worldPosition.y,
                z = worldPosition.z,
                artifactId = artifactId ?? "",
                currentLabel = currentLabel ?? "",
            });
            RequestShellPinName(json);
            return true;
#else
            return false;
#endif
        }
    }
}
