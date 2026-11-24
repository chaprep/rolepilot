# Rolepilot changelog

## 2026-11-24 — Update the GitHub image workflow’s repository-link test

- Updated the Startups user-agent test to expect the current Rolepilot repository link. The previous assertion failed the GitHub coverage test step and prevented the production image job from starting.
- All four tests in the affected file and Git whitespace checks passed. The change leaves the running deployment and saved data intact.

## 2026-11-24 — Prepare the update for the Rolepilot repository

- Updated the GitHub destination in the public guides, issue templates, application source links, desktop metadata and request identification. The application snapshot includes OpenRouter onboarding, the One integration, People search, cover letter research and the posting import fallback.
- Published documentation comprises the README, project guides and changelog. Kept implementation plans, audit records and the writing brief in the local checkout and removed public links to those files.
- Verified 46 staged documentation links, TypeScript, 43 focused application tests and staged whitespace. Checked the staged changes for local credentials and verified that private documents are excluded. No running deployment or saved data changed.

## 2026-11-24 — Stop the local onboarding server

- Stopped the Next.js development server on port 3001 on request. Verified that port 3001 no longer accepts connections, the onboarding database file is present, and the Docker app on port 3000 reports healthy.

## 2026-11-24 — Rewrite the Rolepilot documentation

- Inventoried the Markdown guides, planning records, font notes and in-app help. Rewrote the README, development, contributing, privacy, security and source attribution documents. Added a documentation index and guides for deployment and recovery, integrations and application workflows under `docs/`.
- Replaced the rollout audit with `docs/BRANDING_AND_COMPATIBILITY.md` and removed retired branding and local storage identifiers from changelog prose while retaining its dated records. Preserved upstream attribution in `PROVENANCE.md` and the existing compatibility identifiers in code and configuration. Updated the font notes, Help page and issue-template links for the current product.
- Verified repository-local documentation links, Git whitespace, ESLint and TypeScript. An isolated production image instance started from a fresh SQLite data mount and passed health and login-page checks. Verified the PostgreSQL Compose configuration renders. The running application and its saved data were left in place. The Help copy is in source and awaits the next deployment.

## 2026-11-24 — Deploy the onboarding updates in Docker

- Rebuilt `rolepilot:settings-no-scoring-local` from the current checkout and recreated the local service with the existing data volume. Verified the deployed bundle contains the new OpenRouter key verification prompt and One dashboard link.
- Docker and HTTP health checks passed. SQLite integrity was `ok` and all six applications were present.

## 2026-11-24 — Include the onboarding callback in One Connect config

- Added `http://127.0.0.1:3001/api/one/callback` to `one.connect.ts` alongside the port 3000 callback. The running onboarding server sends that exact port 3001 URI in its One authorization redirect. Validated the config loads and both callbacks are present.
- The existing One Connect app still needs the callback added in its dashboard before One can accept authorization on port 3001. The repository config does not update a registered app on its own.

## 2026-11-24 — Fix onboarding for OpenRouter and One

- Updated the welcome guide and OpenRouter settings card to prompt for a connection test after saving the key. The footer switches to Continue as soon as a key is available. A successful check shows a green confirmation. Settings store a server-bound fingerprint of the tested key so confirmation survives a reload and resets when the key is replaced, removed, or fails a later check.
- Added the optional One settings card to the first step with a link to One’s dashboard and the callback URL to register. Updated the One authorization route and SDK configuration to return users to the page that started consent. The completion screen lists One’s connection.
- Type checking, scoped ESLint, 1,656 Node and UI tests, and 241 focused tests including isolated SQLite passed. Chromium confirmed the save prompt and the change from Skip to Continue on a fresh local instance. Fixture tests covered OpenRouter verification and the One SDK callback. Live service checks were outside this pass. Changes are available on the hot-reloading server on port 3001.

## 2026-11-24 — Start a local onboarding server

- Started a hot-reloading Next.js server at `http://127.0.0.1:3001/welcome` for first-run onboarding work. Applied all 12 migrations to a fresh SQLite database at `data/onboarding-3001/rolepilot.db`. The data and server log are local and Git-ignored. The Docker app on port 3000 continued using its own database.
- Both health endpoints reported a healthy database. In Chromium, sign-in reached the welcome screen and “Let’s start” opened the AI setup step. Later setup steps and provider connections were outside this check.

## 2026-11-24 — Rebuild the local Docker app

- Rebuilt the production app in `rolepilot:settings-no-scoring-local` from the current checkout and recreated the service through `compose.local.yml`. The container uses the rebuilt image and the existing data volume.
- Docker and HTTP health checks passed. SQLite integrity was `ok`, with all six existing applications present.

## 2026-11-24 — Remove the Scoring entry from Settings

- Removed the standalone Scoring panel and navigation entry. Old Scoring URLs open AI provider, which manages the OpenRouter key used for job and resume scoring. Updated job-agent links, the New Application score card, setup guidance, and the development guide. The scoring workflows and saved settings use their existing backend behavior.
- Updated Settings and agent tests and the Find Jobs browser fixture for the shared OpenRouter connection. Type checking, scoped ESLint, Git whitespace, both production builds, and 70 focused tests passed. A Chromium test signed in, opened the old Settings URL, confirmed the Scoring entry was gone, and scored a fixture job through Find Jobs.
- Updated `compose.local.yml` to deploy `rolepilot:settings-no-scoring-local` on port 3000.

## 2026-11-24 — Align the AI Settings connection cards

- Moved the OpenRouter heading and description into the card with its API key controls in `ai-provider-section.tsx`. It uses the same card spacing and heading placement as One. The Settings tests check that the OpenRouter heading and key field share a card.
- Type checking, focused ESLint, Git whitespace, four Settings UI tests, and the production Docker build passed. Updated `compose.local.yml` and deployed `rolepilot:ai-settings-cards-local` on port 3000. Verified HTTP and Docker health.

## 2026-11-24 — Remove backend model names from AI Settings

- Removed the Models by task section and its component from Settings → AI provider. OpenRouter connection checks now report one status and avoid sending per-model details to that screen. The checks still cover writing and scoring access, and the runtime assignments are unchanged.
- Updated the provider form, Settings page, server action, and focused tests. Type checking, scoped ESLint, Git whitespace, the production Docker build, and 27 focused UI, routing, and isolated SQLite tests passed.
- Updated `compose.local.yml` and deployed `rolepilot:ai-settings-clean-local` on port 3000. Verified dashboard health and that the deployed bundle contains the generic connection status without the model table.

## 2026-11-24 — Update the AI Settings model table

- Added `ai-models-section.tsx` and moved the model information to the bottom of Settings → AI provider, after OpenRouter, One, and the writing controls. The table lists 20 processes, including the current GPT-6 Luna assignment for resume and cover letter chat edits, the separate email chat and section rewrite assignments, and the tools used for URL import and greetings. AI rows use the same model assignments as the runtime.
- Updated `ai-provider-section.tsx`, the Settings page, and the focused UI tests. Type checking, scoped ESLint, Git whitespace, nine focused tests, and the production Docker build passed. A signed-in Playwright check confirmed the section order, the Luna row, and that the table fits at 390 pixels with the sidebar collapsed.
- Updated `compose.local.yml` and deployed `rolepilot:ai-settings-models-local` on port 3000.

## 2026-11-24 — Use GPT-6 Luna for resume and cover letter chat edits

- Changed OpenRouter routing in `src/lib/ai/assignments.ts` and the refine job and task. Chat uses the selected document, or the open tab when no unit is selected, to route resume and cover letter edits to GPT-6 Luna and email-tab edits to Claude Sonnet 5.5. Updated Settings' model list through the shared assignments and added a separate Usage category for email chat in `src/lib/usage.ts`. Standalone section rewrites keep their existing model.
- Updated task, routing, and Usage tests. Type checking, focused ESLint, Git whitespace checks, the production Docker build, and 1,654 Node and UI tests passed with 31 skipped. Two synthetic requests through the live OpenRouter provider applied the requested resume summary and cover letter opening edits and recorded GPT-6 Luna. The live check used sample documents.
- Updated `compose.local.yml` and deployed `rolepilot:luna-chat-local` on port 3000.

## 2026-11-24 — Recover job URL imports with Exa

- New Application's **Fetch** tries the direct site first, then makes one Exa Get Contents request through the existing One grant on eligible failures. Added `job-posting-import.ts`, updated the direct fetcher and One client, and wired the result into the editable posting form and its Undo action. Invalid or private links and explicitly removed postings skip Exa. URLs with common credential parameters are kept out of the fallback. If both attempts fail, the form keeps the pasted text and URL. A late response also leaves newer edits intact.
- Added targeted tests and updated `DEVELOPMENT.md`, `PRIVACY.md`, and the local One Connect consent description. The job import uses the existing Exa permission set. Exa is limited to one 12-second attempt, with up to 40,000 characters of text. Some sites still require manual paste, and Exa results must match the requested listing URL after common normalization.
- Passed type checking, focused ESLint, Git whitespace checks, the production Docker build, and 1,653 Node and UI tests with 31 skips. A signed-in isolated dashboard imported an ŌURA job directly and recovered a public Indeed listing for Manthorpe Building Products through Exa. The recovered responsibilities and qualifications matched the source, and **Read the posting** extracted the correct company and role. An Apple Careers link and a Workable link still needed manual paste, and the form preserved existing text.
- Updated `compose.local.yml` and deployed `rolepilot:job-import-exa-local` on port 3000. The running dashboard passed HTTP and Docker health checks, with SQLite integrity intact and all six existing applications present.

## 2026-11-24 — Generate cover letters with company research

- Added `generate-cover-letter.ts`, `research-cover-letter.ts`, and `cover-letter-research.ts`. Sonnet frames the question, Luna searches and reads public pages through the existing One Exa grant, and Sonnet writes the four-paragraph letter. Rolepilot limits the research stage to 45 seconds and five tool calls. Exa requests use public job details and approved research topics. Missing or unusable research falls back to the posting. The People tab still applies a selected first-name greeting independently.
- Wired the workflow into `write-document.ts` and `write-documents.ts`, including new-application, agent, and connector drafts. Updated the writer, shared prompt parts, paragraph rewrite task, progress steps, model routing, and Usage. Paragraph rewrites reuse matching saved excerpts. Source-backed company warnings are handled separately from candidate claims. Added paired Prisma migrations, portable backup schema 18, and older-backup compatibility. Updated the implementation plan, One Connect description, privacy documentation, and development guide.
- Passed type checking, focused ESLint, Git whitespace, the production Docker build, and 1,642 Node and DOM tests with 31 skipped. Live synthetic pilots used both Exa actions and produced sourced four-paragraph drafts from a public URL and a pasted description. A signed-in isolated dashboard generated a sourced letter after its candidate memory settled and downloaded a one-page A4 PDF. Research quality and run time depend on the public evidence and provider availability. The page count can vary with content and layout.
- Passed full SQLite and PostgreSQL test suites in UTC, with 623 and 625 passes respectively. Updated two backup-version assertions to follow the current format. A forced research outage in a separate pilot still produced a four-paragraph draft from the live Sonnet writer.
- Verified a pre-migration SQLite copy in the app backup directory and rehearsed the additive migration on a copy. Updated `compose.local.yml` and deployed `rolepilot:cover-letter-research-local` on port 3000. Verified HTTP and Docker health, SQLite integrity, all six applications, and both saved People research results. The signed-in generation used the isolated instance with synthetic data.

## 2026-11-24 — Plan research-backed cover letter generation

- Added `docs/COVER_LETTER_IMPLEMENTATION_PLAN.md`. It specifies Sonnet's research planning and drafting, Luna's company research through the existing One and Exa connection, and how the brief will be saved and reused for paragraph rewrites. The plan covers both generation paths, the posting-only fallback, backup compatibility, and rollout checks. Hiring contacts stay in People.
- Reviewed the current generation jobs, shared prompts, One action configuration, editing, and backup code. Verified all 16 plan links, the matching writing-guide copies, and Git whitespace. This is a proposal. Application code, data, and deployment were untouched. Live provider access and generation quality will be checked during implementation.

## 2026-11-24 — Consolidate project plans and notes

- Moved four implementation plans, three audits, and `Cover Letter Writing Process.md` from the repository root to `docs/`. Linked the folder from `README.md` and updated the resume optimization plan reference in `DEVELOPMENT.md`. The changelog and repository guidance remain at the root.
- Verified that all eight moved files match their original contents, the updated links resolve, and Git whitespace checks pass. Documentation only. No deployment was needed.

## 2026-11-24 — Rename the local repository folder to rolepilot

- Moved the checkout from the previous checkout directory to `rolepilot`. Verified the same Git HEAD and identical working-tree status before and after the move. Recreated the running container from the new path with the same `compose.local.yml`, image, and Docker data volume.
- Verified `yarn typecheck`, Git whitespace, Docker and HTTP health checks, and SQLite integrity. All six applications and both saved People results are present. External shortcuts and tools configured with the old absolute path need the new path.

## 2026-11-24 — Deploy first-name greetings locally

- Built `rolepilot:people-first-name-local` from the current source and updated `compose.local.yml` to restart the dashboard with it. The build also includes the existing Rolepilot favicon update described below.
- Confirmed Docker health, `/api/health`, SQLite integrity, all six application records, the compiled first-name greeting action in the running container, and the branded favicon URL. Both greeting actions previously passed the focused SQLite tests. Existing drafts pick up the new greeting when the user reapplies the contact.

## 2026-11-24 — Use first names in People greetings

- Updated `src/app/(app)/applications/[id]/people-actions.ts` to use the first word of the saved contact name when applying a greeting to a cover letter or email. People still displays the full name. The change applies when the contact is selected, so existing drafts require reapplying the contact.
- Updated `src/app/(app)/applications/[id]/people-actions.db.test.ts` to assert first-name greetings for both drafts and preserve the existing Undo and draft-content checks. All five People action tests passed on isolated SQLite, along with type checking, focused ESLint, and Git whitespace checks. The running Docker dashboard still uses its previous build.

## 2026-11-24 — Keep Rolepilot favicons consistent across navigation

- Declared shared favicon/PNG/Apple icon metadata explicitly in `src/app/layout.tsx`, using new `/brand/rolepilot-*` URLs to avoid browser caches associated with the previous icon paths. Moved the existing, unchanged artwork from `src/app/favicon.ico`, `icon.png`, and `apple-icon.png` to matching names under `public/brand/`; kept a correct conventional fallback at `public/favicon.ico`. Removing file-convention icon declarations prevents competing automatic metadata during navigation.
- Investigation: the running app on port 3000 already served favicon and PNG bytes identical to the current Rolepilot source, and Settings declared no icon override. Stale browser favicon caching is the likely explanation; the user's existing browser-cache state was not reproduced.
- Validation: `yarn typecheck`, targeted ESLint, `yarn build`, and `git diff --check` passed. Verified rendered login HTML declares exactly the three new branded URLs and HTTP image bytes match their source files; conventional fallback also matches. Playwright sign-in and client navigation from dashboard to Settings and About, then full reload, retained the same Rolepilot icon links. No new dependency or image regeneration was needed.
- Local data operations: created/migrated/seeded only `/tmp/rolepilot_favicon_20261124_test.db` and used temporary app data `/tmp/rolepilot-favicon-smoke` with a test password on port 3119. No live user data or credentials were changed. Temporary server/browser stopped after validation.
- Deployment: source implementation and isolated production-build validation only. Existing Docker app on port 3000 was not rebuilt/restarted; it must be rebuilt to serve the new metadata/assets. Existing unrelated workspace changes were preserved. Safari and the user's existing browser profile were not tested.

## 2026-11-24 — Enable People search on the regular dashboard

- After the requested restart, detected the replacement OpenRouter key and reran both isolated pilots through the People tab. A posted URL and a pasted description each produced one sourced Figma contact. Some Muapi searches were unavailable, and Rolepilot displayed the partial-results message. Verified the pasted-description result after reload and applied its contact to a pilot cover letter. The earlier isolated fixture also verified both greeting actions and Undo.
- Took a consistent SQLite backup and verified its integrity before rollout. Updated `compose.local.yml` to use `rolepilot:people-live-local`, applied the People migration to the existing Docker volume, and verified the health endpoint, Docker health, SQLite integrity, and all six application records on port 3000. Saved the previously tested Exa and Muapi connection references after confirming that the live One credentials and authorization exactly matched the tested grant. Updated the People implementation plan. The final signed-in smoke test on the regular dashboard awaits a user-started search.

## 2026-11-24 — Restart the local dashboard

- Restarted the running `rolepilot:one-local` container using `compose.local.yml`. The health endpoint and Docker health check passed on port 3000. The existing SQLite volume reported six applications. The People rollout is still pending a successful pilot search.

## 2026-11-24 — Prepare the People workflow for local rollout

- Updated `src/lib/one/client.ts` to read Muapi’s live `full_name` and `company_name` fields while accepting previously supported fields. Poll the original receipt with a 15-second people-search deadline and a 50-second company-lookup deadline. The company lookup took about 37 seconds in the live provider check. Provider timeouts and caller cancellation keep distinct error codes. Updated `src/lib/one/client.test.ts` and the People implementation plan.
- Passed type checking, focused ESLint, Git whitespace checks, 1,636 Node and DOM tests with 31 skipped, and 13 focused tests on each of SQLite and PostgreSQL. Built `rolepilot:people-live-local`. Rehearsed the migration against a verified backup of the live SQLite database and confirmed that all six applications remained present. On an isolated instance, verified the Exa and Muapi permissions, saved People results across reload using a fixture, and confirmed both draft greeting actions and Undo.
- The two isolated searches, one with a posting URL and one with pasted job text, reached the OpenRouter step and failed because the saved key was rejected. A separate read-only authentication check returned HTTP 401. Port 3000 remains on `rolepilot:one-local` pending successful pilot searches with an accepted key.

## 2026-11-22 — LinkedIn company lookup for People

- Added Muapi’s LinkedIn company profile lookup as the fifth permission in `one.connect.ts` and opened a fresh registration review. The People agent can verify an ambiguous employer once per research run using a public LinkedIn company URL or official domain. It shares Muapi’s existing prediction polling and uses company data for employer context only. Existing grants with the two people-search permissions can still run People research.
- Updated the shared One client, People research task, their tests, the Settings permission hint, `DEVELOPMENT.md`, and the implementation plan. Type checks, focused ESLint, Git whitespace checks, and 18 focused tests passed. The regular app remains on its previous build. Live Muapi response verification awaits authorization and a provider connection.

## 2026-11-22 — Register Rolepilot with One Connect

- Added `one.connect.ts` with the local callback and four custom actions for Exa and Muapi. One’s current catalog uses new IDs for Exa Search and Get Contents. Updated the shared One client, its tests, the Settings hint, and the setup docs to match. The two Muapi action IDs were unchanged.
- Verified the selected actions against One’s catalog and opened the app registration approval page. One writes registration metadata to the ignored `.env.one-connect` file after approval. Type checks, focused ESLint, Git whitespace checks, and 16 focused tests passed. The running local app remains on its previous build. Provider connections and live People searches have yet to be verified.

## 2026-11-22 — Implement the hiring contact agent

- Wired **Find hiring contacts** to a cancellable, application-scoped background job. The OpenRouter agent chooses queries and actions from Exa search, Exa page reading, and Muapi LinkedIn people search through the shared One client. It accepts saved posting text or a URL, limits time and requests, validates cited evidence, and returns up to three ranked contacts. Settings → AI → One checks the Muapi grant separately from Exa. Muapi submission and bounded polling stay inside the One module.
- Added People results, source links, refresh and retry states, and optional greeting edits with Undo for existing cover letters and emails. Persisted results with the application in both databases and added backup format 17. One connection references remain installation settings. Earlier exports continue to import.
- Affected files include `src/lib/one/`, `src/lib/ai/tasks/find-hiring-contacts.ts`, `src/lib/jobs/find-hiring-contacts.ts`, `src/lib/jobs/runner.ts`, `src/lib/people/`, the Application and Settings screens, usage and backup modules, and the paired Prisma migrations. Updated `DEVELOPMENT.md` and the implementation plan.
- Type checks, focused ESLint, and Git whitespace checks passed. Node and UI suites recorded 1,629 passes and 31 skips. A focused rerun added two passing scenarios for a dead posting URL and the search budget. The focused SQLite and PostgreSQL suites passed 57 tests each. Built the local production image `rolepilot:people-agent-local` and used an isolated SQLite instance to verify sign-in, the People search button, the missing-grant state, and the link to Settings → AI. The regular local app and its database were left on the previous build. Live OpenRouter and One/Muapi searches require an authorized One grant and live provider verification before rollout.

## 2026-11-22 — Hiring contact agent implementation plan

- Added `PEOPLE_RESEARCH_IMPLEMENTATION_PLAN.md` with URL and pasted-description flows, the system prompt, approved One actions, evidence checks, execution limits, persistence, the People tab, and draft greeting updates. The plan identifies the existing OpenRouter tool-call adapter, One client, and job runner for reuse.
- Reviewed the current source paths and One’s documented Muapi submission and result actions. Git whitespace checks passed. This is a proposal. No application code, database, or deployment changed. Live One and Muapi behavior remains to be verified during implementation.

## 2026-11-22 — People research workflow design (proposal)

- Agreed that **Find hiring contacts** will start a dedicated research agent on demand. It will accept either a job URL or a pasted description. The agent will use the application’s company, title, and team clues to identify the opening and ask for the employer only if it remains ambiguous.
- People and future cover-letter research will share the One connection. The People agent will select from approved actions at runtime. The proposed first version uses Exa for public web search and page reading and Muapi for LinkedIn people search without a personal LinkedIn login. LinkedIn job-poster lookup is a possible follow-up.
- The agent will prioritize people named on the posting or tied to it through a public hiring announcement, then consider relevant team leads and recruiters. Results will include the reason and source links. The user can choose a contact for either draft’s greeting. People search will run independently of draft creation.
- Checked the changelog against the Rolepilot commits and current working tree. Clarification to the One entry below: the shared client implements the two Exa actions, and no company-research or People job calls it yet. The People button is still disabled. Only `CHANGELOG.md` changed in this review. Git’s whitespace check passed, and Docker reported the existing `rolepilot:one-local` deployment healthy. No app tests or live provider requests were run for this documentation update.

## 2026-11-21 — Shared One MCP connection

- Added a One section immediately below the OpenRouter credentials in Settings → AI. It stores the One Connect credentials encrypted, supports the signed-in OAuth consent flow, and checks the two explicit Exa permissions without running a search. The installation’s credentials, grant reference, and selected connection stay out of portable backups.
- Added the server-only `callOneAction()` for Exa Search the Web and Get Contents. It uses One’s hosted MCP with a short-lived Connect token, bounds responses, validates inputs and output, and honors cancellation. The installed Connect SDK handles consent, and the documented token endpoint handles minting. The current allowlist enables the company research caller. Research and People workflows are separate follow-up work.
- Affected files include `src/lib/one/`, `src/app/api/one/[action]/`, the Settings AI and credential-storage modules, export and session audit tests, dependencies, `DEVELOPMENT.md`, and `compose.local.yml`. The existing settings table handles storage without a schema change.
- Passed type checking, focused ESLint, whitespace checks, 1,619 Node and UI tests, and 42 focused SQLite tests. The production Docker build passed and `rolepilot:one-local` is deployed on the regular local app. Verified the signed-in settings placement, disconnected state, and protection of the authorization route. Consent and Exa actions were tested with mocked responses. Live One and Exa checks need a configured grant.

## 2026-11-21 — Cover letter introduction

- Matched the empty Cover letter tab to the Application email card. Added a description of what the draft uses and kept the existing write action, progress, and AI settings guidance. Updated `write-missing-document.tsx` and the application view test.
- Passed 85 focused tests, ESLint, whitespace checks, and the production Docker build. Deployed to the regular local app and verified the new card and button on a signed-in application without a cover letter. Draft creation was exercised in the component test.

## 2026-11-21 — People tab button

- Added a disabled Find hiring contacts button below the description, matching the placement of the Application email action. Updated `people-tab.tsx` and the application view test. Contact search remains pending.
- Passed 84 focused tests, ESLint, whitespace checks, and the production Docker build. Deployed to the regular local app and verified the disabled button on a signed-in application.

## 2026-11-21 — People tab introduction

- Matched the People card to the Application email layout and added a short explanation of the hiring-contact lookup. The card says contact search is coming soon. Updated `people-tab.tsx` and the application view test.
- Passed 84 focused tests, ESLint, whitespace checks, and the production Docker build. Deployed to the regular local app on port 3000 and verified the copy on a signed-in application.

## 2026-11-21 — People tab deployed and Zyte retired

- Deployed the frontend People tab to the regular local app. It shows the real empty hiring contacts panel for each application. Contact search, storage, and cover-letter integration remain outside this frontend change.
- Removed Zyte tools, settings, refresh jobs and controls, and the company-research step and prompt context from new letters, missing letters, and letter edits. Kept historical research data in exports and imports and recorded historical usage where present. Files changed under `src/app/(app)/applications/`, `new/`, `settings/` and `usage/`, and under `src/lib/` for jobs, drafting, prompts, usage, settings and exports.
- Built and deployed `rolepilot:people-local` through `compose.local.yml` on the existing volume. The previously published migration added an unused nullable compatibility column. Backed up the database before deployment and verified integrity, all 6 applications and 11 documents, the signed-in People tab, AI settings, and live health. The running bundles contain no Zyte endpoint. The build also includes the previously prepared flexible application-email brief.
- Production Docker build, type checking, ESLint on changed frontend and library files, and whitespace checks passed. Node and UI suites recorded 1,612 passes and 31 skips. Four focused SQLite suites recorded 59 passes.

## 2026-11-21 — People tab empty state

- Removed the sample contacts, simulated search, and simulated confirmation from the People tab. The tab now shows the empty hiring contacts panel. Updated `people-tab.tsx`, `application-view.tsx`, and the application view test.
- All 84 focused tests, type checking, ESLint on the files changed in this follow-up, and whitespace checks passed.
- Stopped the separate demo server. The regular local instance is healthy. Deploying the current source would also apply the pending company research migration, so the frontend change has not been deployed there.

## 2026-11-21 — People tab frontend preview

- Added a People tab to each application. Its Find hiring contact button reveals sample results with roles and sources, a possible match, and a reversible confirmation. Preview state stays in the current application view while switching tabs. People uses the full pane and hides document editing and PDF controls.
- Updated the application view, tab routing, and sidebar under `src/app/(app)/applications/[id]/`. Added `people-tab.tsx` and extended the application-view and routing tests.
- Validation passed for 84 focused tests, type checking, and ESLint on all changed frontend files. Checked the empty state, sample results, and confirmation in Chromium against an isolated demo instance. Checked the narrow layout with the main navigation collapsed.
- Available in the local demo preview. Search, persistence, and cover-letter integration are outside this frontend preview. The regular local deployment was not updated.

## 2026-11-21 — Current Rolepilot source snapshot

- Prepared the current Rolepilot app for GitHub, including the rebrand, candidate memory, resume optimization, writing updates, and sourced company research. This snapshot includes app and desktop source, documentation, test fixtures, branding assets, and database migrations.
- Checked the publish diff for whitespace issues and common credential patterns. Feature validation is recorded in the corresponding entries below. Live Zyte acceptance remains pending.

## 2026-11-20 — Sourced company research for cover letters

- Added opt-in company research through OpenRouter and Zyte. The model can choose organic searches and rendered pages within a two-minute deadline, with up to three search requests and five page requests including retries. Rolepilot checks company identity, retrieved source IDs and supporting excerpts, and keeps company evidence separate from candidate evidence. Settings → AI now provides encrypted Zyte key management, search and page connection tests, and an enable switch that defaults to off.
- Initial cover-letter jobs started manually, by the job agent, or by the connector and missing-cover-letter jobs on existing applications now use the shared research pipeline. Writing proceeds from application information when research is unavailable. Matching sourced results are reusable for seven days. Applications show research status and source links alongside the letter, and their refresh action updates research independently of the letter. Letter edits can reuse fresh research.
- Added matching PostgreSQL and SQLite migrations for versioned application research and updated backup/restore to export schema 16. Findings survive job cleanup and follow their application on export, restore, and deletion. Zyte credentials remain in installation settings. Added research token usage and request, duration, reuse, and failure logging. Prompt versions are `research-company@1`, `write-cover-letter@8`, `regenerate-unit@11`, and `refine-chat@16`.
- Affected code is in `src/lib/research/`, `src/lib/bounded-response.ts`, the AI adapters, tasks, and fact guard, document and research jobs, application creation, settings and secret storage, backup/export/import, and the New, Settings, Application, and Usage screens. Added mock transport, database, and UI tests and updated affected fixtures.
- Validation passed for 1,641 Node and UI tests, plus 131 PostgreSQL and 130 SQLite tests on isolated databases. Migration status, type checking, ESLint, whitespace checks, and an optimized production build also passed.
- Changes are in the workspace and local build. Live Zyte account access, JavaScript-heavy site retrieval, factual quality for three companies, and switching between two OpenRouter models still require configured credentials. Zyte follows page redirects in its browser infrastructure. Rolepilot checks submitted and returned addresses and sends credentials only to the Zyte API. [Zyte browser request documentation](https://docs.zyte.com/zyte-api/usage/reference.html)

## 2026-11-19 — Flexible application email writing brief

- Replaced the literal email prose template with the agreed writing brief, giving the AI freedom over wording, sentence structure, paragraph lengths and emphasis while preserving the three-paragraph progression: interest/background, strengths/concrete work, and interest in joining. Retained the factual boundaries, natural omission of missing details, fixed “Hi,”/“Best,” framing and candidate name, with no attachment paragraph or portfolio/LinkedIn signature.
- Shared `EMAIL_WRITING_BRIEF` between full email writing and email-body regeneration. Preserved recipient/subject handling, structured output and existing fact guard. Prompt versions are now `write-email@5` and `regenerate-unit@10`. Updated prompt assertions and saved-version expectations. Affected files: `src/lib/ai/tasks/write-email.ts`, `src/lib/ai/tasks/regenerate-unit.ts`, `src/lib/ai/tasks/tasks.test.ts`, `src/lib/jobs/write-email.db.test.ts`, and this changelog.
- Validation: all 61 AI task tests and 4 email-job database tests passed; focused ESLint, `yarn typecheck`, and whitespace checks passed. Database tests applied migrations to an isolated SQLite fixture for the email writing brief; no live application data was modified.
- Deployment: source changes only; no production build or running service/container deployment. Existing drafts are not automatically rewritten. Mock-provider tests verify prompt delivery and application behavior; live-model wording quality and adherence have not been evaluated.

## 2026-11-19 — Application email template

- Replaced the short attachment-note prompt with the requested conversational three-paragraph template: company/role interest and relevant background, strengths and concrete projects, then interest in joining and shaping the team. Corrected “strongest suites” to “strongest suits” and smoothed grammar. Full email generation now adds “Hi,” and “Best,” plus the saved candidate name directly, regardless of model-provided framing or tone. No portfolio/LinkedIn signature is added.
- Added explicit instructions to use supported details, omit unknown years/team clauses naturally, avoid padding employer lists to four, and adapt project claims to available evidence. Shared the template with email-body regeneration so it no longer requests the old 80–150-word attachment note. Existing recipient validation and fact guard remain. Prompt versions are `write-email@4` and `regenerate-unit@9`.
- Affected files: `src/lib/ai/tasks/write-email.ts`, `src/lib/ai/tasks/regenerate-unit.ts`, `src/lib/ai/tasks/tasks.test.ts`, `src/lib/jobs/write-email.db.test.ts`, and this changelog. Preserved unrelated existing workspace changes.
- Validation: 61 AI task tests and 4 email-job database tests passed; focused ESLint, `yarn typecheck`, and whitespace checks passed. Database tests used an isolated SQLite fixture for the email template, with migrations applied there; no live saved data was changed.
- Deployment: source changes only; no running service/container replacement, production build, or deployment. Existing emails are not rewritten automatically. Tests used a mock AI provider; live-model adherence to the prose template and factual accuracy were not evaluated. Three-paragraph content is instructed through the prompt; greeting and closing are enforced during full email assembly.

## 2026-11-19 — Sliding dark mode switch

- Replaced the sidebar theme button treatment with a sliding switch next to the Dark mode label, with a compact track in the collapsed sidebar. The control supports keyboard input, announces its on/off state and respects reduced motion. Theme choice still uses the existing browser preference. Changed `src/app/(app)/theme-toggle.tsx` and the corresponding sidebar tests.
- All five focused sidebar and layout tests passed, including keyboard switching and preference persistence. Focused lint, whitespace and production Docker build passed. Deployed `rolepilot:theme-switch-local` via `compose.local.yml` with the existing volume. Live health and light/dark sign-in color checks passed. Signed-in switch behavior was verified in component tests.

## 2026-11-19 — Lighten the blue accent one step

- Lightened primary blue to #2064F3 in light mode and #296CF4 in dark mode. Matched hover colors and the light focus ring in `src/app/globals.css` and `desktop/start/start.css`.
- Verified white button label contrast at rest and on hover in both modes, plus light focus and dark control contrast. Docker production build, live sign-in button and hover checks, health and whitespace checks passed. Deployed `rolepilot:soft-blue-local` via `compose.local.yml` using the existing volume. Native installers were not rebuilt.

## 2026-11-19 — Slightly lighter blue interface accent

- Switched from burnt clay to the original blue direction with slightly lighter primary fills in `src/app/globals.css` and `desktop/start/start.css`. Primary fills are #155EEF in light mode and #246BF2 in dark mode, with white labels. Restored the original blue selection backgrounds and tuned hover and focus colors.
- Contrast checks passed for primary labels, hover states, selected labels and focus rings in both modes. Production Docker build and whitespace checks passed. Deployed `rolepilot:lighter-blue-local` via `compose.local.yml` using the existing volume. Live health and browser checks for sign-in button, label and hover colors passed in both modes. Native installers were not rebuilt.

## 2026-11-19 — Burnt clay interface accent

- Replaced deep teal with the selected burnt clay palette for primary actions, focus and selections in `src/app/globals.css`, and matched the native startup colors in `desktop/start/start.css`. Light mode uses #9B4D35 and dark mode uses #D89A82.
- Contrast checks passed for primary labels, hover states, selected labels and focus rings in both modes. Production Docker build and whitespace checks passed. Deployed `rolepilot:burnt-clay-local` via `compose.local.yml` using the existing volume. Live health and browser checks for sign-in button, label and hover colors passed in both modes. Native installers were not rebuilt.

## 2026-11-19 — Deep teal interface accent

- Applied the selected deep teal palette to primary actions, focus and selected states in `src/app/globals.css`. Light mode uses #21605C with white labels. Dark mode uses #86B9B2 with dark labels. Matched native startup source in `desktop/start/start.css` and kept checked switch thumbs legible in the shared toggle and application preview switch.
- Verified contrast for button text and hover states, selected text, focus rings and primary controls in both schemes. Production Docker build and whitespace checks passed. Deployed `rolepilot:deep-teal-local` via `compose.local.yml` using the existing volume. Live health and browser checks for light and dark sign-in button, label and hover colors passed. Native installers were not rebuilt.

## 2026-11-19 — Desktop rolepilot visual refresh

- Implemented logo-aligned cool light/slate dark tokens, blue actions/focus/selection, bundled Inter interface text, Manrope product headings and lowercase wordmark. Added product-only typography utilities, retaining existing document typeface mappings; adjusted the shared logo display crop without modifying the PNG. Kept layouts, control placement, interaction logic, saved data, AI prompts and document templates intact; no phone changes.
- Updated product-owned pipeline/activity/startup/email-heading copy and corresponding existing component/browser assertions. Coordinated desktop startup and native bar fonts/colors and font-copy assets. Main files: `src/app/globals.css`, `src/fonts/index.ts`, `src/fonts/README.md`, shared BrandMark/header/UI components, product screen/chrome components, desktop styles/assets script and `ROLEPILOT_VISUAL_AUDIT.md` implementation record.
- Validation: UI component tests 637 passed; focused theme/desktop/compatibility tests 24 passed; final affected toast/application component recheck 86 passed. Lint/typecheck, final production web/Docker build, desktop build, copied desktop font URLs and whitespace checks passed. Browser run initially had 84 passes/5 failures: corrected the toast entrance fade causing transient contrast loss and existing cover-letter format accessible-name mismatch; updated stale accessibility selectors to the current Resume controls/Sections tabs and exact Resume label without weakening assertions. Targeted rerun: 11 passed, covering all failures plus cover-letter format/Undo, long-letter PDFs and every built-in theme's embedded non-Type-3 fonts.
- Deployed `rolepilot:visual-refresh-local` via `compose.local.yml`, retaining the original external data volume/config and prior image `rolepilot:career-tagline-local`. Health passed. Inspected live light/dark desktop captures at 1280/1440px, login, collapsed-sidebar/focus; no page-level horizontal overflow across the eight captured core routes. Same live base/tailored-resume/cover-letter PDFs retained extracted text, page counts and embedded font names/types; rasterized PDF pixels were identical before/after. Preview document computed font/color/dimensions also matched; surrounding product chrome changes naturally alter screenshot positioning. Top-left branding remains tagline-free. No application-data/schema changes or phone work; native installers were not packaged or exercised, and the full unrelated regression suite was not rerun.

## 2026-11-19 — Desktop product visual audit and refresh proposal

- Added `ROLEPILOT_VISUAL_AUDIT.md` with live/source findings, proposed logo-aligned blue/cool-neutral palette, bundled Manrope/Inter typography, shared wordmark treatment, scoped product wording examples, implementation phases and document-regression boundaries. Incorporated the user's desktop-only scope: phone work excluded; resume/cover-letter/email content, document themes and functionality remain outside the refresh.
- Validation: inspected current source/tokens/font wiring, supplied transparent logo and local production desktop captures in light/dark mode across primary routes and all nine Settings sections; calculated sample proposed color contrast ratios. Screenshots are local under `output/playwright/audit-*.png` and may contain personal data. Not an exhaustive state/accessibility/functional audit; setup/OAuth/native desktop coverage is source review. No implementation, database/config edits or deployment; lint/build/regression tests are not applicable to the documentation-only proposal. Missing installed skill reference templates and repository design documents are explicitly recorded.

## 2026-11-19 — New career tagline outside branding headers

- Added the selected “Your career. Cleared for takeoff.” tagline to global page metadata and the README introduction. Kept login and sidebar top-left logo/name areas tagline-free, as requested; the removed old tagline is not restored. Affected files: `src/app/layout.tsx`, `README.md` and this changelog.
- Validation: source assertions confirm the two placements and absence from both branding headers. Focused lint, typecheck, production web/Docker build and whitespace checks passed. Deployed `rolepilot:career-tagline-local` through `compose.local.yml`, retaining existing data/config and the previous image. Live login and authenticated dashboard metadata contain the new description; visible logo/name areas remain tagline-free; health passed. No database changes; full regression suites are unnecessary for this copy-only change.

## 2026-11-19 — Remove product tagline

- Removed the tagline from the login page, sidebar header and global metadata description, plus its variant in the README introduction. Searched active source, desktop, public assets and repository-facing copy for further uses; no remaining matches. Existing historical screenshots/builds are not active application copy.
- Validation: focused ESLint, typecheck and 11 login/sidebar/layout tests passed; whitespace check passed. Production web/Docker build passed. Deployed `rolepilot:no-tagline-local` via `compose.local.yml` with existing volume/config retained and previous image preserved. Verified live login/global metadata and authenticated dashboard/sidebar contain no tagline; deployed compiled JS/JSON/HTML scan found zero matches, and health passed. Full database suites were not rerun for this copy-only change; no database or credential changes.

## 2026-11-19 — Transparent rolepilot logo

- Removed the supplied logo’s white background through imagegen background extraction, preserving the blue arrow artwork and original source PNG. `public/brand/rolepilot-transparent.png` is now used by BrandMark and README, with transparent app/Apple/desktop/favicon derivatives. Removed the large login logo’s tile shadow, rounding and opacity so the artwork blends into the page in both color schemes. The prior white-background public PNG is retained as the original copy. Updated the removal audit’s logo follow-up to describe the transparent derivative.
- Validation: ESLint/typecheck, desktop build, production web/Docker build and 11 login/sidebar/layout tests passed. Verified alpha at image corners and inside the loop, then inspected live light/dark login screenshots (`output/playwright/rolepilot-transparent-light.png` and `rolepilot-transparent-dark.png`). Live PNG has alpha and login uses the new asset without the tile shadow. Deployed `rolepilot:transparent-logo-local` via `compose.local.yml`; data/config retained and prior `rolepilot:logo-local` image preserved. Native installers were not repackaged.

## 2026-11-19 — Supplied rolepilot PNG logo

- Adopted user-supplied `Rolepilot.png` as the canonical artwork. `public/brand/rolepilot.png` is a byte-for-byte copy used by the shared BrandMark on login/sidebar/setup/authorization surfaces. Replaced the temporary R glyph and SVG app icon with derived PNG app/Apple/desktop icons and an RGBA favicon; README now displays the supplied asset. Original artwork, colors, white background and proportions are preserved. The removal audit records that this supersedes its temporary R-mark description.
- Validation: shared component ESLint and typecheck passed; login/sidebar/layout component tests passed (11); desktop build passed. Verified the public asset checksum against the original and icon dimensions (512/180/512). The first production build caught an RGB favicon incompatibility; regenerated its embedded PNG as RGBA. Final web and Docker production builds passed. Recreated the local service as `rolepilot:logo-local` via `compose.local.yml`, preserving the existing volume and configuration. Live PNG checksum matches the supplied file; app/Apple/favicon endpoints return 200 and login references the PNG. Inspected the live login screenshot at `output/playwright/rolepilot-supplied-logo.png`; health endpoint passed. Desktop source/assets were rebuilt, but no new native installer was packaged. Previous image `rolepilot:rebrand-local` remains available for rollback.

## 2026-11-19 — rolepilot rebrand and upstream communications removal

- Applied the branding audit and adopted the Rolepilot name. Replaced web/desktop names, R-mark/icon assets, metadata, errors, download names, user agents, MCP/OAuth/desktop/print identities, package locks, configuration examples, CI wording and active docs. Added shared `src/lib/brand.ts`, local help and `PROVENANCE.md`; preserved LICENSE, font attribution, migration/checksum identities and earlier changelog entries.
- Deleted usage telemetry sender/consent/actions/startup hooks/config and dedicated tests/fake endpoints; removed upstream promotions/contact/funding and stale update/usage copy. Remote announcements/releases were already removed from source and are now absent from the deployed build. Functional saves/errors/progress/integration notifications remain.
- Added v2 credential encryption and transactional legacy rewrapping (`keys.ts`, `secrets.ts`, `rebrand-secrets.ts`, instrumentation); retained recovery for unreadable secrets and old env/exports/themes/backups/browser drafts/preferences/Calendar/desktop storage. Existing secret/password unchanged; browser sessions and MCP tokens require fresh authorization. No rebranding SQL migration needed.
- Checks: production build, typecheck/lint, desktop build, diff whitespace; Node/DOM 1,607 passed/31 skipped plus final focused crypto/compatibility 18 passed; SQLite 612 passed/3 skipped; Postgres 614 passed/1 skipped. Sign-in, MCP, Google mail, optimization/history, theme file and PDF-font browser checks passed. One existing cover-letter theme UI/database synchronization discrepancy remains documented in the audit; its browser assertion is not suppressed.
- Deployed local Docker `rolepilot-app-1` / `rolepilot:rebrand-local` on port 3000 with the original external volume; migrated local `.env` names without exposing values. Applied the previously authorized pending memory/optimization migrations after an offline copy upgrade preserved 36 existing table counts. Live routes/export/PDF/health passed; integrity `ok`, foreign-key errors zero; only Job/AiUsage counts increased due to normal newly deployed memory backfill (which makes configured provider calls). Live saved settings credentials are v2.
- Preserved old container/image and consistent data/secret recovery files under `~/.local/share/rolepilot/backups/pre-rebrand-20261119T042611Z/`. Rollback needs the matching data/config restore, not just the older image. Deployed compiled scan found zero old notification/telemetry endpoints/control strings; offline fetch tracing found no upstream project hosts. Native installers were not packaged/published or installed. See the deployment guide for storage and recovery details.

## 2026-11-18 — Branding and upstream-connection removal audit

- Added the branding audit, covering an inventory of 271 matching files, remaining telemetry/promotional links, web/desktop assets, external request identity, MCP/OAuth, cookies, encryption, exports/themes/backups, calendar ownership, packaging/deployment and legal/provenance boundaries. Documents compatibility risks, removal sequence and verification criteria; no removal implementation claimed.
- Validation: read-only static source/config/history inspection; Docker identity and compiled-string inspection confirmed the older running image still contains release/announcement functionality already removed from source. Documentation whitespace check passed. No live data/config edits, provider calls, network capture, tests or deployment; replacement product identity remains unspecified.

## 2026-11-18 — Frontend writing settings clarification

- Confirmed the frontend already has Faithful/Balanced/Optimized under Writing approach, with generation-language controls removed. Updated `src/app/(app)/settings/ai-behaviour.tsx` so factual-review help follows the selected approach, and `documents-section.tsx` to explain English drafting while preserving existing documents and profile languages.
- Updated the corresponding component tests to verify Optimized selection/saving, its factual-review description, the English notice and absent language selectors. Validation: both component suites passed (9 tests), and ESLint passed for all four affected files.
- Source changes only. The existing Docker app on port 3000 was not replaced: deploying the current workspace would also ship pending backend work and database migrations. No live data changed; this follow-up did not repeat browser or production-build checks.

## 2026-11-18 — Optimized resume writing and English-only generation implemented

- Replaced Expressive with Optimized while retaining Faithful/Balanced and Balanced as the default. Provider temperatures are 0.2/0.6/0.7, subject to existing provider capability handling. Settings now describe Writing approach and strict advisory review. Optimized omits the generic `truthfulness()` attachment regardless of strict, and uses its own boundaries preserving employers, historical titles, dates, responsibility/ownership, metrics and outcomes. Resume strategy recognizes direct, transferable and adjacent capabilities demonstrated through actions, with examples preventing tool/proficiency and leadership inflation. Updated affected prompt versions and fixtures; preserved existing explicit-user-edit chat behavior and unrelated work.
- Added privacy-filtered role/project/education evidence and validated stable source citations to requirement matching. Direct/transferable versus adjacent support appears in notes; adjacent evidence cannot become covered through a named-skill mapping. Deterministic years, language qualifications and certification validity remain unchanged. Resume writing retains full evidence separately from printable entries: hidden roles can support general skills without generating hidden role units or relocating achievements. These interpretations do not create candidate-memory assertions. Connector drafting exposes the selected writing strategy, English policy and full evidence while retaining printable-entry filtering.
- Removed active generation-language settings/actions/UI, task options, job overrides, connector language selection and posting-language extraction. Every new writing prompt contains one shared English instruction. New applications/missing documents have English metadata; candidate language skills/requirements remain supported. Legacy application/document language fields, old rendering/RTL helpers, frozen copies, exports and history remain readable. Section edits preserve legacy metadata. Explicit full-prose chat rewrites stamp English atomically; format-only changes do not. Email rewrites save previous state for Undo, with concurrency checks against the rewritten state. This intentionally supersedes the earlier Refine entry's allowance for explicit language requests to override defaults.
- Added paired `20261118130000_resume_optimization` migrations: PostgreSQL renames its existing Creativity enum value; both backends convert raw key/value EXPRESSIVE settings and remove retired language keys. Settings parsing and backup imports normalize the old mode before validation; exports canonicalize it. Backup format stays 15 because generic setting and historical document shapes are unchanged; previously supported import versions remain accepted. No new tables or application-language column removal.
- Affected files: both Prisma schemas/new migrations; `src/lib/ai/provider.ts`, task options and writing/extraction/matching tasks; settings/data import/export; writing/refinement jobs, document-state and application creation/Undo; connector tools/write; settings UI, base-resume rendering inputs, gallery and affected fixtures. Added `src/lib/ai/tasks/optimization.test.ts`, `src/lib/optimization-migration.db.test.ts`, `e2e/optimization.spec.ts` and regression coverage in settings/import/jobs/actions tests. Updated `DEVELOPMENT.md`, `PRIVACY.md` and the implementation plan's status/compatibility notes.
- Validation: regenerated both Prisma clients; TypeScript/production build, changed-file plus new-file ESLint, and `git diff --check` passed. Final Node/DOM suite: **1,611 passed, 31 skipped**. Final isolated SQLite suite: **627 passed, 3 skipped**; PostgreSQL: **629 passed, 1 skipped**. Suites ran with `TZ=UTC` for existing timezone-dependent assertions. Seven Chromium tests passed (including setup), covering Optimized persistence, generation from a German posting, section regeneration/history restoration, email rewriting/editing/chat and Undo. Mock prompt matrix covers all three approaches, strict on/off, and all six writing paths. Populated backend migration tests and legacy backup round trips passed. Actual desktop SQLite runner passed a populated pre-feature upgrade, preservation of unrelated settings, its pre-update backup's old values, and repeat-startup no-op using a temporary fixture.
- Local test data only: isolated SQLite, PostgreSQL and browser test databases; desktop migration smoke fixture was temporary and removed. Browser AI/job services were fake; no paid-provider semantic comparisons, live historical extraction or mass regeneration ran. Exact citations validate provenance, not semantic entailment; real-model writing quality still needs the separately scoped evaluation. Complete English metadata conversion is conservative and requires explicit rewrite intent plus replacement of every existing generated prose unit; partial/mixed documents retain legacy layout metadata.
- Deployment: source implementation and local validation only. No live application database migration, running-app/container replacement, commit/push, installer publication or production deployment. Deploy matching code/clients/migrations together after a live-data backup; rollback to older code requires mapping OPTIMIZED back to EXPRESSIVE and compatible database handling. Existing drafts and sent snapshots were not rewritten.

## 2026-11-18 — Remove the standalone marketing website

- Deleted the complete `site/` directory (HTML, CSS, JavaScript, build script, and social image) and `.github/workflows/pages.yml`, removing its scheduled and push-triggered GitHub Pages deployment.
- Removed website-only instructions from `DEVELOPMENT.md` and obsolete website/output entries from `.gitignore`, `.dockerignore`, and `eslint.config.mjs`. Shared application icons/fonts and README screenshots remain because they have other consumers. No generated `_site/` directory was present.
- Validation: `yarn typecheck`, `yarn lint`, and `git diff --check` passed. Verified website source, generated output, and Pages workflow are absent; repository search found no remaining site-build or Pages-workflow references outside historical changelog entries. No application logic changed; no additional runtime tests or production build were run for this deletion.
- Deployment: local repository cleanup only. Existing hosted GitHub Pages content, domain/DNS settings, and remote repository history were not changed; removing the workflow prevents future deployments from this checkout once committed/pushed. Application data and unrelated workspace changes were preserved.

## 2026-11-18 — Remove release checks and remote announcements

- Removed automatic/manual GitHub release checks, Settings → About update controls, sidebar release notices, remote announcement fetching/rendering/dismissal, related settings/schema fields, environment overrides, and obsolete tests/fixtures. Affected application areas: `src/app/(app)/layout.tsx`, `sidebar.tsx`, settings pages/actions/About components; `src/lib/settings.ts`, `env.ts`, `releases.ts`; deleted `src/lib/update-check*`, `update-actions.ts`, `src/lib/announcements/*`, notification components/tests, and notification E2E specs. Simplified `e2e/support.ts` and `e2e/fake-jobs.mts` accordingly.
- Removed desktop release-download menu/recovery links and their IPC/preload handlers (`desktop/src/main.ts`, `preload.ts`, `desktop/start/index.html`, `start.js`); updated the packaging comment. Preserved newer-database refusal and its explanation; focus now goes to the existing data-location chooser. Version information, repository credits, telemetry consent, and normal application features remain.
- Retired notification keys, including `updateCheck`, remain excluded by `INSTALL_SETTINGS` in `src/lib/data-export.ts` so existing database rows are inert and older backups cannot reintroduce active settings. No schema migration or live-data deletion. Updated `DEVELOPMENT.md` and `PRIVACY.md` to reflect the removed requests.
- Validation: 62 focused tests passed across settings/environment parsing, desktop recovery, signed-in layout (no update requests or cached notices), About controls, and SQLite export/import compatibility. Root TypeScript check, targeted ESLint, production build, desktop TypeScript check/build, and whitespace checks passed. Desktop dependencies were installed with `yarn install --immutable`; no lockfile changes. Initial test/check attempts caught test setup/type issues and an SQLite/PostgreSQL environment mismatch; corrected before the passing runs.
- Browser validation: Playwright smoke check against the built app on temporary port 3118 passed sign-in, dashboard/navigation, Settings → About, and a saved application page. Populated legacy notification settings produced no notices; retained About controls and version information were present. The mocked layout regression verifies no notification fetches; no server-side network capture was performed.
- Local data operations: migrated/reset/seeded only an isolated SQLite fixture for automated tests and smoke checks, with temporary app data under a temporary directory. Stopped the temporary server/browser afterward. Existing application data and unrelated working-tree changes were preserved.
- Deployment: source implementation and local build validation only; no production app/container rebuilt or restarted and no desktop installer published. Installed copies require a rebuilt release/reinstallation. Native Electron window interaction, packaged Windows/Linux installers, and PostgreSQL-specific E2E tests were not run; desktop recovery behavior was exercised through its actual HTML/JavaScript in JSDOM.

## 2026-11-18 — User-directed Refine with AI implemented

- Rewrote chat refinement as one editing workflow using selected existing `prompt-parts.ts` helpers, without duplicating formatters. Preserved profile/job/posting/document/application-fact/history/settings context and scoped private-field access. Current user instructions take precedence over remembered context and default style/language preferences.
- Removed automatic-evidence mode, structured skill-evidence requirements, resume-generation rule imports, and post-edit fact checking from chat. Requested additions and replacements no longer acquire unsupported-fact warnings; previous warnings remain in Undo snapshots. Updated the prompt version to `refine-chat@14`.
- Preserved transactional document persistence, conversation history, versions, structural/style operations, Undo payloads, duplicate-result handling, and concurrent-edit protection. Old queued automatic-evidence jobs now fail explicitly before AI execution rather than becoming unrestricted edits.
- Supporting-information submissions now save application facts and their existing memory source without generating a chat request or starting a document rewrite. Updated form guidance, feedback, and UI result handling accordingly. Initial tailoring and section regeneration retain their evidence behavior.
- Added an optional pending-memory-processing switch to the existing candidate-context loader. Chat reads available remembered context without waiting for pending/failed extraction; other callers retain the default behavior. User requests continue to be recorded through the existing chat/memory pipeline.
- Implementation files: `src/lib/ai/tasks/refine-chat.ts`, `src/lib/jobs/refine.ts`, `src/lib/memory/context.ts`, `src/app/(app)/applications/[id]/actions.ts`, `src/app/(app)/applications/[id]/application-view.tsx`, and `src/components/application-evidence-form.tsx`. Updated `REFINE_CHAT_IMPLEMENTATION_PLAN.md` with implementation status.
- Test files: `src/lib/ai/tasks/tasks.test.ts`, `src/lib/jobs/refine.db.test.ts`, `src/app/(app)/applications/[id]/actions.db.test.ts`, `src/app/(app)/applications/[id]/application-view.test.tsx`, and `src/components/application-evidence-form.test.tsx`.
- Validation: 61 AI task tests, 83 UI tests, and 128 SQLite database tests passed (272 total). Database suites included refinement, application actions, initial-generation actions, and candidate memory. `yarn typecheck`, `yarn lint`, and `git diff --check` passed. The initial combined test invocation lacked database configuration and failed during startup; explicit project runs with an isolated SQLite test URL succeeded. Two new test assertions were corrected before the final passing runs.
- Local data operations: the test harness created/migrated and reset only an isolated SQLite fixture. No application database, Docker data volume, or existing saved history was modified. Existing unrelated workspace changes were preserved.
- Deployment: source implementation only; the running Docker app was not rebuilt or restarted. Known limitations: no real-model request or manual browser walkthrough was performed; existing context-window limits and supported editor operations remain. Structural validation and concurrency checks can still reject invalid or stale edits.

## 2026-11-18 — Refine with AI rewrite plan (proposal only)

- Added `REFINE_CHAT_IMPLEMENTATION_PLAN.md` describing a single user-directed chat editing workflow that selectively reuses existing prompt helpers without duplication, removes evidence gates from chat, and preserves context, persistence, Undo, and concurrent-edit protection.
- Planned save-only supporting-information submissions, compatibility handling for older evidence-update jobs, and targeted task, database, and UI verification. Initial tailoring and regeneration remain outside the proposed chat rewrite.
- Affected files in this planning task: `REFINE_CHAT_IMPLEMENTATION_PLAN.md` and `CHANGELOG.md` only. Application source changes listed in the plan are proposed, not implemented.
- Validation: inspected current task, shared prompts, job execution/persistence, supporting-information submission, UI handling, and existing test cases; checked the documentation diff for whitespace errors. No application tests or live AI requests run because this task only creates the plan.
- Deployment: none. Known limitations: implementation and runtime validation remain pending; model compliance and legacy queued-job behavior require verification during implementation.

This log records changes made while working on this project, including implementation, tests, migrations, and local deployment or data operations. Update it with every future change. Record what changed, why, affected files, validation, and any remaining limitations. Record deployment separately from implementation; do not assume a source change is running in the app.

The initial history below was reconstructed on 2026-11-15 from this conversation and the current working tree. It covers the work recorded in this session, not the project's complete history. Exact timestamps for earlier steps are unavailable. These source changes are currently uncommitted.

## 2026-11-15 — Profile formatting carried into the base resume

### Behavior

- Kept the existing profile textareas.
- Added support for explicit `* ` bullet markers in experience, volunteering, and project descriptions.
- Preserved unmarked text as paragraphs and respected blank lines instead of automatically converting all description text into bullets.
- Supported `**bold**` within the rendered description text.
- Added profile field guidance and placeholders explaining the formatting markers.
- Kept the tailored resume's existing bullet representation working.
- Did not change AI prompts. Automatic AI insertion of formatting markers was discussed later but was not implemented.

### Files

- `src/app/(app)/profile/bullets-field.tsx` — field guidance for explicit formatting.
- `src/app/(app)/profile/experience-section.tsx` — experience description placeholder.
- `src/app/(app)/profile/projects-section.tsx` — project description placeholder.
- `src/lib/resume-content.ts` — parse descriptions into paragraph and bullet blocks for the base resume.
- `src/lib/resume-content.test.ts` — formatting and content conversion coverage.
- `src/components/documents/resume-document.tsx` — render structured description blocks while retaining tailored bullets.
- `src/components/documents/document.module.css` — description paragraph spacing.
- `src/components/documents/resume-document.test.tsx` — rendering coverage.
- `src/components/documents/__snapshots__/resume-document.test.tsx.snap` — updated document snapshots.

### Validation and deployment

- Earlier verification reported 135 targeted tests passing, plus browser and PDF visual checks.
- An initial app restart still used the old Docker image. Rebuilding the image and recreating the container corrected the deployment.

## 2026-11-15 — Requested local data reset and restart

- At the user's explicit request, stopped the local Docker app, removed the application data volume, and restarted the application with empty saved data.
- This was a one-time destructive reset. Subsequent deployments preserved the database and volume.
- Preserved `.env` configuration and credentials; no secrets are recorded here.

## 2026-11-15 — Adjustable page margins

### Behavior

- Added side-margin and top/bottom-margin sliders to theme customization.
- Both accept 0–30 mm in 0.5 mm increments, update the preview, and provide reset behavior.
- Saved explicit margins with custom themes and included them in theme files and full data backups.
- Missing or null margins continue using the theme's existing density defaults, preserving older themes and imports.
- Applied margins consistently to resume and cover letter rendering and PDF print styles, accounting for A4 and US Letter widths.
- Preserved explicit margin choices when using fit-to-one-page squeezing.

### Files

- `prisma/schema.prisma` and `prisma/sqlite/schema.prisma` — nullable `marginXmm` and `marginYmm` theme fields.
- `prisma/migrations/20261115120000_theme_margins/migration.sql` — PostgreSQL migration.
- `prisma/sqlite/migrations/20261115120000_theme_margins/migration.sql` — SQLite migration.
- `src/lib/themes.ts` — shared margin resolution, units conversion, and print styles.
- `src/lib/theme-data.ts` — load saved margin fields.
- `src/lib/theme-file.ts` — margin validation and import/export; theme file version increased from 3 to 4, retaining older-file support.
- `src/lib/data-export.ts` — backup margin fields; backup schema version increased from 11 to 12, retaining older-version support.
- `src/app/(app)/resume/theme-builder.tsx` — margin sliders and reset controls.
- `src/app/(app)/resume/resume-workspace.tsx` — supply the current paper size to customization.
- `src/components/documents/resume-document.tsx` and `src/components/documents/cover-letter-document.tsx` — resolve margins for the selected paper size.
- `src/lib/themes.test.ts`, `src/lib/theme-file.test.ts`, and `src/app/(app)/resume/theme-builder.test.tsx` — margin behavior, validation, and control coverage.
- `src/app/(app)/resume/actions.db.test.ts` and `src/lib/data-import.db.test.ts` — saved margins and backup round-trip coverage.
- `src/lib/backup-schedule.db.test.ts`, `src/lib/agent/searches.db.test.ts`, and `e2e/agent-searches.spec.ts` — update expected backup schema version to 12.

### Validation and deployment

- Earlier verification reported 226 tests passing across rendering, theme, database, backup, and agent checks; one PostgreSQL-specific test was skipped in that run.
- Type checking, lint, and production build passed.
- Browser checks covered keyboard use, minimum/maximum margins, reset, save/reload, and default/10 mm/0 mm PDF output.
- Saved a pre-migration SQLite backup inside the persistent volume at `/data/backups/pre-theme-margins-20261115.db`.
- Rebuilt and deployed the Docker app, applied the migration, and confirmed a healthy database.
- Data counts remained unchanged at deployment: 12 themes, 4 experience entries, 1 project, and 0 applications.

## 2026-11-15 — Independent scrolling in the resume editor

### Behavior

- Constrained the desktop resume workspace to the available viewport height.
- Kept its header visible while allowing the resume preview and theme/customization/section controls to scroll independently.
- Contained wheel scrolling at the boundaries of the two panels.
- Kept normal document scrolling when the workspace stacks below its existing 780 px container breakpoint.
- Preserved existing panel focus behavior.

### Files

- `src/app/(app)/resume/resume-workspace.tsx` — height constraints, flex sizing, panel overflow, and overscroll containment.
- `e2e/resume.spec.ts` — independent wheel scrolling, reachable controls, keyboard focus, and narrow/desktop resizing coverage.

### Validation and deployment

- 20 workspace tests passed.
- Browser run passed 6 tests, including setup and the 5 resume scenarios.
- Lint, type checking, and production build passed; Docker app rebuilt and deployed.
- A subsequent live-profile check revealed the outer-page overflow defect documented next. Initial scrolling checks did not catch it.

## 2026-11-15 — Fix blank space below the entire app

### Cause and fix

- On the live profile, Themes and Customize could extend the outer page below the visible app, scrolling the navigation and editor into blank space.
- Radix's absolutely positioned hidden radio inputs were positioned relative to an ancestor outside the controls panel. Their positions increased the outer document's scroll height.
- Added `position: relative` to the controls panel so those inputs stay within its scroll area.
- Strengthened browser regression coverage to assert the document has no excess scroll height and cannot scroll to a blank area, including after switching panels and resizing.

### Files

- `src/app/(app)/resume/resume-workspace.tsx` — positioned controls panel and explanatory comment.
- `e2e/resume.spec.ts` — document overflow regression assertions.

### Validation and deployment

- Confirmed the regression test failed against the old build with 603 px of unexpected outer-page overflow.
- After the fix: 20 workspace tests and all 6 browser tests passed; lint, production build/type checking, and `git diff --check` passed.
- Rebuilt the production Docker image and recreated the local app container using `compose.local.yml`, preserving the existing data volume.
- Confirmed `/api/health` returned healthy app and database status.
- Verified the deployed app with the real profile at 1400 × 900: Themes, Customize, and Sections each had a document height of 900 px and no outer scrolling, including an explicit scroll-to-bottom attempt.
- Data counts remained 12 themes, 4 experience entries, 1 project, and 0 applications.
- Temporary PostgreSQL test container and temporary browser authentication state were removed after verification.
- Safari and Firefox were not tested.

## 2026-11-15 — Discussions and inspection without implementation

- Discussed AI-added bullets, emphasis, and job-specific skill grouping during tailoring while keeping the profile/base resume faithful to the source. No AI prompt or tailoring behavior was changed.
- Reviewed shared themes across base and application resumes. No new theme was created.
- Discussed exposing paper-size selection under Customize and adding a pageless preview with a single tall PDF export. The user deferred this feature; no implementation changes were made.
- Located existing prompts:
  - `src/lib/ai/tasks/tailor-resume.ts` — resume-specific `INSTRUCTIONS` and prompt assembly.
  - `src/lib/ai/tasks/write-cover-letter.ts` — cover-letter-specific `INSTRUCTIONS` and prompt assembly.
  - `src/lib/ai/tasks/prompt-parts.ts` — shared prompt rules and cover letter approach.
- Prompt inspection was read-only. No AI prompts have been changed as part of the work logged here.

## 2026-11-15 — Establish ongoing change logging

- Added this root `CHANGELOG.md` with the available history, affected files, checks, deployment notes, and deferred work.
- Added root `AGENTS.md` directing future coding work to update this log with every change.
- Checked the current Git status/diff inventory when reconstructing the history and ran `git diff --check` after adding the documentation.
- Documentation only; no application behavior changed and no app rebuild or deployment was needed.

## 2026-11-14 — Initial OpenRouter routing and shared scoring credential

Historical correction added on 2026-11-15: the initial reconstruction omitted this earlier implementation. Git commit `b4c36e318e66918e62ed535ec84f4b9e86240913` records it as “Route AI tasks and Jev scoring through OpenRouter”. Unlike the later working-tree changes, this work is already committed.

### Behavior

- Fixed normal application AI configuration to OpenRouter and routed generation models by the actual request task.
- Assigned extraction, matching, reply classification, and email/reply drafting to `openai/gpt-6-luna`; assigned resume tailoring, cover letter generation, chat refinement, and section rewrites to `anthropic/claude-sonnet-5.5`.
- Applied a fixed medium reasoning policy to OpenRouter requests and updated explicit effort options on affected tasks.
- Routed Jev scoring through OpenRouter using the shared AI credential, with scoring configuration fixed to Jev.
- Updated settings and onboarding for the fixed connection, credentials, task assignments, and scoring setup; updated related UI text, environment examples, local Compose files, and development notes.
- Retained legacy provider adapters and factory branches internally. Current `resolveAiConfig()` always selects the OpenRouter route, represented by the existing `OPENAI` provider enum.
- This commit does not modify the resume-tailoring or cover-letter task files. The earlier log's statements about unchanged prompts apply to the subsequent resume-formatting/margin/scroll work; they were not a complete audit of all initial AI integration changes.

### Files recorded in the commit

- `.env.example`
- `DEVELOPMENT.md`
- `compose.local.before-openrouter.yml`
- `compose.local.yml`
- `src/app/(app)/agent/actions.db.test.ts`
- `src/app/(app)/jobs/actions.db.test.ts`
- `src/app/(app)/settings/actions.db.test.ts`
- `src/app/(app)/settings/actions.ts`
- `src/app/(app)/settings/agent-section.test.tsx`
- `src/app/(app)/settings/agent-section.tsx`
- `src/app/(app)/settings/ai-provider-section.test.tsx`
- `src/app/(app)/settings/ai-provider-section.tsx`
- `src/app/(app)/settings/scoring-section.test.tsx`
- `src/app/(app)/settings/scoring-section.tsx`
- `src/app/(app)/settings/settings-screen.test.tsx`
- `src/app/(app)/settings/settings-screen.tsx`
- `src/app/(app)/startups/startups-screen.tsx`
- `src/app/(setup)/welcome/actions.db.test.ts`
- `src/app/(setup)/welcome/actions.ts`
- `src/app/(setup)/welcome/page.tsx`
- `src/app/(setup)/welcome/scoring-step.tsx`
- `src/app/api/profile/import/route.ts`
- `src/lib/agent/run.db.test.ts`
- `src/lib/agent/view.db.test.ts`
- `src/lib/ai/assignments.ts`
- `src/lib/ai/config.test.ts`
- `src/lib/ai/config.ts`
- `src/lib/ai/index.ts`
- `src/lib/ai/openrouter-routing.test.ts`
- `src/lib/ai/provider.ts`
- `src/lib/ai/providers/openai-compatible.ts`
- `src/lib/ai/providers/openrouter.ts`
- `src/lib/ai/tasks/classify-reply.ts`
- `src/lib/ai/tasks/extract-posting.ts`
- `src/lib/ai/tasks/extract-profile.test.ts`
- `src/lib/ai/tasks/extract-profile.ts`
- `src/lib/ai/tasks/match-requirements.ts`
- `src/lib/ai/tasks/score-posting.test.ts`
- `src/lib/ai/tasks/score-posting.ts`
- `src/lib/ai/tasks/tasks.test.ts`
- `src/lib/google/google.db.test.ts`
- `src/lib/jobs/score-posting.db.test.ts`
- `src/lib/scoring/config.test.ts`
- `src/lib/scoring/config.ts`
- `src/lib/scoring/index.test.ts`
- `src/lib/scoring/index.ts`
- `src/lib/scoring/jev.test.ts`
- `src/lib/scoring/jev.ts`
- `src/lib/scoring/scorers.ts`
- `src/lib/scoring/typesafe.test.ts`
- `src/lib/scoring/typesafe.ts`

### Verification and limitations

- Confirmed the commit and inspected current configuration, provider factory, task assignments, OpenRouter adapter, shared transport imports, and scoring configuration during this review.
- The commit includes updated tests, but those tests were not rerun during this read-only routing review. Historical deployment/testing details for that initial task were not reconstructed.

## 2026-11-15 — Review remaining provider adapters

- Confirmed `src/lib/ai/providers/openrouter.ts` extends `openai-compatible.ts`, which uses `guarded-fetch.ts` and `servers.ts`; these remain active dependencies.
- Confirmed direct Anthropic, Mistral, local/Ollama, and LM Studio adapters remain available through factory branches, while current application configuration always selects OpenRouter.
- Updated only this change log to restore the missing initial AI implementation history. No provider, prompt, or runtime behavior was changed, and no deployment was needed.
- Validation: inspected source imports and Git commit history; `git diff --check` passed. No live AI calls or tests were run for this review.

## 2026-11-15 — Retained legacy AI provider files

The following direct-provider adapters are legacy relative to the app's current fixed OpenRouter configuration. They have **not been removed** from `src/lib/ai/providers`:

- `anthropic.ts` — direct Anthropic adapter.
- `mistral.ts` — direct Mistral adapter.
- `local.ts` — local-provider adapter and server selection.
- `ollama.ts` — Ollama adapter used by the legacy local route.
- `lmstudio.ts` — direct LM Studio adapter.

Their supporting factory branches and tests also remain. “Legacy” here means outside the current normal application route, not proven broken or safe to delete without reviewing dependencies.

`openrouter.ts`, `openai-compatible.ts`, `guarded-fetch.ts`, and `servers.ts` remain active dependencies and are not included in this legacy designation. The mock provider remains test infrastructure.

- Changed only `CHANGELOG.md` to make the retained legacy status explicit at the user's request.
- Validation: `git diff --check` passed. No runtime changes, tests, or deployment were needed.

## 2026-11-15 — Review user-edited tailoring skills instruction

- Observed the user's edit to the skills instruction in `src/lib/ai/tasks/tailor-resume.ts`: replaced the exact-name instruction with wording asking for job-suited skill phrasing and related skill grouping. This is a user-made prompt change after the earlier unchanged-prompt entries; those entries describe the work at their respective points in time.
- Reviewed the prompt, answer schema, `resumeUnits()`, `sameName()`, existing skills tests, and `src/lib/skill-groups.ts`.
- Found that output processing still matches generated names to profile skill names (ignoring case and surrounding whitespace), drops unmatched names, and renders the original profile names and groups. The user-edited prompt alone therefore does not enable skill rewording, additional evidence-backed skills, or AI-defined group labels.
- Recommended distinguishing equivalent terminology and profile-supported transferable skills from unsupported claims, and updating output processing alongside any future prompt implementation.
- Updated only this log during the review; did not edit or revert the user's prompt. No tests or live AI calls were run; `git diff --check` passed.

## 2026-11-15 — Review whole-resume job-description tailoring

- Confirmed current tailoring rewrites the summary, experience and project bullets, selects existing skills, and shortens education notes. Certifications, publications, custom sections, and identity/history fields remain profile-derived.
- Confirmed the generation message uses extracted job details and requirement matches, rather than the original posting text; the original posting currently also goes into the strict-mode fact guard's combined sources.
- Identified improvements for future implementation: explicit supported job terminology across editable sections, original-posting context local to the tailoring task, candidate-only evidence for personal claims, and evidence-backed skill rewording/additions.
- Found another downstream dependency relevant to the earlier approximate five-file skills proposal: `src/lib/resume-fit.ts` reconstructs scored skills by matching original profile names, so newly worded/generated skills also need compatible score-input handling and regression tests. The earlier file estimate was preliminary, not a complete implementation scope.
- No tailoring implementation or shared prompt changes made. This entry documents source inspection only; no live generations or tests were run.

## 2026-11-15 — Comprehensive tailoring compatibility audit

### Scope and outcome

Reviewed the proposed whole-resume job-description wording and evidence-supported skills changes against extraction/matching, both document-generation jobs, provider validation/routing, connector writes, profile section restoration/update, refinement and regeneration, score input, change summaries, stored units, versioning, frozen copies, and document/PDF rendering. This was a compatibility review, not implementation of the proposed feature. Current tests pass; that does not establish that a future implementation cannot break.

### Findings to address during implementation

1. **Initial generation and existing callers:** `src/lib/ai/tasks/tailor-resume.ts` currently filters skill strings against profile names and restores profile grouping. Add a richer AI response and evidence validation without changing the legacy `resumeUnits()` contract used by `src/lib/connector/write.ts` and `profileUnits()`. Section restoration and `src/lib/profile-update.ts` must continue to work without AI evidence objects. Keep saved output as ordinary units with stable IDs and text.
2. **Job context:** both `src/lib/jobs/write-documents.ts` and `src/lib/jobs/write-document.ts` already supply the original posting. Include bounded, untrusted posting context locally in the resume task. Preserve extracted corrections as authoritative for corrected job fields, language selection, cancellation, hidden-section handling, privacy filtering, and existing manual skill-order preferences. No changes to shared `prompt-parts.ts` are required for this.
3. **Evidence validation:** references must resolve to candidate-provided sources, not the JD, match notes, or generated text. Derive task-local source references from the existing privacy-filtered profile/facts representation rather than sending the raw profile. Check evidence ownership for role-specific claims, normalize and deduplicate accepted skill names, and reject malformed entries without discarding other valid skills. A real source reference does not prove semantic entailment; no claim of guaranteed factual accuracy is justified.
4. **Fact guards:** `src/lib/ai/fact-guard.ts` skips skills in `guardUnits()` and combines profile/posting sources. `refine-chat.ts` also calls `unverifiedFacts()` directly. A resume-only candidate-evidence policy must cover both paths without changing the rules for cover letter recipients, greetings, application emails, or other shared callers. Existing guards flag selected names/numbers/credentials; they are not general factual verification.
5. **Subsequent AI edits:** `src/lib/ai/tasks/refine-chat.ts` and `regenerate-unit.ts` have independent prompts and validation. Resume branches need the same job-wording/evidence policy as initial generation, including skills grouping format. Preserve other document kinds, unchanged units, optimistic concurrency, Undo, and version history. Bump affected prompt versions.
6. **Scoring:** `src/lib/resume-fit.ts` drops skills not matching original profile names. Preserve the skills actually written in the tailored document when building scorer input, using temporary in-memory representations without changing the saved profile. Cover matching of retained source-skill links and inferred skills in tests. `src/lib/jobs/score-resume.ts` currently loads the live profile even when an application has a frozen copy; this is a pre-existing consistency limitation to keep visible, not something the proposed prompt alone fixes.
7. **Change explanation:** `src/lib/ai/tailoring-summary.ts` treats renamed skills as omitted and can misdescribe their ordering. Update messages conservatively to describe selection/rewording without claiming the job makes every omitted skill irrelevant. Its existing “Nothing invented” footnote also overstates the assurance provided by heuristic checks.
8. **Requirement matching:** `src/lib/ai/tasks/match-requirements.ts` sends skill/language/certification lists, not experience/project descriptions, to its matching model. Its gap results are not a complete assessment of transferable experience. Do not treat such a gap as proof that a capability is absent, or silently mark it covered because generation added a phrase. Improving pre-generation matching itself is an additional scope item; wording in the generated summary should not claim these narrow gaps establish the candidate lacks the capability.
9. **Storage and rendering:** `unitSchema`, document history, and backups already store text units. `resumeContent()` and `ResumeDocument` render tailored skills text directly, including existing `Group: Skill · Skill` lines. No database migration, theme change, or PDF renderer change is expected if this text format and existing IDs are retained. Validate generated labels/names so embedded separators or newlines do not corrupt grouping/parsing. Evidence retained only during generation would not be available for later audits; persisting it would require a separate compatibility design.
10. **Regression cases:** cover supported synonyms, experience-derived skills, unsupported tool substitutions, made-up metrics/credentials, evidence taken only from the JD, absent/invalid references, repeated/empty skills, manual skill ordering and grouping, long/non-English/instruction-bearing postings, corrected job fields, omitted/hidden sections, saved/frozen older documents, section restoration, connector writes, edit/rewrite/Undo, score input, preview, and PDF output. Exercise the richer response through provider structured-output validation and JSON fallback, not only mocked task answers.

### Expected implementation touch points

- Runtime: `src/lib/ai/tasks/tailor-resume.ts`, `src/lib/ai/tasks/refine-chat.ts`, `src/lib/ai/tasks/regenerate-unit.ts`, `src/lib/ai/fact-guard.ts`, `src/lib/resume-fit.ts`, and `src/lib/ai/tailoring-summary.ts`.
- Tests: corresponding task/guard/score-input/summary tests, plus affected generation/edit/connector integration tests. A small resume-specific evidence helper may be appropriate if the same validation is needed by generation and editing; choose after defining the response contract, not in advance.
- Log: this file. Shared prompt helpers, provider routing, schemas/migrations, and renderers should remain unchanged unless implementation reveals a concrete need. The earlier five-file skills-only estimate does not cover this larger whole-resume consistency scope.

### Validation actually performed

- Node baseline: **156 tests passed across 11 files** covering AI tasks, fact guards, tailoring summaries, score input, skill groups, resume content, OpenRouter routing, structured output, document generation, frozen-copy handling, and section behavior (as matched by the selected test filters).
- DOM baseline: **164 tests passed across 2 files** covering resume rendering and application view behavior.
- SQLite integration baseline: **21 tests passed across 5 files** covering missing-document generation, refinement, regeneration, resume scoring, and connector writes. Used an isolated SQLite fixture for the tailoring audit; did not reset or mutate the running app database.
- Total: **341 passing tests**. `yarn typecheck` passed. `git diff --check` passed after documenting the audit.
- Did not run live paid AI requests, browser/PDF end-to-end exports, production build/deployment, or tests of the unimplemented new behavior during this audit. Only this change log was edited; the user's prompt edit was preserved.

## 2026-11-15 — User-requested local login password reset

- Replaced the local `.env` login password hash using the existing Argon2id helper, at the user’s explicit request. No password or hash is recorded here.
- Verified the replacement hash against the requested password before saving.
- Recreated the local Compose app container to load the new credential, preserving the existing data volume.
- Validation: password hash verification and application health check; no source changes or rebuild required.

## 2026-11-15 — Implement JD-specific resume tailoring and application-only evidence

### Behavior and boundaries

- Updated resume generation, refinement, and section rewrite prompts to use accurate JD terminology and candidate-supported transferable skills. Tailored skills may be regrouped and reordered regardless of profile ordering. Prompt versions: tailor-resume@10, refine-chat@10, regenerate-unit@7. Shared prompt-parts.ts and provider routing were not edited.
- Added structured skill names/groups with candidate-source references and quotes, validated against the privacy-filtered profile and application facts. Original-name string responses remain compatible; the existing connector/profile restoration conversion contract is unchanged. Unsupported references, duplicate skill names, and grouping delimiter injection are rejected individually.
- Included bounded original-posting context locally in resume tasks. Resume factual warnings use candidate sources rather than job requirements. Source references and heuristic warnings reduce unsupported claims but do not guarantee semantic accuracy.
- Replaced both JD-screen profile-writing actions with Add for this application, available on every skill requirement, including partially covered and covered requirements. Profile matching remains explicitly distinct from what the tailored resume demonstrates.
- Added one shared inline evidence form, with a required example and optional existing role/project context. New-application drafts preserve evidence across reloads and clear it when a different posting is read. Initial generation receives the evidence and application creation saves it as application facts.
- Existing applications save evidence only to their own facts and queue the existing refinement job in a resume-only mode. Only visible existing skills/summary/selected role or project can change. The submitted example is identified explicitly when several examples concern the same skill. Existing skills are preserved if an additive update omits them. No role is invented or automatically assigned without selected context.
- Evidence may inform later explicitly requested cover letter/email generation, per user preference. The automatic update cannot modify those documents, their tone, the global profile/base resume, or other applications. No database migration, new dependency, new resume-tailoring.ts file, theme change, or PDF renderer change was introduced.
- Added stable submission/job identifiers, duplicate-job protection, retained-evidence failure handling, and retry behavior. Existing concurrency checks, versions, and Undo remain. Undo restores document text while leaving evidence saved; changed/removed evidence during generation prevents applying the result. Applications without a resume retain evidence for later creation.
- Scoring now includes skills actually present in the tailored resume, uses its frozen profile where applicable, clears old scores when resume units change, and rejects results calculated while the document changed. Tailoring summaries no longer mislabel reworded skills as dropped or promise that heuristic checking proves nothing was invented.

### Files edited or added for this feature

- `e2e/fake-ai.mts`
- `e2e/new-application.spec.ts`
- `e2e/support.ts`
- `src/app/(app)/applications/[id]/actions.db.test.ts`
- `src/app/(app)/applications/[id]/actions.ts`
- `src/app/(app)/applications/[id]/application-view.test.tsx`
- `src/app/(app)/applications/[id]/application-view.tsx`
- `src/app/(app)/applications/[id]/posting-tab.tsx`
- `src/app/(app)/new/actions.db.test.ts`
- `src/app/(app)/new/actions.ts`
- `src/app/(app)/new/match-card.tsx`
- `src/app/(app)/new/new-application.test.tsx`
- `src/app/(app)/new/new-application.tsx`
- `src/app/(app)/new/page.tsx`
- `src/components/match-rows.tsx`
- `src/lib/ai/fact-guard.ts`
- `src/lib/ai/tailoring-summary.test.ts`
- `src/lib/ai/tailoring-summary.ts`
- `src/lib/ai/tasks/refine-chat.ts`
- `src/lib/ai/tasks/regenerate-unit.ts`
- `src/lib/ai/tasks/tailor-resume.ts`
- `src/lib/ai/tasks/tasks.test.ts`
- `src/lib/application-create.ts`
- `src/lib/application-data.ts`
- `src/lib/document-units.db.test.ts`
- `src/lib/document-units.ts`
- `src/lib/jobs/refine.db.test.ts`
- `src/lib/jobs/refine.ts`
- `src/lib/jobs/runner.db.test.ts`
- `src/lib/jobs/runner.ts`
- `src/lib/jobs/score-resume.db.test.ts`
- `src/lib/jobs/score-resume.ts`
- `src/lib/jobs/write-document.ts`
- `src/lib/jobs/write-documents.test.ts`
- `src/lib/jobs/write-documents.ts`
- `src/lib/resume-fit.test.ts`
- `src/lib/resume-fit.ts`
- `src/components/application-evidence-form.tsx`
- `src/components/application-evidence-form.test.tsx`
- `e2e/openrouter-preload.cjs`
- `CHANGELOG.md` — this implementation record.

### Verification and local operations

- Used isolated SQLite and PostgreSQL test databases; the running app database has not been reset.
- Updated browser-test transport in test-only code to redirect the fixed OpenRouter URL to the fake AI server. Browser tests make no paid model calls. Updated the fake AI to exercise evidence-backed grouped skills and focused automatic updates.
- Corrected an existing note timestamp test to accept create/update operations within the same millisecond on SQLite; no note behavior changed.
- Validation/deployment results are recorded below when final checks finish.

### Final verification before deployment

- Node/AI/compatibility checks: 248 passed; 24 live-provider tests were intentionally skipped.
- UI/rendering checks: 194 passed across the evidence form, new-application flow, existing application view, and resume rendering.
- SQLite integration: 118 passed; one PostgreSQL concurrency test skipped on SQLite.
- PostgreSQL integration: 108 passed, including concurrency and duplicate-submission/job handling.
- Chromium: all 17 selected browser tests passed, including initial evidence generation, reload, a second example for the same skill, automatic updating, PDF text extraction, Undo, unchanged cover letter/global profile/other applications, existing facts/refinement behavior, and resume scrolling/PDF regressions.
- Production build/type checking, lint of changed TypeScript/test files, and diff whitespace checks passed.
- Saved the live SQLite backup at `/data/backups/pre-resume-evidence-1794719743466.db` before deployment. Live counts at backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 2.
- Real paid AI calls and Safari/Firefox were not tested. Evidence references validate source presence/quotes, not the semantic truth of every generated skill. Existing saved resumes are not automatically regenerated by deployment.

### Deployment and live smoke check

- Built and deployed the local OpenRouter image using `docker compose -f compose.local.yml up -d --force-recreate`; retained the existing data volume and `.env`. Deployed image config: `879e59ea5ba7ceec469a7d47759cf44bd7e7c3370b43c2ce3a09f52bff247c57`. No schema migration was needed for this feature.
- Health returned app/database OK. Post-deployment counts matched the backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 2.
- Read-only Chromium smoke check on the deployed app: new application screen loaded; the existing application's Job posting tab exposed 8 application-only evidence actions; the supporting-experience form and save control opened successfully and were cancelled without saving. The base resume rendered with zero outer-page overflow at 1400 × 900.
- Removed temporary browser authentication state and closed the smoke browser. Removed the temporary PostgreSQL test container after testing. No paid AI request was made against the user's live configuration.

## 2026-11-15 — User-directed content editing in Refine with AI

- Ordinary chat refinement now treats explicit user requests and supplied content as authorized for the current application's resume, cover letter and email, without requiring a profile update or tailoring skill evidence. Shared prompts and automatic tailoring rules were not edited.
- Existing certifications, publications and custom-section text can be refined; empty replacements clear existing text units. Explicit language/style requests override defaults. A requested sign-off is retained when changing letter tone.
- Automatic application-evidence updates retain structured skills validation, additive skills handling and restricted document/unit targeting. Existing source warnings remain informational. Valid unit checks, privacy filtering, concurrent-edit protection, application isolation, versions and Undo remain in place.
- Changed files: `src/lib/ai/tasks/refine-chat.ts`, `src/lib/ai/tasks/tasks.test.ts`, `src/lib/jobs/refine.db.test.ts`, `e2e/fake-ai.mts`, `e2e/refine.spec.ts`, and this log. Prompt version is `refine-chat@11`; no schema/API changes or new dependencies.
- Validation: 59 task tests passed; SQLite integration 14 passed with one PostgreSQL-only skip; PostgreSQL integration 15 passed, including concurrency. Chromium 10 passed, including requested profile-absent content, reload/Undo and the application-evidence flow with PDF/Undo/isolation checks. Production build, typecheck, changed-file lint and diff whitespace checks passed.
- Before deployment, backed up live SQLite to `/data/backups/pre-free-refinement-1794722518619.db`. Counts: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1. The document count reflects the live state before this deployment; no documents were removed by this task.
- Deployment: rebuilt the local OpenRouter image and recreated the app container using `compose.local.yml`, retaining the data volume and `.env`. Image manifest: `d2d3efe315d784f1225545456c54832ecf9d46bfd15e13185fe005330d102f9f`. Live health returned app/database OK and the saved-data counts matched the pre-deployment counts. Removed the temporary PostgreSQL test container and its test volume.
- Limits: no paid live AI calls were tested. Refinement still operates on existing text units; adding/reordering sections, changing layout and private contact fields remain outside this change. Model responses may still fail or decline; failures are reported rather than presented as successful edits.

## 2026-11-15 — Remove Refine with AI suggested actions

- Removed the suggested-action buttons entirely from the resume, cover letter and email refinement panel, allowing the conversation to use the freed space. Kept the heading, subtitle, conversation, input, Send control, About target and Undo behavior.
- Removed suggestion props and server generation, and deleted the unused generator and its tests. Updated UI tests to send typed requests and verify suggestions are absent, including the email tab.
- Files: `src/app/(app)/applications/[id]/refine-panel.tsx`, `application-view.tsx`, `page.tsx`, `application-view.test.tsx` (all in that directory), deleted `src/lib/refine-suggestions.ts` and `src/lib/refine-suggestions.test.ts`, and this log. No AI prompts, database schema or dependencies changed.
- Validation: all 74 application-view DOM tests passed; all 6 refinement Chromium tests passed, including sending, reload and Undo. Type checking, production build, changed-file lint and diff whitespace checks passed. Search found no remaining generator imports/types or suggestion props. An email test's old suggestion click was replaced with a typed request, and its textbox lookup corrected after the first check exposed a test-local helper scope issue.
- Backed up live SQLite to `/data/backups/pre-remove-suggestions-1794723449765.db`. Counts before deployment: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1.
- Deployment: rebuilt the local OpenRouter image (manifest `9a17bb3f5d40ff9393a933fb4f22dd0dcbae69599b00920c9141c67527061971`) and recreated the container with the existing data volume and `.env`. Live app/database health was OK and counts matched the backup.
- Read-only deployed Chromium checks at 1400×900 and 390×844: the panel exposed only Send, input access worked, and the conversation retained an independently scrollable area. The narrow-width check also found overall page horizontal overflow (704px page width at 390px viewport, involving the surrounding main/resume canvas). No surrounding layout styles were changed for this removal; that separate layout issue was left outside this task.
- Closed the smoke browser and removed its temporary authentication file. No paid AI calls were performed; Safari/Firefox were not tested.
- Removed the temporary PostgreSQL browser-test container and its test volume after validation.

## 2026-11-15 — Scroll the refinement heading with the conversation

- Moved the Refine with AI heading and subtitle into the conversation's scrolling content, ahead of its messages. They scroll out of view in longer conversations and reappear at the beginning; short chats keep the heading at the top.
- Kept the composer outside the scroll area and retained reverse-column scrolling for newest messages, accessible panel naming, and keyboard-scrollable conversation.
- Files: `src/app/(app)/applications/[id]/refine-panel.tsx`, `src/app/(app)/applications/[id]/application-view.test.tsx`, and this log. Added a DOM assertion that the heading/subtitle belong to the conversation while the input and Send control do not.
- Validation so far: 75 application-view tests passed; changed-file lint and production build/type checking passed. No prompts, database schema or AI behavior changed. Deployment/browser scrolling verification is recorded below.
- Backed up SQLite before deployment to `/data/backups/pre-scroll-heading-1794723863822.db`; live counts: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1.
- Deployment: rebuilt the local OpenRouter image (manifest `500ea447b0dc04d55e0a7df59c33b6b19018f56191f34d1de984fbf2fefebc8b`) and recreated the app container, retaining the existing data volume and `.env`. Health returned app/database OK and saved counts matched the backup.
- Deployed Chromium checks at 1400×900 and 390×844 used temporary browser-only content to exercise long-conversation scrolling without saving messages or calling AI. The heading was hidden at the newest messages, visible at the conversation beginning, and hidden again on return; the input's position remained identical throughout each check. Temporary content was removed, the browser closed and its temporary authentication file deleted.
- Limits: Safari/Firefox and paid live AI were not tested. The previously recorded narrow-page horizontal overflow is outside this heading change.

## 2026-11-15 — Complete application-local document refinement

- Implementing the approved plan for content, structure and appearance edits to application resumes/cover letters, while keeping email plain text. No shared tailoring prompts or base-resume settings are changed.
- Added nullable local document state, version state and complete chat change records, with additive PostgreSQL/SQLite migrations `20261115180000_local_document_state`. Successful ordinary refinement snapshots each touched document independently; legacy documents keep inheriting until edited. Global profile facts/private notes are not copied into document state; existing photo data stays local and is never sent to AI.
- Added validated settings, typography/spacing, metadata, entry and text-unit operations, and safe inline bold/italic/underline/highlighting/web links for local documents. Local preview and PDF use the same saved settings, paper geometry and renderer. Existing base-resume snapshots remain unchanged.
- Extended transactional saving, formatting-only Undo, full version previews/restoration, manual section/theme/photo controls, backup format 13 (accepting older formats), regeneration/writing/scoring context and connector reads to understand local state. Shared theme records and other applications are not edited by refinement.
- Ordinary AI context redacts contacts/photos/references; explicitly requested private fields can be supplied in a bounded second pass. Added explicit intent marking for contact edits. Automatic application-evidence updates retain their original constrained behavior. Refinement prompt version: `refine-chat@12`.
- Early verification: Node/helper tests, DOM rendering tests, SQLite and PostgreSQL integration tests have passed in intermediate runs. A browser check exposed the OpenAI SDK's requirement that optional structured-output fields also be nullable; corrected the task schema and added a serializer regression assertion. Final checks and deployment are still pending; do not treat this entry as a deployment claim.

### Final implementation inventory

- `e2e/fake-ai.mts`
- `e2e/refine.spec.ts`
- `prisma/schema.prisma`
- `prisma/sqlite/schema.prisma`
- `prisma/migrations/20261115180000_local_document_state/migration.sql`
- `prisma/sqlite/migrations/20261115180000_local_document_state/migration.sql`
- `src/app/(app)/applications/[id]/actions.ts`
- `src/app/(app)/applications/[id]/actions.db.test.ts`
- `src/app/(app)/applications/[id]/application-view.tsx`
- `src/app/(app)/applications/[id]/application-view.test.tsx`
- `src/app/(app)/applications/[id]/page.tsx`
- `src/app/(app)/applications/[id]/refine-panel.tsx`
- `src/app/(app)/applications/[id]/version-history.tsx`
- `src/app/api/pdf/route.ts`
- `src/app/print/[doc]/[id]/page.tsx`
- `src/components/documents/document-page.tsx`
- `src/components/documents/resume-document.tsx`
- `src/components/documents/cover-letter-document.tsx`
- `src/components/documents/tailored-documents.tsx`
- `src/components/documents/tailored-documents.test.tsx`
- `src/components/document-text.tsx`
- `src/components/document-text.test.tsx`
- `src/lib/ai/tasks/refine-chat.ts`
- `src/lib/ai/tasks/tasks.test.ts`
- `src/lib/application-documents.ts`
- `src/lib/connector/tools.ts`
- `src/lib/data-export.ts`
- `src/lib/data-import.ts`
- `src/lib/data-import.db.test.ts`
- `src/lib/document-state.ts`
- `src/lib/document-state.test.ts`
- `src/lib/document-units.ts`
- `src/lib/document-versions.ts`
- `src/lib/frozen-copy.ts`
- `src/lib/frozen-copy.db.test.ts`
- `src/lib/google/send.ts`
- `src/lib/jobs/refine.ts`
- `src/lib/jobs/refine.db.test.ts`
- `src/lib/jobs/regenerate-unit.ts`
- `src/lib/jobs/score-resume.ts`
- `src/lib/jobs/write-document.ts`
- `src/lib/jobs/write-email.ts`
- `src/lib/letter-frame.ts`
- `src/lib/unit-text.ts`
- `src/lib/resume-content.ts`
- `src/lib/resume-fit.ts`
- `src/lib/resume-sections.ts`
- `src/lib/themes.ts`
- `src/test/document-state.ts`

### Validation and rollout

- Final Node/AI/helper selection: 307 passed; 24 paid live-provider cases skipped. UI/rendering: 178 passed, including unchanged base-resume snapshots. SQLite integration: 179 passed, with one PostgreSQL-only concurrency test skipped. PostgreSQL integration: 154 passed, including concurrency, local-state Undo, theme changes during refinement, frozen-copy independence, backup round trips and mocked Google sending.
- Chromium: all 16 selected scenarios passed across refinement, email, initial application evidence and version history. A final 7-case refinement rerun passed after the concurrent-theme guard. The new scenario verifies role metadata, a local awards section, inline marks, persisted typography/margins, US Letter PDF dimensions (612×792 points), text extraction, Undo/history restoration and unchanged global profile/themes/other documents.
- Production build/type checking, lint over changed/new TypeScript files and diff whitespace checks passed. No real paid AI request or external email was sent. Firefox/Safari were not tested.
- Captured live SQLite backup `/data/backups/pre-document-state-1794762160702.db`; preserved the previous image under a pre-document-state rollback tag. Live counts before deployment: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1. Docker deployment is pending the build below.
- Limits: existing registered fonts and layout structures only; no arbitrary HTML/CSS, new image uploads or HTML email. Snapshotting photos and full state can increase backup size. Legacy text-only history restores text without fabricating historical formatting. Undo refuses to overwrite subsequent document edits. Model interpretation is not guaranteed by fixture tests.
- Final compatibility additions: shared document saving synchronizes manually edited local text/skills for subsequent AI work while retaining omitted entries for Put back. Added regression coverage. Local resumes can set exact per-entry displayed date labels; explicit letter date changes update an existing date unit. Cover letters retain the existing single-column frame; resume-only layout fields are rejected rather than silently ignored.
- Final follow-up checks: 93 targeted Node tests and 4 local-rendering tests passed; production build/type checking passed. Targeted save/refinement/action database checks passed on SQLite (93 passed, one PostgreSQL-only skip). Final PostgreSQL and browser follow-up results are recorded after completion below.

### Completed deployment and smoke check

- Final follow-up PostgreSQL save/refinement/action tests: 94 passed. The final targeted Chromium full-state/PDF/Undo/history scenario and its setup both passed after the shared text synchronization change. Final targeted lint and diff checks passed.
- Deployed the final the local OpenRouter image image (manifest `488a42718b969ed222e87cdfb0f60e9b400bc3e3e0b7359d0848c1fce039a969`) with `docker compose -f compose.local.yml up -d --force-recreate`. The additive SQLite migration `20261115180000_local_document_state` completed successfully. Retained the existing data volume and `.env`.
- App/database health returned OK and the container is healthy. Post-deployment counts match the pre-deployment backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1. Existing live documents still have null local state; deployment did not rewrite them.
- Read-only deployed Chromium smoke check: existing resume and chat input loaded, new formatting guidance appeared, and PDF download returned HTTP 200 with a valid PDF content type and a non-empty body. No paid AI request was sent against the live configuration.
- Closed the smoke browser, deleted its temporary authentication state, and removed the temporary PostgreSQL test container and its test volume. The previous image remains available under a pre-document-state rollback tag and the pre-migration SQLite backup remains in `/data/backups`.

## 2026-11-16 — Navy Sidebar cover-letter format

- Implemented the approved reference layout with navy `#243B53`, existing Inter fonts, charcoal text, sidebar identity/role/contacts and a main letter column. Follows current paper/margins; writing prompts and paragraph counts remain unchanged.
- New letters receive a nullable initial-format tag; legacy null/missing tags remain Classic. Added PostgreSQL/SQLite migration `20261116090000_cover_letter_layout` without rewriting existing records. Local-state overrides use the existing snapshot/history/Undo mechanism.
- Added separate headline/contact frame units for new/explicitly converted Sidebar letters. Contact units remain private in ordinary AI context. Added an application-only format selector and refinement support, preserving Classic rendering and existing body text.
- Backup format 14 includes the initial-layout tag and continues accepting older backups. No new fonts, dependencies, shared theme rows or writing-prompt changes.

### Affected files

- Persistence: `prisma/schema.prisma`, `prisma/sqlite/schema.prisma`, and both `20261116090000_cover_letter_layout/migration.sql` files.
- Local format defaults/conversion: new `src/lib/cover-letter-format.ts`; `src/lib/letter-frame.ts`, `src/lib/document-state.ts`, `src/lib/application-documents.ts`, `src/lib/application-create.ts`, `src/lib/jobs/write-document.ts`.
- Preview/print/UI: `src/components/documents/cover-letter-document.tsx`, `document.module.css`, `tailored-documents.tsx`; `src/app/(app)/applications/[id]/{actions.ts,application-view.tsx,page.tsx,theme-menu.tsx}`; `src/app/print/[doc]/[id]/page.tsx`.
- Refinement compatibility/privacy: `src/lib/jobs/refine.ts`, `src/lib/ai/tasks/refine-chat.ts`. Refine task version advanced to 13; its operation guidance now describes the new format and contact/headline units. Cover-letter writing and shared prompt-parts files were not changed.
- Backup compatibility: `src/lib/data-export.ts`, `src/lib/data-import.ts` (format 14, reads older versions).
- Tests: new `src/lib/cover-letter-format.test.ts`, new `e2e/cover-letter-format.spec.ts`; existing cover-letter renderer, application-view, new-application/actions, application/actions, missing-document generation, connector writing, backup/import, AI task and refinement integration tests updated for the new default/operation version; `e2e/new-application.spec.ts` checks the default format/role/contacts/fonts.
- This log records implementation, validation and local rollout. No dependency or font additions, writing-prompt edits, profile/base-resume rewrites, or shared theme-row changes were needed.

### Validation

- Production build and type checking passed. Targeted lint and whitespace checks passed.
- Node/AI/helper selection: 244 passed, 24 paid live-provider cases skipped. UI selection: 89 passed; existing Classic letter snapshots were unchanged. Earlier renderer selection also included all 90 resume rendering checks, preserving their existing snapshots.
- SQLite and PostgreSQL integration: 158 passed on each, including new-letter creation, missing-letter generation, connector creation, explicit format selection, theme selection, full Undo, local-state refinement, frozen copies and backup compatibility. Final connector assertions separately passed (3 tests).
- Chromium production-build selection: 13 passed across new format, new application, refinement, PDF, Undo and history. Follow-up format selection: 3 passed, verifying history restoration and both A4/Letter with explicit margins. Initial follow-up test assertions were corrected to wait for async restore completion and convert millimetres into document units; the application required no fix for these checks.
- Visually inspected the Sidebar preview and first/continuation PDF pages. Long names/roles/emails wrap within the sidebar; all 12 long body paragraphs and sign-off survived PDF extraction; the sidebar does not repeat on continuation pages. Existing paper/margin settings are honored.
- No real paid AI requests or external emails sent. Safari/Firefox and real model interpretation were not tested. A long letter can span multiple pages; the template does not force content into one page or discard it.

### Local rollout

- Captured live SQLite backup `/data/backups/pre-letter-layout-1794778059368.db` and tagged the previous image for rollback. Live counts at backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 2. The live app gained a second document since the previous feature's rollout; this task did not create it.
- Deployed the local OpenRouter image manifest `a686b98bc595461f435541c90d2e0411ef034fd10242281469e802d3a53f6057` with `docker compose -f compose.local.yml up -d --force-recreate`. Additive migration `20261116090000_cover_letter_layout` completed. Retained the existing volume and environment. Existing letters remain Classic until explicitly switched.
- Live app/database health OK; container healthy. Counts match the backup. Compared saved document IDs, application IDs, kinds, text units, local state, themes, writer tags, trimmed parts and update timestamps against the backup: all unchanged. Initial-format tags remain null on existing rows.
- Read-only deployed Chromium smoke: existing resume loads; PDF response HTTP 200, valid content type, 46,058 bytes. The missing cover-letter tab loads without an inappropriate format selector. No live letter was generated and no paid AI call was made.
- Removed the temporary PostgreSQL test container/volume, closed the smoke browser and deleted its temporary authentication file. Retained the database backup and previous-image tag for rollback.

## 2026-11-16 — Application resume sidebar controls

- Implemented the approved two-view resume sidebar: Refine with AI and Resume controls, with right/left touch swipes and a visible keyboard-accessible switch. The controls view reuses the base resume’s Themes picker and Customize editor and displays the application’s existing Sections controls inline. Removed the resume preview’s theme and Sections dropdowns; other preview controls and the cover-letter dropdown remain available.
- Preserved unfinished AI messages and customization drafts while switching views or controls tabs. Ask AI opens the conversation and focuses its input. Viewing a historical resume hides theme/section editing until returning to the current resume. Other application tabs and missing resumes retain AI-only navigation.
- Customization previews locally; Save theme always creates a new library theme and applies it to this application’s resume and cover letter. Global base settings, existing shared themes, other applications, and document text are preserved. Theme creation, document references, local states, and frozen copies now update in one transaction; the shared document updater accepts an existing transaction for this operation. Failed saves keep the editor draft.
- Touch navigation requires 60px of predominantly horizontal travel, preserves vertical scrolling, and ignores inputs, links/buttons, sliders, and section editing/dragging. No gesture animations or new dependencies were added. Desktop trackpad navigation remains outside this change.
- Affected files: `src/app/(app)/applications/[id]/{application-view.tsx,application-view.test.tsx,resume-sidebar.tsx,refine-panel.tsx,sections-menu.tsx,actions.ts,actions.db.test.ts}`, `src/lib/document-units.ts`, and this changelog. Existing unrelated working-tree changes were preserved.
- Validation: production build, TypeScript checking, targeted ESLint, and whitespace checks passed. Focused DOM tests: 100 passed across application view and base resume workspace, including new checks for draft preservation, Ask AI focus, failed-save retry, section removal, swipes, and historical-version editing restrictions. SQLite action/document-updater integration tests: 82 passed, 1 existing skipped; new save-copy checks verify application document state, unchanged base/shared themes/other applications/text, invalid fields, and missing applications.
- Isolated Chromium production-browser checks with demo data verified custom theme saving and selection after reload, persisted section removal, AI draft preservation, arrow-key tab navigation, independent desktop scrolling (sidebar scroll 500px, window scroll 0), and touch swipes in both directions with reduced motion at a 390px viewport. Visually inspected desktop and narrow screenshots. Resume PDF export returned HTTP 200; PDF text extraction confirmed the removed Skills section was absent, and PDF drawing operators contained the saved Green accent (`#2d6a4f`).
- Validation used separate temporary SQLite databases and a local server on port 3210; no live application records or paid AI requests were involved. No deployment or new migration. Phone-width checks require collapsing the existing global navigation; the existing application header can still overflow horizontally at 390px. That header layout, physical-device/Safari/Firefox checks, and PostgreSQL validation were not part of this change.

## 2026-11-16 — Restart with application resume sidebar changes

- At the user’s request, rebuilt the production Docker image the local OpenRouter image from the current workspace and recreated the local app container using `docker compose -f compose.local.yml up -d --force-recreate`, so the implemented resume sidebar controls are available locally.
- Retained the existing data volume and Compose environment. Preserved the previous image as a pre-sidebar rollback tag. New running image ID: `sha256:3338d26cbb46abfd70df205451ba84dc9ad1a1ac401e9c26b126cb0a3eab2e53`.
- Validation: Docker production build succeeded; startup reported no pending migrations; `http://localhost:3000/api/health` returned `status: ok` and `db: ok`. No new schema migration or application data editing was performed. This operation changed the local deployment and this changelog; no additional source changes were needed.

## 2026-11-16 — Space below the resume sidebar switch

- Added 16px of bottom margin beneath the Refine with AI / Resume controls switch, separating the navigation from the content below while retaining the content’s existing padding. Applies to both sidebar views.
- Affected files: `src/app/(app)/applications/[id]/resume-sidebar.tsx` and this changelog.
- Validation: targeted ESLint and whitespace checks passed; Docker production build including TypeScript checking passed. Rebuilt the local OpenRouter image and recreated the local application container with the existing volume/environment. Health endpoint returned `status: ok` and `db: ok` after restart.
- No new tests or browser visual inspection for this spacing-only adjustment; no data or schema changes.

## 2026-11-16 — Publish the current application source to GitHub

- At the user’s request, prepared the current application source snapshot for commit and push to `origin/main` at `git@github.com:chaprep/job-finder.git`, including the existing resume/document improvements, migrations, tests, sidebar controls, and spacing adjustment recorded above.
- Affected files: current changes under `src/`, `e2e/`, and `prisma/`, plus the root `AGENTS.md` and this changelog. Local environment files, application data, generated clients, build outputs, and browser authentication files remain excluded.
- Validation: fetched origin and confirmed local HEAD matched `origin/main` before committing; checked changed/untracked source files for common credential patterns with no matches. The latest Docker production build and local health checks passed in the preceding task; this publication task does not rerun the full test suite or change the running deployment. Push completion is verified and reported separately in the task result.

## 2026-11-18 — Audit automatic reusable candidate memory

- Completed a source audit before implementing automatic capture and reuse of candidate information across applications. Added `AUTOMATIC_MEMORY_AUDIT.md` covering database/source relationships, capture boundaries, role/project attribution, matching, AI context and validators, local/frozen documents, candidate versus resume scoring, agent/connector consumers, retries/concurrency, correction/forgetting, backfill, retention, export/import, deletion, privacy and the implementation verification plan.
- Confirmed that application facts currently include local instructions and cascade on application deletion; local document snapshots intentionally omit profile facts; requirement matching ignores free-text facts; manual edits do not always leave an attributable version. These require explicit integration rather than globally sharing existing fact text.
- Proposed extending the facts domain with durable source/capture records and shared candidate AI context. Exact schema and product semantics remain proposals; no feature, database migration, source behavior, live data operation or deployment was implemented.
- Affected files: `AUTOMATIC_MEMORY_AUDIT.md` and this changelog. Preserved the pre-existing change in `src/lib/ai/tasks/write-cover-letter.ts`.
- Validation: targeted Node baseline passed, 101 tests across 7 files (AI tasks, fact guard, profile update, resume fit, initial writing/reading jobs and Jev); documentation whitespace check passed. No full suite/build, database/browser validation, live database inspection or paid AI calls. Existing passing tests do not validate the proposed feature.

## 2026-11-18 — Plan automatic candidate memory implementation

- Added `AUTOMATIC_MEMORY_IMPLEMENTATION_PLAN.md`, turning the audit into a proposed implementation contract: separate memory/source/evidence/state models, automatic submission capture, extraction and correction rules, shared context and bounded semantic selection, evidence-aware matching, all AI consumers, management controls, historical backfill, data compatibility, eight work packages, verification gates and rollout/rollback steps.
- Specified defaults for submitted draft information, detached role attribution, application deletion versus forgetting, pending-source dependencies, historical corrections and replay suppression. Existing application facts retain their current semantics; database additions and behavior changes remain planned only.
- Affected files: `AUTOMATIC_MEMORY_IMPLEMENTATION_PLAN.md` and this changelog. Existing audit documentation and the unrelated cover-letter source edit were preserved.
- Validation: reviewed plan against the audit and current entry points/task assignments; documentation whitespace checks passed. No new tests, feature code, schema changes, migrations, saved-data operations, paid requests or deployment. The audit's earlier 101-test baseline was not rerun and does not validate this proposal.


## 2026-11-18 — Implement automatic reusable candidate memory

### Implemented

- Added independent `MemorySource`, `MemoryFact`, `MemoryEvidence` and `MemoryState` models, global role/project attribution with detached snapshots, monotonic context/source revisions, source identities and replay suppression. Added paired additive PostgreSQL/SQLite migration `20261118120000_candidate_memory`; existing `Fact` semantics and application-local rendering state remain intact.
- Automatically capture submitted application chat (including no-document and unavailable-AI paths), supporting evidence, application-fact revisions, submitted new-application notes/evidence and accepted direct text edits. Store sources transactionally and process outside document transactions. Failed rewrites retain input; no save-for-future option was added. Generated documents, private notes, employer messages and known model-generated notes are excluded as candidate sources.
- Added Luna extraction and semantic-selection tasks, usage categories, durable retries/restart recovery, ten-source historical batches, visible processing/clarification states and an operational pause control. Concurrent requests wait for already running capture rather than immediately failing; no queue slot waits on a queued prerequisite.
- Added quote/reference/privacy checks, conservative capability labels, exact deduplication, multiple-source support, explicit corrections, conflict withholding, source withdrawal, forgetting with excerpt scrubbing and keyed replay suppression. PostgreSQL JSONB context is compared after schema normalization to avoid false new revisions. Historical backfill does not resurrect known forgotten sources.
- Added an AI-only context builder with current global facts, relevant remembered evidence and stable source IDs. Wired initial matching/writing, local/frozen refinement, regeneration, missing-document generation, emails/replies, candidate scoring, agent, startups and connector context/writes. Memory revision guards reject publication after a concurrent correction/forget. Resume scoring continues to exclude unwritten facts.
- Added cited memory-supported requirement matches without inventing global skills, years, language proficiency or certifications, plus explicit stale-match refresh and candidate-score staleness notices. Legacy connector skill strings remain compatible; optional cited remembered skills are validated through the existing skill-evidence path.
- Added profile memory inspection, sources, correction/work-context selection, forget, clarification, retry, pause/resume, pagination and historical progress using existing UI styles. Application deletion retains memory with detached source pointers; deletion copy explains the distinction. Profile replacement detaches attribution instead of transferring it to newly created roles.
- Added export format 15 with older-format defaults, relationship/ownership/cycle validation before replacement, transactional memory restoration, full-deletion cleanup, privacy/development documentation and explicit dual-client generation regardless of the local database URL. Updated test fixtures for new tasks/export versions and corrected a pre-existing stale PDF query expectation without changing PDF production behavior.

### Affected areas

- New domain: `src/lib/memory/{schema,store,process,context,selection,import,actions}.ts`, memory/selection tests, `src/lib/ai/tasks/extract-memory.ts`, `src/lib/jobs/capture-memory.ts`.
- Persistence/tooling: canonical and derived Prisma schemas, both migration trees, `package.json`, startup/job registration, data export/import and settings deletion.
- Capture and consumers: application/new/profile actions and controls; application creation/fact/profile-import helpers; AI matching/prompt/evidence helpers; read/write/refine/regenerate/email/reply/scoring jobs; posting score/state, agent, startup and connector modules.
- UI/tests/docs: memory panel/status components and tests, profile facts/application posting/refinement/deletion views, fake AI, new `e2e/memory.spec.ts`, existing relevant fixtures, `PRIVACY.md`, `DEVELOPMENT.md`, implementation-plan execution record, `.gitignore` for local browser artifacts and this changelog. Existing audit history and the pre-existing `src/lib/ai/tasks/write-cover-letter.ts` edit were preserved.

### Validation and deployment

- Node and DOM suites: **1,637 passed**, 31 skipped across 201 files. SQLite integration suite: **659 passed**, 3 skipped across 67 files; subsequent memory concurrency/missing-document checks: **22 passed**. PostgreSQL integration suite: **662 passed**, 1 skipped across 67 files. Tests used isolated `_test` databases, not the running application database.
- Chromium production-browser selection: **12 passed**, including setup, automatic A-to-B reuse, correction/forgetting, new applications/evidence/PDF, refinement, manual editing, local document state, Undo and history restoration. Follow-up memory-only browser check is recorded below after final UI validation. Visually inspected the profile memory controls screenshot under ignored `output/playwright/`.
- Applied the new migration with the desktop SQLite runner to a populated pre-feature fixture: original application/fact preserved, foreign-key checks clean, pre-upgrade backup created. Regenerated both Prisma clients. Production build/type checking, changed-file ESLint and whitespace checks passed before final follow-ups recorded below.
- Source implementation only: no live migration, container replacement, deployment, real historical extraction, paid AI call or outgoing application/email. Existing container/data/environment were left untouched.
- Limits: extraction/relevance remain model interpretation; exact quotation checks do not prove truth. Old manual edits without attributable sources cannot be safely backfilled. Character budgets are conservative estimates; the existing 10 MB import limit remains. No paid-provider, Safari/Firefox or physical-device validation. PostgreSQL emitted existing client-query deprecation warnings; tests passed.

- Final follow-ups: work-context selection was added to correction controls so detached facts can be explicitly reassociated without moving claims silently. Stale management corrections are suppressed with a reload/retry response rather than leaving a permanently failing capture in the queue. Final focused memory lifecycle checks passed on PostgreSQL and SQLite (**21 tests on each**); correction UI tests passed (**3**); the latest memory-only Chromium run passed (**2 including setup**). Final production build/TypeScript, changed-file ESLint and whitespace checks passed. No deployment occurred.

## 2026-11-18 — Resume optimization implementation plan (proposal)

- Added `RESUME_OPTIMIZATION_IMPLEMENTATION_PLAN.md` covering Faithful/Balanced/Optimized, Optimized temperature 0.7, omission of generic truthfulness for Optimized, explicit historical-fact boundaries, transferable evidence matching, English-only future writing, settings/storage/import compatibility, rendering/history/PDF compatibility, implementation sequence, acceptance checks and rollout/rollback.
- Inspected writing tasks, shared prompts, provider temperatures, key/value settings, both schema enum declarations, generation jobs, document state, language settings/rendering references and backup contracts. Corrected the earlier assumption that the creativity setting is stored in an enum-typed column: it is a key/value setting requiring explicit legacy-value conversion.
- Affected files: the new plan and this changelog only. Existing source changes were preserved. Validation: source inspection and `git diff --check`; no application tests or model-quality evaluations were run for this documentation-only task.
- Status: proposal only; no feature implementation, live migration, deployment, paid AI calls or saved application-data changes. Historical language compatibility and candidate language qualifications are intentionally preserved; semantic inference quality requires later evaluation.
