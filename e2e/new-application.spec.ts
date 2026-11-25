import { extractText, getDocumentProxy } from "unpdf";
import { expect, test } from "@playwright/test";

import { resetData, sql } from "./support";

// A new application from a pasted posting (E7), with the fake AI server.
test.beforeAll(resetData);

const POSTING = `Ledgerly: Senior Product Designer, Payments
Amsterdam (hybrid, 3 days in office) · €75,000–€90,000

What we're looking for
- 5+ years of product design
- You've built or maintained a design system
- Strong prototyping skills in Figma
- Experience with Kubernetes
- Dutch is a plus`;

test("reads a posting, shows the match and writes tailored documents", async ({ page }) => {
  await page.goto("/new?fresh=1");
  await page.getByLabel("Job posting").fill(POSTING);
  await page.getByRole("button", { name: "Read the posting →" }).click();

  await expect(page.getByRole("heading", { name: "How you match" })).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveValue("Ledgerly");
  await expect(page.getByLabel("Role")).toHaveValue("Senior Product Designer, Payments");
  await expect(page.getByText("Experience with Kubernetes")).toBeVisible();

  await page.getByLabel("Anything I should know?").fill("I'm moving to Amsterdam in January.");
  await page.getByRole("button", { name: "Create application →" }).click();
  await page.waitForURL(/\/applications\/c/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { level: 1, name: "Senior Product Designer, Payments · Ledgerly" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Resume" })).toContainText("Jane Doe");
  await page.getByRole("tab", { name: "Cover letter" }).click();
  await expect(page.getByText("Payments are where trust is won or lost")).toBeVisible();
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Sidebar format/);
  await expect(page.locator('aside [data-unit="headline"]')).toContainText("Senior Product Designer, Payments");
  await expect(page.locator('aside [data-unit="contacts"]')).toContainText("jane.doe@example.com");
  const letterAppearance = await page.getByRole("article", { name: "Cover letter" }).evaluate(el => ({ accent: getComputedStyle(el).getPropertyValue("--accent").trim(), font: getComputedStyle(el).fontFamily }));
  expect(letterAppearance.accent).toBe("#243B53");
  expect(letterAppearance.font).toMatch(/inter/i);
  // What you told the AI is the application's first fact (APP-15).
  await page.getByRole("tab", { name: /Job posting/ }).click();
  await expect(page.getByRole("region", { name: "Facts for this application" }).getByRole("textbox", { name: "Fact 1", exact: true })).toHaveValue("I'm moving to Amsterdam in January.");
});

test("counts the tokens it used on the Usage screen (#290)", async ({ page }) => {
  await page.goto("/usage");
  await expect(page.getByRole("heading", { level: 1, name: "Usage" })).toBeVisible();
  // One reading of the posting, as the fake AI server counts every answer.
  const reading = page.getByRole("row", { name: /^Reading postings/ });
  await expect(reading.getByRole("cell")).toHaveText(["1", "1,200", "300", "1,500"]);
  await expect(page.getByRole("row", { name: /^Writing resumes/ }).getByRole("cell").first()).toHaveText("1");
  await expect(page.getByText(/^Counting since/)).toBeVisible();
});

test("won't fetch a posting from the server's own network (E7-8)", async ({ page }) => {
  await page.goto("/new?fresh=1");
  await page.getByLabel(/^Link to the posting/).fill("http://localhost:3100/login");
  await page.getByRole("button", { name: "Fetch" }).click();
  await expect(page.getByText("rolepilot doesn't fetch addresses on your own network. Paste the posting instead.")).toBeVisible();
  await expect(page.getByLabel("Job posting")).toHaveValue("");
});



test("keeps added JD evidence inside one application through generation, updating, PDF and Undo", async ({ page }) => {
  const globalBefore = await sql(`SELECT 'skills' AS kind, row_to_json(t)::text AS data FROM "Skill" t UNION ALL SELECT 'facts', row_to_json(t)::text FROM "Fact" t WHERE "applicationId" IS NULL UNION ALL SELECT 'experience', row_to_json(t)::text FROM "Experience" t UNION ALL SELECT 'fields', row_to_json(t)::text FROM "ProfileField" t UNION ALL SELECT 'projects', row_to_json(t)::text FROM "Project" t ORDER BY kind, data`);
  const otherDocuments = await sql(`SELECT id, units FROM "Document" ORDER BY id`);
  await page.goto("/new?fresh=1");
  await page.getByLabel("Job posting").fill(POSTING);
  await page.getByRole("button", { name: "Read the posting →" }).click();
  const row = page.getByRole("list", { name: "Requirements" }).getByRole("listitem").filter({ hasText: "Experience with Kubernetes" });
  await row.getByRole("button", { name: "Add for this application" }).click();
  await page.getByRole("textbox", { name: "Supporting experience", exact: true }).fill("Maintained Kubernetes deployments for internal tools.");
  await page.getByRole("button", { name: "Save for this application" }).click();
  await page.reload();
  await expect(row.getByRole("button", { name: "Edit application evidence" })).toBeVisible();
  await page.getByRole("button", { name: "Create application →" }).click();
  await page.waitForURL(/\/applications\/c/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.locator('[data-unit="skills"]')).toContainText("Additional skills: Kubernetes");
  const summaryBefore = (await page.locator('[data-unit="summary"]').textContent())!;
  const [letterBefore] = await sql<{ units: unknown }>(`SELECT units FROM "Document" WHERE "applicationId" = $1 AND kind = 'COVER_LETTER'`, [id]);
  await page.getByRole("tab", { name: /Job posting/ }).click();
  await row.getByRole("button", { name: "Add for this application" }).click();
  await page.getByRole("textbox", { name: "Supporting experience", exact: true }).fill("Used Kubernetes for service rollouts.");
  await page.getByRole("button", { name: "Save for this application" }).click();
  await expect(page.getByText("Information saved for this application.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Resume", exact: true }).click();
  await expect(page.locator('[data-unit="summary"]')).toHaveText(summaryBefore);
  const chat = page.getByRole("textbox", { name: "Ask for a change" });
  await chat.fill("Use my saved Kubernetes evidence in the summary.");
  await chat.press("Enter");
  await expect(page.getByRole("log", { name: "Conversation" }).getByText("Added your supporting experience to this resume.")).toBeVisible();
  await expect(page.locator('[data-unit="summary"]')).not.toHaveText(summaryBefore);
  const pdf = await page.request.get(`/api/pdf?doc=resume&application=${id}`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const { text: pdfText } = await extractText(await getDocumentProxy(new Uint8Array(await pdf.body())), { mergePages: true });
  expect(pdfText).toContain("Kubernetes");
  expect(pdfText.replace(/\s+/g, " ")).toContain("Used Kubernetes for service rollouts.");
  await page.getByRole("log", { name: "Conversation" }).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-unit="summary"]')).toHaveText(summaryBefore);
  expect((await sql<{ units: unknown }>(`SELECT units FROM "Document" WHERE "applicationId" = $1 AND kind = 'COVER_LETTER'`, [id]))[0].units).toEqual(letterBefore.units);
  expect(await sql(`SELECT 'skills' AS kind, row_to_json(t)::text AS data FROM "Skill" t UNION ALL SELECT 'facts', row_to_json(t)::text FROM "Fact" t WHERE "applicationId" IS NULL UNION ALL SELECT 'experience', row_to_json(t)::text FROM "Experience" t UNION ALL SELECT 'fields', row_to_json(t)::text FROM "ProfileField" t UNION ALL SELECT 'projects', row_to_json(t)::text FROM "Project" t ORDER BY kind, data`)).toEqual(globalBefore);
  const otherIds = otherDocuments.map((doc) => doc.id);
  expect(await sql(`SELECT id, units FROM "Document" WHERE id = ANY($1::text[]) ORDER BY id`, [otherIds])).toEqual(otherDocuments);
  expect((await sql<{ count: string }>(`SELECT count(*) FROM "Fact" WHERE "applicationId" = $1`, [id]))[0].count).toBe("2");
});
