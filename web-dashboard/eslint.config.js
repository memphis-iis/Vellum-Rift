import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Files already brought into compliance. Rules below are "error" for these
 * and "warn" everywhere else. Add a file here when a PR touches or refactors
 * it (see docs/reference/frontend-standards.md).
 */
const ENFORCED = [
  "src/hooks/usePoll.ts",
  "src/components/Dialog.tsx",
  "src/components/StatusRegion.tsx",
  "src/components/TurnCountdown.tsx",
  "src/lib/concurrency.ts",
  "src/screens/Upload.tsx",
  "src/components/upload/*.{ts,tsx}",
  "src/screens/Enter.tsx",
  "src/components/enter/*.{ts,tsx}",
];

/** NASA Power of 10 aligned limits (rules 1, 2, 4, 7, 10). */
const nasaRules = (level) => ({
  "max-lines-per-function": [
    level,
    { max: 60, skipBlankLines: true, skipComments: true },
  ],
  complexity: [level, 10],
  "max-depth": [level, 4],
  "no-empty": [level, { allowEmptyCatch: false }],
  "no-eval": "error",
  "no-implied-eval": "off",
  "no-restricted-syntax": [
    level,
    {
      selector: "WhileStatement[test.value=true]",
      message: "Loops must have a fixed upper bound (NASA rule 2).",
    },
    {
      selector: "ForStatement[test=null]",
      message: "Loops must have a fixed upper bound (NASA rule 2).",
    },
  ],
});

export default tseslint.config(
  { ignores: ["dist", "node_modules", "vite.config.js", "vite.config.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      ...nasaRules("warn"),
    },
  },
  {
    // Existing code predates the a11y gate: warn until each file is fixed.
    files: ["src/**/*.{ts,tsx}"],
    rules: Object.fromEntries(
      Object.keys(jsxA11y.flatConfigs.recommended.rules).map((r) => [r, "warn"]),
    ),
  },
  {
    files: ["src/**/*.d.ts"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: ENFORCED,
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((r) => [r, "error"]),
      ),
      "jsx-a11y/label-has-for": ["error", { required: { some: ["nesting", "id"] } }],
      "react-hooks/exhaustive-deps": "error",
      ...nasaRules("error"),
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: { "max-lines-per-function": "off" },
  },
);
