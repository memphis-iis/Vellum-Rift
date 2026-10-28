using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using VellumRift;

namespace VellumRift.Tests
{
    public class MultiplayerControllerTests
    {
        private readonly List<GameObject> createdObjects = new List<GameObject>();

        [TearDown]
        public void TearDown()
        {
            foreach (var obj in createdObjects)
            {
                if (obj != null)
                    Object.DestroyImmediate(obj);
            }

            createdObjects.Clear();
        }

        [Test]
        public void UpdatePlayerPositions_WithNullState_DoesNotThrow()
        {
            var controller = CreateController(out _);

            Assert.DoesNotThrow(() => controller.UpdatePlayerPositions(null));
        }

        [Test]
        public void UpdatePlayerPositions_MovesRemotePlayerToServerPosition()
        {
            var controller = CreateController(out var spawner);
            controller.Initialize("session-1", "local-player");

            var remoteObject = CreateGameObject("RemotePlayer");
            AddSpawnedPlayer(spawner, "remote-player", remoteObject);

            var state = new GameState();
            state.players.Add(new PlayerState("remote-player", "Remote")
            {
                position = new Vector3Data(0.001f, 0.002f, 0.003f),
                rotation = new Vector3Data(0f, 1f, 0f)
            });

            controller.UpdatePlayerPositions(state);

            Assert.That(remoteObject.transform.position.x, Is.EqualTo(0.001f).Within(0.0001f));
            Assert.That(remoteObject.transform.position.y, Is.EqualTo(0.002f).Within(0.0001f));
            Assert.That(remoteObject.transform.position.z, Is.EqualTo(0.003f).Within(0.0001f));
        }

        [Test]
        public void UpdatePlayerPositions_SkipsLocalPlayer()
        {
            var controller = CreateController(out var spawner);
            controller.Initialize("session-1", "local-player");

            var localObject = CreateGameObject("LocalPlayer");
            localObject.transform.position = Vector3.zero;
            AddSpawnedPlayer(spawner, "local-player", localObject);

            var state = new GameState();
            state.players.Add(new PlayerState("local-player", "Local")
            {
                position = new Vector3Data(0.001f, 0.002f, 0.003f)
            });

            controller.UpdatePlayerPositions(state);

            Assert.That(localObject.transform.position, Is.EqualTo(Vector3.zero));
        }

        private MultiplayerController CreateController(out PlayerSpawner spawner)
        {
            var manager = CreateGameObject("MultiplayerManager");
            spawner = manager.AddComponent<PlayerSpawner>();
            var controller = manager.AddComponent<MultiplayerController>();
            // Mirror production wiring (DemoSession calls SetPlayerSpawner
            // before Initialize); without it UpdatePlayerPositions early-returns
            // and the position tests never exercise the code.
            controller.SetPlayerSpawner(spawner);
            return controller;
        }

        private GameObject CreateGameObject(string name)
        {
            var obj = new GameObject(name);
            createdObjects.Add(obj);
            return obj;
        }

        private static void AddSpawnedPlayer(PlayerSpawner spawner, string playerId, GameObject playerObject)
        {
            var field = typeof(PlayerSpawner).GetField("spawnedPlayers", BindingFlags.NonPublic | BindingFlags.Instance);
            var spawnedPlayers = (Dictionary<string, GameObject>)field.GetValue(spawner);
            spawnedPlayers[playerId] = playerObject;
        }
    }
}
