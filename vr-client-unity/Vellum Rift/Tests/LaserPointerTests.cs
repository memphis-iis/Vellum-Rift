using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using VellumRift.Control;

namespace VellumRift.Tests
{
    /// <summary>
    /// EditMode coverage for #197 / #271 — LaserPointer no longer uses legacy XRI axes.
    /// </summary>
    public class LaserPointerTests
    {
        private GameObject host;
        private LaserPointer laser;

        [SetUp]
        public void SetUp()
        {
            host = new GameObject("LaserPointer (test)");
            laser = host.AddComponent<LaserPointer>();
        }

        [TearDown]
        public void TearDown()
        {
            if (host != null)
                Object.DestroyImmediate(host);
            host = null;
            laser = null;
        }

        [Test]
        public void DoesNotDeclareLegacyTriggerAxisField()
        {
            FieldInfo field = typeof(LaserPointer).GetField(
                "triggerAxis",
                BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            Assert.That(field, Is.Null,
                "Legacy Input.GetAxis(\"XRI_Right_Trigger\") field must be removed (#197)");
        }

        [Test]
        public void DeclaresModernXrTriggerActionField()
        {
            FieldInfo field = typeof(LaserPointer).GetField(
                "xrTriggerAction",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(field, Is.Not.Null);
            Assert.That(field.FieldType.Name, Is.EqualTo("InputAction"));
        }

        [Test]
        public void Initialize_SetsSessionIdentity()
        {
            laser.Initialize("space-1", "player-1", "user-1", isHost: true);
            FieldInfo session = typeof(LaserPointer).GetField(
                "sessionId", BindingFlags.Instance | BindingFlags.NonPublic);
            FieldInfo player = typeof(LaserPointer).GetField(
                "playerId", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(session.GetValue(laser), Is.EqualTo("space-1"));
            Assert.That(player.GetValue(laser), Is.EqualTo("player-1"));
        }

        [Test]
        public void ActivateAndDeactivate_TogglesBeamWithoutError()
        {
            laser.Initialize("space-1", "player-1", "user-1", isHost: false);
            Assert.DoesNotThrow(() => laser.ActivateLaser());
            Assert.DoesNotThrow(() => laser.DeactivateLaser());
        }

        [Test]
        public void TryGetAim_UsesLaserAimForward_NotGripUp()
        {
            var grip = new GameObject("Right Controller");
            grip.transform.position = new Vector3(1f, 0.5f, 0f);
            grip.transform.rotation = Quaternion.identity;

            var aim = new GameObject(HybridRigBuilder.LaserAimName);
            aim.transform.SetParent(grip.transform, false);
            aim.transform.localRotation = Quaternion.Euler(HybridRigBuilder.RightHandAimLocalEuler);

            SetPrivateField(laser, "controllerTransform", grip.transform);
            SetPrivateField(laser, "aimTransform", aim.transform);

            Vector3 expectedDir = aim.transform.forward;
            Assert.That(laser.TryGetAim(out Vector3 origin, out Vector3 dir, out Vector3 hit), Is.True);
            Assert.That(origin, Is.EqualTo(aim.transform.position));
            Assert.That(Vector3.Dot(dir.normalized, expectedDir.normalized), Is.GreaterThan(0.99f));
            // Euler(90,0,0) maps aim +Z onto grip -Y (gun-forward when handle is upright).
            Assert.That(Vector3.Dot(dir.normalized, -grip.transform.up), Is.GreaterThan(0.99f));
            Assert.That(laser.TryGetAimRay(out Ray ray), Is.True);
            Assert.That(ray.origin, Is.EqualTo(origin));

            Object.DestroyImmediate(grip);
        }

        [Test]
        public void ResolveAimDirection_PrefersAimTransform()
        {
            var grip = new GameObject("Grip");
            var aim = new GameObject("Aim");
            aim.transform.SetParent(grip.transform, false);
            aim.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);

            Vector3 dir = LaserPointer.ResolveAimDirection(aim.transform, grip.transform);
            Assert.That(dir.x, Is.GreaterThan(0.9f));
        }

        [Test]
        public void SetReceiveOnly_BlocksActivateLaser()
        {
            laser.Initialize("space-1", "player-1", "user-1", isHost: false);
            laser.SetReceiveOnly(true);
            laser.ActivateLaser();
            FieldInfo active = typeof(LaserPointer).GetField(
                "laserActive", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That((bool)active.GetValue(laser), Is.False);
        }

        [Test]
        public void ResolveBeamEnd_UsesMaxLengthWhenNoHit()
        {
            Vector3 end = LaserPointer.ResolveBeamEnd(
                Vector3.zero, Vector3.forward, maxLength: 12f);
            Assert.That(end.z, Is.EqualTo(12f).Within(0.01f));
        }

        private static void SetPrivateField(object target, string name, object value)
        {
            FieldInfo field = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
            field.SetValue(target, value);
        }
    }
}
