# Rolepilot privacy

Rolepilot runs in your own environment. Your database and data directory hold your profile, applications, settings and backup files. The services you configure receive the information needed for the actions you use. See [Security](SECURITY.md) for deployment and credential protections.

## Data stored by Rolepilot

| Data | Where and for how long |
| --- | --- |
| Career profile, qualifications, contact details and references | Database, until you change or delete them |
| Job applications, descriptions, matching results, status history, drafts and versions, chats and private notes | Database, until you delete the application. Sent applications can retain a profile snapshot. |
| People search results and cover letter research | Database, with the application. Can include names, roles, public profile links and source excerpts. These records are included in portable exports. |
| Find jobs, Job agent and Startups | Database. Includes searches, saved or dismissed results, job agent scores and startup research. Some dismissed records retain identifiers or fingerprints to prevent rediscovery. |
| Temporary task inputs and outputs | Database, for the period chosen under **Settings → Your data** or until the associated application is deleted. The default is 24 hours. |
| Usage and sign-in protection | Database. Usage records report task, model, time and token counts. Failed sign-in counters keep client IPs temporarily. Prompts and responses can be present in the separate task records. |
| Integration settings | Database. Saved credentials are encrypted. One Connect settings and grant references and Google connection credentials belong to the installation. |
| Gmail and Calendar | If connected, Rolepilot can keep linked mail text, drafted replies, permissions and interview event IDs. Rolepilot shows queried calendar events without retaining the full calendar. |
| Backups and bulk downloads | Data directory. Nightly JSON backups default to 14 days of retention. Temporary bulk PDF downloads expire after download or an hour. |

## Where information goes

| Recipient | When and what it receives |
| --- | --- |
| **OpenRouter and the model providers it routes to** | When using AI features, they receive the input needed for the task. This can include job text, candidate evidence, drafts, prompts, public research excerpts and relevant email text. Scoring also runs through OpenRouter. |
| **One and Exa** | For company research and People, they receive public search queries and public page URLs. For an eligible posting import fallback, they receive the public posting URL. |
| **One and Muapi** | For LinkedIn research, they receive employer and role search terms or a company domain or LinkedIn company URL, plus requests for the status of those lookups. |
| **Job source** | Find jobs and recurring agent searches send keywords, geographic search parameters and filters to the chosen source. |
| **Public sites** | Direct posting imports contact the job site. Startups requests public hiring posts from Hacker News and Algolia and may read relevant company pages. |
| **Google** | If connected, receives OAuth requests and requests for your chosen Gmail and Calendar features. Messages you approve may include your application PDFs. Calendar requests can include interview titles and times. |
| **Authorized MCP client** | When enabled and authorized, the client receives data returned by Rolepilot tools. Depending on the tool this can include candidate profile evidence, job postings, application status and draft text. |

Rolepilot does not send project usage telemetry or fetch project announcements or release notices.

### AI task inputs

- **Read and match a posting.** Sends posting text and selected candidate evidence to extract requirements and assess fit.
- **Write or refine a draft.** Sends relevant profile evidence, job requirements, the tone and applicable research. Refinement can include draft content, your instructions and recent chat messages. Regular drafting filters structured contact details and references. Free text you provide can still include identifying information.
- **Import a resume.** Sends extracted text from the resume, which can include your contact details and references.
- **Research hiring contacts.** Sends the saved employer, role, location, posting context and public search results to the model. Research tools receive the bounded queries or public URLs constructed for the task.
- **Score a job or resume.** Job scoring uses job text and filtered candidate evidence. Resume scoring uses the written resume content and job context.
- **Read or draft email replies.** If using Gmail’s AI features, the model can receive the sender, subject and message text, selected thread context and relevant application details.
- **Remember candidate evidence.** Extraction and selection use eligible submissions and remembered facts, as described below.

Hiding a resume section from printing can still leave it available as candidate evidence. External services process their inputs under the terms and settings of your accounts.

### Startups

Rolepilot’s Startups feature requests public hiring posts and public company pages. It follows a site’s robots.txt for company-page reads using the product token `rolepilot`. It can keep public contact addresses and the source page. Looking up individual addresses requires an explicit action. Those addresses expire after 14 days unless you start an application to the startup.

### MCP connector

This optional connector lets authorized clients call Rolepilot tools. Tool responses can include filtered candidate evidence, job details and saved draft text. The connector excludes private application notes and letter sender and signature details from application responses. **Disconnect all apps** revokes future access. Copies an external client already received are subject to that service’s data controls.

## Automatically remembered candidate information

Eligible facts you submit through application chats, evidence forms, application facts, initial application notes or accepted manual edits can become memory sources. Generated documents, private application notes and employer messages are excluded as sources. Submitted evidence can persist even if an application draft fails or is abandoned.

Review remembered facts in **Profile → Facts about me**. Corrections supersede earlier assertions. Conflicting facts are withheld until resolved. **Pause** suspends processing and reuse. **Forget** removes the item from future use and clears memory-owned text and evidence. Rolepilot keeps keyed replay markers to avoid recovering a forgotten fact from the same historic source. Original chats, application records and earlier exports are managed separately.

Deleting an application detaches its memory links. Reusable facts can remain available until forgotten. Document Undo restores the draft version and leaves memory actions to the Profile controls.

## Export, retention and deletion

- **Export** in **Settings → Your data** creates a portable copy that includes your profile, saved applications, candidate memory and application research. Opting to include eligible API keys puts them in the export as plaintext. Keep exports and backups private.
- **Import** replaces the destination’s portable dataset. One Connect authorizations belong to the target installation. Full-instance recovery also needs the matching configuration and secret.
- **Deleting an application** removes its drafts, saved research, chat, notes, task data and linked local mail. It leaves copies already in Gmail and earlier backups until their own deletion or expiry.
- **Disconnecting Google** revokes access and removes the local connection. Previously linked mail remains attached to its application. **Remove One settings** clears Rolepilot’s connection. Manage or revoke the external One grant in One.
- **Delete everything** removes application and profile data, candidate memory and local backups managed by Rolepilot. Manage any copies you downloaded or already sent to a connected service through that service or storage location.

See [Deployment and recovery](docs/DEPLOYMENT.md#backups-and-restore) for backup locations and recovery steps.
