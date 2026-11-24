# Application workflows

## Read a job posting

In **New application**, paste a public URL and select **Fetch**. Rolepilot first requests the job page directly. If an eligible error or a page like a sign-in wall prevents extraction, it can try Exa through One. This fallback uses the public posting URL and runs without a model.

Review the returned text in the editable field. If the page stays unavailable, paste the full description yourself. **Read the posting** then sends that text to OpenRouter for structured extraction and requirement matching. Check the company, title, location and description before saving. Both URL and text-only applications use the same later drafting and People workflows.

## Resume and refinement

Rolepilot matches the posting to evidence from your profile and relevant candidate memory. Check direct experience, transferable skills and gaps before drafting. You can choose a writing approach in Settings, edit a draft directly, ask **Refine with AI** to change it, or regenerate a section. Review suggested claims against your experience. Use document versions and Undo to recover earlier wording.

## Cover letter

To add a missing letter, open **Cover letter → Write the cover letter**. Rolepilot plans a research angle using the posting and your relevant evidence. When Exa is available through One, a research task searches public sources and returns a focused brief with short excerpts. The writer uses the brief to connect a specific employer priority to your experience. If usable research is unavailable, it writes from the posting and candidate evidence. Paragraph rewrites can reuse a matching brief.

Rolepilot structures the letter in four paragraphs.

1. Open with a specific reason for applying to this company and role.
2. Show your fit with relevant evidence and results.
3. Connect your experience to the employer’s priorities or future work.
4. Close with a concise invitation to talk.

Review the letter’s claims and tone before use. The default greeting is **Dear Hiring Team**. You can personalize it manually or select a contact in People.

## People

Open **People → Find hiring contacts** on a saved application. Rolepilot uses the employer, role, posting context and any known URL to look for recruiters, hiring managers or relevant team leads. The workflow can start from a pasted description or a company careers page. If the employer is unclear, correct the application details and try again.

Results show why each person may be relevant and link to supporting sources. Open those sources and verify the person’s current role before using their name. Exa can supply public web evidence, and the Muapi connection adds LinkedIn search and company verification. Partial results indicate that some sources were unavailable.

Choose **Use in cover letter** or **Use in email** on a contact to replace the greeting in that existing draft with the contact’s first name. Each draft is changed separately. **Undo greeting change** restores the previous greeting. Drafting can proceed with a generic greeting while you research contacts.

## Email and tracking

Use the **Email** tab to generate, edit and copy an application email. Review the greeting, recipient, subject and body. Download your resume and letter as PDFs to attach in your mail client. If you enable Gmail, Rolepilot can send the message and PDFs after you confirm. Manage the application’s status in the board or table.

## Candidate memory

With memory active, eligible submissions such as facts you provide for an application and messages you send in the refinement chat can become reusable candidate evidence. Review, correct or forget those items in **Profile → Facts about me**. Private application notes and generated documents are excluded as memory sources. Document Undo applies to the draft. Manage remembered facts separately in Profile. See [Privacy](../PRIVACY.md#automatically-remembered-candidate-information) for retention and deletion.
