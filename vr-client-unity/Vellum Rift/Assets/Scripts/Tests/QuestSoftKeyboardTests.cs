using NUnit.Framework;
using UnityEngine;

namespace VellumRift.Tests
{
    public class QuestSoftKeyboardTests
    {
        [Test]
        public void SoftKeyboard_StartsClosed()
        {
            var kb = new QuestSoftKeyboard();
            Assert.That(kb.IsOpen, Is.False);
            Assert.That(kb.Tick(out _, out bool submitted, out bool canceled), Is.False);
            Assert.That(submitted, Is.False);
            Assert.That(canceled, Is.False);
        }

        [Test]
        public void SoftKeyboard_IsSupported_RequiresTouchScreenKeyboard()
        {
            // EditMode on desktop: TouchScreenKeyboard.isSupported is typically false.
            var kb = new QuestSoftKeyboard();
            if (!TouchScreenKeyboard.isSupported)
                Assert.That(kb.IsSupported, Is.False);
        }
    }
}
