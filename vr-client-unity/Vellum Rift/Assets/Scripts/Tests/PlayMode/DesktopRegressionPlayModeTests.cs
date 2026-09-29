using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;
using VellumRift.Control;

namespace VellumRift.Tests.PlayMode
{
    /// <summary>
    /// PlayMode desktop regression (#271): WASD locomotion when XR is inactive.
    /// </summary>
    public class DesktopRegressionPlayModeTests : InputTestFixture
    {
        private GameObject player;

        [SetUp]
        public override void Setup()
        {
            base.Setup();
            player = new GameObject("DesktopPlayer");
            player.tag = "MainCamera";
            player.AddComponent<Camera>();
            player.AddComponent<PlayerController>();
            player.transform.position = Vector3.zero;
            player.transform.rotation = Quaternion.identity;
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
        public IEnumerator KeyboardW_DisplacesPlayerAlongForward()
        {
            Assert.That(InputControlSchema.IsXrActive(), Is.False,
                "Desktop regression requires XR inactive");

            Vector3 start = player.transform.position;
            var keyboard = InputSystem.AddDevice<Keyboard>();

            Press(keyboard.wKey);
            yield return new WaitForSeconds(0.35f);
            Release(keyboard.wKey);
            yield return null;

            Assert.That(player.transform.position.z, Is.GreaterThan(start.z + 0.05f),
                "Holding W should move the player forward in desktop mode");
        }

        [UnityTest]
        public IEnumerator KeyboardSpace_ElevatesPlayer()
        {
            Vector3 start = player.transform.position;
            var keyboard = InputSystem.AddDevice<Keyboard>();

            Press(keyboard.spaceKey);
            yield return new WaitForSeconds(0.35f);
            Release(keyboard.spaceKey);
            yield return null;

            Assert.That(player.transform.position.y, Is.GreaterThan(start.y + 0.05f),
                "Holding Space should elevate the player");
        }
    }
}
