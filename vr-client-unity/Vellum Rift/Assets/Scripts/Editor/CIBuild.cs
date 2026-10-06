using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace VellumRift.Editor
{
    /// <summary>
    /// Headless build entries for museum publish and Quest APK (#193 / #209 / #275 / #295).
    /// WebGL:  Unity -batchmode -nographics -projectPath "…" -executeMethod VellumRift.Editor.CIBuild.BuildWebGL -quit
    /// Android: Unity -batchmode -nographics -projectPath "…" -executeMethod VellumRift.Editor.CIBuild.BuildAndroid -quit
    /// Optional env (#295): VELLUM_BUILD_BACKEND_URL, VELLUM_BUILD_ALLOW_INSECURE_HTTP
    /// </summary>
    public static class CIBuild
    {
        private const string WebGlOutputDir = "web build";
        private const string DefaultAndroidApk = "build/VellumRift-Quest.apk";
        private const string BuildBackendUrlEnv = "VELLUM_BUILD_BACKEND_URL";
        private const string BuildAllowInsecureHttpEnv = "VELLUM_BUILD_ALLOW_INSECURE_HTTP";

        private static Dictionary<string, string> _sceneYamlBackups;

        [MenuItem("Vellum Rift/Build/WebGL (museum)")]
        public static void BuildWebGL()
        {
            bool stagedBackend = TryStageBuildBackendOverrides();
            try
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

                // Custom shell chrome (no default Unity footer/logo). Folder name under Assets/WebGLTemplates.
                PlayerSettings.WebGL.template = "PROJECT:VellumRift";
                // Museum wall / multi-monitor: keep simulating when the browser blurs.
                PlayerSettings.runInBackground = true;
                Debug.Log("[CIBuild] WebGL template = PROJECT:VellumRift; runInBackground=true");

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
            finally
            {
                if (stagedBackend)
                    RestoreStagedBuildBackendOverrides();
            }
        }

        [MenuItem("Vellum Rift/Build/Android Quest APK")]
        public static void BuildAndroid()
        {
            bool stagedBackend = TryStageBuildBackendOverrides();
            try
            {
                string projectRoot = Directory.GetParent(Application.dataPath)!.FullName;
                string relativeOrAbsolute = GetArg("-customBuildPath") ?? DefaultAndroidApk;
                string outputPath = Path.IsPathRooted(relativeOrAbsolute)
                    ? relativeOrAbsolute
                    : Path.Combine(projectRoot, relativeOrAbsolute);
                bool isDev = HasFlag("-developmentBuild");

                Debug.Log($"[CIBuild] Starting Android Quest build → {outputPath} (Dev: {isDev})");

                // Stale XR Simulation temp assets from a prior crashed preprocess
                // block ARFoundation's move-aside and contribute to flaky Android builds.
                string xrTemp = Path.Combine(Application.dataPath, "XR", "Temp");
                if (Directory.Exists(xrTemp))
                {
                    try
                    {
                        Directory.Delete(xrTemp, recursive: true);
                        Debug.Log("[CIBuild] Cleared Assets/XR/Temp before Android build.");
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[CIBuild] Could not clear Assets/XR/Temp: {ex.Message}");
                    }
                }

                string[] scenes = GetEnabledScenes();
                if (scenes.Length == 0)
                {
                    Debug.LogError("[CIBuild] No enabled scenes in Build Settings.");
                    EditorApplication.Exit(1);
                    return;
                }

                // Batchmode cannot SwitchActiveBuildTarget (Unity docs) — rely on CLI
                // -buildTarget Android. If the Android module never registered (license
                // entitlement com.unity.editor.platforms.android denied / Hub token missing),
                // fail fast with a clear message instead of "build target was unsupported".
                bool androidSupported = BuildPipeline.IsBuildTargetSupported(
                    BuildTargetGroup.Android, BuildTarget.Android);
                var active = EditorUserBuildSettings.activeBuildTarget;
                Debug.Log($"[CIBuild] Active build target: {active}; Android module supported: {androidSupported}");
                if (!androidSupported)
                {
                    Debug.LogError(
                        "[CIBuild] Android Build Support is not available to this Editor session " +
                        "(IsBuildTargetSupported=false). Usually the Hub access token is missing " +
                        "so entitlement com.unity.editor.platforms.android is denied — " +
                        "sign in via Unity Hub, open the project once from Hub (File → Build Settings " +
                        "should list Android), then re-run build-android-quest.sh. " +
                        "SwitchActiveBuildTarget cannot fix this in -batchmode.");
                    EditorApplication.Exit(1);
                    return;
                }

                if (active != BuildTarget.Android && !Application.isBatchMode)
                {
                    bool switched = EditorUserBuildSettings.SwitchActiveBuildTarget(
                        NamedBuildTarget.Android, BuildTarget.Android);
                    Debug.Log(switched
                        ? "[CIBuild] Switched active build target to Android."
                        : "[CIBuild] SwitchActiveBuildTarget returned false.");
                    if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                    {
                        Debug.LogError("[CIBuild] Active build target is still not Android after switch.");
                        EditorApplication.Exit(1);
                        return;
                    }
                }
                else if (active != BuildTarget.Android && Application.isBatchMode)
                {
                    Debug.LogWarning(
                        "[CIBuild] Batchmode active target is " + active +
                        " (CLI -buildTarget Android should have selected Android at launch). Continuing.");
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
            finally
            {
                if (stagedBackend)
                    RestoreStagedBuildBackendOverrides();
            }
        }

        /// <summary>
        /// When #295 env vars are set, temporarily patches SessionManager (and related) in build
        /// scenes, then restores YAML after the build so committed IIS defaults stay unchanged.
        /// </summary>
        private static bool TryStageBuildBackendOverrides()
        {
            if (!TryParseBuildBackendOverrides(out string backendUrl, out bool? allowInsecureHttp))
                return false;

            string projectRoot = Directory.GetParent(Application.dataPath)!.FullName;
            string[] scenes = GetEnabledScenes();
            _sceneYamlBackups = new Dictionary<string, string>(StringComparer.Ordinal);

            foreach (string sceneAssetPath in scenes)
            {
                string absolutePath = Path.Combine(projectRoot, sceneAssetPath);
                if (!File.Exists(absolutePath))
                {
                    Debug.LogWarning($"[CIBuild] Build scene missing on disk: {sceneAssetPath}");
                    continue;
                }

                _sceneYamlBackups[absolutePath] = File.ReadAllText(absolutePath);

                Scene scene = EditorSceneManager.OpenScene(sceneAssetPath, OpenSceneMode.Single);
                bool changed = ApplyBuildBackendOverridesToOpenScene(backendUrl, allowInsecureHttp);
                if (changed)
                {
                    EditorSceneManager.SaveScene(scene);
                    Debug.Log($"[CIBuild] Staged build backend overrides in {sceneAssetPath}");
                }
            }

            AssetDatabase.Refresh();
            return true;
        }

        private static void RestoreStagedBuildBackendOverrides()
        {
            if (_sceneYamlBackups == null || _sceneYamlBackups.Count == 0)
                return;

            try
            {
                foreach (KeyValuePair<string, string> entry in _sceneYamlBackups)
                    File.WriteAllText(entry.Key, entry.Value);

                AssetDatabase.Refresh();
                Debug.Log("[CIBuild] Restored scene defaults after build backend override staging.");
            }
            finally
            {
                _sceneYamlBackups = null;
            }
        }

        private static bool TryParseBuildBackendOverrides(out string backendUrl, out bool? allowInsecureHttp)
        {
            backendUrl = System.Environment.GetEnvironmentVariable(BuildBackendUrlEnv)?.Trim();
            if (string.IsNullOrEmpty(backendUrl))
                backendUrl = null;

            allowInsecureHttp = ParseTruthyEnv(System.Environment.GetEnvironmentVariable(BuildAllowInsecureHttpEnv));
            if (backendUrl == null && !allowInsecureHttp.HasValue)
                return false;

            if (backendUrl != null)
                Debug.Log($"[CIBuild] {BuildBackendUrlEnv} → {backendUrl}");
            if (allowInsecureHttp.HasValue)
                Debug.Log($"[CIBuild] {BuildAllowInsecureHttpEnv} → {allowInsecureHttp.Value}");

            return true;
        }

        private static bool? ParseTruthyEnv(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return null;

            raw = raw.Trim();
            if (raw == "1" || raw.Equals("true", StringComparison.OrdinalIgnoreCase)
                || raw.Equals("yes", StringComparison.OrdinalIgnoreCase))
                return true;
            if (raw == "0" || raw.Equals("false", StringComparison.OrdinalIgnoreCase)
                || raw.Equals("no", StringComparison.OrdinalIgnoreCase))
                return false;

            Debug.LogWarning($"[CIBuild] Unrecognized {BuildAllowInsecureHttpEnv}={raw} — ignoring.");
            return null;
        }

        private static bool ApplyBuildBackendOverridesToOpenScene(string backendUrl, bool? allowInsecureHttp)
        {
            bool changed = false;

            foreach (SessionManager sessionManager in UnityEngine.Object.FindObjectsByType<SessionManager>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                SerializedObject so = new SerializedObject(sessionManager);
                if (!string.IsNullOrEmpty(backendUrl))
                {
                    SerializedProperty prop = so.FindProperty("defaultBackendUrl");
                    if (prop != null && prop.propertyType == SerializedPropertyType.String)
                    {
                        prop.stringValue = backendUrl;
                        changed = true;
                    }
                }

                if (allowInsecureHttp.HasValue)
                {
                    SerializedProperty prop = so.FindProperty("allowInsecureHttp");
                    if (prop != null && prop.propertyType == SerializedPropertyType.Boolean)
                    {
                        prop.boolValue = allowInsecureHttp.Value;
                        changed = true;
                    }
                }

                so.ApplyModifiedPropertiesWithoutUndo();
            }

            if (!string.IsNullOrEmpty(backendUrl))
            {
                foreach (BluekeyAuth auth in UnityEngine.Object.FindObjectsByType<BluekeyAuth>(
                             FindObjectsInactive.Include, FindObjectsSortMode.None))
                {
                    SerializedObject so = new SerializedObject(auth);
                    SerializedProperty prop = so.FindProperty("defaultBackendUrl");
                    if (prop != null && prop.propertyType == SerializedPropertyType.String)
                    {
                        prop.stringValue = backendUrl;
                        so.ApplyModifiedPropertiesWithoutUndo();
                        changed = true;
                    }
                }
            }

            if (allowInsecureHttp.HasValue)
            {
                foreach (RemoteModelLoader loader in UnityEngine.Object.FindObjectsByType<RemoteModelLoader>(
                             FindObjectsInactive.Include, FindObjectsSortMode.None))
                {
                    SerializedObject so = new SerializedObject(loader);
                    SerializedProperty prop = so.FindProperty("allowInsecureHttp");
                    if (prop != null && prop.propertyType == SerializedPropertyType.Boolean)
                    {
                        prop.boolValue = allowInsecureHttp.Value;
                        so.ApplyModifiedPropertiesWithoutUndo();
                        changed = true;
                    }
                }
            }

            return changed;
        }

        private static void ApplyOptionalAndroidKeystore()
        {
            // Qualify System.Environment — inside namespace VellumRift.Editor, bare
            // "Environment" resolves to VellumRift.Environment (GalleryEnvironment folder).
            string keystore = System.Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PATH");
            if (string.IsNullOrEmpty(keystore) || !File.Exists(keystore))
            {
                PlayerSettings.Android.useCustomKeystore = false;
                Debug.Log("[CIBuild] No ANDROID_KEYSTORE_PATH — using debug signing.");
                return;
            }

            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = keystore;
            PlayerSettings.Android.keystorePass = System.Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PASS") ?? "";
            PlayerSettings.Android.keyaliasName = System.Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_NAME") ?? "";
            PlayerSettings.Android.keyaliasPass = System.Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_PASS") ?? "";
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
            string[] args = System.Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.Ordinal))
                    return args[i + 1];
            }
            return null;
        }

        internal static bool HasFlag(string name)
        {
            string[] args = System.Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], name, StringComparison.Ordinal))
                    return true;
            }
            return false;
        }
    }
}
