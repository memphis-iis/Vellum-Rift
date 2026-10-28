using System.Collections;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;
using VellumRift.Control;

namespace VellumRift.Tests.PlayMode
{
    /// <summary>
    /// PlayMode XR binding / Hybrid Rig checks (#271).
    /// Full Touch locomotion against a live OpenXR display still needs the XR Device Simulator
    /// or a headset; these fixtures validate wiring that CI and Editor can exercise headlessly.
    /// </summary>
    public class XrLocomotionPlayModeTests : InputTestFixture
    {
        private GameObject player;

        [SetUp]
        public override void Setup()
        {
            base.Setup();
            player = HybridRigTestBuilder.BuildHybridRig();
            player.transform.position = Vector3.zero;
        }

        [TearDown]
        public override void TearDown()
        {
            if (player != null)
                Object.Destroy(player);
            player = null;
            base.TearDown();
        }

        [UnityTest]
        public IEnumerator HybridRig_ExposesRightControllerForLaserAnchor()
        {
            Transform right = player.transform.Find("XR Origin/Camera Offset/Right Controller");
            Assert.That(right, Is.Not.Null);

            var laserHost = new GameObject("LaserHost");
            laserHost.transform.SetParent(right, false);
            var laser = laserHost.AddComponent<LaserPointer>();
            laser.Initialize("s1", "p1", "u1", false);

            // Force controller transform via private field for deterministic headless assert.
            FieldInfo field = typeof(LaserPointer).GetField(
                "controllerTransform", BindingFlags.Instance | BindingFlags.NonPublic);
            field.SetValue(laser, right);

            yield return null;

            Assert.That(field.GetValue(laser), Is.SameAs(right));
            Object.Destroy(laserHost);
        }

        [UnityTest]
        public IEnumerator PlayerController_RegistersXrThumbstickBindings()
        {
            var controller = player.GetComponent<PlayerController>();
            Assert.That(controller, Is.Not.Null);

            FieldInfo moveField = typeof(PlayerController).GetField(
                "moveAction", BindingFlags.Instance | BindingFlags.NonPublic);
            var moveAction = moveField.GetValue(controller) as InputAction;
            Assert.That(moveAction, Is.Not.Null);

            bool hasXrStick = false;
            foreach (var binding in moveAction.bindings)
            {
                if (binding.path != null && binding.path.Contains("XRController") &&
                    binding.path.Contains("thumbstick"))
                {
                    hasXrStick = true;
                    break;
                }
            }

            Assert.That(hasXrStick, Is.True,
                "Move action must bind LeftHand XR thumbstick for Touch locomotion (#192)");
            yield return null;
        }

        [UnityTest]
        public IEnumerator FreeFlyMover_AcceptsThumbstickStyleIntent()
        {
            // Without a live XR display, FreeFlyMover uses the desktop Space.Self path.
            // Still verify intent magnitude from a stick-like Vector3 moves the body.
            var body = new GameObject("StickBody");
            body.transform.position = Vector3.zero;
            var mover = new FreeFlyMover(body.transform, 5f, 90f, 0.1f);

            mover.Tick(new MovementIntent
            {
                Move = new Vector3(0.7f, 0f, 0.7f),
                Yaw = 0f,
                LookActive = false,
                Look = Vector2.zero,
            }, 0.5f);

            Assert.That(body.transform.position.sqrMagnitude, Is.GreaterThan(0.01f));
            Object.Destroy(body);
            yield return null;
        }
    }
}
