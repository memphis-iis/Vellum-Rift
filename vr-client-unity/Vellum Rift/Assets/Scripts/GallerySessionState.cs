using System;
using System.Collections.Generic;
using UnityEngine;

namespace VellumRift
{
    [Serializable]
    public struct ModelPlacementData
    {
        public float[] position;
        public float[] rotation;
        public float scale;

        public static ModelPlacementData Default =>
            new ModelPlacementData
            {
                position = new[] { 0f, 0.5f, 0f },
                rotation = new[] { 0f, 0f, 0f },
                scale = 1f,
            };

        public Vector3 PositionVector =>
            position != null && position.Length >= 3
                ? new Vector3(position[0], position[1], position[2])
                : new Vector3(0f, 0.5f, 0f);

        public Vector3 RotationEuler =>
            rotation != null && rotation.Length >= 3
                ? new Vector3(rotation[0], rotation[1], rotation[2])
                : Vector3.zero;

        public float UniformScale => scale > 0f ? scale : 1f;
    }

    /// <summary>
    /// Gallery fields parsed from GET /api/game-state JSON (#167).
    /// JsonUtility cannot parse modelPlacements objects keyed by id.
    /// </summary>
    public class GallerySessionState
    {
        public string selectedModelId;
        public string[] playlist = Array.Empty<string>();
        public string activeModelId;
        public string guestExperience = "open_stage";
        public string stageLayout = "surround";
        public readonly Dictionary<string, ModelPlacementData> placements = new Dictionary<string, ModelPlacementData>();

        public static GallerySessionState Parse(string json)
        {
            var state = new GallerySessionState();
            if (string.IsNullOrEmpty(json)) return state;

            state.selectedModelId = ExtractJsonString(json, "selectedModelId");
            state.activeModelId = ExtractJsonString(json, "activeModelId");
            state.playlist = ExtractJsonStringArray(json, "playlist");
            state.guestExperience = ExtractJsonString(json, "guestExperience") ?? "open_stage";
            state.stageLayout = ExtractJsonString(json, "stageLayout") ?? "surround";
            string placementsBlock = ExtractJsonObject(json, "modelPlacements");
            if (!string.IsNullOrEmpty(placementsBlock))
                ParsePlacementsObject(placementsBlock, state.placements);
            return state;
        }

        /// <summary>True when guests may cycle the active manuscript (#243).</summary>
        public bool GuestsMaySwitchManuscripts()
        {
            string mode = guestExperience ?? "";
            return mode == "browse" || mode == "open_stage";
        }

        public bool CanShowManuscriptSwitch(bool isHost)
        {
            var list = playlist ?? Array.Empty<string>();
            if (list.Length < 2) return false;
            return isHost || GuestsMaySwitchManuscripts();
        }

        private static void ParsePlacementsObject(string body, Dictionary<string, ModelPlacementData> target)
        {
            body = body.Trim();
            if (body.Length < 2 || body[0] != '{' || body[body.Length - 1] != '}') return;
            int i = 1;
            int n = body.Length - 1;
            while (i < n)
            {
                while (i < n && (char.IsWhiteSpace(body[i]) || body[i] == ',')) i++;
                if (i >= n || body[i] != '"') break;
                string modelId = ReadQuoted(body, ref i);
                if (string.IsNullOrEmpty(modelId)) break;
                while (i < n && char.IsWhiteSpace(body[i])) i++;
                if (i >= n || body[i] != ':') break;
                i++;
                string placementJson = ReadObjectValue(body, ref i);
                if (!string.IsNullOrEmpty(placementJson))
                {
                    var placement = ParsePlacement(placementJson);
                    target[modelId] = placement;
                }
            }
        }

        private static ModelPlacementData ParsePlacement(string json)
        {
            var data = ModelPlacementData.Default;
            data.position = ExtractJsonNumberArray(json, "position", 3) ?? data.position;
            data.rotation = ExtractJsonNumberArray(json, "rotation", 3) ?? data.rotation;
            string scaleRaw = ExtractJsonNumberToken(json, "scale");
            if (float.TryParse(scaleRaw, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out float scale) && scale > 0f)
                data.scale = scale;
            return data;
        }

        private static string ExtractJsonString(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (idx < 0) return null;
            idx = json.IndexOf(':', idx);
            if (idx < 0) return null;
            idx++;
            while (idx < json.Length && char.IsWhiteSpace(json[idx])) idx++;
            if (idx >= json.Length) return null;
            if (json[idx] == 'n') return null;
            if (json[idx] != '"') return null;
            return ReadQuoted(json, ref idx);
        }

        private static string[] ExtractJsonStringArray(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (idx < 0) return Array.Empty<string>();
            idx = json.IndexOf('[', idx);
            if (idx < 0) return Array.Empty<string>();
            int end = FindMatching(json, idx, '[', ']');
            if (end < 0) return Array.Empty<string>();
            var list = new List<string>();
            int i = idx + 1;
            while (i < end)
            {
                while (i < end && (char.IsWhiteSpace(json[i]) || json[i] == ',')) i++;
                if (i >= end || json[i] != '"') break;
                string value = ReadQuoted(json, ref i);
                if (!string.IsNullOrEmpty(value)) list.Add(value);
            }
            return list.ToArray();
        }

        private static string ExtractJsonObject(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (idx < 0) return null;
            idx = json.IndexOf('{', idx);
            if (idx < 0) return null;
            int end = FindMatching(json, idx, '{', '}');
            if (end < 0) return null;
            return json.Substring(idx, end - idx + 1);
        }

        private static float[] ExtractJsonNumberArray(string json, string key, int count)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (idx < 0) return null;
            idx = json.IndexOf('[', idx);
            if (idx < 0) return null;
            int end = FindMatching(json, idx, '[', ']');
            if (end < 0) return null;
            string inner = json.Substring(idx + 1, end - idx - 1);
            string[] parts = inner.Split(',');
            if (parts.Length < count) return null;
            var nums = new float[count];
            for (int i = 0; i < count; i++)
            {
                if (!float.TryParse(parts[i].Trim(), System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out nums[i]))
                    return null;
            }
            return nums;
        }

        private static string ExtractJsonNumberToken(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (idx < 0) return null;
            idx = json.IndexOf(':', idx);
            if (idx < 0) return null;
            idx++;
            while (idx < json.Length && char.IsWhiteSpace(json[idx])) idx++;
            int start = idx;
            while (idx < json.Length && "0123456789.-eE+".IndexOf(json[idx]) >= 0) idx++;
            return json.Substring(start, idx - start);
        }

        private static string ReadQuoted(string s, ref int i)
        {
            if (i >= s.Length || s[i] != '"') return null;
            i++;
            int start = i;
            while (i < s.Length)
            {
                if (s[i] == '"') break;
                if (s[i] == '\\') i++;
                i++;
            }
            if (i >= s.Length) return null;
            string value = s.Substring(start, i - start);
            i++;
            return value;
        }

        private static string ReadObjectValue(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
            if (i >= s.Length || s[i] != '{') return null;
            int end = FindMatching(s, i, '{', '}');
            if (end < 0) return null;
            string value = s.Substring(i, end - i + 1);
            i = end + 1;
            return value;
        }

        private static int FindMatching(string s, int openIndex, char open, char close)
        {
            int depth = 0;
            bool inString = false;
            for (int i = openIndex; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"' && (i == 0 || s[i - 1] != '\\')) inString = !inString;
                if (inString) continue;
                if (c == open) depth++;
                else if (c == close)
                {
                    depth--;
                    if (depth == 0) return i;
                }
            }
            return -1;
        }
    }
}
