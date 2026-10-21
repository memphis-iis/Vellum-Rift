using NUnit.Framework;

namespace VellumRift.Tests
{
    public class SeatEvictionTests
    {
        private static GameState StateWithPlayer(string id, string connectionId)
        {
            var state = new GameState();
            state.sessionId = "session-1";
            var player = new PlayerState(id, "Guest") { connectionId = connectionId };
            state.players.Add(player);
            return state;
        }

        [Test]
        public void Evaluate_MissingSelf_IsKick()
        {
            var state = StateWithPlayer("p1", "conn-a");
            Assert.That(
                SeatEviction.Evaluate(state, "gone", "conn-a"),
                Is.EqualTo(SeatEvictionReason.Kick));
        }

        [Test]
        public void Evaluate_ConnectionMismatch_IsTakeover()
        {
            var state = StateWithPlayer("p1", "conn-b");
            Assert.That(
                SeatEviction.Evaluate(state, "p1", "conn-a"),
                Is.EqualTo(SeatEvictionReason.Takeover));
        }

        [Test]
        public void Evaluate_MatchingConnection_IsNone()
        {
            var state = StateWithPlayer("p1", "conn-a");
            Assert.That(
                SeatEviction.Evaluate(state, "p1", "conn-a"),
                Is.EqualTo(SeatEvictionReason.None));
        }

        [Test]
        public void Evaluate_EmptyLocalConnection_DoesNotTakeover()
        {
            var state = StateWithPlayer("p1", "conn-b");
            Assert.That(
                SeatEviction.Evaluate(state, "p1", null),
                Is.EqualTo(SeatEvictionReason.None));
        }
    }
}
