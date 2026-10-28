using System.Collections.Generic;
using NUnit.Framework;

namespace VellumRift.Tests
{
    public class SimpleJsonTests
    {
        [Test]
        public void ParseObjectArray_ParsesEventListPayload()
        {
            const string json = "{\"events\":[{\"sessionId\":\"abc\",\"label\":\"Demo\",\"startsAt\":null,\"endsAt\":null,\"updatedAt\":\"2026-09-29T12:00:00.000Z\"}]}";
            var root = SimpleJson.ParseObject(json);
            Assert.That(root, Is.Not.Null);
            Assert.That(root.ContainsKey("events"), Is.True);

            List<Dictionary<string, string>> arr = SimpleJson.ParseObjectArray(root["events"]);
            Assert.That(arr, Is.Not.Null);
            Assert.That(arr.Count, Is.EqualTo(1));
            Assert.That(arr[0]["sessionId"], Is.EqualTo("abc"));
            Assert.That(arr[0]["label"], Is.EqualTo("Demo"));
        }

        [Test]
        public void ParseObjectArray_EmptyArray()
        {
            var arr = SimpleJson.ParseObjectArray("[]");
            Assert.That(arr, Is.Not.Null);
            Assert.That(arr.Count, Is.EqualTo(0));
        }
    }
}
