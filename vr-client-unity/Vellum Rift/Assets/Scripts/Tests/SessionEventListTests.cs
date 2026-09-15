using System;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class SessionEventListTests
    {
        private static GameStateApiClient.SessionListItem Item(
            string id,
            string kind,
            bool active,
            string updatedAt,
            string endsAt = null)
        {
            return new GameStateApiClient.SessionListItem
            {
                sessionId = id,
                label = id,
                kind = kind,
                isActive = active,
                updatedAt = updatedAt,
                endsAt = endsAt,
            };
        }

        [Test]
        public void CurrentEvents_OnlyActiveEventKind()
        {
            var now = new DateTime(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
            var list = new[]
            {
                Item("explore", "exploration", true, "2026-09-15T11:00:00Z"),
                Item("event-old", "event", true, "2026-09-14T10:00:00Z"),
                Item("event-new", "event", true, "2026-09-15T11:30:00Z"),
                Item("archived", "event", false, "2026-09-15T11:45:00Z"),
            };

            var events = SessionEventList.CurrentEvents(list, now);
            Assert.That(events.Length, Is.EqualTo(2));
            Assert.That(events[0].sessionId, Is.EqualTo("event-new"));
            Assert.That(events[1].sessionId, Is.EqualTo("event-old"));
        }

        [Test]
        public void CurrentEvents_ExcludesPastEndsAt()
        {
            var now = new DateTime(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
            var list = new[]
            {
                Item("past", "event", true, "2026-09-15T11:00:00Z", endsAt: "2026-09-15T11:00:00Z"),
                Item("live", "event", true, "2026-09-15T11:00:00Z", endsAt: "2026-09-15T18:00:00Z"),
            };

            var events = SessionEventList.CurrentEvents(list, now);
            Assert.That(events.Length, Is.EqualTo(1));
            Assert.That(events[0].sessionId, Is.EqualTo("live"));
        }

        [Test]
        public void FormatWindow_OpenEnded_ReturnsNull()
        {
            Assert.That(SessionEventList.FormatWindow(null, null), Is.Null);
        }
    }
}
