using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class BackendUrlResolverTests
    {
        private const string InspectorDefault = "http://localhost:4000/api/health";

        // Builds a "-key=value" lookup (returns null for absent keys), matching
        // the Func<string,string> shape BackendUrlResolver.Resolve expects.
        private static Func<string, string> Lookup(Dictionary<string, string> map)
        {
            return key => map != null && map.TryGetValue(key, out var value) ? value : null;
        }

        private static Func<string, string> None() => _ => null;

        // ---------------------------------------------------------------
        // Precedence order (highest wins)
        // ---------------------------------------------------------------
        [Test]
        public void Resolve_CliUrl_WinsOverEverything()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                ["-backendUrl"] = "http://cli-url:1/api/health",
                ["-backendHost"] = "cli-host",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = "http://env-url:2/api/health",
                ["VELLUM_BACKEND_HOST"] = "env-host",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, cli, env);
            Assert.That(result, Is.EqualTo("http://cli-url:1/api/health"));
        }

        [Test]
        public void Resolve_CliHostPort_BeatsEnv()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                ["-backendHost"] = "1.2.3.4",
                ["-backendPort"] = "9000",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = "http://env-url:2/api/health",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, cli, env);
            Assert.That(result, Is.EqualTo("http://1.2.3.4:9000/api/health"));
        }

        [Test]
        public void Resolve_EnvUrl_BeatsEnvHost()
        {
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = "http://env-url:2/api/health",
                ["VELLUM_BACKEND_HOST"] = "env-host",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, None(), env);
            Assert.That(result, Is.EqualTo("http://env-url:2/api/health"));
        }

        [Test]
        public void Resolve_EnvHostPort_BeatsInspectorDefault()
        {
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_HOST"] = "5.6.7.8",
                ["VELLUM_BACKEND_PORT"] = "8080",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, None(), env);
            Assert.That(result, Is.EqualTo("http://5.6.7.8:8080/api/health"));
        }

        [Test]
        public void Resolve_NoOverrides_ReturnsInspectorDefault()
        {
            var result = BackendUrlResolver.Resolve(InspectorDefault, None(), None());
            Assert.That(result, Is.EqualTo(InspectorDefault));
        }

        // ---------------------------------------------------------------
        // Default port
        // ---------------------------------------------------------------
        [Test]
        public void Resolve_CliHostWithoutPort_UsesDefaultPort()
        {
            var cli = Lookup(new Dictionary<string, string> { ["-backendHost"] = "1.2.3.4" });

            var result = BackendUrlResolver.Resolve(InspectorDefault, cli, None());
            Assert.That(result, Is.EqualTo($"http://1.2.3.4:{BackendUrlResolver.DefaultPort}/api/health"));
        }

        [Test]
        public void Resolve_EnvHostWithoutPort_UsesDefaultPort()
        {
            var env = Lookup(new Dictionary<string, string> { ["VELLUM_BACKEND_HOST"] = "9.9.9.9" });

            var result = BackendUrlResolver.Resolve(InspectorDefault, None(), env);
            Assert.That(result, Is.EqualTo($"http://9.9.9.9:{BackendUrlResolver.DefaultPort}/api/health"));
        }

        // ---------------------------------------------------------------
        // Empty / whitespace overrides are ignored (fall through)
        // ---------------------------------------------------------------
        [Test]
        public void Resolve_EmptyCliUrl_FallsThroughToNextTier()
        {
            var cli = Lookup(new Dictionary<string, string> { ["-backendUrl"] = "" });
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = "http://env-url:2/api/health",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, cli, env);
            Assert.That(result, Is.EqualTo("http://env-url:2/api/health"));
        }

        [Test]
        public void Resolve_WhitespaceOnlyOverrides_FallThroughToInspectorDefault()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                ["-backendUrl"] = "   ",
                ["-backendHost"] = "\t",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = " ",
                ["VELLUM_BACKEND_HOST"] = "  ",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, cli, env);
            Assert.That(result, Is.EqualTo(InspectorDefault));
        }

        [Test]
        public void Resolve_TrimsSurroundingWhitespaceOnOverride()
        {
            var env = Lookup(new Dictionary<string, string>
            {
                ["VELLUM_BACKEND_URL"] = "  http://trimmed:3/api/health  ",
            });

            var result = BackendUrlResolver.Resolve(InspectorDefault, None(), env);
            Assert.That(result, Is.EqualTo("http://trimmed:3/api/health"));
        }

        // ---------------------------------------------------------------
        // IsWellFormed
        // ---------------------------------------------------------------
        [TestCase("http://localhost:4000/api/health")]
        [TestCase("https://example.com/api/health")]
        public void IsWellFormed_AcceptsHttpAndHttps(string url)
        {
            Assert.That(BackendUrlResolver.IsWellFormed(url, out _), Is.True);
        }

        [TestCase("localhost:4000/api/health")]   // missing scheme
        [TestCase("ftp://example.com/health")]    // wrong scheme
        [TestCase("not a url")]
        [TestCase("")]
        public void IsWellFormed_RejectsMissingOrWrongScheme(string url)
        {
            Assert.That(BackendUrlResolver.IsWellFormed(url, out _), Is.False);
        }

        // ---------------------------------------------------------------
        // IsRemoteHost
        // ---------------------------------------------------------------
        [TestCase("http://localhost:4000/")]
        [TestCase("http://127.0.0.1:4000/")]
        [TestCase("http://127.0.0.2:4000/")]      // rest of 127.0.0.0/8 loopback block
        [TestCase("http://[::1]:4000/")]          // IPv6 loopback
        [TestCase("http://10.0.0.5/")]            // 10.0.0.0/8
        [TestCase("http://172.16.4.4/")]          // 172.16.0.0/12 (low end)
        [TestCase("http://172.31.4.4/")]          // 172.16.0.0/12 (high end)
        [TestCase("http://192.168.1.10/")]        // 192.168.0.0/16
        public void IsRemoteHost_LocalAndPrivate_ReturnsFalse(string url)
        {
            Assert.That(BackendUrlResolver.IsWellFormed(url, out var uri), Is.True);
            Assert.That(BackendUrlResolver.IsRemoteHost(uri), Is.False);
        }

        [TestCase("http://8.8.8.8/")]             // public IPv4
        [TestCase("http://172.32.0.1/")]          // just outside 172.16/12
        [TestCase("http://example.com/")]         // public hostname
        public void IsRemoteHost_PublicAddresses_ReturnsTrue(string url)
        {
            Assert.That(BackendUrlResolver.IsWellFormed(url, out var uri), Is.True);
            Assert.That(BackendUrlResolver.IsRemoteHost(uri), Is.True);
        }

        // ---------------------------------------------------------------
        // FromQueryString (WebGL page-URL config)
        // ---------------------------------------------------------------

        [Test]
        public void FromQueryString_ReturnsBackendUrl_WhenPresent()
        {
            const string page = "https://iis.memphis.edu/vellumrift/?backendUrl=https%3A%2F%2Fiis.memphis.edu%2Fapis%2Fvellumrift";
            string result = BackendUrlResolver.FromQueryString(page, "http://fallback:4000");
            Assert.That(result, Is.EqualTo("https://iis.memphis.edu/apis/vellumrift"));
        }

        [Test]
        public void FromQueryString_ReturnsFallback_WhenAbsent()
        {
            const string page = "https://iis.memphis.edu/vellumrift/";
            string result = BackendUrlResolver.FromQueryString(page, "http://fallback:4000");
            Assert.That(result, Is.EqualTo("http://fallback:4000"));
        }

        [Test]
        public void FromQueryString_IgnoresOtherParameters()
        {
            const string page = "https://host/vellumrift/?session=demo&backendUrl=http%3A%2F%2Fapi.local%3A4000&debug=1";
            string result = BackendUrlResolver.FromQueryString(page, "fallback");
            Assert.That(result, Is.EqualTo("http://api.local:4000"));
        }

        [Test]
        public void FromQueryString_NullOrEmpty_ReturnsFallback()
        {
            Assert.That(BackendUrlResolver.FromQueryString(null, "fb"), Is.EqualTo("fb"));
            Assert.That(BackendUrlResolver.FromQueryString("", "fb"), Is.EqualTo("fb"));
            Assert.That(BackendUrlResolver.FromQueryString("no-query-here", "fb"), Is.EqualTo("fb"));
        }
    }
}
