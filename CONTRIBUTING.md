# Contributing to Rolepilot

Use GitHub issues for bugs and feature requests. Report vulnerabilities privately using the [security guide](SECURITY.md).

## Propose a change

For a bug, include the Rolepilot version, deployment method, expected behavior, actual behavior and steps to reproduce it. Use synthetic examples and redact credentials, job applications and profile data.

For a feature, open an issue first. Describe the job-search workflow, who it helps and how you would check that it works. Discuss changes to model routing, provider permissions or persisted data before implementation. Small fixes to code or documentation can go straight to a pull request.

## Open a pull request

- Keep the change focused and review every changed line, including generated code.
- Follow the existing architecture and update the relevant guide when behavior changes.
- Keep PostgreSQL and SQLite migrations, import/export and deletion behavior consistent when changing stored data.
- Minimize data sent to integrations. Update [Privacy](PRIVACY.md) where the recipient or payload changes.
- Run the relevant [tests and checks](DEVELOPMENT.md#tests-and-checks) and report what you verified. Prefer fixture services and isolated databases.
- Add a [changelog](CHANGELOG.md) entry covering the change, its validation and any deployment or migration implications.
