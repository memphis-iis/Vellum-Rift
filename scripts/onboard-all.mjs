import { spawnSync } from "node:child_process";

const withSpeech = process.argv.includes("--with-speech");

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("node", ["./scripts/setup-env.mjs"]);
run("docker", ["compose", "--env-file", ".env", "-f", "docker-compose.yml", "up", "-d"]);
run("docker", ["compose", "--env-file", ".env", "-f", "docker-compose.yml", "-f", "docker-compose.tools.yml", "up", "-d"]);

if (withSpeech) {
  run("docker", ["compose", "--env-file", ".env", "-f", "docker-compose.yml", "-f", "docker-compose.speech.yml", "up", "-d"]);
}

console.log("\nVellum Rift local onboarding is complete.");
console.log("MinIO console: http://localhost:9001");
console.log("Mailpit: http://localhost:8025");
console.log("Adminer: http://localhost:8081");
if (withSpeech) {
  console.log("Faster-Whisper: http://localhost:10300/healthz");
  console.log("Piper: http://localhost:10400/healthz");
}
console.log("Unity project: vr-client-unity/Vellum Rift");
