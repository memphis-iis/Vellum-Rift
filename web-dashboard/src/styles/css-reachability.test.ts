import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the per-screen CSS split: a screen must load every stylesheet that
 * defines a class or custom property used by the code or CSS it can reach.
 * Global = main.tsx + App.tsx static imports (screens are lazy routes).
 */
const SRC = join(process.cwd(), "src");
const SCREEN_CSS = join(SRC, "styles", "screens");
const STATIC_IMPORT_RE = /^\s*import\s+(?:[^"']*from\s+)?["'](\.[^"']+)["']/gm;
const CLASS_TOKEN_RE = /[a-z][a-z0-9]*(?:-{1,2}|__)[a-z0-9_-]*[a-z0-9]/g;

const read = (f: string) => readFileSync(f, "utf8");

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function staticImports(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(STATIC_IMPORT_RE)) {
    const r = resolveImport(file, m[1]);
    if (r) out.push(r);
  }
  return out;
}

function reach(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!f.endsWith(".css")) stack.push(...staticImports(f));
  }
  return seen;
}

const screenCssFiles = readdirSync(SCREEN_CSS)
  .filter((f) => f.endsWith(".css"))
  .map((f) => join(SCREEN_CSS, f));

const definedClasses = new Map<string, Set<string>>();
const definedVars = new Map<string, Set<string>>();
for (const css of screenCssFiles) {
  const text = read(css);
  for (const m of text.matchAll(/\.([a-z][a-z0-9_-]*)/g)) {
    (definedClasses.get(m[1]) ?? definedClasses.set(m[1], new Set()).get(m[1])!).add(css);
  }
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
    (definedVars.get(m[1]) ?? definedVars.set(m[1], new Set()).get(m[1])!).add(css);
  }
}

function globalFiles(): string[] {
  const global = [join(SRC, "main.tsx"), join(SRC, "App.tsx")];
  const files = new Set<string>();
  for (const g of global) {
    files.add(g);
    for (const i of staticImports(g)) files.add(i);
  }
  return [...files].filter((f) => f.endsWith(".css") || f.endsWith("main.tsx") || f.endsWith("App.tsx"));
}

/** Stylesheets (anywhere) defining a token, minus the screen files that load them. */
function missingFor(entry: string): string[] {
  const reachable = reach([entry, ...globalFiles()]);
  const loadedCss = new Set([...reachable].filter((f) => f.endsWith(".css")));
  const problems: string[] = [];

  for (const f of reachable) {
    if (f.endsWith(".css")) {
      for (const m of read(f).matchAll(/var\((--[a-z0-9-]+)/g)) {
        const defs = definedVars.get(m[1]);
        if (defs && ![...defs].some((d) => loadedCss.has(d))) {
          problems.push(`${rel(f)} uses ${m[1]} defined only in ${[...defs].map(rel).join(", ")}`);
        }
      }
      continue;
    }
    const text = read(f);
    for (const tok of new Set(text.match(CLASS_TOKEN_RE) ?? [])) {
      const defs = definedClasses.get(tok);
      if (defs && ![...defs].some((d) => loadedCss.has(d))) {
        problems.push(`${rel(f)} uses .${tok} defined only in ${[...defs].map(rel).join(", ")}`);
      }
    }
  }
  return problems;
}

const rel = (f: string) => f.slice(SRC.length + 1);

describe("per-screen CSS reachability", () => {
  const screens = readdirSync(join(SRC, "screens"))
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => join(SRC, "screens", f));

  it.each(screens.map((s) => [rel(s), s]))(
    "%s loads every stylesheet it depends on",
    (_name, screen) => {
      expect([...new Set(missingFor(screen))]).toEqual([]);
    },
  );
});
