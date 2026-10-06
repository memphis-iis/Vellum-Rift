using System;
using System.Globalization;

namespace VellumRift
{
    /// <summary>
    /// Who to show as a remote presence avatar / indicator.
    /// Prefer <c>lastSeenAt</c> (position heartbeats) over join age so long-lived
    /// museum hosts stay visible while idle ghosts still drop.
    /// </summary>
    public static class PresenceFilter
    {
        /// <summary>Hide remotes idle longer than this (matches backend guest prune).</summary>
        public const double MaxIdleMinutes = 3.0;

        /// <summary>Backward-compatible alias.</summary>
        public const double MaxJoinAgeMinutes = MaxIdleMinutes;

        public static bool ShouldShowRemote(
            string playerId,
            bool isConnected,
            string joinedAt,
            string localPlayerId,
            string lastSeenAt = null)
        {
            if (string.IsNullOrEmpty(playerId) || playerId == localPlayerId)
                return false;
            if (!isConnected)
                return false;

            string stamp = !string.IsNullOrEmpty(lastSeenAt) ? lastSeenAt : joinedAt;
            if (string.IsNullOrEmpty(stamp))
                return false;

            if (!DateTime.TryParse(
                    stamp,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out DateTime seen))
                return false;

            double ageMinutes = (DateTime.UtcNow - seen.ToUniversalTime()).TotalMinutes;
            return ageMinutes >= 0 && ageMinutes <= MaxIdleMinutes;
        }

        public static bool ShouldShowRemote(PlayerState player, string localPlayerId, string hostId)
        {
            if (player == null)
                return false;
            _ = hostId;
            // Museum wall spectator must not appear as a pill / avatar in other clients.
            if (string.Equals(player.displayName, SpectatorMode.DisplayName, StringComparison.Ordinal))
                return false;
            if (SpectatorMode.LooksLikeSpectatorName(player.displayName))
                return false;
            return ShouldShowRemote(
                player.id,
                player.isConnected,
                player.joinedAt,
                localPlayerId,
                player.lastSeenAt);
        }
    }
}
