# Integrations

## OpenRouter

OpenRouter powers job description reading, requirement matching, drafting, refinement, candidate memory, People research and scoring. Add an OpenRouter API key under **Settings → AI provider** and choose **Test connection**. A deployment can supply `ROLEPILOT_AI_KEY` as a fallback. Rolepilot selects the models by task. The connection test makes small inference requests, and usage depends on your OpenRouter account.

## One Connect

One Connect gives Rolepilot a server-side MCP connection to authorized external actions. Rolepilot uses Exa to read and search public web pages and Muapi for LinkedIn research. OpenRouter provides model inference. One provides the authorized tool calls.

| Provider | One actions | Rolepilot uses them for |
| --- | --- | --- |
| Exa | Search, Get Contents | Company research, posting import fallback and public evidence in People |
| Muapi | LinkedIn People Search, Get a Prediction’s Result | Searching for people and retrieving the results |
| Muapi | Look Up a LinkedIn Company Profile | Confirming an employer by a company LinkedIn URL or official domain when available |

1. Open the [One dashboard](https://app.withone.ai/developers/connect) and create or open a Connect app for Rolepilot. Connect Exa with your Exa API key. For LinkedIn research, connect Muapi with your Muapi API key and make sure that account can run the LinkedIn actions.
2. Give the Connect app a custom permission set for the actions listed above. The repository’s [One Connect config](../one.connect.ts) records the action IDs this build expects.
3. In Rolepilot, open **Settings → AI provider → One**. Copy the callback URL shown there into the One Connect app’s allowed redirects. The URL must match exactly, including hostname, port and protocol. For example, `http://localhost:3000/api/one/callback` and `http://127.0.0.1:3000/api/one/callback` are different redirect URIs.
4. Enter the **One Connect key**, **client ID**, **client secret**, and **permission set ID** in Rolepilot. Save, choose **Connect with One**, and authorize the connections you configured. Keep the Exa and Muapi keys in One.
5. Select **Test connection**. Check that Rolepilot shows Exa as checked and, if you configured Muapi, LinkedIn people search as checked too. The test verifies these grants without making provider requests. Run the relevant workflow to verify the upstream provider responds and has credits.

Register changes to callback URLs or permissions in One and reconnect Rolepilot when the grant changes. **Remove One settings** clears the local configuration. Revoke access at One to end the external grant. A public-web setup can use Exa alone. Muapi’s LinkedIn actions use your Muapi connection and do not require signing in to your personal LinkedIn account.

## Find jobs and Job agent

Choose your source in **Settings → Job search**. JSearch and Adzuna require source credentials. FreeHire uses a public catalog or a configured FreeHire instance. The optional Germany-only source is available for manual searches when enabled and acknowledged.

Configure recurring searches in **Settings → Job agent**. Enabled searches share one schedule and a three-request rolling 24-hour budget. The agent evaluates new results and can prepare drafts for review. It does not submit applications.

## Google

Gmail and Calendar are optional. In **Settings → Google**, choose the features you want and provide your Google OAuth client. Enable the corresponding APIs on that client and register the callback shown in Settings (the Rolepilot origin followed by `/api/google/callback`). Then connect your Google account. Each send needs your confirmation. Without Gmail, copy an email draft and use your own mail client.

## MCP connector

The optional **Settings → MCP connector** exposes Rolepilot tools to a compatible client such as Claude. Enable it and follow the Settings instructions for the client’s URL and authorization. Depending on the tool, a connected client can read candidate and job context, score postings, or save a draft for review. Disconnect clients from Settings when you finish using them.

This connector gives an external client access to Rolepilot. One Connect gives Rolepilot access to Exa and Muapi. Each connection is configured separately.
