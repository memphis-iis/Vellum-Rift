using UnityEngine;

namespace VellumRift.Control
{
    /// <summary>
    /// Samples hand-vs-controller tracking before other gameplay scripts, and
    /// poses the rig from the hand aim/grip while bare hands are the live source.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class XrHandRig : MonoBehaviour
    {
        private void Update()
        {
            if (!InputControlSchema.IsXrActive())
                return;

            XrTrackingSource.Tick(Time.unscaledDeltaTime);

            Transform offset = transform.Find(HybridRigBuilder.OffsetName);
            if (offset == null)
                return;
            XrTrackingSource.Pose(
                offset.Find(HybridRigBuilder.LeftName),
                offset.Find(HybridRigBuilder.RightName));
        }
    }
}
