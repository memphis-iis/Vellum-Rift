using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    public class SpectatorWallCameraTests
    {
        [TearDown]
        public void TearDown()
        {
            SpectatorMode.ClearCache();
        }

        [Test]
        public void SpectatorMode_ParseFlag_AcceptsOneAndTrue()
        {
            Assert.That(SpectatorMode.ParseFlag("1"), Is.True);
            Assert.That(SpectatorMode.ParseFlag("true"), Is.True);
            Assert.That(SpectatorMode.ParseFlag("TRUE"), Is.True);
            Assert.That(SpectatorMode.ParseFlag("0"), Is.False);
            Assert.That(SpectatorMode.ParseFlag(""), Is.False);
            Assert.That(SpectatorMode.ParseFlag(null), Is.False);
        }

        [Test]
        public void WallCameraDirector_NextIndex_Wraps()
        {
            Assert.That(WallCameraDirector.NextIndex(0, 3), Is.EqualTo(1));
            Assert.That(WallCameraDirector.NextIndex(2, 3), Is.EqualTo(0));
            Assert.That(WallCameraDirector.NextIndex(0, 0), Is.EqualTo(0));
        }

        [Test]
        public void WallCameraDirector_ShouldIdle_WhenNoFollowables()
        {
            Assert.That(WallCameraDirector.ShouldIdle(0), Is.True);
            Assert.That(WallCameraDirector.ShouldIdle(2), Is.False);
        }

        [Test]
        public void WallCameraDirector_PickShot_LaserBeatsPlayers()
        {
            Assert.That(
                WallCameraDirector.PickShot(true, 2, 1, false),
                Is.EqualTo(WallCameraDirector.ShotKind.FollowLaser));
        }

        [Test]
        public void WallCameraDirector_PickShot_ArtifactWhenDue()
        {
            Assert.That(
                WallCameraDirector.PickShot(false, 2, 1, true),
                Is.EqualTo(WallCameraDirector.ShotKind.OrbitArtifact));
            Assert.That(
                WallCameraDirector.PickShot(false, 2, 1, false),
                Is.EqualTo(WallCameraDirector.ShotKind.FollowPlayer));
        }

        [Test]
        public void WallCameraDirector_PickShot_IdleWhenEmpty()
        {
            Assert.That(
                WallCameraDirector.PickShot(false, 0, 0, false),
                Is.EqualTo(WallCameraDirector.ShotKind.IdleManuscript));
            Assert.That(
                WallCameraDirector.PickShot(false, 0, 2, false),
                Is.EqualTo(WallCameraDirector.ShotKind.OrbitArtifact));
        }

        [Test]
        public void WallCameraDirector_CanInterruptForLaser_RespectsCooldown()
        {
            Assert.That(
                WallCameraDirector.CanInterruptForLaser(
                    2f, "p1", "p2", WallCameraDirector.ShotKind.FollowPlayer),
                Is.False);
            Assert.That(
                WallCameraDirector.CanInterruptForLaser(
                    0f, "p1", "p2", WallCameraDirector.ShotKind.FollowPlayer),
                Is.True);
            Assert.That(
                WallCameraDirector.CanInterruptForLaser(
                    2f, "p1", "p1", WallCameraDirector.ShotKind.FollowLaser),
                Is.True);
        }

        [Test]
        public void SpectatorRadar_ShouldPlotPlayer_ExcludesGalleryScreen()
        {
            Assert.That(
                SpectatorRadar.ShouldPlotPlayer("a", SpectatorMode.DisplayName, "local"),
                Is.False);
            Assert.That(
                SpectatorRadar.ShouldPlotPlayer("local", "Guest", "local"),
                Is.False);
            Assert.That(
                SpectatorRadar.ShouldPlotPlayer("guest-1", "Guest", "local"),
                Is.True);
        }

        [Test]
        public void PlayerPill_BuildsBodyAndHead()
        {
            var go = new GameObject("Pill");
            go.AddComponent<VellumRift.Environment.PlayerBookVisual>();
            Assert.That(go.transform.Find("AvatarGroup/Body"), Is.Not.Null);
            Assert.That(go.transform.Find("AvatarGroup/Head"), Is.Not.Null);
            Object.DestroyImmediate(go);
        }
    }
}
