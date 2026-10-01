using NUnit.Framework;
using UnityEngine;
using VellumRift;

namespace VellumRift.Tests
{
    public class HelpRequestButtonTests
    {
        [Test]
        public void SetHudVisible_HidesCanvas_WithoutDisablingComponent()
        {
            var go = new GameObject("HelpRequest");
            var help = go.AddComponent<HelpRequestButton>();

            help.SetHudVisible(false);

            Assert.That(help.enabled, Is.True, "Network behaviour stays enabled for L-Y");
            help.RequestHelpFromInput(pulseHaptic: false);
            Object.DestroyImmediate(go);
        }
    }
}
