using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    /// <summary>
    /// Covers the player join/leave detection at the heart of sub-issue 11b
    /// (Polling/Update Gamestate). GameStatePoller delegates its diffing to
    /// GameStateDiff, so exercising the helper directly validates the polling
    /// behavior without a scene, networking, or the Unity player loop.
    /// </summary>
    public class GameStateDiffTests
    {
        // Builds a state containing players with the given display names and
        // returns both the state and the generated id for each name.
        private static (GameState state, Dictionary<string, string> ids) StateWith(params string[] names)
        {
            var state = new GameState();
            var ids = new Dictionary<string, string>();
            foreach (var name in names)
            {
                var player = state.AddPlayer(name);
                ids[name] = player.id;
            }
            return (state, ids);
        }

        // ---------------------------------------------------------------
        // First poll (previous == null)
        // ---------------------------------------------------------------
        [Test]
        public void FirstPoll_ReportsAllCurrentPlayersAsJoined()
        {
            var (current, _) = StateWith("Alice", "Bob");

            GameStateDiff.Compute(null, current, out var joined, out var leftIds);

            Assert.That(joined.Select(p => p.displayName), Is.EquivalentTo(new[] { "Alice", "Bob" }));
            Assert.That(leftIds, Is.Empty);
        }

        [Test]
        public void FirstPoll_WithNoPlayers_ReportsNothing()
        {
            var current = new GameState();

            GameStateDiff.Compute(null, current, out var joined, out var leftIds);

            Assert.That(joined, Is.Empty);
            Assert.That(leftIds, Is.Empty);
        }

        // ---------------------------------------------------------------
        // Steady state
        // ---------------------------------------------------------------
        [Test]
        public void NoMembershipChange_ReportsNothing()
        {
            var (previous, ids) = StateWith("Alice", "Bob");

            // A new state describing the same two players (same ids).
            var current = new GameState();
            current.players.Add(new PlayerState(ids["Alice"], "Alice"));
            current.players.Add(new PlayerState(ids["Bob"], "Bob"));

            GameStateDiff.Compute(previous, current, out var joined, out var leftIds);

            Assert.That(joined, Is.Empty);
            Assert.That(leftIds, Is.Empty);
        }

        // ---------------------------------------------------------------
        // Joins
        // ---------------------------------------------------------------
        [Test]
        public void NewPlayer_ReportedAsJoined()
        {
            var (previous, ids) = StateWith("Alice");

            var current = new GameState();
            current.players.Add(new PlayerState(ids["Alice"], "Alice"));
            var bob = current.AddPlayer("Bob");

            GameStateDiff.Compute(previous, current, out var joined, out var leftIds);

            Assert.That(joined, Has.Count.EqualTo(1));
            Assert.That(joined[0].id, Is.EqualTo(bob.id));
            Assert.That(joined[0].displayName, Is.EqualTo("Bob"));
            Assert.That(leftIds, Is.Empty);
        }

        // ---------------------------------------------------------------
        // Leaves
        // ---------------------------------------------------------------
        [Test]
        public void RemovedPlayer_ReportedAsLeft()
        {
            var (previous, ids) = StateWith("Alice", "Bob");

            // Current only still has Alice.
            var current = new GameState();
            current.players.Add(new PlayerState(ids["Alice"], "Alice"));

            GameStateDiff.Compute(previous, current, out var joined, out var leftIds);

            Assert.That(joined, Is.Empty);
            Assert.That(leftIds, Is.EquivalentTo(new[] { ids["Bob"] }));
        }

        [Test]
        public void EmptyCurrent_ReportsAllPreviousAsLeft()
        {
            var (previous, ids) = StateWith("Alice", "Bob");
            var current = new GameState();

            GameStateDiff.Compute(previous, current, out var joined, out var leftIds);

            Assert.That(joined, Is.Empty);
            Assert.That(leftIds, Is.EquivalentTo(new[] { ids["Alice"], ids["Bob"] }));
        }

        // ---------------------------------------------------------------
        // Simultaneous join + leave
        // ---------------------------------------------------------------
        [Test]
        public void JoinAndLeaveInSamePoll_ReportedIndependently()
        {
            var (previous, ids) = StateWith("Alice", "Bob");

            // Bob leaves, Carol joins; Alice stays.
            var current = new GameState();
            current.players.Add(new PlayerState(ids["Alice"], "Alice"));
            var carol = current.AddPlayer("Carol");

            GameStateDiff.Compute(previous, current, out var joined, out var leftIds);

            Assert.That(joined.Select(p => p.id), Is.EquivalentTo(new[] { carol.id }));
            Assert.That(leftIds, Is.EquivalentTo(new[] { ids["Bob"] }));
        }

        // ---------------------------------------------------------------
        // Edge cases
        // ---------------------------------------------------------------
        [Test]
        public void NullCurrent_ReportsNothing()
        {
            var (previous, _) = StateWith("Alice");

            GameStateDiff.Compute(previous, null, out var joined, out var leftIds);

            Assert.That(joined, Is.Empty);
            Assert.That(leftIds, Is.Empty);
        }
    }
}
