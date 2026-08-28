using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace VellumRift
{
    /// <summary>
    /// ControlsGuide — control guide panel anchored to the top-right corner.
    /// Mirrors the Material 3 "glass" HUD control guide: a translucent rounded
    /// glass card with a cyan rim light on the top/left edges, a soft drop
    /// shadow, a header with a gamepad glyph + pulsing status dots, action rows
    /// with gold mono key badges, and a gradient footer. All visuals are
    /// generated procedurally as Texture2D sprites, so no art assets are needed.
    /// </summary>
    public class ControlsGuide : MonoBehaviour
    {
        // ---------------------------------------------------------------
        // Icon shapes
        // ---------------------------------------------------------------
        private enum IconKind
        {
            Keyboard,   // Move Around
            Laser,      // Use Laser
            Delete,     // Delete Object
            Waypoint,   // Drop a Marker
            Summon,     // Open Object Menu
            Chat,       // Open Chat
            Gamepad,    // Header glyph
        }

        [Header("Layout")]
        [SerializeField] private bool showHostOnly = false; // Guests see all rows (museum day)

        [Header("Dismiss")]
        [Tooltip("Start visible; H toggles. Keep existing Vellum Material 3 theme.")]
        [SerializeField] private bool startVisible = true;
        [SerializeField] private KeyCode toggleKey = KeyCode.H;

        // ---------------------------------------------------------------
        // Material 3 palette (Vellum Rift HUD design tokens)
        // ---------------------------------------------------------------
        private static readonly Color COLOR_SURFACE_TOP       = new Color(27f/255f, 27f/255f, 35f/255f, 0.70f);  // #1B1B23 glass top
        private static readonly Color COLOR_SURFACE_BOT       = new Color(13f/255f, 13f/255f, 21f/255f, 0.80f);  // #0D0D15 glass bottom
        private static readonly Color COLOR_SURFACE_HIGH      = new Color(0.161f, 0.161f, 0.196f, 0.40f);         // #292932 @ 40%
        private static readonly Color COLOR_GOLD              = new Color(1.000f, 0.855f, 0.616f);                // #FFDB9D
        private static readonly Color COLOR_GOLD_DEEP         = new Color(0.996f, 0.718f, 0.000f);                // #FEB700
        private static readonly Color COLOR_TEXT              = new Color(0.784f, 0.773f, 0.792f);                // #C8C5CA
        private static readonly Color COLOR_DIVIDER           = new Color(0.784f, 0.773f, 0.792f, 0.20f);         // on-surface-variant / 20
        private static readonly Color COLOR_CYAN_EDGE         = new Color(0.000f, 219f/255f, 233f/255f, 0.30f);   // #00DBE9 @ 30%
        private static readonly Color COLOR_NEUTRAL_EDGE      = new Color(200f/255f, 197f/255f, 202f/255f, 0.10f);// border rgba(200,197,202,.1)
        private static readonly Color COLOR_SURFACE_VARIANT   = new Color(52f/255f, 52f/255f, 61f/255f);          // #34343D dots
        private static readonly Color COLOR_BADGE_FILL        = new Color(0.996f, 0.718f, 0.000f, 0.10f);        // secondary-container / 10
        private static readonly Color COLOR_BADGE_BORDER      = new Color(1.000f, 0.855f, 0.616f, 0.20f);        // secondary / 20

        // ---------------------------------------------------------------
        // Layout (canvas reference pixels)
        // ---------------------------------------------------------------
        private const float PANEL_WIDTH   = 384f;   // max-w-sm
        private const float HEADER_HEIGHT = 44f;
        private const float ROW_HEIGHT    = 36f;
        private const float ROW_GAP       = 18f;    // gap-4
        private const float CONTENT_PAD   = 24f;    // px-panel-padding
        private const float FOOTER_HEIGHT = 6f;
        private const float PANEL_RADIUS  = 8f;     // rounded-lg
        private const float BADGE_RADIUS  = 4f;     // rounded
        private const float BADGE_HEIGHT  = 22f;
        private const float SHADOW_BOTTOM = 52f;    // room below the card for the drop shadow
        private const float SHADOW_SIDE   = 30f;
        private const float SHADOW_OFFSET = 8f;     // "0 20px 50px …" offset
        private const float SHADOW_BLUR   = 34f;
        private const float SHADOW_ALPHA  = 0.45f;

        private const int ICON_TEX_SIZE = 48;
        private const int TITLE_FONT  = 14;
        private const int ACTION_FONT = 16;
        private const int KEY_FONT    = 14;

        private GameObject canvasGO;
        private RectTransform panelRect;
        private RectTransform shadowRect;
        private RectTransform contentRect;
        private Image pulseDot;
        private float lastPanelSpriteH = -1f;
        private bool isHost;
        private bool isVisible = true;

        private void Awake()
        {
            if (WebGlShellMode.UsesExternalShell)
            {
                enabled = false;
                return;
            }

            BuildCanvas();
            isVisible = startVisible;
            ApplyVisibility();
            if (pulseDot != null) StartCoroutine(PulseDotRoutine(pulseDot));
        }

        private void Update()
        {
            bool pressed = false;
            if (UnityEngine.InputSystem.Keyboard.current != null
                && UnityEngine.InputSystem.Keyboard.current.hKey.wasPressedThisFrame)
                pressed = true;
#if ENABLE_LEGACY_INPUT_MANAGER
            else if (Input.GetKeyDown(toggleKey))
                pressed = true;
#endif
            if (pressed)
                SetVisible(!isVisible);
        }

        public void SetVisible(bool visible)
        {
            isVisible = visible;
            ApplyVisibility();
        }

        private void ApplyVisibility()
        {
            if (canvasGO != null)
                canvasGO.SetActive(isVisible);
        }

        private void OnDestroy()
        {
            if (canvasGO != null) Destroy(canvasGO);
        }

        public void SetHost(bool host)
        {
            isHost = host;
            if (canvasGO != null) RebuildRows();
        }

        // ---------------------------------------------------------------
        // Canvas shell
        // ---------------------------------------------------------------

        private void BuildCanvas()
        {
            canvasGO = new GameObject("ControlsGuideCanvas");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 7500;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGO.AddComponent<GraphicRaycaster>();

            BuildPanel();
        }

        private void BuildPanel()
        {
            // Soft drop shadow rendered behind the glass card (0 20px 50px rgba(0,0,0,.5)).
            GameObject shadowGO = CreateUIObject("Shadow", canvasGO.transform);
            var shadowImg = shadowGO.AddComponent<Image>();
            shadowImg.raycastTarget = false;
            shadowImg.color = Color.white;
            shadowRect = shadowGO.GetComponent<RectTransform>();
            shadowRect.anchorMin = new Vector2(1, 1);
            shadowRect.anchorMax = new Vector2(1, 1);
            shadowRect.pivot = new Vector2(1, 1);
            shadowRect.anchoredPosition = new Vector2(-16, -16);

            // Outer glass panel. Mask clips the header/content/footer to the
            // rounded shape so child rects never poke out of the corners.
            GameObject panel = CreateUIObject("Panel", canvasGO.transform);
            var panelImg = panel.AddComponent<Image>();
            panelImg.raycastTarget = false;
            panelImg.color = Color.white;
            panel.AddComponent<Mask>().showMaskGraphic = true;
            panelRect = panel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(1, 1);
            panelRect.anchorMax = new Vector2(1, 1);
            panelRect.pivot = new Vector2(1, 1);
            panelRect.sizeDelta = new Vector2(PANEL_WIDTH, 200);
            panelRect.anchoredPosition = new Vector2(-16, -16);

            // Header strip.
            BuildHeader(panel.transform);

            // Content rows area (inset by the same 24px as px-panel-padding).
            contentRect = CreateUIObject("Content", panel.transform).GetComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0, 0);
            contentRect.anchorMax = new Vector2(1, 1);
            contentRect.offsetMin = new Vector2(CONTENT_PAD, FOOTER_HEIGHT + 8);
            contentRect.offsetMax = new Vector2(-CONTENT_PAD, -(HEADER_HEIGHT + 2));

            // Gradient footer line.
            BuildFooter(panel.transform);

            RebuildRows();
        }

        private void BuildHeader(Transform panel)
        {
            // Header strip (bg-surface-container-high/40, border-b).
            GameObject header = CreateUIObject("Header", panel);
            var headerImg = header.AddComponent<Image>();
            headerImg.color = COLOR_SURFACE_HIGH;
            headerImg.raycastTarget = false;
            RectTransform hRect = header.GetComponent<RectTransform>();
            hRect.anchorMin = new Vector2(0, 1);
            hRect.anchorMax = new Vector2(1, 1);
            hRect.pivot = new Vector2(0.5f, 1);
            hRect.sizeDelta = new Vector2(0, HEADER_HEIGHT);
            hRect.anchoredPosition = Vector2.zero;

            // Gamepad glyph.
            GameObject iconGO = CreateUIObject("GamepadIcon", header.transform);
            var iconImage = iconGO.AddComponent<Image>();
            iconImage.sprite = CreateIconSprite(IconKind.Gamepad, COLOR_GOLD);
            iconImage.preserveAspect = true;
            iconImage.raycastTarget = false;
            iconImage.color = new Color(1f, 1f, 1f, 0.85f);
            RectTransform iconRect = iconGO.GetComponent<RectTransform>();
            iconRect.anchorMin = new Vector2(0, 0.5f);
            iconRect.anchorMax = new Vector2(0, 0.5f);
            iconRect.pivot = new Vector2(0.5f, 0.5f);
            iconRect.sizeDelta = new Vector2(18, 18);
            iconRect.anchoredPosition = new Vector2(24, 0);

            // Title — letter-spaced to approximate the monospace tracking-widest.
            Text title = CreateTextAt(header.transform, "Title", "H O W   T O   P L A Y", TITLE_FONT, TextAnchor.MiddleLeft);
            title.color = COLOR_GOLD;
            title.fontStyle = FontStyle.Bold;
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            title.verticalOverflow = VerticalWrapMode.Overflow;
            title.raycastTarget = false;
            RectTransform tRect = title.GetComponent<RectTransform>();
            tRect.anchorMin = new Vector2(0, 0);
            tRect.anchorMax = new Vector2(1, 1);
            tRect.offsetMin = new Vector2(50, 0);
            tRect.offsetMax = new Vector2(-80, 0);

            // Status dots — first is the pulsing secondary gold, the rest surface-variant.
            for (int i = 0; i < 3; i++)
            {
                GameObject dot = CreateUIObject($"Dot{i}", header.transform);
                var dotImg = dot.AddComponent<Image>();
                dotImg.raycastTarget = false;
                dotImg.color = i == 0 ? COLOR_GOLD : COLOR_SURFACE_VARIANT;
                RectTransform dRect = dot.GetComponent<RectTransform>();
                dRect.anchorMin = new Vector2(1, 0.5f);
                dRect.anchorMax = new Vector2(1, 0.5f);
                dRect.pivot = new Vector2(0.5f, 0.5f);
                dRect.sizeDelta = new Vector2(8, 8);
                dRect.anchoredPosition = new Vector2(-20 - i * 14, 0);
                if (i == 0) pulseDot = dotImg;
            }

            // Bottom divider (border-b border-on-surface-variant/20).
            GameObject divider = CreateUIObject("Divider", header.transform);
            var divImg = divider.AddComponent<Image>();
            divImg.color = COLOR_DIVIDER;
            divImg.raycastTarget = false;
            RectTransform dvRect = divider.GetComponent<RectTransform>();
            dvRect.anchorMin = new Vector2(0, 0);
            dvRect.anchorMax = new Vector2(1, 0);
            dvRect.pivot = new Vector2(0.5f, 0);
            dvRect.sizeDelta = new Vector2(0, 1);
            dvRect.anchoredPosition = Vector2.zero;
        }

        private void BuildFooter(Transform panel)
        {
            // from-transparent via-secondary/50 to-transparent, opacity-50
            GameObject footer = CreateUIObject("Footer", panel);
            var footerImg = footer.AddComponent<Image>();
            footerImg.sprite = CreateFooterSprite();
            footerImg.type = Image.Type.Simple;
            footerImg.preserveAspect = false;
            footerImg.raycastTarget = false;
            RectTransform fRect = footer.GetComponent<RectTransform>();
            fRect.anchorMin = new Vector2(0, 0);
            fRect.anchorMax = new Vector2(1, 0);
            fRect.pivot = new Vector2(0.5f, 0);
            fRect.sizeDelta = new Vector2(PANEL_WIDTH, FOOTER_HEIGHT);
            fRect.anchoredPosition = Vector2.zero;
        }

        // ---------------------------------------------------------------
        // Rows
        // ---------------------------------------------------------------

        private void RebuildRows()
        {
            if (contentRect == null) return;

            // Destroy previous rows.
            for (int i = contentRect.childCount - 1; i >= 0; i--)
            {
                Transform c = contentRect.GetChild(i);
                if (c != null) Destroy(c.gameObject);
            }

            var rows = new (IconKind icon, string action, string key)[]
            {
                (IconKind.Keyboard,  "Move Around",    "WASD"),
                (IconKind.Laser,     "Use Laser",      "L-CLK"),
                (IconKind.Waypoint,  "Drop a Pin",     "F"),
                (IconKind.Waypoint,  "Rename Pin",     "L-CLK"),
                (IconKind.Delete,    "Delete Pin",     "SHIFT+R-CLK"),
            };

            // showHostOnly=true → summon row for hosts only; false → all guests (museum).
            if (!showHostOnly || isHost)
                rows = Append(rows, (IconKind.Summon, "Open Object Menu", "Q"));

            rows = Append(rows, (IconKind.Chat, "Open Chat", "ENTER"));
            rows = Append(rows, (IconKind.Gamepad, "Hide guide", "H"));

            // Build rows top-down inside the content area.
            for (int i = 0; i < rows.Length; i++)
            {
                CreateRow(rows[i].icon, rows[i].action, rows[i].key, i);
            }

            ResizePanel(rows.Length);
        }

        private void CreateRow(IconKind kind, string action, string key, int index)
        {
            float rowStep = ROW_HEIGHT + ROW_GAP;
            float y = -(CONTENT_PAD + index * rowStep);

            // Key badge is sized to its content (px-2 py-1 rounded border).
            float keyTextW = MeasureText(key, KEY_FONT, FontStyle.Bold);
            float badgeW = Mathf.Max(30f, keyTextW + 18f);

            // Row root anchored to the top of the content area.
            GameObject row = CreateUIObject("Row", contentRect);
            RectTransform rRect = row.GetComponent<RectTransform>();
            rRect.anchorMin = new Vector2(0, 1);
            rRect.anchorMax = new Vector2(1, 1);
            rRect.pivot = new Vector2(0.5f, 1);
            rRect.anchoredPosition = new Vector2(0, y);
            rRect.sizeDelta = new Vector2(0, ROW_HEIGHT);

            // Label (icon + action text) — leaves room for the badge on the right.
            GameObject labelGO = CreateUIObject("Label", row.transform);
            var labelImg = labelGO.AddComponent<Image>();
            labelImg.color = Color.clear;
            labelImg.raycastTarget = false;
            RectTransform labelRect = labelGO.GetComponent<RectTransform>();
            labelRect.anchorMin = new Vector2(0, 0);
            labelRect.anchorMax = new Vector2(1, 1);
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = new Vector2(-(badgeW + 20), 0);

            // Icon (70% opacity, like the HTML opacity-70).
            GameObject iconGO = CreateUIObject("Icon", labelGO.transform);
            var iconImage = iconGO.AddComponent<Image>();
            iconImage.sprite = CreateIconSprite(kind, COLOR_GOLD);
            iconImage.preserveAspect = true;
            iconImage.raycastTarget = false;
            iconImage.color = new Color(1f, 1f, 1f, 0.7f);
            RectTransform iconRect = iconGO.GetComponent<RectTransform>();
            iconRect.anchorMin = new Vector2(0, 0.5f);
            iconRect.anchorMax = new Vector2(0, 0.5f);
            iconRect.pivot = new Vector2(0.5f, 0.5f);
            iconRect.sizeDelta = new Vector2(18, 18);
            iconRect.anchoredPosition = new Vector2(12, 0);

            // Action text (body-md 16px, on-surface-variant).
            Text actionText = CreateTextAt(labelGO.transform, "Action", action, ACTION_FONT, TextAnchor.MiddleLeft);
            actionText.color = COLOR_TEXT;
            actionText.raycastTarget = false;
            RectTransform aRect = actionText.GetComponent<RectTransform>();
            aRect.anchorMin = new Vector2(0, 0);
            aRect.anchorMax = new Vector2(1, 1);
            aRect.offsetMin = new Vector2(42, 0);
            aRect.offsetMax = new Vector2(-2, 0);

            // Key badge — rounded pill with 1px gold border and gold-glow text.
            GameObject badge = CreateUIObject("Badge", row.transform);
            var badgeImg = badge.AddComponent<Image>();
            badgeImg.sprite = CreateRoundedSprite((int)badgeW, (int)BADGE_HEIGHT, BADGE_RADIUS, COLOR_BADGE_FILL, 1f, COLOR_BADGE_BORDER);
            badgeImg.raycastTarget = false;
            RectTransform bRect = badge.GetComponent<RectTransform>();
            bRect.anchorMin = new Vector2(1, 0.5f);
            bRect.anchorMax = new Vector2(1, 0.5f);
            bRect.pivot = new Vector2(0.5f, 0.5f);
            bRect.sizeDelta = new Vector2(badgeW, BADGE_HEIGHT);
            bRect.anchoredPosition = new Vector2(-(12f + badgeW * 0.5f), 0);

            Text keyText = CreateTextAt(badge.transform, "Key", key, KEY_FONT, TextAnchor.MiddleCenter);
            keyText.color = COLOR_GOLD;
            keyText.fontStyle = FontStyle.Bold;
            keyText.raycastTarget = false;
            keyText.horizontalOverflow = HorizontalWrapMode.Overflow;
            keyText.verticalOverflow = VerticalWrapMode.Overflow;
            RectTransform kRect = keyText.GetComponent<RectTransform>();
            kRect.anchorMin = Vector2.zero;
            kRect.anchorMax = Vector2.one;
            kRect.offsetMin = new Vector2(1, 0);
            kRect.offsetMax = new Vector2(-1, 0);

            // Gold glow (text-shadow approximating the .gold-glow class).
            var glow = keyText.gameObject.AddComponent<Shadow>();
            glow.effectColor = new Color(1f, 0.855f, 0.616f, 0.35f);
            glow.effectDistance = new Vector2(1f, -1f);
        }

        private static (IconKind, string, string)[] Append(
            (IconKind, string, string)[] arr,
            (IconKind, string, string) item)
        {
            var result = new (IconKind, string, string)[arr.Length + 1];
            System.Array.Copy(arr, result, arr.Length);
            result[arr.Length] = item;
            return result;
        }

        private void ResizePanel(int rowCount = 6)
        {
            if (panelRect == null) return;

            float rowsH = rowCount * ROW_HEIGHT + (rowCount - 1) * ROW_GAP;
            float panelH = HEADER_HEIGHT + CONTENT_PAD * 2 + rowsH + FOOTER_HEIGHT + 10f;
            panelRect.sizeDelta = new Vector2(PANEL_WIDTH, panelH);

            // Regenerate the glass card (rounded gradient + cyan rim) and its
            // soft shadow only when the size actually changes.
            if (!Mathf.Approximately(lastPanelSpriteH, panelH))
            {
                lastPanelSpriteH = panelH;
                var panelImg = panelRect.GetComponent<Image>();
                if (panelImg != null)
                    panelImg.sprite = CreatePanelSprite((int)PANEL_WIDTH, (int)panelH);

                if (shadowRect != null)
                {
                    float texW = PANEL_WIDTH + SHADOW_SIDE * 2f;
                    float texH = panelH + SHADOW_BOTTOM;
                    shadowRect.sizeDelta = new Vector2(texW, texH);
                    shadowRect.GetComponent<Image>().sprite =
                        CreateShadowSprite((int)texW, (int)texH, (int)PANEL_WIDTH, (int)panelH);
                }
            }
        }

        // ---------------------------------------------------------------
        // Procedural sprite factories
        // ---------------------------------------------------------------

        /// <summary>Signed distance to a rounded rectangle (inside is negative).</summary>
        private static float SdfRoundedRect(float px, float py, float cx, float cy, float hw, float hh, float r)
        {
            float qx = Mathf.Abs(px - cx) - (hw - r);
            float qy = Mathf.Abs(py - cy) - (hh - r);
            float ox = Mathf.Max(qx, 0f), oy = Mathf.Max(qy, 0f);
            return Mathf.Min(Mathf.Max(qx, qy), 0f) + Mathf.Sqrt(ox * ox + oy * oy) - r;
        }

        /// <summary>
        /// The glass card: vertical gradient fill (top #1B1B23 70% → bottom
        /// #0D0D15 80%), rounded corners, and a 1.5px border — cyan on the top/
        /// left edges, warm neutral on the bottom/right.
        /// </summary>
        private static Sprite CreatePanelSprite(int w, int h)
        {
            const float borderW = 1.5f;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            float cx = w * 0.5f, cy = h * 0.5f;
            float hw = w * 0.5f - PANEL_RADIUS;
            float hh = h * 0.5f - PANEL_RADIUS;

            for (int y = 0; y < h; y++)
            {
                Color fill = Color.Lerp(COLOR_SURFACE_BOT, COLOR_SURFACE_TOP, (float)y / (h - 1));
                for (int x = 0; x < w; x++)
                {
                    float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, PANEL_RADIUS);
                    Color c = fill;
                    if (sdf >= -borderW - 1f)
                    {
                        bool nearTop  = y >= h - borderW;
                        bool nearLeft = x < borderW;
                        Color edge = (nearTop || nearLeft) ? COLOR_CYAN_EDGE : COLOR_NEUTRAL_EDGE;
                        float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                        c = Color.Lerp(fill, edge, t);
                    }
                    c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                    px[y * w + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }

        /// <summary>Generic rounded rect: fill color with an optional 1px border ring.</summary>
        private static Sprite CreateRoundedSprite(int w, int h, float radius, Color fill, float borderW, Color border)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            float cx = w * 0.5f, cy = h * 0.5f;
            float hw = w * 0.5f - radius;
            float hh = h * 0.5f - radius;

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, radius);
                    Color c = fill;
                    if (sdf >= -borderW - 1f)
                    {
                        float t = Mathf.Clamp01((sdf + borderW + 1f) * 0.5f);
                        c = Color.Lerp(fill, border, t);
                    }
                    c.a *= Mathf.Clamp01(1.2f - Mathf.Max(0f, sdf));
                    px[y * w + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }

        /// <summary>
        /// Soft drop shadow, baked into a transparent texture. The card occupies
        /// the top part of the texture; the shadow falls off below its bottom edge.
        /// </summary>
        private static Sprite CreateShadowSprite(int texW, int texH, int panelW, int panelH)
        {
            var tex = new Texture2D(texW, texH, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[texW * texH];
            float cx = texW * 0.5f;
            // Texture2D y=0 is the BOTTOM row, so the card sits in the upper
            // rows (texY in [SHADOW_BOTTOM, texH)) to align with the panel's
            // top edge when the rects share the same top anchor.
            float cy = SHADOW_BOTTOM + panelH * 0.5f;
            float hw = panelW * 0.5f - PANEL_RADIUS;
            float hh = panelH * 0.5f - PANEL_RADIUS;

            for (int y = 0; y < texH; y++)
            {
                for (int x = 0; x < texW; x++)
                {
                    float a = 0f;
                    if (y < SHADOW_BOTTOM) // below the card's bottom edge — "0 20px 50px" falloff
                    {
                        float sdf = SdfRoundedRect(x + 0.5f, y + 0.5f, cx, cy, hw, hh, PANEL_RADIUS);
                        if (sdf > SHADOW_OFFSET)
                            a = SHADOW_ALPHA * (1f - Mathf.Clamp01((sdf - SHADOW_OFFSET) / SHADOW_BLUR));
                    }
                    px[y * texW + x] = new Color(0f, 0f, 0f, a);
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, texW, texH), new Vector2(0.5f, 0.5f), 100f);
        }

        /// <summary>Horizontal gold gradient line (via-secondary/50, opacity-50).</summary>
        private static Sprite CreateFooterSprite()
        {
            const int w = 64, h = 8;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float t = (float)x / (w - 1);
                    float a = 0.5f * Mathf.Sin(t * Mathf.PI);
                    px[y * w + x] = new Color(1f, 0.855f, 0.616f, a);
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 100f);
        }

        private Sprite CreateIconSprite(IconKind kind, Color color)
        {
            int size = ICON_TEX_SIZE;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;

            var clear = new Color[size * size];
            System.Array.Fill(clear, Color.clear);
            tex.SetPixels(clear);

            switch (kind)
            {
                case IconKind.Keyboard:  DrawKeyboard(tex, color); break;
                case IconKind.Laser:     DrawLaser(tex, color); break;
                case IconKind.Delete:    DrawDelete(tex, color); break;
                case IconKind.Waypoint:  DrawWaypoint(tex, color); break;
                case IconKind.Summon:    DrawSummon(tex, color); break;
                case IconKind.Chat:      DrawChat(tex, color); break;
                case IconKind.Gamepad:   DrawGamepad(tex, color); break;
            }

            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
        }

        // ---------------------------------------------------------------
        // Pixel drawing primitives
        // ---------------------------------------------------------------

        private static void SetPx(Texture2D tex, int x, int y, Color c)
        {
            if (x < 0 || x >= tex.width || y < 0 || y >= tex.height) return;
            tex.SetPixel(x, y, c);
        }

        private static void DrawLine(Texture2D tex, int x0, int y0, int x1, int y1, Color c)
        {
            int dx = Mathf.Abs(x1 - x0), dy = Mathf.Abs(y1 - y0);
            int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            int err = dx - dy;
            while (true)
            {
                SetPx(tex, x0, y0, c);
                if (x0 == x1 && y0 == y1) break;
                int e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        private static void DrawRectOutline(Texture2D tex, int x0, int y0, int x1, int y1, Color c)
        {
            DrawLine(tex, x0, y0, x1, y0, c);
            DrawLine(tex, x1, y0, x1, y1, c);
            DrawLine(tex, x1, y1, x0, y1, c);
            DrawLine(tex, x0, y1, x0, y0, c);
        }

        private static void DrawCircleOutline(Texture2D tex, int cx, int cy, int r, Color c)
        {
            int x = r, y = 0, d = 1 - r;
            while (x >= y)
            {
                SetPx(tex, cx + x, cy + y, c); SetPx(tex, cx + y, cy + x, c);
                SetPx(tex, cx - y, cy + x, c); SetPx(tex, cx - x, cy + y, c);
                SetPx(tex, cx - x, cy - y, c); SetPx(tex, cx - y, cy - x, c);
                SetPx(tex, cx + y, cy - x, c); SetPx(tex, cx + x, cy - y, c);
                y++;
                if (d <= 0) d += 2 * y + 1;
                else { x--; d += 2 * (y - x) + 1; }
            }
        }

        // ---------------------------------------------------------------
        // Icon shapes
        // ---------------------------------------------------------------

        private static void DrawKeyboard(Texture2D tex, Color c)
        {
            DrawRectOutline(tex, 4, 14, 43, 34, c);
            for (int row = 0; row < 3; row++)
                for (int col = 0; col < 5; col++)
                    SetPx(tex, 9 + col * 7, 20 + row * 6, c);
        }

        private static void DrawLaser(Texture2D tex, Color c)
        {
            // Crosshair (engagement reticle) — reads as "laser interactor".
            DrawCircleOutline(tex, 24, 24, 12, c);
            DrawLine(tex, 24, 6, 24, 18, c);
            DrawLine(tex, 24, 30, 24, 42, c);
            DrawLine(tex, 6, 24, 18, 24, c);
            DrawLine(tex, 30, 24, 42, 24, c);
            SetPx(tex, 24, 24, c);
        }

        private static void DrawDelete(Texture2D tex, Color c)
        {
            // Trash / discard glyph.
            DrawLine(tex, 10, 14, 38, 14, c);
            DrawLine(tex, 12, 14, 15, 36, c);
            DrawLine(tex, 15, 36, 33, 36, c);
            DrawLine(tex, 33, 36, 36, 14, c);
            DrawLine(tex, 18, 13, 30, 13, c);
            DrawLine(tex, 19, 18, 19, 31, c);
            DrawLine(tex, 29, 18, 29, 31, c);
        }

        private static void DrawWaypoint(Texture2D tex, Color c)
        {
            // Location pin.
            DrawCircleOutline(tex, 24, 22, 8, c);
            DrawLine(tex, 24, 30, 24, 40, c);
            DrawLine(tex, 20, 38, 28, 38, c);
        }

        private static void DrawSummon(Texture2D tex, Color c)
        {
            DrawCircleOutline(tex, 24, 24, 14, c);
            DrawCircleOutline(tex, 24, 24, 9, c);
            SetPx(tex, 24, 24, c);
            SetPx(tex, 25, 24, c);
            SetPx(tex, 24, 25, c);
        }

        private static void DrawChat(Texture2D tex, Color c)
        {
            DrawRectOutline(tex, 6, 14, 42, 34, c);
            DrawLine(tex, 14, 14, 10, 8, c);
            DrawLine(tex, 10, 8, 20, 14, c);
            DrawLine(tex, 11, 20, 22, 20, c);
            DrawLine(tex, 11, 26, 26, 26, c);
            DrawLine(tex, 11, 32, 20, 32, c);
        }

        private static void DrawGamepad(Texture2D tex, Color c)
        {
            // Body bar.
            DrawRectOutline(tex, 8, 20, 40, 29, c);
            // Left handle.
            DrawLine(tex, 8, 24, 4, 27, c);
            DrawLine(tex, 4, 27, 4, 31, c);
            DrawLine(tex, 4, 31, 9, 33, c);
            DrawLine(tex, 9, 33, 12, 33, c);
            DrawLine(tex, 12, 33, 8, 24, c);
            // Right handle.
            DrawLine(tex, 40, 24, 44, 27, c);
            DrawLine(tex, 44, 27, 44, 31, c);
            DrawLine(tex, 44, 31, 39, 33, c);
            DrawLine(tex, 39, 33, 36, 33, c);
            DrawLine(tex, 36, 33, 40, 24, c);
            // D-pad (left side).
            DrawLine(tex, 16, 25, 16, 20, c);
            DrawLine(tex, 16, 29, 16, 24, c);
            DrawLine(tex, 13, 24, 19, 24, c);
            DrawLine(tex, 13, 25, 19, 25, c);
            // Face buttons (right side).
            SetPx(tex, 30, 28, c); SetPx(tex, 30, 22, c);
            SetPx(tex, 27, 25, c); SetPx(tex, 33, 25, c);
            SetPx(tex, 28, 25, c); SetPx(tex, 32, 25, c);
            // Center select/start dots.
            SetPx(tex, 22, 24, c); SetPx(tex, 22, 25, c);
            SetPx(tex, 25, 24, c); SetPx(tex, 25, 25, c);
        }

        // ---------------------------------------------------------------
        // Generic UI helpers
        // ---------------------------------------------------------------

        private static Font uiFont;
        private static Font UiFont
        {
            get
            {
                if (uiFont == null)
                    uiFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return uiFont;
            }
        }

        /// <summary>Predicts the rendered width of text in the built-in font.</summary>
        private static float MeasureText(string s, int fontSize, FontStyle style)
        {
            Font f = UiFont;
            if (f == null) return s.Length * fontSize * 0.6f;
            f.RequestCharactersInTexture(s, fontSize, style);
            float total = 0f;
            foreach (char ch in s)
            {
                if (f.GetCharacterInfo(ch, out CharacterInfo ci, fontSize, style))
                    total += ci.advance;
                else
                    total += fontSize * 0.6f;
            }
            return total;
        }

        private static Text CreateTextAt(Transform parent, string name, string content, int fontSize, TextAnchor anchor)
        {
            GameObject go = CreateUIObject(name, parent);
            var text = go.AddComponent<Text>();
            text.text = content;
            text.font = UiFont;
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.color = Color.white;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            return text;
        }

        private static GameObject CreateUIObject(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<RectTransform>();
            return go;
        }

        /// <summary>Pulses the first status dot like the HTML animate-pulse.</summary>
        private IEnumerator PulseDotRoutine(Image dot)
        {
            var baseColor = COLOR_GOLD;
            while (dot != null)
            {
                float t = (Mathf.Sin(Time.unscaledTime * 4f) + 1f) * 0.5f;
                dot.color = new Color(baseColor.r, baseColor.g, baseColor.b, 0.4f + 0.6f * t);
                yield return null;
            }
        }
    }
}