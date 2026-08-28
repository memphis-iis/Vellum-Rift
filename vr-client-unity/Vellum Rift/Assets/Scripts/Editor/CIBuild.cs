using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace VellumRift.Editor
{
    /// <summary>
    /// Headless WebGL build entry for museum publish (# museum polish).
    /// Unity -batchmode -nographics -projectPath "…" -executeMethod VellumRift.Editor.CIBuild.BuildWebGL -quit
    /// </summary>
    public static class CIBuild
    {
        private const string WebGlOutputDir = "web build";

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
    }
}
