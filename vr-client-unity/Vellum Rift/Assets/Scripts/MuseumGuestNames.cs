using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace VellumRift
{
    /// <summary>
    /// Museum / kiosk guest display names: Explorer 1, Explorer 2, …
    /// Allocated from players already in the Space so headsets don't all say "Guest".
    /// </summary>
    public static class MuseumGuestNames
    {
        public const string Prefix = "Explorer";
        private static readonly Regex ExplorerPattern = new Regex(
            @"^Explorer\s+(\d+)$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

        /// <summary>True when the resolved name is a placeholder that should be replaced.</summary>
        public static bool IsPlaceholder(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return true;
            string n = name.Trim();
            if (string.Equals(n, "Guest", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(n, "Player", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(n, "User", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        /// <summary>Next unused Explorer N given existing display names in the Space.</summary>
        public static string NextExplorer(IEnumerable<string> existingDisplayNames)
        {
            int max = 0;
            if (existingDisplayNames != null)
            {
                foreach (string raw in existingDisplayNames)
                {
                    if (string.IsNullOrEmpty(raw)) continue;
                    Match m = ExplorerPattern.Match(raw.Trim());
                    if (!m.Success) continue;
                    if (int.TryParse(m.Groups[1].Value, out int n) && n > max)
                        max = n;
                }
            }
            return $"{Prefix} {max + 1}";
        }
    }
}
