using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    /// <summary>
    /// Covers sub-issue 11a (Instantiate Players): PlayerSpawner must create a
    /// visual per player, register it for lookup, and clean it up on leave.
    /// EditMode tests — no scene or networking required; the spawner falls back
    /// to a default cube when no prefab is assigned.
    /// </summary>
    public class PlayerSpawnerTests
    {
        private GameObject spawnerHost;
        private PlayerSpawner spawner;

        [SetUp]
        public void SetUp()
        {
            spawnerHost = new GameObject("PlayerSpawner (test)");
            spawner = spawnerHost.AddComponent<PlayerSpawner>();
        }

        [TearDown]
        public void TearDown()
        {
            if (spawner != null)
                spawner.RemoveAllPlayers();
            if (spawnerHost != null)
                Object.DestroyImmediate(spawnerHost);
            spawner = null;
            spawnerHost = null;
        }

        private static PlayerState Player(string id, string displayName)
        {
            return new PlayerState(id, displayName);
        }

        // ---------------------------------------------------------------
        // Spawning
        // ---------------------------------------------------------------

        [Test]
        public void SpawnPlayer_CreatesDefaultCube_WhenNoPrefabAssigned()
        {
            GameObject go = spawner.SpawnPlayer(Player("p1", "Alice"));

            Assert.That(go, Is.Not.Null);
            // Default fallback is a cube primitive.
            Assert.That(go.GetComponent<BoxCollider>(), Is.Not.Null, "expected a cube primitive when no prefab is set");
            Assert.That(spawner.IsPlayerSpawned("p1"), Is.True);
            Assert.That(spawner.GetPlayerObject("p1"), Is.SameAs(go));
            Assert.That(spawner.SpawnedCount, Is.EqualTo(1));
        }

        [Test]
        public void SpawnPlayer_IsIdempotent_ForSamePlayerId()
        {
            GameObject first = spawner.SpawnPlayer(Player("p1", "Alice"));
            GameObject second = spawner.SpawnPlayer(Player("p1", "Alice"));

            Assert.That(second, Is.SameAs(first), "second spawn should return the existing object, not a duplicate");
            Assert.That(spawner.SpawnedCount, Is.EqualTo(1));
        }

        [Test]
        public void SpawnPlayer_NullPlayer_ReturnsNull()
        {
            Assert.That(spawner.SpawnPlayer(null), Is.Null);
            Assert.That(spawner.SpawnedCount, Is.EqualTo(0));
        }

        [Test]
        public void SpawnPlayer_MissingId_ReturnsNull()
        {
            Assert.That(spawner.SpawnPlayer(new PlayerState("", "NoId")), Is.Null);
            Assert.That(spawner.SpawnedCount, Is.EqualTo(0));
        }

        [Test]
        public void SpawnPlayer_DefaultOffset_WhenNoSpawnPoints()
        {
            GameObject first = spawner.SpawnPlayer(Player("p1", "Alice"));
            GameObject second = spawner.SpawnPlayer(Player("p2", "Bob"));

            // No spawn points configured: players spread along X so they don't stack.
            Assert.That(first.transform.position, Is.EqualTo(new Vector3(0f, 0f, 0f)));
            Assert.That(second.transform.position, Is.EqualTo(new Vector3(1.5f, 0f, 0f)));
        }

        [Test]
        public void SpawnPlayer_UsesServerPosition_WhenReported()
        {
            PlayerState player = Player("p1", "Alice");
            player.position = new Vector3Data(1f, 2f, 3f);

            GameObject go = spawner.SpawnPlayer(player);

            Assert.That(go.transform.position, Is.EqualTo(new Vector3(1f, 2f, 3f)));
        }

        [Test]
        public void SpawnPlayer_UsesSpawnPoints_RoundRobin_WhenNoServerPosition()
        {
            var p0 = new GameObject("spawn0").transform;
            var p1 = new GameObject("spawn1").transform;
            p0.position = new Vector3(5f, 0f, 0f);
            p1.position = new Vector3(10f, 0f, 0f);
            spawner.SetSpawnPoints(new[] { p0, p1 });

            GameObject first = spawner.SpawnPlayer(Player("p1", "Alice"));
            GameObject second = spawner.SpawnPlayer(Player("p2", "Bob"));

            Assert.That(first.transform.position, Is.EqualTo(new Vector3(5f, 0f, 0f)));
            Assert.That(second.transform.position, Is.EqualTo(new Vector3(10f, 0f, 0f)));

            Object.DestroyImmediate(p0.gameObject);
            Object.DestroyImmediate(p1.gameObject);
        }

        [Test]
        public void SpawnPlayer_RoundRobin_ReusesFreedSpot_AfterRemoval()
        {
            var p0 = new GameObject("spawn0").transform;
            var p1 = new GameObject("spawn1").transform;
            p0.position = new Vector3(5f, 0f, 0f);
            p1.position = new Vector3(10f, 0f, 0f);
            spawner.SetSpawnPoints(new[] { p0, p1 });

            spawner.SpawnPlayer(Player("p1", "Alice")); // -> point 0
            spawner.SpawnPlayer(Player("p2", "Bob"));   // -> point 1

            spawner.RemovePlayer("p1");                 // frees point 0

            // Next spawn takes the freed point 0, not point 1 (occupied by p2).
            GameObject third = spawner.SpawnPlayer(Player("p3", "Carol"));

            Assert.That(third.transform.position, Is.EqualTo(new Vector3(5f, 0f, 0f)));

            Object.DestroyImmediate(p0.gameObject);
            Object.DestroyImmediate(p1.gameObject);
        }

        [Test]
        public void SpawnPlayer_RoundRobin_ReusesLatestFreedSlot_AfterRemoval()
        {
            var p0 = new GameObject("spawn0").transform;
            var p1 = new GameObject("spawn1").transform;
            p0.position = new Vector3(5f, 0f, 0f);
            p1.position = new Vector3(10f, 0f, 0f);
            spawner.SetSpawnPoints(new[] { p0, p1 });

            spawner.SpawnPlayer(Player("p1", "Alice")); // -> point 0
            spawner.SpawnPlayer(Player("p2", "Bob"));   // -> point 1

            spawner.RemovePlayer("p2");                 // frees point 1 (most recent)

            // Scanning from the cursor must find the freed point 1, not the
            // still-occupied point 0.
            GameObject third = spawner.SpawnPlayer(Player("p3", "Carol"));

            Assert.That(third.transform.position, Is.EqualTo(new Vector3(10f, 0f, 0f)));

            Object.DestroyImmediate(p0.gameObject);
            Object.DestroyImmediate(p1.gameObject);
        }

        [Test]
        public void SpawnPlayer_InstantiatesAssignedPrefab()
        {
            var prefab = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            prefab.name = "PlayerVisual (test prefab)";
            spawner.SetPlayerPrefab(prefab);

            GameObject go = spawner.SpawnPlayer(Player("p1", "Alice"));

            Assert.That(go, Is.Not.Null);
            Assert.That(go, Is.Not.SameAs(prefab), "should be a clone, not the prefab asset");
            Assert.That(go.GetComponent<SphereCollider>(), Is.Not.Null);
            Assert.That(go.name, Does.StartWith("Player (Alice)"));

            Object.DestroyImmediate(prefab);
        }

        [Test]
        public void SpawnPlayer_NamesObject_AfterDisplayName()
        {
            GameObject go = spawner.SpawnPlayer(Player("p1", "Alice"));
            Assert.That(go.name, Is.EqualTo("Player (Alice)"));
        }

        // ---------------------------------------------------------------
        // Removal
        // ---------------------------------------------------------------

        [Test]
        public void RemovePlayer_DestroysAndUnregisters()
        {
            GameObject go = spawner.SpawnPlayer(Player("p1", "Alice"));

            spawner.RemovePlayer("p1");

            Assert.That(spawner.IsPlayerSpawned("p1"), Is.False);
            Assert.That(spawner.GetPlayerObject("p1"), Is.Null);
            Assert.That(spawner.SpawnedCount, Is.EqualTo(0));
        }

        [Test]
        public void RemovePlayer_UnknownId_IsNoOp()
        {
            Assert.DoesNotThrow(() => spawner.RemovePlayer("nope"));
        }

        [Test]
        public void RemoveAllPlayers_ClearsEverything()
        {
            spawner.SpawnPlayer(Player("p1", "Alice"));
            spawner.SpawnPlayer(Player("p2", "Bob"));

            spawner.RemoveAllPlayers();

            Assert.That(spawner.SpawnedCount, Is.EqualTo(0));
            Assert.That(spawner.IsPlayerSpawned("p1"), Is.False);
            Assert.That(spawner.IsPlayerSpawned("p2"), Is.False);
        }

        // ---------------------------------------------------------------
        // Lookup
        // ---------------------------------------------------------------

        [Test]
        public void Lookup_UnknownPlayer_ReturnsNull()
        {
            Assert.That(spawner.GetPlayerObject("ghost"), Is.Null);
            Assert.That(spawner.IsPlayerSpawned("ghost"), Is.False);
        }
    }
}
