using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace VellumRift.Editor
{
    /// <summary>
    /// Keeps glTFast URP shader graphs + common keyword variants in the player
    /// build so runtime GLB import (RemoteModelLoader) does not pink-out.
    /// See docs/dev-onboarding/unity-setup.md § Manuscript shaders.
    /// </summary>
    public static class GltfShaderVariantBake
    {
        const string CollectionPath = "Assets/Settings/GltfManuscriptShaderVariants.shadervariants";

        static readonly string[] ShaderGraphGuids =
        {
            "b9d29dfa1474148e792ac720cbd45122", // glTF-pbrMetallicRoughness
            "c87047c884d9843f5b0f4cce282aa760", // glTF-unlit
            "9a07dad0f3c4e43ff8312e3b5fa42300", // glTF-pbrSpecularGlossiness
            "c18c97ae1ce021b4980c5d19a54f0d3c", // URP clearcoat
        };

        // Keyword sets manuscript GLBs commonly need (URP lighting + glTFast features).
        static readonly string[][] KeywordCombos =
        {
            new string[0],
            new[] { "_OCCLUSION" },
            new[] { "_EMISSIVE" },
            new[] { "_TEXTURE_TRANSFORM" },
            new[] { "_OCCLUSION", "_TEXTURE_TRANSFORM" },
            new[] { "_EMISSIVE", "_OCCLUSION" },
            new[] { "_EMISSIVE", "_OCCLUSION", "_TEXTURE_TRANSFORM" },
            new[] { "FOG_LINEAR" },
            new[] { "FOG_EXP2" },
            new[] { "_ADDITIONAL_LIGHTS" },
            new[] { "_MAIN_LIGHT_SHADOWS" },
            new[] { "_MAIN_LIGHT_SHADOWS_CASCADE" },
            new[] { "_ADDITIONAL_LIGHTS", "_MAIN_LIGHT_SHADOWS_CASCADE" },
            new[] { "_ADDITIONAL_LIGHTS", "_MAIN_LIGHT_SHADOWS_CASCADE", "_SHADOWS_SOFT" },
            new[] { "_ADDITIONAL_LIGHTS", "_MAIN_LIGHT_SHADOWS_CASCADE", "_OCCLUSION", "_TEXTURE_TRANSFORM" },
        };

        [MenuItem("Vellum Rift/Shaders/Repopulate glTFast Variant Collection")]
        public static void RepopulateCollection()
        {
            var collection = AssetDatabase.LoadAssetAtPath<ShaderVariantCollection>(CollectionPath);
            if (collection == null)
            {
                collection = new ShaderVariantCollection();
                AssetDatabase.CreateAsset(collection, CollectionPath);
            }

            collection.Clear();
            int added = 0;
            foreach (string guid in ShaderGraphGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
                if (shader == null)
                {
                    Debug.LogWarning($"[GltfShaderVariantBake] Missing shader guid {guid} ({path})");
                    continue;
                }

                foreach (string[] keywords in KeywordCombos)
                {
                    try
                    {
                        var variant = new ShaderVariantCollection.ShaderVariant(
                            shader,
                            PassType.Normal,
                            keywords);
                        if (collection.Add(variant))
                            added++;
                    }
                    catch (System.ArgumentException)
                    {
                        // Keyword combo invalid for this shader — skip.
                    }
                }
            }

            EditorUtility.SetDirty(collection);
            AssetDatabase.SaveAssets();
            Debug.Log($"[GltfShaderVariantBake] Added {added} variants to {CollectionPath}. " +
                      "Confirm Preloaded Shaders lists this collection under Project Settings → Graphics. " +
                      "Also run Play Mode with representative manuscripts, then Graphics → Shader Preloading → Save to merge tracked variants.");
        }

        [MenuItem("Vellum Rift/Shaders/Open Graphics Settings (Shader Preloading)")]
        public static void OpenGraphicsSettings()
        {
            SettingsService.OpenProjectSettings("Project/Graphics");
        }
    }
}
