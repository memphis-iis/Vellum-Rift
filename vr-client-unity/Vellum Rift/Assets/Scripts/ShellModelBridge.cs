using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// WebGL shell / dashboard embed model library picker bridge (#169).
    /// </summary>
    public static class ShellModelBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void RequestShellModelPick();

        [DllImport("__Internal")]
        private static extern void RegisterModelHandoffTarget(string gameObjectName);
#endif

        public static void RegisterTarget(string gameObjectName)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RegisterModelHandoffTarget(gameObjectName);
#endif
        }

        public static bool TryRequestModelPick()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!WebGlShellMode.UsesExternalShell)
                return false;
            RequestShellModelPick();
            return true;
#else
            return false;
#endif
        }
    }
}
