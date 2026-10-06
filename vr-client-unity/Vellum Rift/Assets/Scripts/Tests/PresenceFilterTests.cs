using System;
using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    public class PresenceFilterTests
    {
        [Test]
        public void Hides_Disconnected()
        {
            Assert.That(
                PresenceFilter.ShouldShowRemote(
                    "p1", isConnected: false,
                    joinedAt: DateTime.UtcNow.ToString("o"),
                    localPlayerId: "me"),
                Is.False);
        }

        [Test]
        public void Hides_Self()
        {
            Assert.That(
                PresenceFilter.ShouldShowRemote(
                    "me", isConnected: true,
                    joinedAt: DateTime.UtcNow.ToString("o"),
                    localPlayerId: "me"),
                Is.False);
        }

        [Test]
        public void Hides_StaleHostGhosts()
        {
            string old = DateTime.UtcNow.AddDays(-30).ToString("o");
            Assert.That(
                PresenceFilter.ShouldShowRemote(
                    "host", isConnected: true,
                    joinedAt: old, localPlayerId: "me"),
                Is.False);
        }

        [Test]
        public void Hides_StaleGuestGhosts()
        {
            string old = DateTime.UtcNow.AddMinutes(-10).ToString("o");
            Assert.That(
                PresenceFilter.ShouldShowRemote(
                    "g1", isConnected: true,
                    joinedAt: old, localPlayerId: "me"),
                Is.False);
        }

        [Test]
        public void Shows_RecentGuest_ByLastSeen()
        {
            string oldJoin = DateTime.UtcNow.AddMinutes(-30).ToString("o");
            string recentSeen = DateTime.UtcNow.AddSeconds(-30).ToString("o");
            Assert.That(
                PresenceFilter.ShouldShowRemote(
                    "g1", isConnected: true,
                    joinedAt: oldJoin, localPlayerId: "me", lastSeenAt: recentSeen),
                Is.True);
        }

        [Test]
        public void Hides_GalleryScreen_ByName()
        {
            var player = new PlayerState("g", SpectatorMode.DisplayName)
            {
                isConnected = true,
                joinedAt = DateTime.UtcNow.ToString("o"),
            };
            Assert.That(
                PresenceFilter.ShouldShowRemote(player, "me", hostId: "h"),
                Is.False);
        }

        [Test]
        public void ParseGameState_ReadsPlayersArray()
        {
            const string json =
                "{\"sessionId\":\"s1\",\"label\":\"Museum\",\"hostId\":\"h1\"," +
                "\"isActive\":true,\"activeModelId\":\"m1\"," +
                "\"players\":[{\"id\":\"h1\",\"displayName\":\"Host\",\"isHost\":true," +
                "\"isConnected\":true,\"joinedAt\":\"2026-09-29T12:00:00.000Z\"," +
                "\"position\":{\"x\":1,\"y\":0,\"z\":2},\"rotation\":{\"x\":0,\"y\":0,\"z\":0}}]}";

            GameState state = GameStateApiClient.ParseGameState(json);
            Assert.That(state, Is.Not.Null);
            Assert.That(state.sessionId, Is.EqualTo("s1"));
            Assert.That(state.activeModelId, Is.EqualTo("m1"));
            Assert.That(state.players, Is.Not.Null);
            Assert.That(state.players.Count, Is.EqualTo(1));
            Assert.That(state.players[0].id, Is.EqualTo("h1"));
            Assert.That(state.players[0].position.x, Is.EqualTo(1f));
        }
    }
}
