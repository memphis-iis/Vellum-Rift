using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    /// <summary>EditMode coverage for Bluekey error intake helpers (#289).</summary>
    public class BluekeyErrorReporterTests
    {
        [SetUp]
        public void SetUp()
        {
            BluekeyErrorReporter.ResetDedupeForTests();
        }

        [Test]
        public void ScrubText_RedactsBearerAndEmail()
        {
            string raw = "Authorization: Bearer eyJhbGciOi.secret.token user@memphis.edu ok";
            string scrubbed = BluekeyErrorReporter.ScrubText(raw, 4000);
            Assert.That(scrubbed, Does.Contain("Bearer [redacted]"));
            Assert.That(scrubbed, Does.Contain("[email]"));
            Assert.That(scrubbed, Does.Not.Contain("eyJhbGciOi"));
            Assert.That(scrubbed, Does.Not.Contain("user@memphis.edu"));
        }

        [Test]
        public void ScrubText_TruncatesLongMessages()
        {
            string raw = new string('x', 100);
            string scrubbed = BluekeyErrorReporter.ScrubText(raw, 20);
            Assert.That(scrubbed.Length, Is.LessThanOrEqualTo(21));
            Assert.That(scrubbed, Does.EndWith("…"));
        }

        [Test]
        public void ShouldDedupe_BlocksSameMessageWithinWindow()
        {
            Assert.That(BluekeyErrorReporter.ShouldDedupe("boom", "UnityError", 1_000), Is.False);
            Assert.That(BluekeyErrorReporter.ShouldDedupe("boom", "UnityError", 1_000 + 1_000), Is.True);
            Assert.That(BluekeyErrorReporter.ShouldDedupe("boom", "UnityError", 1_000 + 61_000), Is.False);
        }

        [Test]
        public void IsReportingEnabled_DefaultsTrue()
        {
            Assert.That(BluekeyErrorReporter.IsReportingEnabled(), Is.True);
        }
    }
}
