using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class ModelIdResolverTests
    {
        private static Func<string, string> Lookup(Dictionary<string, string> map)
        {
            return key => map != null && map.TryGetValue(key, out var value) ? value : null;
        }

        private static Func<string, string> None() => _ => null;

        [Test]
        public void ResolveOverride_Cli_Wins()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                [ModelIdResolver.CliFlagKey] = "cli-model",
            });
            string result = ModelIdResolver.ResolveOverride(
                "inspector", cli, None(), pageQueryModelId: "page-model");
            Assert.That(result, Is.EqualTo("cli-model"));
        }

        [Test]
        public void ResolveOverride_Page_BeatsInspector()
        {
            string result = ModelIdResolver.ResolveOverride(
                "inspector", None(), None(), pageQueryModelId: "page-model");
            Assert.That(result, Is.EqualTo("page-model"));
        }

        [Test]
        public void ResolveOverride_EmptyInspector_ReturnsEmpty()
        {
            string result = ModelIdResolver.ResolveOverride("", None(), None());
            Assert.That(result, Is.EqualTo(""));
        }

        [Test]
        public void ResolveActive_OverrideBeatsSession()
        {
            Assert.That(
                ModelIdResolver.ResolveActive("override", "session-active"),
                Is.EqualTo("override"));
        }

        [Test]
        public void ResolveActive_UsesSessionWhenNoOverride()
        {
            Assert.That(
                ModelIdResolver.ResolveActive("", "session-active"),
                Is.EqualTo("session-active"));
        }

        [Test]
        public void ResolveActive_EmptyWhenNeither()
        {
            Assert.That(ModelIdResolver.ResolveActive("", ""), Is.EqualTo(""));
        }
    }
}
