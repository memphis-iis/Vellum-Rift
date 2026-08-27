using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class SessionIdResolverTests
    {
        private const string InspectorDefault = "inspector-session-uuid";

        private static Func<string, string> Lookup(Dictionary<string, string> map)
        {
            return key => map != null && map.TryGetValue(key, out var value) ? value : null;
        }

        private static Func<string, string> None() => _ => null;

        [Test]
        public void Resolve_CliSession_WinsOverEverything()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.CliFlagKey] = "cli-session",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.EnvVarName] = "env-session",
            });

            string result = SessionIdResolver.Resolve(
                InspectorDefault, cli, env, pageQuerySession: "page-session");
            Assert.That(result, Is.EqualTo("cli-session"));
        }

        [Test]
        public void Resolve_EnvSession_BeatsPageAndInspector()
        {
            var env = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.EnvVarName] = "env-session",
            });

            string result = SessionIdResolver.Resolve(
                InspectorDefault, None(), env, pageQuerySession: "page-session");
            Assert.That(result, Is.EqualTo("env-session"));
        }

        [Test]
        public void Resolve_PageQuery_BeatsInspector()
        {
            string result = SessionIdResolver.Resolve(
                InspectorDefault, None(), None(), pageQuerySession: "page-session");
            Assert.That(result, Is.EqualTo("page-session"));
        }

        [Test]
        public void Resolve_NoOverrides_ReturnsInspectorDefault()
        {
            string result = SessionIdResolver.Resolve(InspectorDefault, None(), None());
            Assert.That(result, Is.EqualTo(InspectorDefault));
        }

        [Test]
        public void Resolve_EmptyCliAndEnv_FallThroughToPage()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.CliFlagKey] = "  ",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.EnvVarName] = "",
            });

            string result = SessionIdResolver.Resolve(
                InspectorDefault, cli, env, pageQuerySession: "page-session");
            Assert.That(result, Is.EqualTo("page-session"));
        }

        [Test]
        public void Resolve_WhitespaceOnly_FallsThroughToInspector()
        {
            var cli = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.CliFlagKey] = "\t",
            });
            var env = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.EnvVarName] = "   ",
            });

            string result = SessionIdResolver.Resolve(
                InspectorDefault, cli, env, pageQuerySession: " ");
            Assert.That(result, Is.EqualTo(InspectorDefault));
        }

        [Test]
        public void Resolve_TrimsSurroundingWhitespace()
        {
            var env = Lookup(new Dictionary<string, string>
            {
                [SessionIdResolver.EnvVarName] = "  trimmed-uuid  ",
            });

            string result = SessionIdResolver.Resolve(InspectorDefault, None(), env);
            Assert.That(result, Is.EqualTo("trimmed-uuid"));
        }

        [Test]
        public void Resolve_NullInspector_ReturnsEmptyString()
        {
            string result = SessionIdResolver.Resolve(null, None(), None());
            Assert.That(result, Is.EqualTo(""));
        }

        [Test]
        public void Resolve_EmptyInspector_MeansCreateNew()
        {
            string result = SessionIdResolver.Resolve("", None(), None(), pageQuerySession: null);
            Assert.That(result, Is.EqualTo(""));
        }
    }
}
