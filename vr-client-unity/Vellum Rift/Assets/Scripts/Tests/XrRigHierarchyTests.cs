using NUnit.Framework;
using UnityEngine;
using VellumRift;
using VellumRift.Control;
using VellumRift.Tests.PlayMode;

namespace VellumRift.Tests
{
    /// <summary>
    /// EditMode coverage for Hybrid Rig hierarchy (#191 / #271) and FreeFlyMover desktop path (#192).
    /// </summary>
    public class XrRigHierarchyTests
    {
        private GameObject root;

        [TearDown]
        public void TearDown()
        {
            if (root != null)
                Object.DestroyImmediate(root);
            root = null;
        }

        [Test]
        public void HybridRig_HasCameraOffsetAndControllers()
        {
            root = HybridRigTestBuilder.BuildHybridRig();

            Transform origin = root.transform.Find("XR Origin");
            Assert.That(origin, Is.Not.Null);

            Transform offset = origin.Find("Camera Offset");
            Assert.That(offset, Is.Not.Null);

            Assert.That(offset.Find("Main Camera"), Is.Not.Null);
            Assert.That(offset.Find("Left Controller"), Is.Not.Null);
            Assert.That(offset.Find("Right Controller"), Is.Not.Null);

            Camera cam = offset.Find("Main Camera").GetComponent<Camera>();
            Assert.That(cam, Is.Not.Null);
        }

        [Test]
        public void FreeFlyMover_DesktopPath_TranslatesAlongLocalForward()
        {
            root = new GameObject("MoverBody");
            root.transform.position = Vector3.zero;
            root.transform.rotation = Quaternion.identity;

            var mover = new FreeFlyMover(root.transform, moveSpeed: 5f, yawSpeed: 90f, lookSensitivity: 0.1f);
            var intent = new MovementIntent
            {
                Move = new Vector3(0f, 0f, 1f),
                Yaw = 0f,
                LookActive = false,
                Look = Vector2.zero,
            };

            mover.Tick(intent, 1f);

            Assert.That(root.transform.position.z, Is.GreaterThan(0f));
            Assert.That(Mathf.Abs(root.transform.position.x), Is.LessThan(0.01f));
        }

        [Test]
        public void FreeFlyMover_Yaw_RotatesAroundWorldUp()
        {
            root = new GameObject("MoverBody");
            root.transform.rotation = Quaternion.identity;
            var mover = new FreeFlyMover(root.transform, 5f, yawSpeed: 90f, 0.1f);

            mover.Tick(new MovementIntent { Yaw = 1f }, 1f);

            float yaw = root.transform.eulerAngles.y;
            Assert.That(yaw, Is.EqualTo(90f).Within(0.5f));
        }

        [Test]
        public void GuideRows_Xr_JetpackIsLeftGripLookThrust_NotRightPrimary()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain("Jetpack=L-GRIP (look direction)"));
            Assert.That(joined, Does.Not.Contain("GRIP / A"));
        }
    }
}
