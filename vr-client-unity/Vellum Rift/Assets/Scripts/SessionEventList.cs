using System;
using System.Collections.Generic;

namespace VellumRift
{
    /// <summary>
    /// Filters session list to current site events (#226), matching dashboard
    /// Featured pool: active + kind event, newest activity first.
    /// </summary>
    public static class SessionEventList
    {
        /// <summary>
        /// Active event-kind spaces, sorted by <c>updatedAt</c> descending.
        /// Excludes exploration spaces and archived sessions.
        /// </summary>
        public static GameStateApiClient.SessionListItem[] CurrentEvents(
            GameStateApiClient.SessionListItem[] sessions,
            DateTime? utcNow = null)
        {
            if (sessions == null || sessions.Length == 0)
                return Array.Empty<GameStateApiClient.SessionListItem>();

            DateTime now = utcNow ?? DateTime.UtcNow;
            var filtered = new List<GameStateApiClient.SessionListItem>();
            foreach (var s in sessions)
            {
                if (s == null || string.IsNullOrEmpty(s.sessionId))
                    continue;
                if (!s.isActive)
                    continue;
                if (!IsEventKind(s))
                    continue;
                if (HasEnded(s.endsAt, now))
                    continue;
                filtered.Add(s);
            }

            filtered.Sort((a, b) =>
            {
                long tb = ParseTime(b.updatedAt);
                long ta = ParseTime(a.updatedAt);
                return tb.CompareTo(ta);
            });
            return filtered.ToArray();
        }

        /// <summary>True when kind is event (mirrors dashboard sessionKind top-level).</summary>
        public static bool IsEventKind(GameStateApiClient.SessionListItem s)
        {
            if (s == null)
                return false;
            return string.Equals((s.kind ?? "").Trim(), "event", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>Short schedule label for a card subtitle, or null if open-ended.</summary>
        public static string FormatWindow(string startsAt, string endsAt)
        {
            bool hasStart = !string.IsNullOrWhiteSpace(startsAt);
            bool hasEnd = !string.IsNullOrWhiteSpace(endsAt);
            if (!hasStart && !hasEnd)
                return null;
            if (hasStart && hasEnd)
                return $"{Fmt(startsAt)} – {Fmt(endsAt)}";
            if (hasStart)
                return $"From {Fmt(startsAt)}";
            return $"Until {Fmt(endsAt)}";
        }

        private static bool HasEnded(string endsAt, DateTime utcNow)
        {
            if (string.IsNullOrWhiteSpace(endsAt))
                return false;
            if (!DateTime.TryParse(endsAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out DateTime end))
                return false;
            if (end.Kind == DateTimeKind.Unspecified)
                end = DateTime.SpecifyKind(end, DateTimeKind.Utc);
            return end.ToUniversalTime() < utcNow.ToUniversalTime();
        }

        private static long ParseTime(string iso)
        {
            if (string.IsNullOrWhiteSpace(iso))
                return 0;
            return DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out DateTime t)
                ? t.ToUniversalTime().Ticks
                : 0;
        }

        private static string Fmt(string iso)
        {
            if (!DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out DateTime t))
                return iso;
            return t.ToLocalTime().ToString("MMM d, h:mm tt");
        }
    }
}
