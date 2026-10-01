namespace VellumRift
{
    /// <summary>Client-side mirror of backend help-request rate limit (#294).</summary>
    public static class HelpRequestCooldown
    {
        public const int CooldownSeconds = 30;

        public static bool IsReady(double lastRequestUtcSeconds, double nowUtcSeconds)
        {
            if (lastRequestUtcSeconds <= 0d) return true;
            return nowUtcSeconds - lastRequestUtcSeconds >= CooldownSeconds;
        }

        public static double SecondsRemaining(double lastRequestUtcSeconds, double nowUtcSeconds)
        {
            if (IsReady(lastRequestUtcSeconds, nowUtcSeconds)) return 0d;
            return CooldownSeconds - (nowUtcSeconds - lastRequestUtcSeconds);
        }
    }
}
