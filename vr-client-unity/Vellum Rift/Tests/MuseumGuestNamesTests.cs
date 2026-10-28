using NUnit.Framework;

namespace VellumRift.Tests
{
    public class MuseumGuestNamesTests
    {
        [Test]
        public void IsPlaceholder_RecognizesGuestAndEmpty()
        {
            Assert.That(MuseumGuestNames.IsPlaceholder(null), Is.True);
            Assert.That(MuseumGuestNames.IsPlaceholder(""), Is.True);
            Assert.That(MuseumGuestNames.IsPlaceholder("Guest"), Is.True);
            Assert.That(MuseumGuestNames.IsPlaceholder("player"), Is.True);
            Assert.That(MuseumGuestNames.IsPlaceholder("Alice"), Is.False);
            Assert.That(MuseumGuestNames.IsPlaceholder("Explorer 1"), Is.False);
        }

        [Test]
        public void NextExplorer_StartsAtOne_WhenEmpty()
        {
            Assert.That(MuseumGuestNames.NextExplorer(null), Is.EqualTo("Explorer 1"));
            Assert.That(MuseumGuestNames.NextExplorer(new string[0]), Is.EqualTo("Explorer 1"));
        }

        [Test]
        public void NextExplorer_IncrementsPastExisting()
        {
            Assert.That(
                MuseumGuestNames.NextExplorer(new[] { "Host", "Explorer 1", "Explorer 3", "Bob" }),
                Is.EqualTo("Explorer 4"));
        }
    }
}
