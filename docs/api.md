# REST API (этап 5)

Базовый адрес: `/api/v1`. Swagger UI: `/api/docs` (JSON: `/api/docs-json`). Включается `SWAGGER_ENABLED`.
Код: [`apps/api/src`](../apps/api/src). Схемы запросов — в [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts)
(одни и те же Zod-схемы валидируют сервер и формы фронтенда).

## Конвейер запроса

```
ThrottlerGuard → AuthGuard → TenantGuard → PermissionsGuard → SubscriptionGuard → ZodPipe → контроллер → сервис → Prisma
                                              любое исключение → AllExceptionsFilter (единый формат)
```

| Шаг | Что делает |
|---|---|
| **ThrottlerGuard** | лимит `THROTTLE_LIMIT` запросов в минуту на IP (для всех маршрутов, включая публичные) |
| **AuthGuard** | `Authorization: Bearer <Supabase JWT>` **или** `X-API-Key`. Обе формы сразу — 400. Результат — `req.principal` |
| **TenantGuard** | организация берётся **только из `:orgId` в URL**; нужен активный участник (или SUPER_ADMIN, или ключ этой организации). Чужая/несуществующая/кривая — одинаково **404** |
| **PermissionsGuard** | проверяет `@RequirePermissions(...)` на сервере. **Маршрут без правила отклоняется (403)** — забытый декоратор не открывает эндпоинт |
| **ZodPipe** | валидация body/query; `.strict()` — лишние поля = 400 |
| **AllExceptionsFilter** | `{ statusCode, message, details?, requestId }`; без стектрейсов, SQL и текстов драйвера |

### Правила доступа маршрута (ровно одно обязательно)

| Декоратор | Кто проходит |
|---|---|
| `@Public()` | любой (health) |
| `@UserOnly()` | только вошедший пользователь; **API-ключ — 403** (свой аккаунт, создание организаций, выпуск ключей) |
| `@MemberOnly()` | пользователь — активный участник `:orgId` |
| `@RequirePermissions(a, b)` | пользователь **или** ключ, у которого есть **все** перечисленные права |

Права: каталог `PERMISSIONS` в `@repo/shared` (29 ключей, области `PLATFORM` / `ORGANIZATION`).
Платформенное право проверяется по ролям пользователя (`user_roles`), организационное — по роли в **этой** организации.
SUPER_ADMIN проходит все проверки.

## Аутентификация

**Веб (Supabase Auth).** Регистрация, подтверждение email, вход, сброс пароля выполняет Supabase на фронтенде.
API проверяет токен **сам**: подпись по JWKS проекта (`ES256/RS256/EdDSA`), `iss`, `aud`, `exp`.
`alg: none` и HS-токены отвергаются (HS256 принимается только при заданном `SUPABASE_JWT_SECRET`, для старых проектов).
Анонимные сессии Supabase не принимаются. Любая ошибка токена → один и тот же `401`.

Что происходит при первом запросе: создаётся `users` + `profiles` + `user_settings`.
Пользователь, заранее созданный с тем же **подтверждённым** email (например, сидовый SUPER_ADMIN), привязывается, а не дублируется.
Неподтверждённый email не сохраняется и не привязывается. Email, уже занятый другим аккаунтом, → 409.

**Сессии.** `session_id` из JWT фиксируется в `sessions`. Отзыв (выход на устройстве, блокировка) действует сразу,
хотя сам JWT ещё не истёк. Чужой `session_id` с токеном другого пользователя → 401.

**Блокировка** проверяется на каждом запросе (читается статус из БД): заблокированный получает 403 немедленно.

**API-ключи.** Формат `pk_<8 hex>.<43 символа>`; секрет — 256 бит из CSPRNG; в БД только SHA-256 хеш (сравнение за постоянное время),
полный ключ показывается **один раз** при создании. Права ключа ⊆ прав его создателя на момент выпуска.
Организационный ключ действует только в своей организации; личный — как владелец, но только пересечением прав ключа и **живых** прав владельца.
Лимит запросов на ключ (`rateLimitPerMinute`) → 429 + `Retry-After`. Каждый вызов (и отказанный) пишется в `api_logs` (только путь, без query).
Ключи участника отзываются, когда его удаляют из организации.

## Эндпоинты

| Группа | Маршруты | Доступ |
|---|---|---|
| health | `GET /health`, `GET /health/ready` | public |
| auth | `GET /auth/me`, `POST /auth/logout` | user |
| profiles | `GET/PATCH /profiles/me` | user |
| users | `GET/PATCH /users/me/settings`, `GET /users/me/sessions`, `DELETE /users/me/sessions/:id`, `GET /users/me/activity`, `DELETE /users/me` | user |
| permissions | `GET /permissions` | user |
| roles (платформа) | `GET/POST /roles`, `PATCH/DELETE /roles/:id`, `POST /users/:id/roles`, `DELETE /users/:id/roles/:roleId` | `platform.roles.manage` |
| organizations | `POST/GET /organizations`, `GET /organizations/:orgId` (member), `PATCH` (`org.settings.manage`), `POST …/leave` (member) | user / member |
| members | `GET …/members` (`org.members.read`), `PATCH/DELETE …/members/:id` (`org.members.manage`) | |
| invitations | `GET/POST …/invitations`, `DELETE …/invitations/:id` (`org.members.manage`); `POST /invitations/accept` (user) | |
| roles (организация) | `GET …/roles` (`org.members.read`), `POST/PATCH/DELETE …/roles` (`org.roles.manage`) | |
| API-ключи | `…/organizations/:orgId/api-keys` (create/list/revoke/`:id/logs`, `org.api_keys.manage`); `/api-keys` — личные | |
| admin | `GET /admin/stats\|users\|users/:id\|organizations\|audit-logs\|api-keys\|settings`, `POST /admin/users/:id/block\|unblock`, `POST /admin/organizations/:id/suspend\|activate`, `DELETE /admin/api-keys/:id`, `PUT /admin/settings/:key` | `platform.*` |

Списки принимают `?page&pageSize(≤100)&sort=-field`; сортировка — только по белому списку полей, иначе 400.

## Защита от повышения привилегий

- Выдать можно только те права, которые есть у самого выдающего (роли, ключи, назначения). SUPER_ADMIN — без ограничений.
- Системные роли неизменяемы; ключи `SUPER_ADMIN`, `ORG_*`, `PLATFORM_*` зарезервированы. Кастомная роль не может сойти за владельца:
  в проверках её ключ получает префикс `custom:`.
- Роль организации — только системная или этой же организации (проверяет и сервис, и триггер БД).
- Роль нельзя удалить, пока она назначена или есть действующие приглашения (409 с числом зависимостей).
- Нельзя удалить/понизить последнего владельца организации и убрать последнего SUPER_ADMIN.
- Модерация: нельзя заблокировать себя, SUPER_ADMIN (кроме как SUPER_ADMIN) и пользователя с большими правами.

## Журнал действий

Таблица `audit_logs`: кто (пользователь или ключ), что, над чем, IP, user-agent, метаданные.
Из метаданных вырезаются поля с именами `token|secret|password|authorization|api_key|hash`.
Запись идёт в одной транзакции с изменением. Пользователь видит свою историю (`/users/me/activity`),
админ — всю (`/admin/audit-logs`).

## Известные ограничения (осознанные)

| Что | Почему / когда исправим |
|---|---|
| Лимиты запросов и счётчики ключей **в памяти процесса** | при нескольких инстансах лимит «на инстанс»; Redis — этап 10 |
| Письма (приглашения) не отправляются: токен приглашения возвращается создателю один раз | нет почтового провайдера; подключается позже |
| Удаление аккаунта не удаляет запись в Supabase Auth | нужен service-role ключ; вход всё равно закрыт — пользователь `DELETED` |
| Telegram, каталог/заказы | этап 7 и следующая часть бэкенда (тарифы и оплата — [billing.md](billing.md)) |
| Личный API-ключ не заходит в организации | осознанно: организационные интеграции делаются организационными ключами |

## Тесты

`pnpm --filter @repo/api test` — без БД выполняются unit-тесты (проверка JWT, лимитер, пагинация, список маршрутов).
С `TEST_DATABASE_URL` (база `*_test`) запускаются интеграционные: аутентификация, RBAC, изоляция организаций (IDOR),
приглашения, API-ключи, ограничения БД — 100+ проверок на реальном PostgreSQL.
