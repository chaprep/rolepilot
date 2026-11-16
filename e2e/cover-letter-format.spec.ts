import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

import { resetData, sql } from "./support";

test.beforeEach(resetData);

test("switches a legacy letter locally, preserves its body and restores the original with Undo", async ({ page }) => {
  const [letter] = await sql<{ id: string; applicationId: string; units: unknown; state: unknown }>(`SELECT id, "applicationId", units, state FROM "Document" WHERE kind = 'COVER_LETTER' LIMIT 1`);
  const others = await sql(`SELECT id, units, state FROM "Document" WHERE id <> $1 ORDER BY id`, [letter.id]);
  const themes = await sql(`SELECT * FROM "Theme" ORDER BY id`);
  await page.goto(`/applications/${letter.applicationId}?tab=letter`);
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Classic format/);
  const body = await page.locator('[data-unit^="paragraph:"]').allTextContents();
  await page.getByRole("button", { name: "Letter format" }).click();
  await page.getByRole("menuitemradio", { name: "Sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Sidebar format/);
  await expect(page.locator('aside [data-unit="contacts"]')).toContainText("jane.doe@example.com");
  expect(await page.locator('[data-unit^="paragraph:"]').allTextContents()).toEqual(body);
  await page.reload();
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Sidebar format/);
  await page.screenshot({ path: "test-results/cover-letter-sidebar.png", fullPage: true });
  await page.getByRole("log", { name: "Conversation" }).getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Classic format/);
  const [undone] = await sql<{ units: unknown; state: unknown }>(`SELECT units, state FROM "Document" WHERE id = $1`, [letter.id]);
  expect(undone).toEqual({ units: letter.units, state: letter.state });
  await page.getByRole("button", { name: "History", exact: true }).click();
  const version = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Cover-letter format: Sidebar" });
  await version.getByRole("button", { name: /Look at the version from/ }).click();
  await expect(page.locator('aside [data-unit="contacts"]')).toContainText("jane.doe@example.com");
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByRole("button", { name: "Restore this version" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Letter format" })).toHaveText(/Sidebar format/);
  expect(await sql(`SELECT id, units, state FROM "Document" WHERE id <> $1 ORDER BY id`, [letter.id])).toEqual(others);
  expect(await sql(`SELECT * FROM "Theme" ORDER BY id`)).toEqual(themes);
});

test("prints complete long Sidebar letters on both paper sizes without horizontal overflow", async ({ page }) => {
  const [letter] = await sql<{ id: string; applicationId: string }>(`SELECT id, "applicationId" FROM "Document" WHERE kind = 'COVER_LETTER' LIMIT 1`);
  const name = "Alexandra Long-Surname de la Cruz";
  const role = "Senior Director of International Product Strategy and Operations";
  const units = [
    { id: "sender", label: "Sender", text: name },
    { id: "headline", label: "Role title", text: role },
    { id: "contacts", label: "Contact details", text: "London\nalexandra.very.long.email.address.for.testing@example.com\n+44 1234567890" },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `paragraph:${i + 1}`, label: `Paragraph ${i + 1}`, text: `Paragraph ${i + 1}. ${"I build clear and reliable products through research, collaboration and thoughtful delivery. ".repeat(5)}` })),
    { id: "sign-off", label: "Sign-off", text: "Kind regards," },
    { id: "signature", label: "Signature", text: name },
  ];
  await sql(`UPDATE "Document" SET units = $1::jsonb, "initialLetterLayout" = 'SIDEBAR' WHERE id = $2`, [JSON.stringify(units), letter.id]);
  for (const { paper, marginX, marginY } of [{ paper: "A4", marginX: 18, marginY: 16 }, { paper: "LETTER", marginX: 8, marginY: 10 }]) {
    await sql(`UPDATE "Theme" SET "marginXmm" = $1, "marginYmm" = $2`, [marginX, marginY]);
    await sql(`INSERT INTO "Setting" (key, value, "updatedAt") VALUES ('paper', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [paper]);
    await page.goto(`/applications/${letter.applicationId}?tab=letter`);
    const article = page.getByRole("article", { name: "Cover letter" });
    await expect(article.locator('[data-unit="headline"]')).toContainText(role);
    const metrics = await article.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, marginX: getComputedStyle(el).getPropertyValue("--pad-x").trim(), marginY: getComputedStyle(el).getPropertyValue("--pad-y").trim() }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
    const unitsPerMm = 640 / (paper === "A4" ? 210 : 215.9);
    expect(Number(metrics.marginX)).toBeCloseTo(marginX * unitsPerMm, 5);
    expect(Number(metrics.marginY)).toBeCloseTo(marginY * unitsPerMm, 5);
    const response = await page.request.get(`/api/pdf?doc=letter&application=${letter.applicationId}`);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    await writeFile(`test-results/cover-letter-${paper}.pdf`, bytes);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    expect(pdf.numPages).toBeGreaterThan(1);
    const { text } = await extractText(pdf, { mergePages: true });
    for (let i = 1; i <= 12; i++) expect(text).toContain(`Paragraph ${i}.`);
    expect(text).toContain("Kind regards,");
    const first = await pdf.getPage(1);
    expect(first.view[2]).toBeCloseTo(paper === "A4" ? 595 : 612, 0);
    expect(first.view[3]).toBeCloseTo(paper === "A4" ? 842 : 792, 0);
    const { text: continuation } = await extractText(pdf, { mergePages: false });
    expect(continuation[1]).not.toContain("alexandra.very.long.email");
  }
});
