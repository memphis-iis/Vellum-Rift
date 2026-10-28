using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    public class GameStateTests
    {
        // ---------------------------------------------------------------
        // Constructor
        // ---------------------------------------------------------------
        [Test]
        public void Constructor_GeneratesUniqueSessionId()
        {
            var a = new GameState();
            var b = new GameState();
            Assert.That(a.sessionId, Is.Not.Empty);
            Assert.That(a.sessionId, Is.Not.EqualTo(b.sessionId));
        }

        [Test]
        public void Constructor_AcceptsOptionalLabel()
        {
            var state = new GameState("test-session");
            Assert.That(state.label, Is.EqualTo("test-session"));
        }

        [Test]
        public void Constructor_DefaultsLabelToEmptyString()
        {
            var state = new GameState();
            Assert.That(state.label, Is.EqualTo(""));
        }

        [Test]
        public void Constructor_StartsWithNoPlayersAndNoHost()
        {
            var state = new GameState();
            Assert.That(state.players, Is.Empty);
            Assert.That(state.hostId, Is.EqualTo(""));
        }

        [Test]
        public void Constructor_StartsActive()
        {
            var state = new GameState();
            Assert.That(state.isActive, Is.True);
        }

        // ---------------------------------------------------------------
        // AddPlayer
        // ---------------------------------------------------------------
        [Test]
        public void AddPlayer_ReturnsPlayerWithGivenName()
        {
            var state = new GameState();
            var player = state.AddPlayer("Alice");
            Assert.That(player.displayName, Is.EqualTo("Alice"));
            Assert.That(state.players, Has.Count.EqualTo(1));
        }

        [Test]
        public void AddPlayer_StartsWithPositionZero()
        {
            var state = new GameState();
            var player = state.AddPlayer("Bob");
            Assert.That(player.position.x, Is.EqualTo(0));
            Assert.That(player.position.y, Is.EqualTo(0));
            Assert.That(player.position.z, Is.EqualTo(0));
        }

        [Test]
        public void AddPlayer_MarksAsConnected()
        {
            var state = new GameState();
            var player = state.AddPlayer("Charlie");
            Assert.That(player.isConnected, Is.True);
        }

        [Test]
        public void AddPlayer_SetsHostWhenSpecified()
        {
            var state = new GameState();
            var player = state.AddPlayer("Dave", true);
            Assert.That(player.isHost, Is.True);
            Assert.That(state.hostId, Is.EqualTo(player.id));
        }

        [Test]
        public void AddPlayer_DoesNotSetHostByDefault()
        {
            var state = new GameState();
            state.AddPlayer("Eve");
            Assert.That(state.hostId, Is.EqualTo(""));
        }

        // ---------------------------------------------------------------
        // RemovePlayer
        // ---------------------------------------------------------------
        [Test]
        public void RemovePlayer_RemovesExistingPlayer()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");
            Assert.That(state.players, Has.Count.EqualTo(1));

            var result = state.RemovePlayer(p.id);
            Assert.That(result, Is.True);
            Assert.That(state.players, Is.Empty);
        }

        [Test]
        public void RemovePlayer_ReturnsFalseForMissingPlayer()
        {
            var state = new GameState();
            Assert.That(state.RemovePlayer("nonexistent"), Is.False);
        }

        // ---------------------------------------------------------------
        // GetPlayer
        // ---------------------------------------------------------------
        [Test]
        public void GetPlayer_FindsPlayerById()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");
            Assert.That(state.GetPlayer(p.id), Is.EqualTo(p));
        }

        [Test]
        public void GetPlayer_ReturnsNullForUnknownId()
        {
            var state = new GameState();
            Assert.That(state.GetPlayer("missing"), Is.Null);
        }

        // ---------------------------------------------------------------
        // UpdatePosition
        // ---------------------------------------------------------------
        [Test]
        public void UpdatePosition_ChangesPlayerPosition()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");
            var pos = new Vector3Data(10, 20, 30);

            var result = state.UpdatePosition(p.id, pos);
            Assert.That(result, Is.True);
            var updated = state.GetPlayer(p.id);
            Assert.That(updated.position.x, Is.EqualTo(10));
            Assert.That(updated.position.y, Is.EqualTo(20));
            Assert.That(updated.position.z, Is.EqualTo(30));
        }

        [Test]
        public void UpdatePosition_ReturnsFalseForUnknownPlayer()
        {
            var state = new GameState();
            Assert.That(state.UpdatePosition("bad", new Vector3Data(1, 2, 3)), Is.False);
        }

        // ---------------------------------------------------------------
        // UpdateRotation
        // ---------------------------------------------------------------
        [Test]
        public void UpdateRotation_ChangesPlayerRotation()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");
            var rot = new Vector3Data(90, 45, 0);

            Assert.That(state.UpdateRotation(p.id, rot), Is.True);
            var updated = state.GetPlayer(p.id);
            Assert.That(updated.rotation.x, Is.EqualTo(90));
            Assert.That(updated.rotation.y, Is.EqualTo(45));
            Assert.That(updated.rotation.z, Is.EqualTo(0));
        }

        [Test]
        public void UpdateRotation_ReturnsFalseForUnknownPlayer()
        {
            var state = new GameState();
            Assert.That(state.UpdateRotation("bad", new Vector3Data(0, 0, 0)), Is.False);
        }

        // ---------------------------------------------------------------
        // SetHost
        // ---------------------------------------------------------------
        [Test]
        public void SetHost_TransfersHost()
        {
            var state = new GameState();
            var p1 = state.AddPlayer("Alice", true);
            var p2 = state.AddPlayer("Bob");

            Assert.That(state.SetHost(p2.id), Is.True);
            Assert.That(p1.isHost, Is.False);
            Assert.That(p2.isHost, Is.True);
            Assert.That(state.hostId, Is.EqualTo(p2.id));
        }

        [Test]
        public void SetHost_ReturnsFalseForUnknownPlayer()
        {
            var state = new GameState();
            Assert.That(state.SetHost("ghost"), Is.False);
        }

        // ---------------------------------------------------------------
        // SetConnected
        // ---------------------------------------------------------------
        [Test]
        public void SetConnected_MarksPlayerDisconnected()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");

            Assert.That(state.SetConnected(p.id, false), Is.True);
            Assert.That(p.isConnected, Is.False);
        }

        [Test]
        public void SetConnected_ReconnectsPlayer()
        {
            var state = new GameState();
            var p = state.AddPlayer("Alice");
            state.SetConnected(p.id, false);
            state.SetConnected(p.id, true);
            Assert.That(p.isConnected, Is.True);
        }

        [Test]
        public void SetConnected_ReturnsFalseForUnknownPlayer()
        {
            var state = new GameState();
            Assert.That(state.SetConnected("missing", false), Is.False);
        }

        // ---------------------------------------------------------------
        // Session lifecycle
        // ---------------------------------------------------------------
        [Test]
        public void End_MarksSessionInactive()
        {
            var state = new GameState();
            state.End();
            Assert.That(state.isActive, Is.False);
        }

        [Test]
        public void Resume_ReactivatesSession()
        {
            var state = new GameState();
            state.End();
            state.Resume();
            Assert.That(state.isActive, Is.True);
        }

        // ---------------------------------------------------------------
        // Timestamps
        // ---------------------------------------------------------------
        [Test]
        public void UpdatedAt_BumpsAfterMutation()
        {
            var state = new GameState();
            var before = state.updatedAt;
            state.AddPlayer("Alice");
            Assert.That(state.updatedAt, Is.Not.EqualTo(before));
        }
    }
}
