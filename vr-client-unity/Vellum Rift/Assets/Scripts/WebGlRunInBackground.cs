using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Keep the player looping when the browser tab/window loses focus
    /// (museum wall on a second monitor, alt-tab, dashboard iframe blur).
    /// Without this, WebGL freezes on focus loss and remotes/lasers stop updating.
    /// </summary>
    public static class WebGlRunInBackground
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Enable()
        {
            Application.runInBackground = true;
        }
    }
}
