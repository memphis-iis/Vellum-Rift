# Frontend standards (web-dashboard)

All frontend code must follow these rules. They are enforced by ESLint and tests.

## Workflow
branch -> code -> test -> document -> PR -> merge. Branch names: `type/<issue>-short-name`.

## Commands (run in `web-dashboard/`)
- `pnpm lint` - `tsc --noEmit` plus ESLint (fails on errors).
- `pnpm lint:strict` - ESLint with zero warnings allowed.
- `pnpm test` - Vitest, Testing Library, and axe (`src/test/axe.ts`).

## Rules
- Time/space: lowest practical Big O; no O(n) lookups in render paths (use `Map`/`useMemo`).
- NASA Power of 10 (adapted): functions <= 60 lines, complexity <= 10, nesting <= 4,
  bounded loops and polling, no empty `catch`, check every return value, no `eval`.
- Accessibility (WCAG 2.2 AA, Norman/Krug usability): `eslint-plugin-jsx-a11y`, keyboard
  access, visible focus, live regions for async state, minimum text size 0.75rem,
  respect `prefers-reduced-motion`.

## Rollout
Legacy files emit warnings. When a PR touches or refactors a file, add it to `ENFORCED`
in `web-dashboard/eslint.config.js` so every rule becomes an error for that file.
Each component PR should include an axe test.
