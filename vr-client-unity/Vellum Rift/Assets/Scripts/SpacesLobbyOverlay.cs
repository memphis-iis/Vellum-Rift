using System;
using System.Threading.Tasks;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// IMGUI Spaces picker (#188): list via GET /api/game-state, join selected,
    /// create only via explicit New space. No silent auto-create.
    /// </summary>
    public class SpacesLobbyOverlay : MonoBehaviour
    {
        public struct PickResult
        {
            public GameState Session;
            public bool Created;
        }

        private GameStateApiClient apiClient;
        private bool visible;
        private string banner = "";
        private string status = "";
        private string newLabel = "";
        private GameStateApiClient.SessionListItem[] spaces = Array.Empty<GameStateApiClient.SessionListItem>();
        private Vector2 scroll;
        private bool busy;
        private TaskCompletionSource<PickResult> pending;

        /// <summary>
        /// Show the lobby until the user joins or creates a space.
        /// </summary>
        public Task<PickResult> PickAsync(GameStateApiClient client, string bannerMessage = "")
        {
            if (pending != null && !pending.Task.IsCompleted)
                pending.TrySetCanceled();

            apiClient = client;
            banner = bannerMessage ?? "";
            status = "";
            newLabel = "";
            visible = true;
            busy = false;
            pending = new TaskCompletionSource<PickResult>();
            _ = RefreshListAsync();
            return pending.Task;
        }

        private void OnGUI()
        {
            if (!visible || pending == null)
                return;

            // Centered panel — same zero-dependency IMGUI style as BluekeyAuth / SessionLinkOverlay.
            float w = Mathf.Min(520f, Screen.width - 40f);
            float h = Mathf.Min(520f, Screen.height - 40f);
            float x = (Screen.width - w) * 0.5f;
            float y = (Screen.height - h) * 0.5f;

            GUI.Box(new Rect(x, y, w, h), "");
            GUILayout.BeginArea(new Rect(x + 16f, y + 12f, w - 32f, h - 24f));

            GUILayout.Label("Spaces");
            GUILayout.Label("Pick a space to enter, or create a new one.");

            if (!string.IsNullOrEmpty(banner))
            {
                var prev = GUI.color;
                GUI.color = new Color(1f, 0.85f, 0.4f);
                GUILayout.Label(banner);
                GUI.color = prev;
            }

            if (!string.IsNullOrEmpty(status))
                GUILayout.Label(status);

            GUILayout.Space(6f);
            GUI.enabled = !busy;
            if (GUILayout.Button(busy ? "Working…" : "Refresh", GUILayout.Height(28f)))
                _ = RefreshListAsync();

            GUILayout.Space(4f);
            scroll = GUILayout.BeginScrollView(scroll, GUILayout.ExpandHeight(true));
            if (spaces == null || spaces.Length == 0)
            {
                GUILayout.Label(busy ? "Loading spaces…" : "No spaces yet. Create one below.");
            }
            else
            {
                foreach (var space in spaces)
                {
                    if (space == null || string.IsNullOrEmpty(space.sessionId))
                        continue;

                    string label = string.IsNullOrWhiteSpace(space.label) ? "Untitled space" : space.label.Trim();
                    string live = space.isActive ? "LIVE" : "ARCHIVED";
                    GUILayout.BeginHorizontal();
                    GUILayout.Label($"{label}  ·  {live}", GUILayout.ExpandWidth(true));
                    GUI.enabled = !busy && space.isActive;
                    if (GUILayout.Button("Join", GUILayout.Width(72f), GUILayout.Height(26f)))
                        _ = JoinAsync(space.sessionId);
                    GUI.enabled = !busy;
                    GUILayout.EndHorizontal();
                }
            }
            GUILayout.EndScrollView();

            GUILayout.Space(8f);
            GUILayout.Label("New space");
            newLabel = GUILayout.TextField(newLabel ?? "", 120);
            if (GUILayout.Button(busy ? "Creating…" : "New space", GUILayout.Height(32f)))
                _ = CreateAsync();

            GUI.enabled = true;
            GUILayout.EndArea();
        }

        private async Task RefreshListAsync()
        {
            if (apiClient == null)
                return;

            busy = true;
            status = "Loading spaces…";
            try
            {
                var list = await apiClient.ListSessions();
                if (list == null)
                {
                    spaces = Array.Empty<GameStateApiClient.SessionListItem>();
                    status = "Could not load spaces. Check the backend and try Refresh.";
                }
                else
                {
                    spaces = list;
                    status = list.Length == 0 ? "No spaces yet." : $"{list.Length} space(s)";
                }
            }
            catch (Exception ex)
            {
                status = $"Load failed: {ex.Message}";
                spaces = Array.Empty<GameStateApiClient.SessionListItem>();
            }
            finally
            {
                busy = false;
            }
        }

        private async Task JoinAsync(string sessionId)
        {
            if (apiClient == null || string.IsNullOrEmpty(sessionId) || busy)
                return;

            busy = true;
            status = "Joining…";
            try
            {
                var result = await apiClient.GetSession(sessionId);
                if (result.State == null || !result.State.isActive)
                {
                    status = "That space is missing or archived. Pick another or create a new one.";
                    await RefreshListAsync();
                    return;
                }

                Complete(new PickResult { Session = result.State, Created = false });
            }
            catch (Exception ex)
            {
                status = $"Join failed: {ex.Message}";
            }
            finally
            {
                busy = false;
            }
        }

        private async Task CreateAsync()
        {
            if (apiClient == null || busy)
                return;

            busy = true;
            status = "Creating space…";
            try
            {
                string label = string.IsNullOrWhiteSpace(newLabel)
                    ? $"Space {DateTime.Now.ToString("g")}"
                    : newLabel.Trim();
                // Match dashboard defaults: private exploration (#188 parity with Sessions.tsx).
                GameState created = await apiClient.CreateSession(label, "private", "exploration");
                if (created == null || string.IsNullOrEmpty(created.sessionId))
                {
                    status = "Create failed. Is the backend running?";
                    return;
                }

                Complete(new PickResult { Session = created, Created = true });
            }
            catch (Exception ex)
            {
                status = $"Create failed: {ex.Message}";
            }
            finally
            {
                busy = false;
            }
        }

        private void Complete(PickResult result)
        {
            visible = false;
            status = "";
            banner = "";
            var tcs = pending;
            pending = null;
            tcs?.TrySetResult(result);
        }
    }
}
