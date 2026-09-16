using System.Runtime.InteropServices;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Dashboard embed → Unity player actions (respawn, control layout).
    /// </summary>
    public static class ShellPlayerBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void RegisterPlayerHandoffTarget(string gameObjectName);
#endif

        public static void RegisterTarget(string gameObjectName)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RegisterPlayerHandoffTarget(gameObjectName);
#endif
        }
    }
}
