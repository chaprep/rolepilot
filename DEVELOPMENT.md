# Developing Rolepilot

Rolepilot uses Next.js App Router, TypeScript, Yarn 4 and Prisma 7. PostgreSQL is the standard development database. SQLite is also supported, including in the desktop app. For an ordinary installation, start with the [README](README.md).

## Start a development instance

Docker Compose builds the development image with Node.js 24 and the Chromium shell used for PDF generation. The checkout is bind-mounted for hot reload.

```bash
cp -n .env.example .env
docker compose build app
docker/bin/yarn hash-password
openssl rand -base64 32
```

Set `ROLEPILOT_PASSWORD` to the full generated hash and `ROLEPILOT_SECRET` to the random value in `.env`. If you already run Rolepilot, use a separate checkout and environment for development. The default dev ports are 3000 for the app and 5432 for PostgreSQL.

```bash
docker compose up -d app
docker compose logs -f app
```

Open [Rolepilot on localhost](http://localhost:3000). The container generates both Prisma clients, applies migrations and seeds default settings before starting the dev server. Use `docker/bin/yarn` to run commands inside the development container. To run directly on the host, enable Corepack, install with `yarn install --immutable`, generate both clients and provide a separate database and app environment before running `yarn dev`.

## Code map

| Area | Entry points |
| --- | --- |
| Pages and forms | `src/app/(app)/`, `src/app/(setup)/`, `src/components/` |
| Posting import | `src/lib/job-posting-import.ts` handles direct HTTP and eligible One/Exa fallback. `src/lib/ai/tasks/read-posting.ts` handles the separate model-driven extraction step. |
| AI routing and prompts | `src/lib/ai/assignments.ts` maps tasks to fixed OpenRouter models. `src/lib/ai/tasks/prompt-parts.ts` holds shared prompt instructions. |
| Application jobs | `src/lib/jobs/` coordinates persistence, generation and refinement. `generate-cover-letter.ts` implements plan, optional research, and draft. |
| One Connect and People | `src/lib/one/config.ts` manages configuration and grants. `src/lib/one/client.ts` validates workflow-scoped actions. `src/lib/jobs/find-hiring-contacts.ts` saves People results, and the application’s `people-actions.ts` handles greeting changes. |
| Candidate memory | `src/lib/memory/` captures eligible submissions, extracts supported assertions and selects relevant evidence. Generation jobs check the memory revision before publishing. |
| Database and portability | `prisma/`, `src/lib/prisma.ts`, `src/lib/data-export.ts`, and `src/lib/data-import.ts` |
| Tests | Vitest near the source, Playwright in `e2e/`, and CI in `.github/workflows/` |

Use the validated environment from `src/lib/env.ts`. Protect private pages with session verification. Wrap standard mutations in `action()` and private file, upload or progress routes in `route()`. Keep data access on the server, validate inputs at the boundary, and use `setStatus` for application transitions so status history and dashboard counts agree. Use the [security guide](SECURITY.md) when changing authentication or data access.

## Database changes

Edit `prisma/schema.prisma`, derive the SQLite schema, and create a migration for each database with disposable development databases. `prisma7.config.ts` selects SQLite when `DATABASE_URL` starts with `file:`.

```bash
docker/bin/yarn sqlite-schema
docker/bin/yarn prisma migrate dev --name <migration-name>
docker compose exec -e DATABASE_URL=file:/tmp/rolepilot-dev.db app \
  yarn prisma migrate dev --name <migration-name>
docker/bin/yarn generate
```

Keep both migration sets in sync. Use the transaction client inside callbacks and use locking and query patterns supported by both databases. SQLite table rebuilds can drop the built-in theme trigger and case-insensitive Skill and Language constraints. Restore them when a migration rebuilds one of those tables. Keep already-applied migration identities intact. See [deployment and recovery](docs/DEPLOYMENT.md) for upgrades that use existing storage.

Export format 18 includes candidate memory, People results and saved cover letter research. Installation credentials and One grants stay specific to the instance. Check export, import and deletion paths whenever a change introduces persistent data.

## Tests and checks

```bash
docker/bin/yarn lint
docker/bin/yarn typecheck
docker/bin/yarn test
docker/bin/yarn build
docker/bin/yarn test:e2e
```

- Vitest has `node`, `dom` and `db` projects. Database tests migrate and clear a database ending in `_test`. Use `TEST_DATABASE_URL` to choose it. For an isolated SQLite run, also set `DATABASE_URL` to the same test file for code that uses the application client.
- Playwright runs against the standalone production server. Build it before running the tests. It uses an isolated PostgreSQL database ending in `_e2e` and local fixture services for AI, job sources and Google. Use `E2E_DATABASE_URL` to point at the test database. On a host install, install Playwright Chromium before running browser tests.
- For a production smoke check, build the production image and use a disposable database or a verified copy. The image runs migrations during startup. Follow the [deployment guide](docs/DEPLOYMENT.md) for a real instance.

## Desktop and releases

The Electron app in `desktop/` packages the standalone server and uses a local SQLite database. [The desktop workflow](.github/workflows/desktop.yml) builds and stages the server, then packages Windows and Linux artifacts. [The image workflow](.github/workflows/image.yml) builds the production container. Use these workflows as the source for packaging commands and release requirements.

Record implementation, validation and deployment changes in the [changelog](CHANGELOG.md). See [contributing](CONTRIBUTING.md) for pull request guidance.
