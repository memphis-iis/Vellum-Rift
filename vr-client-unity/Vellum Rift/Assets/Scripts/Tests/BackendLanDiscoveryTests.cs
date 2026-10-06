using System.Collections.Generic;
using System.Threading.Tasks;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class BackendLanDiscoveryTests
    {
        [SetUp]
        public void SetUp() => BackendLanDiscovery.ResetForTests();

        [Test]
        public void ParseBeaconApiBase_ValidPayload_ReturnsBase()
        {
            const string json =
                "{\"service\":\"vellum-rift\",\"apiBase\":\"http://10.0.0.5:4000\",\"dashboard\":\"http://10.0.0.5/\"}";
            Assert.That(BackendLanDiscovery.ParseBeaconApiBase(json), Is.EqualTo("http://10.0.0.5:4000"));
        }

        [Test]
        public void ParseBeaconApiBase_StripsHealthSuffix()
        {
            const string json =
                "{\"service\":\"vellum-rift\",\"apiBase\":\"http://10.0.0.5:4000/api/health\"}";
            Assert.That(BackendLanDiscovery.ParseBeaconApiBase(json), Is.EqualTo("http://10.0.0.5:4000"));
        }

        [Test]
        public void ParseBeaconApiBase_WrongService_ReturnsNull()
        {
            const string json = "{\"service\":\"other\",\"apiBase\":\"http://10.0.0.5:4000\"}";
            Assert.That(BackendLanDiscovery.ParseBeaconApiBase(json), Is.Null);
        }

        [Test]
        public void HasExplicitOverride_CliUrl_True()
        {
            Assert.That(
                BackendUrlResolver.HasExplicitOverride(
                    key => key == "-backendUrl" ? "http://x:4000" : null,
                    _ => null),
                Is.True);
        }

        [Test]
        public async Task EnsureAsync_SkipsListen_WhenExplicitOverride()
        {
            bool listened = false;
            string result = await BackendLanDiscovery.EnsureAsync(
                getCliArg: key => key == "-backendUrl" ? "http://override:4000" : null,
                getEnvVar: _ => null,
                listenOverride: async _ =>
                {
                    listened = true;
                    await Task.CompletedTask;
                    return new List<string>();
                });

            Assert.That(result, Is.Null);
            Assert.That(listened, Is.False);
        }

        [Test]
        public async Task EnsureAsync_UsesHealthyBeacon()
        {
            string result = await BackendLanDiscovery.EnsureAsync(
                getCliArg: _ => null,
                getEnvVar: _ => null,
                listenOverride: async _ =>
                {
                    await Task.CompletedTask;
                    return new List<string>
                    {
                        "{\"service\":\"vellum-rift\",\"apiBase\":\"http://192.168.1.9:4000\"}",
                    };
                },
                healthProbe: async baseUrl =>
                {
                    await Task.CompletedTask;
                    return baseUrl == "http://192.168.1.9:4000";
                });

            Assert.That(result, Is.EqualTo("http://192.168.1.9:4000"));
            Assert.That(BackendLanDiscovery.CachedApiBase, Is.EqualTo("http://192.168.1.9:4000"));
        }

        [Test]
        public void StripHealthPath_RemovesSuffix()
        {
            Assert.That(
                BackendUrlResolver.StripHealthPath("http://h:4000/api/health/"),
                Is.EqualTo("http://h:4000"));
        }
    }
}
