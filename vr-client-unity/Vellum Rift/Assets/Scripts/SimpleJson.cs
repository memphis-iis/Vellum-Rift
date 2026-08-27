using System.Collections.Generic;

namespace VellumRift
{
    /// <summary>
    /// Minimal JSON object parser used by BluekeyAuth to read the postMessage
    /// payload delivered from JS. Tiny hand-rolled parser avoids pulling
    /// JsonUtility/Newtonsoft into the WebGL build.
    /// </summary>
    public static class SimpleJson
    {
        /// <summary>Parse a JSON object into a string-key/string-value map.</summary>
        public static Dictionary<string, string> ParseObject(string json)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(json)) return null;

            json = json.Trim();
            if (json.Length < 2 || json[0] != '{' || json[json.Length - 1] != '}') return null;

            string body = json.Substring(1, json.Length - 2);
            int i = 0;
            int n = body.Length;
            while (i < n)
            {
                while (i < n && (char.IsWhiteSpace(body[i]) || body[i] == ',')) i++;
                if (i >= n) break;
                if (body[i] != '"') return null;

                string key = ReadQuotedString(body, ref i);
                if (key == null) return null;

                while (i < n && char.IsWhiteSpace(body[i])) i++;
                if (i >= n || body[i] != ':') return null;
                i++;
                while (i < n && char.IsWhiteSpace(body[i])) i++;
                if (i >= n) return null;

                string value = ReadRawValue(body, ref i);
                if (value == null) return null;

                result[key] = value;
            }
            return result;
        }

        private static string ReadQuotedString(string s, ref int i)
        {
            i++;
            var sb = new System.Text.StringBuilder();
            int n = s.Length;
            while (i < n)
            {
                char c = s[i];
                if (c == '"') { i++; return sb.ToString(); }
                if (c == '\\' && i + 1 < n)
                {
                    i++;
                    char esc = s[i];
                    switch (esc)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 < n && int.TryParse(s.Substring(i + 1, 4),
                                System.Globalization.NumberStyles.HexNumber,
                                System.Globalization.CultureInfo.InvariantCulture, out int cp))
                            { sb.Append((char)cp); i += 4; }
                            else sb.Append(esc);
                            break;
                        default: sb.Append(esc); break;
                    }
                    i++;
                }
                else { sb.Append(c); i++; }
            }
            return null;
        }

        private static string ReadRawValue(string s, ref int i)
        {
            int n = s.Length;
            if (i >= n) return null;
            char c = s[i];

            if (c == '"') return ReadQuotedString(s, ref i);

            if (c == '{' || c == '[')
            {
                char open = c, close = open == '{' ? '}' : ']';
                int depth = 0, start = i;
                bool inStr = false, esc = false;
                while (i < n)
                {
                    char ch = s[i];
                    if (inStr)
                    {
                        if (esc) esc = false;
                        else if (ch == '\\') esc = true;
                        else if (ch == '"') inStr = false;
                    }
                    else
                    {
                        if (ch == '"') inStr = true;
                        else if (ch == open) depth++;
                        else if (ch == close)
                        {
                            depth--;
                            if (depth == 0) { i++; return s.Substring(start, i - start); }
                        }
                    }
                    i++;
                }
                return null;
            }

            var sb = new System.Text.StringBuilder();
            while (i < n)
            {
                char ch = s[i];
                if (ch == ',' || ch == '}') break;
                sb.Append(ch);
                i++;
            }
            string token = sb.ToString().Trim();
            return token.Length == 0 ? null : token;
        }
    }
}