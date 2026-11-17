# База данных

PostgreSQL 17 + Prisma 7. Схема: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma),
миграции: [`apps/api/prisma/migrations`](../apps/api/prisma/migrations), сид: [`apps/api/prisma/seed.ts`](../apps/api/prisma/seed.ts).
ER-диаграмма — в [architecture.md §5](architecture.md#5-er-модель).

## Соглашения

| Что | Как | Почему |
|---|---|---|
| Схема Postgres | все таблицы в `app` | Supabase публикует `public` через Data API с anon-ключом; `app` туда не попадает |
| Имена | модели PascalCase, таблицы и колонки snake_case (`@@map` / `@map`) | читаемый SQL, совпадает с ТЗ (`users`, `organization_members`, …) |
| Первичные ключи | UUIDv7 (`uuid(7)`) | не угадываются (IDOR), но упорядочены по времени — индексы не фрагментируются |
| Деньги | `BIGINT`, минорные единицы + `CHAR(3)` валюта | `INT` переполняется на валютах с крупным номиналом (UZS, KZT); без float-ошибок |
| Время | `timestamptz(3)` | без путаницы часовых поясов |
| Telegram id | `BIGINT` | id пользователей Telegram больше 2³¹ |
| Секреты | только хеши (`key_hash`, `token_hash`, `refresh_token_hash`) или AES-GCM (`integrations.secret_encrypted`) | утечка дампа не раскрывает ключи |
| Клиент Prisma | генерируется в `apps/api/src/generated/prisma` (в git не хранится) | `build`/`typecheck`/`test` сами вызывают `prisma generate` |

## Таблицы (47)

| Группа | Таблицы |
|---|---|
| Пользователи | `users`, `profiles`, `user_settings`, `telegram_accounts`, `sessions`, `notifications`, `audit_logs` |
| RBAC | `roles`, `permissions`, `role_permissions`, `user_roles` |
| Организации | `organizations`, `organization_members`, `invitations`, `integrations` |
| Тарифы и подписки | `plans`, `plan_features`, `subscriptions`, `subscription_events` |
| Платежи | `payments`, `transactions`, `webhook_events`, `idempotency_keys` |
| API | `api_keys`, `api_logs` |
| Каталог | `media_files`, `size_charts`, `products`, `product_options`, `product_option_values`, `product_variants`, `variant_option_values`, `product_media`, `collections`, `collection_products` |
| Продажи | `carts`, `cart_items`, `orders`, `order_items`, `wishlist_items` |
| Контент витрины | `home_sections`, `lookbooks`, `lookbook_items`, `testimonials`, `playlist_tracks`, `newsletter_subscribers` |
| Платформа | `platform_settings` |

Поля, типы, ключи и индексы каждой таблицы — в `schema.prisma` (с комментариями `///`).

## Ограничения сверх Prisma-схемы

Prisma не умеет описывать частичные индексы, CHECK и триггеры — они в конце
[`20261117093125_init/migration.sql`](../apps/api/prisma/migrations/20261117093125_init/migration.sql).
`prisma migrate diff` их не трогает (проверено: дрифта нет).

| Правило | Механизм |
|---|---|
| Ключи системных ролей уникальны | частичный UNIQUE `roles(key) WHERE organization_id IS NULL` |
| `user_roles` принимает только PLATFORM-роли | триггер `assert_platform_role` |
| Участнику/приглашению — только ORGANIZATION-роль своей организации или системная | триггер `assert_org_role` (защита от кросс-тенантной роли) |
| Роль, назначенная участникам, не удаляется | FK `ON DELETE RESTRICT` |
| Одна «живая» подписка на организацию | частичный UNIQUE `WHERE status IN (TRIALING, ACTIVE, PAST_DUE)` |
| Тариф с историей подписок не удаляется (только деактивируется) | FK `RESTRICT` |
| Платёж ссылается ровно на то, что указано в `purpose` | CHECK `payments_purpose_target_chk` |
| Суммы ≥ 0, итог заказа = подытог + доставка + налог − скидка | CHECK `orders_amounts_chk`, `order_items_total_chk` и др. |
| Платежи и заказы не удаляются каскадом | FK `RESTRICT` на организацию |
| Повторный webhook не обрабатывается дважды | UNIQUE `webhook_events(provider, event_id)` |
| Email в нижнем регистре, slug в формате `a-z0-9-` | CHECK |
| Одна активная корзина пользователя в магазине | частичный UNIQUE |
| Одно непринятое приглашение на email | частичный UNIQUE |

## Справочные данные (сид)

`pnpm --filter @repo/api db:seed` — идемпотентен:

- **permissions** и права **системных ролей** синхронизируются с каталогом `PERMISSIONS` / `SYSTEM_ROLE_DEFINITIONS` в `@repo/shared`;
- **тарифы** Free / Basic / Pro / Business / Enterprise создаются, только если их нет — дальше их меняют в админке.
  ⚠ Цены и лимиты в `DEFAULT_PLANS` — **заглушки**, их нужно утвердить;
- `SEED_SUPER_ADMIN_EMAIL` — выдать SUPER_ADMIN пользователю с этим email.

Демо-магазин в БД сид **не** создаёт.

## Команды (`apps/api`)

| Команда | Что делает |
|---|---|
| `pnpm db:migrate` | `prisma migrate dev` — создать и применить миграцию (dev) |
| `pnpm db:deploy` | `prisma migrate deploy` — применить миграции (staging/prod, CI) |
| `pnpm db:seed` | справочные данные |
| `pnpm db:generate` | сгенерировать клиент |
| `pnpm db:studio` | Prisma Studio |

## Подключение

- **Локально**: `docker compose -f infrastructure/docker-compose.yml up -d` — Postgres 17 (UTF-8) с базами `platform` и `platform_test`.
- **Supabase**: в `apps/api/.env` `DATABASE_URL` — строка session pooler, `DIRECT_URL` — прямое подключение (5432) для миграций.
  После первого `db:deploy` в Supabase **не** добавлять схему `app` в Exposed schemas (Settings → API).

## Тесты

`test/db.spec.ts` (19 проверок вместе с API-тестами) запускается, когда задан `TEST_DATABASE_URL`.
Имя базы обязано заканчиваться на `_test`: набор пересоздаёт в ней схему `app`.
