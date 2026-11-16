# Dossier change log

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

- At the user's explicit request, stopped the local Docker app, removed the `dossier_data` volume, and restarted the application with empty saved data.
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
- Rebuilt the production Docker image and recreated `dossier-app-1` using `compose.local.yml`, preserving the existing data volume.
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
- SQLite integration baseline: **21 tests passed across 5 files** covering missing-document generation, refinement, regeneration, resume scoring, and connector writes. Used the isolated `/tmp/dossier-tailoring-audit-20261115_test.db`; did not reset or mutate the running app database.
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

- Built and deployed `dossier:openrouter-local` using `docker compose -f compose.local.yml up -d --force-recreate`; retained the existing data volume and `.env`. Deployed image config: `879e59ea5ba7ceec469a7d47759cf44bd7e7c3370b43c2ce3a09f52bff247c57`. No schema migration was needed for this feature.
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
- Deployment: rebuilt `dossier:openrouter-local` and recreated the app container using `compose.local.yml`, retaining the data volume and `.env`. Image manifest: `d2d3efe315d784f1225545456c54832ecf9d46bfd15e13185fe005330d102f9f`. Live health returned app/database OK and the saved-data counts matched the pre-deployment counts. Removed the temporary PostgreSQL test container and its test volume.
- Limits: no paid live AI calls were tested. Refinement still operates on existing text units; adding/reordering sections, changing layout and private contact fields remain outside this change. Model responses may still fail or decline; failures are reported rather than presented as successful edits.

## 2026-11-15 — Remove Refine with AI suggested actions

- Removed the suggested-action buttons entirely from the resume, cover letter and email refinement panel, allowing the conversation to use the freed space. Kept the heading, subtitle, conversation, input, Send control, About target and Undo behavior.
- Removed suggestion props and server generation, and deleted the unused generator and its tests. Updated UI tests to send typed requests and verify suggestions are absent, including the email tab.
- Files: `src/app/(app)/applications/[id]/refine-panel.tsx`, `application-view.tsx`, `page.tsx`, `application-view.test.tsx` (all in that directory), deleted `src/lib/refine-suggestions.ts` and `src/lib/refine-suggestions.test.ts`, and this log. No AI prompts, database schema or dependencies changed.
- Validation: all 74 application-view DOM tests passed; all 6 refinement Chromium tests passed, including sending, reload and Undo. Type checking, production build, changed-file lint and diff whitespace checks passed. Search found no remaining generator imports/types or suggestion props. An email test's old suggestion click was replaced with a typed request, and its textbox lookup corrected after the first check exposed a test-local helper scope issue.
- Backed up live SQLite to `/data/backups/pre-remove-suggestions-1794723449765.db`. Counts before deployment: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1.
- Deployment: rebuilt `dossier:openrouter-local` (manifest `9a17bb3f5d40ff9393a933fb4f22dd0dcbae69599b00920c9141c67527061971`) and recreated the container with the existing data volume and `.env`. Live app/database health was OK and counts matched the backup.
- Read-only deployed Chromium checks at 1400×900 and 390×844: the panel exposed only Send, input access worked, and the conversation retained an independently scrollable area. The narrow-width check also found overall page horizontal overflow (704px page width at 390px viewport, involving the surrounding main/resume canvas). No surrounding layout styles were changed for this removal; that separate layout issue was left outside this task.
- Closed the smoke browser and removed its temporary authentication file. No paid AI calls were performed; Safari/Firefox were not tested.
- Removed the temporary PostgreSQL browser-test container and its test volume after validation.

## 2026-11-15 — Scroll the refinement heading with the conversation

- Moved the Refine with AI heading and subtitle into the conversation's scrolling content, ahead of its messages. They scroll out of view in longer conversations and reappear at the beginning; short chats keep the heading at the top.
- Kept the composer outside the scroll area and retained reverse-column scrolling for newest messages, accessible panel naming, and keyboard-scrollable conversation.
- Files: `src/app/(app)/applications/[id]/refine-panel.tsx`, `src/app/(app)/applications/[id]/application-view.test.tsx`, and this log. Added a DOM assertion that the heading/subtitle belong to the conversation while the input and Send control do not.
- Validation so far: 75 application-view tests passed; changed-file lint and production build/type checking passed. No prompts, database schema or AI behavior changed. Deployment/browser scrolling verification is recorded below.
- Backed up SQLite before deployment to `/data/backups/pre-scroll-heading-1794723863822.db`; live counts: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1.
- Deployment: rebuilt `dossier:openrouter-local` (manifest `500ea447b0dc04d55e0a7df59c33b6b19018f56191f34d1de984fbf2fefebc8b`) and recreated the app container, retaining the existing data volume and `.env`. Health returned app/database OK and saved counts matched the backup.
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
- Captured live SQLite backup `/data/backups/pre-document-state-1794762160702.db`; preserved the previous image as `dossier:pre-document-state`. Live counts before deployment: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1. Docker deployment is pending the build below.
- Limits: existing registered fonts and layout structures only; no arbitrary HTML/CSS, new image uploads or HTML email. Snapshotting photos and full state can increase backup size. Legacy text-only history restores text without fabricating historical formatting. Undo refuses to overwrite subsequent document edits. Model interpretation is not guaranteed by fixture tests.
- Final compatibility additions: shared document saving synchronizes manually edited local text/skills for subsequent AI work while retaining omitted entries for Put back. Added regression coverage. Local resumes can set exact per-entry displayed date labels; explicit letter date changes update an existing date unit. Cover letters retain the existing single-column frame; resume-only layout fields are rejected rather than silently ignored.
- Final follow-up checks: 93 targeted Node tests and 4 local-rendering tests passed; production build/type checking passed. Targeted save/refinement/action database checks passed on SQLite (93 passed, one PostgreSQL-only skip). Final PostgreSQL and browser follow-up results are recorded after completion below.

### Completed deployment and smoke check

- Final follow-up PostgreSQL save/refinement/action tests: 94 passed. The final targeted Chromium full-state/PDF/Undo/history scenario and its setup both passed after the shared text synchronization change. Final targeted lint and diff checks passed.
- Deployed the final `dossier:openrouter-local` image (manifest `488a42718b969ed222e87cdfb0f60e9b400bc3e3e0b7359d0848c1fce039a969`) with `docker compose -f compose.local.yml up -d --force-recreate`. The additive SQLite migration `20261115180000_local_document_state` completed successfully. Retained the existing data volume and `.env`.
- App/database health returned OK and the container is healthy. Post-deployment counts match the pre-deployment backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 1. Existing live documents still have null local state; deployment did not rewrite them.
- Read-only deployed Chromium smoke check: existing resume and chat input loaded, new formatting guidance appeared, and PDF download returned HTTP 200 with a valid PDF content type and a non-empty body. No paid AI request was sent against the live configuration.
- Closed the smoke browser, deleted its temporary authentication state, and removed the temporary PostgreSQL test container and its test volume. The previous image remains tagged `dossier:pre-document-state` and the pre-migration SQLite backup remains in `/data/backups`.

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

- Captured live SQLite backup `/data/backups/pre-letter-layout-1794778059368.db` and tagged the previous image `dossier:pre-letter-layout`. Live counts at backup: Theme 13, Experience 4, Project 1, Application 1, Skill 51, Fact 0, Document 2. The live app gained a second document since the previous feature's rollout; this task did not create it.
- Deployed `dossier:openrouter-local` manifest `a686b98bc595461f435541c90d2e0411ef034fd10242281469e802d3a53f6057` with `docker compose -f compose.local.yml up -d --force-recreate`. Additive migration `20261116090000_cover_letter_layout` completed. Retained the existing volume and environment. Existing letters remain Classic until explicitly switched.
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

- At the user’s request, rebuilt the production Docker image `dossier:openrouter-local` from the current workspace and recreated `dossier-app-1` using `docker compose -f compose.local.yml up -d --force-recreate`, so the implemented resume sidebar controls are available locally.
- Retained the existing `dossier_data` volume and Compose environment. Preserved the previous image as `dossier:pre-resume-sidebar`. New running image ID: `sha256:3338d26cbb46abfd70df205451ba84dc9ad1a1ac401e9c26b126cb0a3eab2e53`.
- Validation: Docker production build succeeded; startup reported no pending migrations; `http://localhost:3000/api/health` returned `status: ok` and `db: ok`. No new schema migration or application data editing was performed. This operation changed the local deployment and this changelog; no additional source changes were needed.

## 2026-11-16 — Space below the resume sidebar switch

- Added 16px of bottom margin beneath the Refine with AI / Resume controls switch, separating the navigation from the content below while retaining the content’s existing padding. Applies to both sidebar views.
- Affected files: `src/app/(app)/applications/[id]/resume-sidebar.tsx` and this changelog.
- Validation: targeted ESLint and whitespace checks passed; Docker production build including TypeScript checking passed. Rebuilt `dossier:openrouter-local` and recreated the local application container with the existing volume/environment. Health endpoint returned `status: ok` and `db: ok` after restart.
- No new tests or browser visual inspection for this spacing-only adjustment; no data or schema changes.

## 2026-11-16 — Publish the current application source to GitHub

- At the user’s request, prepared the current application source snapshot for commit and push to `origin/main` at `git@github.com:chaprep/job-finder.git`, including the existing resume/document improvements, migrations, tests, sidebar controls, and spacing adjustment recorded above.
- Affected files: current changes under `src/`, `e2e/`, and `prisma/`, plus the root `AGENTS.md` and this changelog. Local environment files, application data, generated clients, build outputs, and browser authentication files remain excluded.
- Validation: fetched origin and confirmed local HEAD matched `origin/main` before committing; checked changed/untracked source files for common credential patterns with no matches. The latest Docker production build and local health checks passed in the preceding task; this publication task does not rerun the full test suite or change the running deployment. Push completion is verified and reported separately in the task result.
