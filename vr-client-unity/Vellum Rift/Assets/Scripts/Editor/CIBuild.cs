using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace VellumRift.Editor
{
    /// <summary>
    /// Headless build entries for museum publish and Quest APK (#193 / #209 / #275).
    /// WebGL:  Unity -batchmode -nographics -projectPath "…" -executeMethod VellumRift.Editor.CIBuild.BuildWebGL -quit
    /// Android: Unity -batchmode -nographics -projectPath "…" -executeMethod VellumRift.Editor.CIBuild.BuildAndroid -quit
    /// </summary>
    public static class CIBuild
    {
        private const string WebGlOutputDir = "web build";
        private const string DefaultAndroidApk = "build/VellumRift-Quest.apk";

        [MenuItem("Vellum Rift/Build/WebGL (museum)")]
        public static void BuildWebGL()
        {
            string projectRoot = Directory.GetParent(Application.dataPath)!.FullName;
            string outDir = Path.Combine(projectRoot, WebGlOutputDir);
            Directory.CreateDirectory(outDir);

            string[] scenes = GetEnabledScenes();
            if (scenes.Length == 0)
            {
                Debug.LogError("[CIBuild] No enabled scenes in Build Settings.");
                EditorApplication.Exit(1);
                return;
            }

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outDir,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };

            Debug.Log($"[CIBuild] Building WebGL → {outDir}");
            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"[CIBuild] WebGL build failed: {report.summary.result}");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log($"[CIBuild] WebGL build OK ({report.summary.totalSize} bytes)");
            if (Application.isBatchMode)
                EditorApplication.Exit(0);
        }

        [MenuItem("Vellum Rift/Build/Android Quest APK")]
        public static void BuildAndroid()
        {
            string projectRoot = Directory.GetParent(Application.dataPath)!.FullName;
            string relativeOrAbsolute = GetArg("-customBuildPath") ?? DefaultAndroidApk;
            string outputPath = Path.IsPathRooted(relativeOrAbsolute)
                ? relativeOrAbsolute
                : Path.Combine(projectRoot, relativeOrAbsolute);
            bool isDev = HasFlag("-developmentBuild");

            Debug.Log($"[CIBuild] Starting Android Quest build → {outputPath} (Dev: {isDev})");

            string[] scenes = GetEnabledScenes();
            if (scenes.Length == 0)
            {
                Debug.LogError("[CIBuild] No enabled scenes in Build Settings.");
                EditorApplication.Exit(1);
                return;
            }

            // Switch active target without touching WebGL player settings permanently beyond Android keys.
            if (!EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android))
            {
                Debug.LogError("[CIBuild] Failed to switch active build target to Android. Is Android Build Support installed?");
                EditorApplication.Exit(1);
                return;
            }

            EditorUserBuildSettings.buildAppBundle = false;
            EditorUserBuildSettings.androidBuildSubtarget = MobileTextureSubtarget.Generic;
            EditorUserBuildSettings.development = isDev;

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel29;

            // Vulkan first, OpenGLES3 fallback (Quest-friendly).
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[]
            {
                GraphicsDeviceType.Vulkan,
                GraphicsDeviceType.OpenGLES3,
            });

            ApplyOptionalAndroidKeystore();

            string outDir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outDir))
                Directory.CreateDirectory(outDir);

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outputPath,
                target = BuildTarget.Android,
                options = isDev ? BuildOptions.Development : BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"[CIBuild] Android build failed: {report.summary.result}");
                EditorApplication.Exit(1);
                return;
            }

            if (!File.Exists(outputPath))
            {
                Debug.LogError($"[CIBuild] Android build reported success but APK missing at {outputPath}");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log($"[CIBuild] Android Quest APK OK → {outputPath} ({new FileInfo(outputPath).Length} bytes)");
            if (Application.isBatchMode)
                EditorApplication.Exit(0);
        }

        private static void ApplyOptionalAndroidKeystore()
        {
            string keystore = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PATH");
            if (string.IsNullOrEmpty(keystore) || !File.Exists(keystore))
            {
                PlayerSettings.Android.useCustomKeystore = false;
                Debug.Log("[CIBuild] No ANDROID_KEYSTORE_PATH — using debug signing.");
                return;
            }

            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = keystore;
            PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PASS") ?? "";
            PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_NAME") ?? "";
            PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_PASS") ?? "";
            Debug.Log($"[CIBuild] Using custom keystore: {keystore}");
        }

        private static string[] GetEnabledScenes()
        {
            var list = new System.Collections.Generic.List<string>();
            foreach (EditorBuildSettingsScene s in EditorBuildSettings.scenes)
            {
                if (s.enabled && !string.IsNullOrEmpty(s.path))
                    list.Add(s.path);
            }
            return list.ToArray();
        }

        /// <summary>Reads <c>-flag value</c> from the Unity process command line.</summary>
        internal static string GetArg(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.Ordinal))
                    return args[i + 1];
            }
            return null;
        }

        internal static bool HasFlag(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], name, StringComparison.Ordinal))
                    return true;
            }
            return false;
        }
    }
}
