import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const copies = [
  [join(root, ".env.example"), join(root, ".env")],
  [join(root, "backend", ".env.example"), join(root, "backend", ".env")],
  [join(root, "webrtc-sfu", ".env.example"), join(root, "webrtc-sfu", ".env")]
];

const keyPattern = /^\s*([A-Z0-9_]+)=/;

const collectKeys = (content) => {
  const keys = new Set();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(keyPattern);
    if (match) {
      keys.add(match[1]);
    }
  }

  return keys;
};

for (const [source, target] of copies) {
  if (!existsSync(source)) {
    console.warn(`Skipping missing template: ${source}`);
    continue;
  }

  if (!existsSync(target)) {
    copyFileSync(source, target);
    console.log(`Created ${target}`);
  } else {
    const sourceContent = readFileSync(source, "utf8");
    const targetContent = readFileSync(target, "utf8");
    const sourceKeys = collectKeys(sourceContent);
    const targetKeys = collectKeys(targetContent);
    const missingLines = sourceContent
      .split(/\r?\n/)
      .filter((line) => {
        const match = line.match(keyPattern);
        return match && sourceKeys.has(match[1]) && !targetKeys.has(match[1]);
      });

    if (missingLines.length > 0) {
      const separator = targetContent.endsWith("\n") ? "" : "\n";
      writeFileSync(target, `${targetContent}${separator}${missingLines.join("\n")}\n`);
      console.log(`Updated ${target} with ${missingLines.length} missing variable(s)`);
    } else {
      console.log(`Keeping existing ${target}`);
    }
  }
}
