using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// Shared parchment/cyan tokens mirroring web-dashboard <c>vr-theme.css</c> (#189).
    /// VR UX notes (Krug / Norman / headset practice):
    /// - One primary cyan CTA per panel (signifier = go)
    /// - Guest vs Bluekey visually distinct (conceptual model)
    /// - Large hit targets for laser/Touch (<see cref="MinHitHeightPx"/>)
    /// - Prefer “Space” wording over “Session” in titles
    /// </summary>
    public static class VrTheme
    {
        // --- Surfaces (dark shell) ---
        public static readonly Color Background = Hex(0x000000);
        public static readonly Color SurfaceLow = Hex(0x0A0A0A);
        public static readonly Color SurfaceContainer = Hex(0x121212);
        public static readonly Color SurfaceHigh = Hex(0x1A1A1A);
        public static readonly Color SurfaceHighest = Hex(0x242424);
        public static readonly Color GalleryVoid = Hex(0x0D0D15); // near-black; keep gallery continuity

        // --- Text (parchment) ---
        public static readonly Color OnSurface = Hex(0xE8E1DB);
        public static readonly Color OnSurfaceVariant = Hex(0xD1C5B7);

        // --- Brand ---
        public static readonly Color Primary = Hex(0xF1CF9C);       // parchment gold
        public static readonly Color PrimaryContainer = Hex(0xD4B483);
        public static readonly Color OnPrimaryContainer = Hex(0x5C451E);
        public static readonly Color Accent = Hex(0x6BB7C4);        // logo cyan — primary CTA
        public static readonly Color AccentBright = Hex(0x7DD1DB);
        public static readonly Color OnAccent = Hex(0x0A242B);

        public static readonly Color Outline = Hex(0x998F82);
        public static readonly Color OutlineVariant = Hex(0x4D463B);
        public static readonly Color Error = Hex(0xFFB4AB);

        // --- Glass (lobby / HUD panels) ---
        public static Color GlassPanel => WithAlpha(SurfaceHigh, 0.92f);
        public static Color GlassTop => WithAlpha(Hex(0x1B1B23), 0.78f);
        public static Color GlassBottom => WithAlpha(GalleryVoid, 0.88f);
        public static Color GuestPanel => WithAlpha(Hex(0x152028), 0.95f); // distinct from Bluekey block

        // --- Interaction (laser / Touch) ---
        /// <summary>Minimum control height in canvas units (~world-space readable / laser).</summary>
        public const float MinHitHeightPx = 56f;
        public const float MinHitWidthPx = 160f;
        public const float LobbyPanelDistance = 2.2f;
        public const float LobbyWorldScale = 0.0024f;

        // --- UI font (#223) ---
        // LegacyRuntime/Arial builtins are often null on Linux Editors; never leave Text.font null.
        private static Font cachedUiFont;
        private static bool loggedFontSource;

        /// <summary>Cached UI font for uGUI <see cref="UnityEngine.UI.Text"/> (never null when OS fonts exist).</summary>
        public static Font UiFont => ResolveUiFont();

        /// <summary>
        /// Resolve a readable UI font: optional <c>Resources/Fonts/VellumUI</c>, then Unity builtins,
        /// then OS dynamic fonts (<c>DejaVu Sans</c>, <c>Segoe UI</c>, …).
        /// </summary>
        public static Font ResolveUiFont()
        {
            if (cachedUiFont != null)
                return cachedUiFont;

            Font fromResources = Resources.Load<Font>("Fonts/VellumUI");
            if (fromResources != null)
            {
                cachedUiFont = fromResources;
                LogFontSource("Resources/Fonts/VellumUI");
                return cachedUiFont;
            }

            foreach (string builtin in new[] { "LegacyRuntime.ttf", "Arial.ttf" })
            {
                Font built = Resources.GetBuiltinResource<Font>(builtin);
                if (built != null)
                {
                    cachedUiFont = built;
                    LogFontSource("builtin " + builtin);
                    return cachedUiFont;
                }
            }

            string[] osCandidates =
            {
                "DejaVu Sans",
                "Liberation Sans",
                "FreeSans",
                "Noto Sans",
                "Segoe UI",
                "Arial",
                "Helvetica Neue",
                "Helvetica",
            };
            try
            {
                cachedUiFont = Font.CreateDynamicFontFromOSFont(osCandidates, 16);
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[VrTheme] CreateDynamicFontFromOSFont failed: " + ex.Message);
            }

            if (cachedUiFont == null)
            {
                string[] installed = Font.GetOSInstalledFontNames();
                if (installed != null && installed.Length > 0)
                {
                    try
                    {
                        cachedUiFont = Font.CreateDynamicFontFromOSFont(installed[0], 16);
                    }
                    catch
                    {
                        // leave null; ApplyUiFont will still assign best-effort
                    }
                }
            }

            if (cachedUiFont != null)
                LogFontSource("OS/dynamic " + cachedUiFont.name);
            else
                Debug.LogError("[VrTheme] ResolveUiFont: no font available — UI labels may be invisible.");

            return cachedUiFont;
        }

        /// <summary>Assign <see cref="ResolveUiFont"/> to a uGUI Text.</summary>
        public static void ApplyUiFont(UnityEngine.UI.Text text, bool bold = false)
        {
            if (text == null)
                return;
            Font font = ResolveUiFont();
            if (font != null)
                text.font = font;
            if (bold)
                text.fontStyle = FontStyle.Bold;
        }

        private static void LogFontSource(string source)
        {
            if (loggedFontSource)
                return;
            loggedFontSource = true;
            Debug.Log("[VrTheme] UI font: " + source);
        }

        public static Color WithAlpha(Color c, float a)
        {
            c.a = a;
            return c;
        }

        public static Color Hex(int rgb, float a = 1f)
        {
            float r = ((rgb >> 16) & 0xFF) / 255f;
            float g = ((rgb >> 8) & 0xFF) / 255f;
            float b = (rgb & 0xFF) / 255f;
            return new Color(r, g, b, a);
        }
    }
}
