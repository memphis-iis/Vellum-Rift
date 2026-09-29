using System.Reflection;
using NUnit.Framework;
using UnityEngine;

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
    }
}
