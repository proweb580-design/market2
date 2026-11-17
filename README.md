# Platform

SaaS для брендов одежды: витрина в стиле референса (веб + Telegram Mini App), кабинет бренда, админка платформы.

- Анализ референса: [docs/reference-analysis.md](docs/reference-analysis.md)
- Архитектура и ER-модель: [docs/architecture.md](docs/architecture.md)
- База данных: [docs/database.md](docs/database.md)
- REST API, авторизация и права: [docs/api.md](docs/api.md)

## Требования

- Node.js 24+
- pnpm 12 — через corepack: `corepack enable` (или `npm i -g pnpm@12`)
- Docker Desktop — для локальных Postgres и Redis (понадобятся с этапа 4)

## Запуск

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose -f infrastructure/docker-compose.yml up -d
pnpm --filter @repo/api db:deploy
pnpm --filter @repo/api db:seed
pnpm dev
```

| Приложение | Адрес |
|---|---|
| web | http://localhost:3000 |
| демо-витрина (web) | http://localhost:3000/s/ashen |
| mini-app | http://localhost:3001 |
| демо-витрина (Mini App) | http://localhost:3001/ashen |
| api | http://localhost:4000/api/v1/health |
| Swagger | http://localhost:4000/api/docs |

## Команды

| Команда | Что делает |
|---|---|
| `pnpm build` | сборка всех пакетов |
| `pnpm typecheck` | проверка типов |
| `pnpm test` | тесты |
| `pnpm lint` | oxlint |
