SHELL := /bin/bash

COMPOSE := docker compose --env-file .env -f docker-compose.yml
TOOLS_COMPOSE := $(COMPOSE) -f docker-compose.tools.yml
SPEECH_COMPOSE := $(COMPOSE) -f docker-compose.speech.yml

.PHONY: init-env infra-up infra-down infra-logs infra-ps tools-up tools-down tools-logs speech-up speech-down speech-logs infra-reset

init-env:
	@test -f .env || cp .env.example .env
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f webrtc-sfu/.env || cp webrtc-sfu/.env.example webrtc-sfu/.env

infra-up:
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f --tail=200

infra-ps:
	$(COMPOSE) ps

tools-up:
	$(TOOLS_COMPOSE) up -d

tools-down:
	$(TOOLS_COMPOSE) down

tools-logs:
	$(TOOLS_COMPOSE) logs -f --tail=200

speech-up:
	$(SPEECH_COMPOSE) up -d

speech-down:
	$(SPEECH_COMPOSE) down

speech-logs:
	$(SPEECH_COMPOSE) logs -f --tail=200

infra-reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d
