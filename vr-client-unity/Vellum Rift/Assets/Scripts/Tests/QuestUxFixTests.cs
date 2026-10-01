using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using VellumRift;

namespace VellumRift.Tests
{
    /// <summary>
    /// EditMode coverage for #285 model auth guards and #286 chase-cam XR skip.
    /// </summary>
    public class QuestUxFixTests
    {
        [Test]
        public void RequiresBearerAuth_DetectsModelsApiPath()
        {
            Assert.That(
                RemoteModelLoader.RequiresBearerAuth(
                    "https://iis.memphis.edu/apis/vellumrift/api/models/abc"),
                Is.True);
            Assert.That(
                RemoteModelLoader.RequiresBearerAuth("https://cdn.example.com/mesh.glb"),
                Is.False);
            Assert.That(RemoteModelLoader.RequiresBearerAuth(""), Is.False);
            Assert.That(RemoteModelLoader.RequiresBearerAuth(null), Is.False);
        }

        [Test]
        public void ShouldApplyChaseCam_FalseWhenXrActive()
        {
            Assert.That(SessionManager.ShouldApplyChaseCam(xrActive: true), Is.False);
            Assert.That(SessionManager.ShouldApplyChaseCam(xrActive: false), Is.True);
        }

        [Test]
        public void GuideRows_Xr_PinIsLeftPrimary_NotRightTrigger()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain("Place Pin=L-A"));
            Assert.That(joined, Does.Contain("Laser Pointer=R-TRIGGER"));
            Assert.That(joined, Does.Contain("R-STICK snap"));
            // Must not claim pin is the same as laser trigger.
            Assert.That(joined, Does.Not.Contain("Select / Pin=R-TRIGGER"));
            Assert.That(joined, Does.Not.Contain("Place Pin=R-TRIGGER"));
        }

        [Test]
        public void IsBrokenOrMissingShader_NullMaterial_IsTrue()
        {
            Assert.That(RemoteModelLoader.IsBrokenOrMissingShader(null), Is.True);
        }

        [Test]
        public void EnsureQuestReadableMaterials_NullRoot_ReturnsZero()
        {
            Assert.That(RemoteModelLoader.EnsureQuestReadableMaterials(null), Is.EqualTo(0));
        }

        [Test]
        public void QuestHudLayout_IsCompactAndSpaced()
        {
            Assert.That(VrTheme.QuestHudWorldScale, Is.InRange(0.002f, 0.0035f));
            Assert.That(VrTheme.QuestLobbyWorldScale, Is.InRange(0.002f, 0.0035f));
            Assert.That(VrTheme.QuestDynamicPixelsPerUnit, Is.GreaterThan(10f));
            Assert.That(VrTheme.HudPanelDistance, Is.EqualTo(2.50f).Within(0.001f));
            Assert.That(VrTheme.HudCenterClearance, Is.EqualTo(0.62f).Within(0.001f));
            Assert.That(VrTheme.HudSlotVerticalGap, Is.EqualTo(0.24f).Within(0.001f));
            Assert.That(VrTheme.MinHitHeightPx, Is.GreaterThanOrEqualTo(64f));
        }

        [Test]
        public void HandVisual_StaysHiddenWhenTheControllerIsOnTheCamera()
        {
            var cam = Vector3.zero;
            Assert.That(
                VellumRift.Control.TrackedHandVisual.ShouldShow(new Vector3(0f, 0f, 0.05f), cam, tracked: true),
                Is.False);
            Assert.That(
                VellumRift.Control.TrackedHandVisual.ShouldShow(new Vector3(0.4f, -0.2f, 0.35f), cam, tracked: false),
                Is.False);
            Assert.That(
                VellumRift.Control.TrackedHandVisual.ShouldShow(new Vector3(0.4f, -0.2f, 0.35f), cam, tracked: true),
                Is.True);
        }

        [Test]
        public void MarkerScale_DoesNotExplodeWhenEyeBufferHeightIsTiny()
        {
            float scale = VellumRift.Environment.BillboardMarker.ComputeWorldScale(
                distance: 1.2f,
                fovDegrees: 90f,
                pixelHeight: 1f,
                screenHeightPixels: 110f,
                minWorldScale: 0.12f,
                maxWorldScale: 0.55f);
            Assert.That(scale, Is.LessThanOrEqualTo(0.55f));
            Assert.That(scale, Is.EqualTo(0.28f).Within(0.001f));
            Assert.That(VellumRift.Environment.BillboardMarker.ShouldHide(0.2f, 0.45f), Is.True);
            Assert.That(VellumRift.Environment.BillboardMarker.ShouldHide(2f, 0.45f), Is.False);
        }

        [Test]
        public void HudSidePanels_StayOutsideTheCentralSightline()
        {
            const float w = 448f;
            const float h = 500f;
            float scale = VrTheme.QuestHudWorldScale;
            float halfW = w * scale * 0.5f;
            float halfH = h * scale * 0.5f;

            Vector3 lower = XrHudFollow.SlotOffset(XrHudSlot.LowerRight, w, h, scale);
            float innerEdge = Mathf.Abs(lower.x) - halfW;
            Assert.That(innerEdge, Is.GreaterThanOrEqualTo(VrTheme.HudCenterClearance - 0.001f));
            Assert.That(lower.z, Is.GreaterThanOrEqualTo(1.5f));
            Assert.That(lower.y, Is.EqualTo(-(halfH + VrTheme.HudSlotVerticalGap)).Within(0.001f));

            Vector3 upper = XrHudFollow.SlotOffset(XrHudSlot.UpperRight, w, h, scale);
            Assert.That(upper.y, Is.EqualTo(halfH + VrTheme.HudSlotVerticalGap).Within(0.001f));
            Assert.That(upper.y - lower.y, Is.GreaterThanOrEqualTo(2f * halfH - 0.001f),
                "Upper/lower centers must be at least one full panel height apart so stacks do not overlap.");

            Vector3 center = XrHudFollow.SlotOffset(
                XrHudSlot.Center, 920f, 780f, VrTheme.QuestLobbyWorldScale);
            Assert.That(center.x, Is.EqualTo(0f).Within(0.001f));
            Assert.That(center.z, Is.InRange(1.5f, 3f));
        }

        // ---------------------------------------------------------------
        // #FTR-005 — "yellow square in the view" regression guards
        // ---------------------------------------------------------------

        [Test]
        public void LineShader_Resolves_SoLineGeometryNeverUsesTheDefaultMaterial()
        {
            VellumShaders.ClearCache();
            Assert.That(VellumShaders.ResolveLine(), Is.Not.Null,
                "The project-owned line shader must exist under Assets/Resources/Shaders, "
                + "otherwise LineRenderer geometry falls back to an untinted slab.");
            Assert.That(VellumShaders.TryCreateLineMaterial(Color.white), Is.Not.Null);
        }

        [Test]
        public void MarkerShader_Resolves_SoPinsRenderAsGlyphsNotParchmentSquares()
        {
            VellumShaders.ClearCache();
            Assert.That(VellumShaders.ResolveMarker(), Is.Not.Null,
                "VellumRift/AnimatedMarker must exist: ArtifactManager and "
                + "SpatialIndicatorSystem both load it by resource path and by name.");
        }

        [Test]
        public void ShaderFactories_NeverThrow_AndRejectNullMaterials()
        {
            Assert.That(VellumShaders.IsRenderable(null), Is.False);
            Assert.DoesNotThrow(() => VellumShaders.ApplyTint(null, Color.white));
            Assert.That(VellumShaders.TryCreateLineMaterial(Color.red), Is.Not.Null);
        }

        [Test]
        public void BillboardMarker_AppliesGlyphMaterial_WithoutThrowing()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            var marker = go.AddComponent<VellumRift.Environment.BillboardMarker>();

            bool applied = marker.ApplyMarkerGlyph(
                new Color(1f, 0.8f, 0.4f), new Color(0f, 0.86f, 0.91f), 2.5f, 3f, 1.2f);

            Assert.That(applied, Is.True);
            var renderer = go.GetComponent<Renderer>();
            Assert.That(renderer.sharedMaterial, Is.Not.Null);
            Assert.That(renderer.sharedMaterial.shader.name,
                Is.EqualTo(VellumShaders.MarkerShaderName));

            Object.DestroyImmediate(go);
        }

        [Test]
        public void BillboardMarker_SuppressedQuad_StaysHidden()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            var marker = go.AddComponent<VellumRift.Environment.BillboardMarker>();

            marker.SuppressForMissingMaterial();

            Assert.That(go.GetComponent<Renderer>().enabled, Is.False,
                "A marker with no glyph material must stay hidden instead of drawing a square.");
            Object.DestroyImmediate(go);
        }

        [Test]
        public void CameraParentedHud_StaysOutsideTheQuestNearField()
        {
            Assert.That(VellumRift.Environment.HudPanelPlane.MinPlaneDistance,
                Is.GreaterThanOrEqualTo(1.5f),
                "A camera-parented plane closer than ~1.5 m reads as a wall in the visor.");
        }

        [Test]
        public void PlayerAvatar_HidesBeforeItCanFillTheView()
        {
            Assert.That(VellumRift.Environment.PlayerBookVisual.MinVisibleDistance,
                Is.GreaterThanOrEqualTo(0.75f),
                "The pill avatar must hide before its mesh crosses the near plane.");
        }

        [Test]
        public void ChatInputRow_FitsAQuestReadableHitTarget()
        {
            FieldInfo field = typeof(ChatManager).GetField(
                "INPUT_ROW_HEIGHT", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.That(field, Is.Not.Null, "ChatManager must size its input row for Touch input.");
            Assert.That((float)field.GetRawConstantValue(),
                Is.GreaterThanOrEqualTo(VrTheme.MinHitHeightPx));
        }

        [Test]
        public void PinLabel_KeepsAFixedWorldSize_IndependentOfTheBillboardQuad()
        {
            var pin = GameObject.CreatePrimitive(PrimitiveType.Quad);
            // Simulate the screen-constant scale BillboardMarker rewrites every frame.
            pin.transform.localScale = Vector3.one * 0.28f;
            var marker = pin.AddComponent<WaypointMarker>();
            marker.SetLabel("Test pin");

            Transform label = null;
            foreach (Canvas canvas in Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
            {
                if (canvas.name == "PinLabelCanvas")
                {
                    label = canvas.transform;
                    break;
                }
            }

            Assert.That(label, Is.Not.Null, "SetLabel must create the world-space label canvas.");
            Assert.That(label.parent, Is.Null,
                "The label must not inherit the billboard quad's per-frame scale.");

            float worldWidth = label.GetComponent<RectTransform>().rect.width * label.localScale.x;
            Assert.That(worldWidth, Is.InRange(0.5f, 1.2f),
                "A pin label wider than ~1.2 m becomes a slab in the visor.");

            Object.DestroyImmediate(pin);
        }

        [Test]
        public void ModalPlacement_UsesCameraForward()
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            camGo.transform.position = new Vector3(0f, 1.6f, 0f);
            camGo.transform.rotation = Quaternion.Euler(10f, 30f, 0f);

            var panel = new GameObject("Modal");
            const float dist = 2f;
            XrHudFollow.PlaceModal(panel.transform, 920f, 780f, VrTheme.QuestLobbyWorldScale, dist);

            Vector3 expected = camGo.transform.position + camGo.transform.forward * dist;
            Assert.That(panel.transform.position, Is.EqualTo(expected).Within(0.02f));

            Object.DestroyImmediate(camGo);
            Object.DestroyImmediate(panel);
        }

        [Test]
        public void CameraViewport_FacesTheHmd()
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.AddComponent<Camera>();
            camGo.transform.position = new Vector3(0f, 1.6f, 0f);

            var panel = new GameObject("SpatialViewport");
            XrHudFollow.PlaceCameraViewport(panel.transform, 960f, 540f, 2.35f);

            Assert.That(panel.transform.parent, Is.EqualTo(camGo.transform));
            Assert.That(panel.transform.localEulerAngles.y, Is.EqualTo(180f).Within(0.1f));
            Assert.That(panel.transform.localPosition.z, Is.EqualTo(2.35f).Within(0.001f));

            Object.DestroyImmediate(camGo);
        }

        [Test]
        public void ManuscriptPlaySpace_SoftRadiusMatchesBoundsPlusMargin()
        {
            ManuscriptPlaySpace.Clear();
            var bounds = new Bounds(Vector3.zero, new Vector3(20f, 2f, 30f));
            ManuscriptPlaySpace.Configure(bounds, marginMeters: 4f);

            float expected = bounds.extents.magnitude + 4f;
            Assert.That(ManuscriptPlaySpace.SoftRadius, Is.EqualTo(expected).Within(0.01f));
            Assert.That(ManuscriptPlaySpace.HorizontalDistance(bounds.center), Is.EqualTo(0f).Within(0.001f));

            ManuscriptPlaySpace.Clear();
        }

        [Test]
        public void ManuscriptPlaySpace_SoftRadiusIncludesGallerySpawnRing()
        {
            ManuscriptPlaySpace.Clear();
            var bounds = new Bounds(Vector3.zero, new Vector3(4f, 1f, 4f));
            const float spawnR = 18f;
            ManuscriptPlaySpace.Configure(bounds, marginMeters: 4f, gallerySpawnRadius: spawnR);

            float fromBounds = bounds.extents.magnitude + 4f;
            float fromSpawn = spawnR + ManuscriptPlaySpace.SpawnRadiusBufferMeters;
            Assert.That(ManuscriptPlaySpace.SoftRadius, Is.EqualTo(Mathf.Max(fromBounds, fromSpawn)).Within(0.01f));
            Assert.That(ManuscriptPlaySpace.SpawnRadiusInsideSoftBoundary(spawnR), Is.True);

            ManuscriptPlaySpace.Clear();
        }

        [Test]
        public void ManuscriptPlaySpace_MoveMultiplierNeverDropsBelowFloor()
        {
            ManuscriptPlaySpace.Clear();
            ManuscriptPlaySpace.Configure(new Bounds(Vector3.zero, Vector3.one * 10f), gallerySpawnRadius: 8f);
            float pastHard = ManuscriptPlaySpace.SoftRadius + ManuscriptPlaySpace.HardEdgeExtraMeters + 2f;
            Assert.That(
                ManuscriptPlaySpace.GetMoveSpeedMultiplierAtDistance(pastHard),
                Is.EqualTo(ManuscriptPlaySpace.MinMoveMultiplier).Within(0.001f));
            Assert.That(
                ManuscriptPlaySpace.GetMoveSpeedMultiplierAtDistance(pastHard),
                Is.GreaterThan(0f));

            ManuscriptPlaySpace.Clear();
        }
    }
}
