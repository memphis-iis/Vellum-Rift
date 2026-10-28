using NUnit.Framework;
using UnityEngine;
using VellumRift;
using VellumRift.Environment;

namespace VellumRift.Tests
{
    public class GallerySpawnTests
    {
        private GameObject host;

        [TearDown]
        public void TearDown()
        {
            if (host != null)
                Object.DestroyImmediate(host);
            host = null;
            if (GalleryEnvironment.Instance != null)
                Object.DestroyImmediate(GalleryEnvironment.Instance.gameObject);
            RenderSettings.skybox = null;
        }

        [Test]
        public void GetSpawnSlot_IsOutsideDefaultManuscriptFootprint()
        {
            host = new GameObject("GalleryHost");
            var gallery = host.AddComponent<GalleryEnvironment>();
            gallery.EnsurePlate();

            Assert.That(gallery.SpawnRadius, Is.GreaterThanOrEqualTo(12f));

            var (pos, rot) = gallery.GetSpawnSlot(0);
            Assert.That(pos.magnitude, Is.EqualTo(gallery.SpawnRadius).Within(0.05f));
            Assert.That(Vector3.Dot(rot * Vector3.forward, (Vector3.zero - pos).normalized), Is.GreaterThan(0.99f));
        }

        [Test]
        public void SetSpawnRadius_RebuildsRingFartherOut()
        {
            host = new GameObject("GalleryHost");
            var gallery = host.AddComponent<GalleryEnvironment>();
            gallery.EnsurePlate();
            gallery.SetSpawnRadius(20f);

            Assert.That(gallery.SpawnRadius, Is.EqualTo(20f).Within(0.01f));
            var (pos, _) = gallery.GetSpawnSlot(0);
            Assert.That(pos.magnitude, Is.EqualTo(20f).Within(0.05f));
        }

        [Test]
        public void EnsurePlate_BuildsDeckEdgeAndHorizonGlow()
        {
            host = new GameObject("GalleryHost");
            var gallery = host.AddComponent<GalleryEnvironment>();
            gallery.EnsurePlate();

            Assert.That(gallery.HasDeckEdgeGlow, Is.True);
            Assert.That(gallery.HasHorizonRing, Is.True);
            Assert.That(host.transform.Find("GallerySpawnGlow"), Is.Not.Null);
            Assert.That(host.transform.Find("GalleryDeckEdgeInner"), Is.Not.Null);
        }

        [Test]
        public void EnsurePlate_UsesVoidLightingWithoutSkybox()
        {
            host = new GameObject("GalleryHost");
            var gallery = host.AddComponent<GalleryEnvironment>();
            gallery.EnsurePlate();

            Assert.That(gallery.HasDeckEdgeGlow, Is.True);
            Assert.That(gallery.HasHorizonRing, Is.True);
            Assert.That(RenderSettings.skybox, Is.Null);
            Assert.That(RenderSettings.ambientLight, Is.EqualTo(VrTheme.GalleryVoid));

            var camGo = new GameObject("VoidCam");
            var cam = camGo.AddComponent<Camera>();
            GalleryEnvironment.ApplyCameraVoid(cam);
            Assert.That(cam.clearFlags, Is.EqualTo(CameraClearFlags.SolidColor));
            Assert.That(cam.backgroundColor, Is.EqualTo(VrTheme.GalleryVoid));
            Object.DestroyImmediate(camGo);
        }

        [Test]
        public void SetSpawnRadius_UpdatesSpawnGlowRing()
        {
            host = new GameObject("GalleryHost");
            var gallery = host.AddComponent<GalleryEnvironment>();
            gallery.EnsurePlate();
            gallery.SetSpawnRadius(18f);

            var glow = host.transform.Find("GallerySpawnGlow");
            Assert.That(glow, Is.Not.Null);
            var lr = glow.GetComponent<LineRenderer>();
            Assert.That(lr, Is.Not.Null);
            Assert.That(lr.positionCount, Is.GreaterThan(8));
            // First point should sit near the new spawn radius on XZ.
            Vector3 p0 = lr.GetPosition(0);
            float r = new Vector2(p0.x, p0.z).magnitude;
            Assert.That(r, Is.EqualTo(18f).Within(0.2f));
        }
    }
}
