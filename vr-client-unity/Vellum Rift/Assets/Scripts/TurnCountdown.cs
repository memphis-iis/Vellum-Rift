using System;
using System.Globalization;

namespace VellumRift
{
    /// <summary>
    /// Host turn clock from polled <c>experiencePhase</c> / <c>rotationEndsAt</c>.
    /// Visible beside the guest name and on the wall observer while a turn is running.
    /// </summary>
    public static class TurnCountdown
    {
        private static bool active;
        private static DateTime endsUtc;

        public static bool IsActive => active;

        public static void Apply(string phase, string rotationEndsAt)
        {
            if (ExperiencePhaseController.IsEnded(phase)
                || !ExperiencePhaseController.TryParseRotationEndsAt(rotationEndsAt, out DateTime utc))
            {
                active = false;
                endsUtc = default;
                return;
            }

            active = true;
            endsUtc = utc;
        }

        /// <summary><c>m:ss</c> while a turn is running, including <c>0:00</c> at expiry. Null when no timer is set.</summary>
        public static string Format(DateTime utcNow)
        {
            if (!active)
                return null;
            double remaining = (endsUtc - utcNow).TotalSeconds;
            int seconds = remaining <= 0 ? 0 : (int)Math.Ceiling(remaining);
            return (seconds / 60).ToString(CultureInfo.InvariantCulture)
                + ":" + (seconds % 60).ToString("00", CultureInfo.InvariantCulture);
        }
    }
}
