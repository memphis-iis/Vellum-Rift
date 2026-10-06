using NUnit.Framework;

namespace VellumRift.Tests
{
    public class JsonNumbersTests
    {
        [Test]
        public void Format_UsesInvariantDecimalPoint()
        {
            Assert.That(JsonNumbers.Format(1.5f), Is.EqualTo("1.5"));
        }

        [Test]
        public void Format_SanitizesNonFinite()
        {
            Assert.That(JsonNumbers.Format(float.NaN), Is.EqualTo("0"));
            Assert.That(JsonNumbers.Format(float.PositiveInfinity), Is.EqualTo("0"));
            Assert.That(JsonNumbers.Format(float.NegativeInfinity), Is.EqualTo("0"));
        }

        [Test]
        public void Vec3Object_IsValidJsonFragment()
        {
            string json = JsonNumbers.Vec3Object(-1.25f, 0f, 3f);
            Assert.That(json, Is.EqualTo("{\"x\":-1.25,\"y\":0,\"z\":3}"));
            Assert.That(json, Does.Not.Contain("F4"));
            Assert.That(json, Does.Not.Contain("Infinity"));
            Assert.That(json, Does.Not.Contain("NaN"));
        }

        [Test]
        public void DirectionObject_IsValidJsonFragment()
        {
            string json = JsonNumbers.DirectionObject(0f, -0.2f, 1f);
            Assert.That(json, Is.EqualTo("{\"dx\":0,\"dy\":-0.2,\"dz\":1}"));
        }
    }
}
