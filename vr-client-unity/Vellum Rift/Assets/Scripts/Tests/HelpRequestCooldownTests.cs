using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    public class HelpRequestCooldownTests
    {
        [Test]
        public void IsReady_whenNeverRequested()
        {
            Assert.That(HelpRequestCooldown.IsReady(0d, 100d), Is.True);
        }

        [Test]
        public void BlocksUntilCooldownElapses()
        {
            const double last = 100d;
            Assert.That(HelpRequestCooldown.IsReady(last, last + 29d), Is.False);
            Assert.That(HelpRequestCooldown.IsReady(last, last + 30d), Is.True);
            Assert.That(HelpRequestCooldown.SecondsRemaining(last, last + 10d), Is.EqualTo(20d).Within(0.001));
        }
    }
}
