namespace VellumRift
{
    /// <summary>Why a local client must leave the Space without DELETE.</summary>
    public enum SeatEvictionReason
    {
        None = 0,
        Kick = 1,
        Takeover = 2,
    }

    /// <summary>
    /// Shared seat eviction checks for kick (self missing) and takeover
    /// (connectionId superseded by another join on the same playerId).
    /// </summary>
    public static class SeatEviction
    {
        public static SeatEvictionReason Evaluate(
            GameState state,
            string localPlayerId,
            string localConnectionId)
        {
            if (state == null || string.IsNullOrEmpty(localPlayerId))
                return SeatEvictionReason.None;

            PlayerState self = state.GetPlayer(localPlayerId);
            if (self == null)
                return SeatEvictionReason.Kick;

            if (!string.IsNullOrEmpty(localConnectionId)
                && !string.IsNullOrEmpty(self.connectionId)
                && self.connectionId != localConnectionId)
            {
                return SeatEvictionReason.Takeover;
            }

            return SeatEvictionReason.None;
        }

        public static string Message(SeatEvictionReason reason)
        {
            switch (reason)
            {
                case SeatEvictionReason.Takeover:
                    return "Another window took your seat in this space.";
                case SeatEvictionReason.Kick:
                    return "You were removed from this space.";
                default:
                    return "";
            }
        }
    }
}
