# Rolepilot security

Rolepilot is a single-user application. Protect its database, app configuration and data directory as you would your resume and correspondence. The [privacy guide](PRIVACY.md) describes what the app stores and sends.

## Report a vulnerability

Open a private vulnerability report in the repository’s GitHub Security tab. Include the affected version, impact and reproduction steps with synthetic data. Keep credentials, personal data and private job application material out of public reports.

## Application controls

- **Sign-in.** The server reads an Argon2id hash from `ROLEPILOT_PASSWORD`. It rate-limits failed attempts and uses an encrypted, HttpOnly, SameSite=Lax session cookie, with the Secure flag over HTTPS.
- **Request checks.** Private pages and data handlers verify sessions. Standard route handlers and Server Actions validate requests and enforce origin checks. OAuth callbacks, sign-in and public health checks have their own validation.
- **Secrets.** Rolepilot encrypts saved credentials using keys derived from `ROLEPILOT_SECRET`. Keep that secret with the matching database backup to recover encrypted settings.
- **Public posting URLs.** The server validates URLs and guards direct fetching against access to private networks. Eligible failing public URLs can go to the Exa fallback. URLs with common credential parameters are excluded from that fallback.
- **One Connect.** The server permits a set of actions for each workflow. Requests and responses have validation and bounds. One authorizes each configured provider connection. See the [integration guide](docs/INTEGRATIONS.md) for the expected permissions.
- **Untrusted content.** Job postings, public research pages and employer replies are external input. Rolepilot checks structured model output and applies factual and source validation where appropriate. Review model-generated claims, suggested contacts and recipient details before using them.
- **Sending.** Draft generation and People research do not submit applications. Gmail sends require confirmation, and the MCP connector provides a limited set of tools for authorized clients.

## Deploy securely

Keep the application listener on loopback when running locally. For remote access, use an HTTPS reverse proxy, set the public origin, and protect the app port from direct internet access. Configure forwarded headers at the proxy and use its HSTS controls. Protect environment files and backups, and give integrations only the permissions required for the features you use.

Changing the password hash invalidates existing sessions. Rotating `ROLEPILOT_SECRET` also affects encrypted settings and may require reconnecting services. Follow the [deployment guide](docs/DEPLOYMENT.md) to back up and restore the matching configuration and data.
