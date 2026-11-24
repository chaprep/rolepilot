<p align="center">
  <img src="public/brand/rolepilot-transparent.png" alt="" width="80" height="80">
</p>

# Rolepilot

Rolepilot is a self-hosted workspace for your job search. Keep one career profile, assess how you match each opening, tailor your application documents, and track your progress from draft to offer.

## What you can do

| Workflow | What Rolepilot does |
| --- | --- |
| **Build your profile** | Add experience, skills, projects, education and credentials, or import a resume. Review reusable facts under **Profile → Facts about me**. Download a base resume as a PDF. |
| **Review a job** | Paste a job URL or the description itself. Review the extracted requirements, the supporting evidence from your profile, and any gaps. |
| **Prepare an application** | Generate a tailored resume, write a cover letter or an application email, and refine each draft. Use **Cover letter → Write the cover letter** when the application has no letter yet. |
| **Research hiring contacts** | Open **People → Find hiring contacts** in a saved application. Review the results and supporting sources before using a first name in a draft greeting. |
| **Find and track opportunities** | Browse jobs and startups, configure recurring job searches, and manage saved applications in a board or table. |
| **Manage correspondence** | Copy a draft to your mail app or optionally connect Gmail and Calendar in **Settings → Google**. Review and confirm each send within Rolepilot. |

## Run locally with Docker

Use Docker Desktop or Docker Engine. This setup runs on your computer, listens on loopback, and keeps the SQLite database and backup files in a named Docker volume.

1. Clone the repository and build the production image.

   ```bash
   git clone https://github.com/chaprep/rolepilot.git rolepilot
   cd rolepilot
   docker build --target production -t rolepilot:latest .
   ```

2. Prepare your credentials. Run the password helper and copy the complete `argon2id:` line it prints. Generate a separate random secret.

   ```bash
   docker run --rm -it rolepilot:latest hash-password
   openssl rand -base64 32
   ```

3. Create a private file named `.env.local-docker` in the checkout and substitute your two values. Keep this file out of version control and protect the secret with your backups.

   ```dotenv
   DATABASE_URL=file:/data/rolepilot.db
   ROLEPILOT_PASSWORD=<complete argon2id hash>
   ROLEPILOT_SECRET=<random secret>
   ```

4. Start the container.

   ```bash
   chmod 600 .env.local-docker
   docker run -d --name rolepilot --restart unless-stopped \
     --env-file .env.local-docker \
     -v rolepilot-data:/data \
     -p 127.0.0.1:3000:3000 rolepilot:latest
   ```

5. Once the container is healthy, open [Rolepilot on localhost](http://localhost:3000) and sign in with the password you chose. Use `docker logs rolepilot` to check startup and `curl -fsS http://localhost:3000/api/health` to check readiness.

If you already have Rolepilot running, follow the [deployment and recovery guide](docs/DEPLOYMENT.md) to reuse your current storage and configuration. It also covers PostgreSQL with Compose and HTTPS hosting.

## Set up your first application

1. In **Settings → AI provider**, save your OpenRouter API key and select **Test connection**. The same key supports writing, document editing and scoring. Rolepilot manages model assignments.
2. In **Profile**, add or import the experience you want Rolepilot to draw on. Review the imported fields before using them in an application.
3. Open **New application**. Paste a public job URL and select **Fetch**, or paste the posting text directly. Then select **Read the posting** and review the extracted details before saving.
4. Open the application and review the tailored resume. Write a cover letter or email as needed. Check factual claims, dates and the greeting before downloading or sending anything.

### Optional One connection

One gives Rolepilot access to Exa for public web research and posting import fallback, and to Muapi for LinkedIn people and company research. It requires One Connect credentials and authorized provider connections. Your personal LinkedIn login is unnecessary for this workflow.

You can draft with the posting and your profile before configuring One. People research runs when you ask for it, and you choose whether to use a result in an existing cover letter or email. The [integration guide](docs/INTEGRATIONS.md) explains the permissions and setup.

## Documentation

| Guide | Covers |
| --- | --- |
| [Application workflows](docs/WORKFLOWS.md) | URL import, matching, resume and cover letter generation, People, email and candidate memory |
| [Deployment and recovery](docs/DEPLOYMENT.md) | Docker, PostgreSQL, persistent storage, upgrades and recovery |
| [Integrations](docs/INTEGRATIONS.md) | OpenRouter, One, job sources, Google and the optional MCP connector |
| [Development](DEVELOPMENT.md) | Local development, architecture, migrations and tests |
| [Privacy](PRIVACY.md) and [Security](SECURITY.md) | Data storage, external services, deployment controls and vulnerability reporting |
| [Contributing](CONTRIBUTING.md) and [Changelog](CHANGELOG.md) | Project contributions and implementation history |
| [Documentation index](docs/README.md) | Public guides and reference material |

## Known limitations

Rolepilot serves one person per installation. Run one app instance per database. The interface is designed for desktop browsers and new application documents are generated in English. Access to integrated services depends on your credentials, provider permissions and available credits. Public job pages may block retrieval, in which case you can paste the posting text.

## License

Rolepilot is distributed under the [GNU Affero General Public License v3.0](LICENSE). See [source attribution](PROVENANCE.md) for credits and bundled font licensing.
