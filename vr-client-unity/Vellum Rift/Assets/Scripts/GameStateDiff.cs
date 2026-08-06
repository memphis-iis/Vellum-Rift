using System.Collections.Generic;

namespace VellumRift
{
    /// <summary>
    /// Pure, MonoBehaviour-free helper that computes the player-membership delta
    /// between two game states. Extracted from GameStatePoller so the join/leave
    /// detection at the heart of sub-issue 11b (Polling/Update Gamestate) can be
    /// covered by fast EditMode unit tests without a scene, networking, or the
    /// Unity player loop — mirroring the pattern used by BackendUrlResolver.
    /// </summary>
    public static class GameStateDiff
    {
        /// <summary>
        /// Compute which players joined and which left between two states.
        ///
        /// A null <paramref name="previous"/> (the first poll) treats every player
        /// in <paramref name="current"/> as newly joined, so players already in the
        /// session when polling starts are surfaced for spawning rather than being
        /// silently skipped.
        /// </summary>
        /// <param name="previous">The last known state, or null on the first poll.</param>
        /// <param name="current">The newly received state.</param>
        /// <param name="joined">Players present in current but not in previous.</param>
        /// <param name="leftIds">IDs present in previous but not in current.</param>
        public static void Compute(
            GameState previous,
            GameState current,
            out List<PlayerState> joined,
            out List<string> leftIds)
        {
            joined = new List<PlayerState>();
            leftIds = new List<string>();

            if (current == null)
                return;

            // Joined: in current, absent from previous (all of them on first poll).
            foreach (var player in current.players)
            {
                if (previous == null || previous.GetPlayer(player.id) == null)
                    joined.Add(player);
            }

            if (previous == null)
                return;

            // Left: in previous, absent from current.
            foreach (var player in previous.players)
            {
                if (current.GetPlayer(player.id) == null)
                    leftIds.Add(player.id);
            }
        }
    }
}
