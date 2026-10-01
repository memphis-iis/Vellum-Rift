using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    /// <summary>EditMode coverage for Quest Call for help controller binding (#310).</summary>
    public class HelpRequestBindingsTests
    {
        [Test]
        public void XrGuideRow_UsesLeftY_AndMatchesInputPath()
        {
            var rows = InputControlSchema.GuideRows(ControlSchema.XR);
            string joined = string.Join(" | ", System.Array.ConvertAll(rows, r => $"{r.Action}={r.Binding}"));
            Assert.That(joined, Does.Contain($"Call for help={HelpRequestBindings.XrGuideLabel}"));
            Assert.That(HelpRequestBindings.XrInputPath, Does.Contain("LeftHand"));
            Assert.That(HelpRequestBindings.XrInputPath, Does.Contain("secondaryButton"));
        }
    }
}
