using NUnit.Framework;

public class ChatEnabledTests
{
    [Test]
    public void Defaults_To_Enabled()
    {
        Assert.That(ChatEnabled.IsEnabled(_ => null, _ => null, () => null), Is.True);
    }

    [Test]
    public void Env_False_Disables()
    {
        Assert.That(
            ChatEnabled.IsEnabled(_ => null, key => key == "VELLUM_CHAT_ENABLED" ? "false" : null, () => null),
            Is.False);
    }

    [Test]
    public void Query_Chat_Zero_Disables()
    {
        Assert.That(
            ChatEnabled.IsEnabled(_ => null, _ => null, () => "https://example.com/?chat=0"),
            Is.False);
    }
}
