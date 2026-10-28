using NUnit.Framework;
using UnityEngine;
using VellumRift;

namespace VellumRift.Tests
{
    public class SessionHudStackTests
    {
        [Test]
        public void Toggle_FlipsStickyState()
        {
            var go = new GameObject("StackHost");
            var stack = go.AddComponent<SessionHudStack>();
            Assert.That(stack.IsStickyOpen, Is.False);
            stack.Toggle();
            Assert.That(stack.IsStickyOpen, Is.True);
            stack.Close();
            Assert.That(stack.IsStickyOpen, Is.False);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void Open_And_Close_SetStickyFlags()
        {
            var go = new GameObject("StackHost");
            var stack = go.AddComponent<SessionHudStack>();
            stack.Open();
            Assert.That(stack.IsStickyOpen, Is.True);
            stack.Close();
            Assert.That(stack.IsStickyOpen, Is.False);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void FindOrCreate_ReusesExistingOnHost()
        {
            var go = new GameObject("StackHost");
            var first = SessionHudStack.FindOrCreate(go);
            var second = SessionHudStack.FindOrCreate(go);
            Assert.That(second, Is.SameAs(first));
            Object.DestroyImmediate(go);
        }
    }
}
