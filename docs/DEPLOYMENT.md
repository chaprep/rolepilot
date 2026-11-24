# Deployment and recovery

## Choose your setup

The [README](../README.md#run-locally-with-docker) runs the production image with SQLite in one container. The repository also provides `compose.production.yml` for PostgreSQL and `compose.yml` for hot-reloading development. Run one Rolepilot app instance per database.

For an existing installation, identify the project, image, environment file and database before replacing the app. This lists the production app’s data mount without printing credentials.

```bash
docker inspect <app-container> --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}} {{.Source}}{{end}}{{end}}'
```

Keep the database or volume, the `/data` mount, and the original `ROLEPILOT_SECRET` together. An existing SQLite deployment also needs the same database filename in `DATABASE_URL`. `compose.local.yml` is an existing local instance’s configuration, with an external volume that must already exist. Use the README for a new installation.

## Production Compose with PostgreSQL

From the checkout, build the image and generate the sign-in credentials as described in the [README](../README.md#run-locally-with-docker). Create a private `.env.production` file with your password hash and random app secret. Generate a separate hexadecimal `POSTGRES_PASSWORD` with `openssl rand -hex 24`. Set these values in that file.

```dotenv
ROLEPILOT_PASSWORD=<complete argon2id hash>
ROLEPILOT_SECRET=<random secret>
POSTGRES_PASSWORD=<hexadecimal database password>
ROLEPILOT_IMAGE=rolepilot:latest
ROLEPILOT_PORT=3000
TZ=UTC
```

```bash
chmod 600 .env.production
docker compose --env-file .env.production -p rolepilot-prod -f compose.production.yml up -d --wait
curl -fsS http://localhost:3000/api/health
```

Keep the same Compose project name on subsequent runs so it reuses the PostgreSQL and app data volumes. Set a different `ROLEPILOT_PORT` if port 3000 is in use. For a remote deployment, keep the app behind an HTTPS reverse proxy and restrict access to its listening port. Set `ROLEPILOT_PUBLIC_URL` to the public HTTPS origin before setting up OAuth callbacks.

## Updates

1. Back up the database, app data directory and configuration before starting a new version.
2. Build the production image from the intended checkout. For a Compose installation, use the same image tag the service references or deliberately update its configured image.
3. Recreate the Compose app with the same project, environment and Compose file. For the production configuration above:

   ```bash
   docker build --target production -t rolepilot:latest .
   docker compose --env-file .env.production -p rolepilot-prod -f compose.production.yml up -d --no-deps --force-recreate --wait app
   ```

   For a standalone Docker installation, stop the old container, give it a spare name and start a new container with the original run command and data mount. Keep only one container running against those data.
4. Check `/api/health`, container logs and the application list. Startup applies migrations automatically. If a migration made incompatible schema changes, restore the paired pre-upgrade database backup before switching back to the prior image.

## Backups and restore

Use **Settings → Your data** to create a portable JSON export and to import it into another SQLite or PostgreSQL installation. Import replaces the target dataset. Keep a copy of the target’s current data first. One Connect credentials and grant references are specific to an installation, so reconnect One after a portable migration. See [Privacy](../PRIVACY.md) for details about export contents.

Rolepilot keeps nightly JSON backups in the data directory. Copy the backups you need off the host. For full instance recovery, separately keep the app secret, configuration and a consistent database backup. For SQLite, stop the app before copying the database and its directory or use SQLite’s online backup API. For PostgreSQL, take a `pg_dump` and verify the restore on an isolated database. Treat every backup as sensitive personal data.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| The browser cannot connect | Check the container state, configured host port and startup logs. |
| The app fails during startup | Check the password hash format, secret length, database connection and file permissions on the data mount. |
| The application list is unexpectedly empty after a restart | Compare the volume, database filename or PostgreSQL database with the previous installation before importing or creating data. |
| One authorization returns an error | Compare the exact callback registered in One with the URL shown in Rolepilot. Use the same origin throughout sign-in and consent. |
| Documents cannot be drafted or scored | Test the OpenRouter key in **Settings → AI provider** and check its credits and access. |
| A job URL still fails to import | Paste the job description directly and select **Read the posting**. |
