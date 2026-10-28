using System.Collections;
using UnityEngine;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// When a guest hits the hard play-space ring: fog wash → snap them back
    /// facing the manuscript → wash clears. Freezes locomotion while busy.
    /// </summary>
    public sealed class PlaySpaceLoopback : MonoBehaviour
    {
        public const float FadeOutSeconds = 0.55f;
        public const float HoldSeconds = 0.12f;
        public const float FadeInSeconds = 0.75f;

        private static PlaySpaceLoopback instance;

        public static bool IsBusy { get; private set; }

        public static PlaySpaceLoopback Ensure()
        {
            if (instance != null)
                return instance;
            var go = new GameObject("PlaySpaceLoopback");
            Object.DontDestroyOnLoad(go);
            instance = go.AddComponent<PlaySpaceLoopback>();
            return instance;
        }

        /// <summary>Begin fog loopback for <paramref name="body"/> if idle.</summary>
        public static void Request(Transform body)
        {
            if (IsBusy || body == null || !ManuscriptPlaySpace.IsConfigured)
                return;
            Ensure().StartCoroutine(Ensure().Run(body));
        }

        private IEnumerator Run(Transform body)
        {
            IsBusy = true;
            var controller = body.GetComponent<PlayerController>();
            bool prevInput = true;
            if (controller != null)
            {
                prevInput = controller.InputEnabled;
                controller.InputEnabled = false;
            }

            Debug.Log("[PlaySpaceLoopback] Edge reached — fog loopback to manuscript");
            yield return VoidFogFade.Fade(FadeOutSeconds, toOpaque: true);

            if (body != null &&
                ManuscriptPlaySpace.TryGetLoopbackPose(body.position, out Vector3 pos, out Quaternion rot))
            {
                if (controller != null)
                    controller.ApplyRespawnPose(pos, rot.eulerAngles.y);
                else
                    body.SetPositionAndRotation(pos, rot);
            }

            if (HoldSeconds > 0f)
                yield return new WaitForSecondsRealtime(HoldSeconds);

            yield return VoidFogFade.Fade(FadeInSeconds, toOpaque: false);

            if (controller != null)
                controller.InputEnabled = prevInput;

            IsBusy = false;
        }
    }
}
