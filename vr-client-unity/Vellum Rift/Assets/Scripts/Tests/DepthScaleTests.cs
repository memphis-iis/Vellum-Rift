using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    public class DepthScaleTests
    {
        [Test]
        public void ComputeModelLocalScale_ZIsReliefMultiplier()
        {
            Vector3 scale = RemoteModelLoader.ComputeModelLocalScale(0.01f, 2f);
            Assert.That(scale.x, Is.EqualTo(0.01f).Within(1e-6f));
            Assert.That(scale.y, Is.EqualTo(0.01f).Within(1e-6f));
            Assert.That(scale.z, Is.EqualTo(0.02f).Within(1e-6f));
        }

        [Test]
        public void ComputeModelLocalScale_ClampsDepth()
        {
            Assert.That(RemoteModelLoader.ComputeModelLocalScale(1f, -1f).z, Is.EqualTo(0f));
            Assert.That(RemoteModelLoader.ComputeModelLocalScale(1f, 9f).z, Is.EqualTo(5f));
        }

        [Test]
        public void ParseDepthScale_DefaultsMissingToOne()
        {
            const string json =
                "{\"sessionId\":\"s1\",\"label\":\"Museum\",\"hostId\":\"h1\"," +
                "\"isActive\":true,\"activeModelId\":\"m1\",\"players\":[]}";
            Assert.That(GameStateApiClient.ParseDepthScale(json, 0f), Is.EqualTo(1f));
        }

        [Test]
        public void ParseDepthScale_ReadsExplicitZero()
        {
            const string json =
                "{\"sessionId\":\"s1\",\"label\":\"Museum\",\"depthScale\":0,\"players\":[]}";
            Assert.That(GameStateApiClient.ParseDepthScale(json, 0f), Is.EqualTo(0f));
        }

        [Test]
        public void ParseGameState_PromotesDepthScale()
        {
            const string json =
                "{\"sessionId\":\"s1\",\"label\":\"Museum\",\"hostId\":\"h1\"," +
                "\"isActive\":true,\"activeModelId\":\"m1\",\"depthScale\":2.5," +
                "\"players\":[]}";
            GameState state = GameStateApiClient.ParseGameState(json);
            Assert.That(state, Is.Not.Null);
            Assert.That(state.depthScale, Is.EqualTo(2.5f).Within(1e-5f));
        }
    }
}
