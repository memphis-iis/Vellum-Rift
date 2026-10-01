using NUnit.Framework;
using UnityEngine;
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
    }
}
