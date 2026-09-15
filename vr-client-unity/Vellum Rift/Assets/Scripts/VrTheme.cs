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
