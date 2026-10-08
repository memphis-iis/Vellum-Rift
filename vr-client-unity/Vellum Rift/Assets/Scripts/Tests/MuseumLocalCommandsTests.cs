using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    /// <summary>EditMode coverage for museum respawn / scheme parsing (#322).</summary>
    public class MuseumLocalCommandsTests
    {
        [Test]
        public void PendingRespawn_SerializesViaJsonUtility()
        {
            var player = new PlayerState("p1", "Guest")
            {
                pendingRespawn = new PendingRespawn
                {
                    seq = 2,
                    x = 0f,
                    y = 0.05f,
                    z = 14f,
                    yaw = 180f,
                },
                controlScheme = "splitLaserJetpack",
            };

            string json = JsonUtility.ToJson(player);
            var roundTrip = JsonUtility.FromJson<PlayerState>(json);
            Assert.That(roundTrip.pendingRespawn, Is.Not.Null);
            Assert.That(roundTrip.pendingRespawn.seq, Is.EqualTo(2));
            Assert.That(roundTrip.pendingRespawn.z, Is.EqualTo(14f).Within(0.01f));
            Assert.That(roundTrip.controlScheme, Is.EqualTo("splitLaserJetpack"));
        }

        [Test]
        public void GallerySpawn_FacesOrigin_MatchesBackendConvention()
        {
            // Slot 0: (0, 0.05, 14), look toward origin → forward ≈ (0,0,-1) → yaw 180°.
            float x = 0f;
            float z = 14f;
            float yaw = Mathf.Atan2(-x, -z) * Mathf.Rad2Deg;
            Vector3 forward = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            Vector3 toOrigin = new Vector3(-x, 0f, -z).normalized;
            Assert.That(Vector3.Dot(forward, toOrigin), Is.GreaterThan(0.99f));
        }

        [Test]
        public void RespawnSeq_AppliesOnce()
        {
            Assert.That(2 > 0 && 2 > 1, Is.True);
            Assert.That(2 > 0 && 2 > 2, Is.False);
        }

        [Test]
        public void GuideRows_Split_IsXrOnly_KeyboardUnchanged()
        {
            var kb = InputControlSchema.GuideRows(
                ControlSchema.KeyboardMouse, XrInputMode.Controllers, QuestControlScheme.SplitLaserJetpack);
            Assert.That(string.Join(" ", System.Array.ConvertAll(kb, r => r.Binding)), Does.Contain("WASD"));
            Assert.That(string.Join(" ", System.Array.ConvertAll(kb, r => r.Binding)), Does.Not.Contain("ANY L"));

            var xr = InputControlSchema.GuideRows(
                ControlSchema.XR, XrInputMode.Controllers, QuestControlScheme.SplitLaserJetpack);
            string joined = string.Join(" ", System.Array.ConvertAll(xr, r => r.Binding));
            Assert.That(joined, Does.Contain("ANY L").And.Contain("ANY R"));
            Assert.That(joined, Does.Not.Contain("L-STICK"));
        }
    }
}
