$ErrorActionPreference = "Stop"

node ./scripts/setup-env.mjs
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tools.yml up -d

if ($args -contains "-WithSpeech") {
    docker compose --env-file .env -f docker-compose.yml -f docker-compose.speech.yml up -d
}

Write-Host ""
Write-Host "Vellum Rift local onboarding is complete."
Write-Host "MinIO console: http://localhost:9001"
Write-Host "Mailpit: http://localhost:8025"
Write-Host "Adminer: http://localhost:8081"

if ($args -contains "-WithSpeech") {
    Write-Host "Faster-Whisper: http://localhost:10300/healthz"
    Write-Host "Piper: http://localhost:10400/healthz"
}

Write-Host "Unity project: vr-client-unity/Vellum Rift"
