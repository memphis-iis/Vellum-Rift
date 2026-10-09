using System;
using System.Threading.Tasks;
using UnityEngine;
using VellumRift.Control;

namespace VellumRift
{
    /// <summary>
    /// Applies museum dashboard commands from polled game state (#322):
    /// pendingRespawn teleport + Quest-only controlScheme. Laptop/WebGL ignore schemes.
    /// </summary>
    public class MuseumLocalCommands : MonoBehaviour
    {
        private GameStateApiClient apiClient;
        private PlayerController playerController;
        private ControlsGuide controlsGuide;
        private string sessionId;
        private string localPlayerId;
        private int lastAppliedRespawnSeq;
        private QuestControlScheme lastAppliedScheme = QuestControlScheme.Default;
        private bool ackInFlight;

        public void Initialize(
            GameStateApiClient client,
            PlayerController controller,
            string session,
            string playerId,
            ControlsGuide guide = null)
        {
            apiClient = client;
            playerController = controller;
            controlsGuide = guide;
            sessionId = session ?? "";
            localPlayerId = playerId ?? "";
            lastAppliedRespawnSeq = 0;
            lastAppliedScheme = QuestControlScheme.Default;
        }

        public void HandleGameState(GameState state)
        {
            if (state == null || string.IsNullOrEmpty(localPlayerId) || playerController == null)
                return;

            PlayerState me = state.GetPlayer(localPlayerId);
            if (me == null)
                return;

            ApplyControlScheme(me.controlScheme);
            ApplyPendingRespawn(me);
        }

        private void ApplyControlScheme(string raw)
        {
            QuestControlScheme next = InputControlSchema.ParseQuestScheme(raw);
            // Only rebind when XR is active — laptop/gamepad keep KeyboardMouse / Gamepad.
            if (!InputControlSchema.IsXrActive())
            {
                if (lastAppliedScheme != QuestControlScheme.Default)
                {
                    playerController.SetQuestControlScheme(QuestControlScheme.Default);
                    lastAppliedScheme = QuestControlScheme.Default;
                }
                return;
            }

            if (next == lastAppliedScheme)
                return;
            playerController.SetQuestControlScheme(next);
            if (controlsGuide != null)
                controlsGuide.SetQuestControlScheme(next);
            lastAppliedScheme = next;
            Debug.Log($"[MuseumLocalCommands] Quest control scheme → {next}");
        }

        private void ApplyPendingRespawn(PlayerState me)
        {
            PendingRespawn pending = me.pendingRespawn;
            if (pending == null || pending.seq <= 0)
                return;
            if (pending.seq <= lastAppliedRespawnSeq)
                return;

            Vector3 pos = new Vector3(pending.x, pending.y, pending.z);
            playerController.ApplyRespawnPose(pos, pending.yaw);
            lastAppliedRespawnSeq = pending.seq;
            Debug.Log(
                $"[MuseumLocalCommands] Applied respawn seq={pending.seq} at {pos} yaw={pending.yaw}");

            if (!ackInFlight && apiClient != null && !string.IsNullOrEmpty(sessionId))
                _ = AckRespawnAsync(pending.seq);
        }

        private async Task AckRespawnAsync(int seq)
        {
            ackInFlight = true;
            try
            {
                await apiClient.AckRespawn(sessionId, localPlayerId, seq);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[MuseumLocalCommands] Respawn ACK failed: {ex.Message}");
            }
            finally
            {
                ackInFlight = false;
            }
        }
    }
}
