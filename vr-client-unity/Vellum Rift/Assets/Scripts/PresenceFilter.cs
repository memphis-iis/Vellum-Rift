using System;
using System.Globalization;

namespace VellumRift
{
    /// <summary>
    /// Who to show as a remote presence avatar / indicator.
    /// Museum Demo accumulates guests that never clear <c>isConnected</c>, so
    /// join age guards against a field of ghosts.
    /// </summary>
    public static class PresenceFilter
    {
        /// <summary>Hide remotes idle longer than this (matches backend guest prune).</summary>
        public const double MaxJoinAgeMinutes = 3.0;

        public static bool ShouldShowRemote(
            string playerId,
            bool isConnected,
            string joinedAt,
            string localPlayerId)
        {
            if (string.IsNullOrEmpty(playerId) || playerId == localPlayerId)
                return false;
            if (!isConnected)
                return false;

            // Offline hosts must not linger as nameplates / laser targets.
            if (string.IsNullOrEmpty(joinedAt))
                return false;

            if (!DateTime.TryParse(
                    joinedAt,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out DateTime joined))
                return false;

            double ageMinutes = (DateTime.UtcNow - joined.ToUniversalTime()).TotalMinutes;
            return ageMinutes >= 0 && ageMinutes <= MaxJoinAgeMinutes;
        }

        public static bool ShouldShowRemote(PlayerState player, string localPlayerId, string hostId)
        {
            if (player == null)
                return false;
            _ = hostId;
            // Museum wall spectator must not appear as a pill in other clients.
            if (string.Equals(player.displayName, SpectatorMode.DisplayName, StringComparison.Ordinal))
                return false;
            return ShouldShowRemote(
                player.id,
                player.isConnected,
                player.joinedAt,
                localPlayerId);
        }
    }
}
