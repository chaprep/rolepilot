import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { resetData, sql } from "./support";

// The theme builder (E5) and the PDF download (E5-5).
test.beforeAll(resetData);

test("builds a theme, makes it the base theme and downloads the resume as a PDF", async ({ page }) => {
  await page.goto("/resume");
  await page.getByRole("button", { name: /Make your own theme/ }).click();
  await page.getByRole("radiogroup", { name: "Accent" }).getByRole("radio", { name: "Green" }).click();
  await page.getByRole("radiogroup", { name: "Spacing" }).getByRole("radio", { name: "Compact" }).click();
  await page.getByLabel("Theme name").fill("Quiet green");
  await page.getByRole("button", { name: "Save theme" }).click();
  await expect(page.getByRole("button", { name: "Quiet green theme, in use" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Quiet green theme, in use" })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
  const pdf = await readFile((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  // Chromium's headless shell names every blob download "download", so the name is checked at the source.
  const response = await page.request.get("/api/pdf?doc=base");
  expect(response.headers()["content-disposition"]).toContain("filename*=UTF-8''Jane%20Doe%20%E2%80%93%20Resume.pdf");
});

test("scrolls the resume and controls independently on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/resume");
  const preview = page.locator("div.overflow-auto").filter({ has: page.getByRole("article", { name: "Resume", exact: true }) });
  const controls = page.getByRole("complementary", { name: "Theme and sections" });
  const header = page.getByRole("heading", { name: "Base resume", exact: true });
  const headerY = (await header.boundingBox())!.y;
  const scrollTop = (area: typeof preview) => area.evaluate((element) => element.scrollTop);
  const documentTop = () => page.evaluate(() => window.scrollY);
  const documentOverflow = () => page.evaluate(() => Math.max(0, document.scrollingElement!.scrollHeight - innerHeight));
  const wheel = async (area: typeof preview, delta: number) => {
    const box = (await area.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, delta);
  };

  await expect.poll(documentOverflow).toBe(0);
  await expect.poll(() => preview.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await wheel(controls, 250);
  await expect.poll(() => scrollTop(controls)).toBeGreaterThan(0);
  expect(await scrollTop(preview)).toBe(0);
  expect(await documentTop()).toBe(0);

  const controlsTop = await scrollTop(controls);
  await wheel(preview, 250);
  await expect.poll(() => scrollTop(preview)).toBeGreaterThan(0);
  expect(await scrollTop(controls)).toBe(controlsTop);
  expect((await header.boundingBox())!.y).toBe(headerY);

  // Wheel events at either boundary must not escape to the document or other column.
  for (const area of [controls, preview]) {
    for (const bottom of [true, false]) {
      await area.evaluate((element, end) => { element.scrollTop = end ? element.scrollHeight : 0; }, bottom);
      const other = area === controls ? preview : controls;
      const otherTop = await scrollTop(other);
      await wheel(area, bottom ? 500 : -500);
      await page.waitForTimeout(150);
      expect(await scrollTop(other)).toBe(otherTop);
      expect(await documentTop()).toBe(0);
    }
  }

  await page.getByRole("tab", { name: "Customize", exact: true }).click();
  await expect.poll(documentOverflow).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
  expect(await documentTop()).toBe(0);
  await expect.poll(() => controls.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await controls.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: "Save theme", exact: true })).toBeInViewport();
  await expect(page.getByRole("slider", { name: "Side margins", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Save theme", exact: true })).toBeFocused();
  expect(await documentOverflow()).toBe(0);
  expect(await scrollTop(preview)).toBe(0);
  await controls.evaluate((element) => { element.scrollTop = 0; });
  await page.getByRole("tab", { name: "Sections", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Projects", exact: true })).toBeVisible();
  expect(await documentTop()).toBe(0);
});

test("returns to normal page scrolling when the workspace stacks", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/resume");
  await page.getByRole("tab", { name: "Customize", exact: true }).click();
  await page.setViewportSize({ width: 760, height: 844 });
  const preview = page.locator("div.overflow-auto").filter({ has: page.getByRole("article", { name: "Resume", exact: true }) });
  const controls = page.getByRole("complementary", { name: "Theme and sections" });
  await expect.poll(async () => (await controls.boundingBox())!.y >= (await preview.boundingBox())!.y + (await preview.boundingBox())!.height - 1).toBe(true);
  await expect.poll(() => controls.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.mouse.move(600, 600);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Save theme", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Save theme", exact: true })).toBeInViewport();
  expect(await controls.evaluate((element) => element.scrollTop)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect.poll(() => controls.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.getByRole("heading", { name: "Base resume", exact: true })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBe(0);
});

test("Fit to one page downloads the resume itself, on one page (#328)", async ({ page }) => {
  const download = async () => (await (await page.request.get("/api/pdf?doc=base")).body()).toString("latin1");
  const pages = (pdf: string) => (pdf.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
  // The demo certification's link, which no other page has: a page count alone
  // can't tell the resume from the sign-in page, which fits on one page too.
  const link = "https://verify.example.org/IDI-20481";

  const unfitted = await download();
  expect(pages(unfitted)).toBeGreaterThan(1);
  expect(unfitted).toContain(link);

  await sql(`INSERT INTO "Setting" (key, value, "updatedAt") VALUES ('fitBaseResume', 'true', now())`);
  try {
    const fitted = await download();
    expect(pages(fitted)).toBe(1);
    expect(fitted).toContain(link);
  } finally {
    await sql(`DELETE FROM "Setting" WHERE key = 'fitBaseResume'`);
  }
});

test("keeps the summary's paragraphs, as typed in Profile → Summary (#277)", async ({ page }) => {
  const [{ value }] = await sql<{ value: string }>(`SELECT value FROM "ProfileField" WHERE key = 'summary'`);
  await sql(`UPDATE "ProfileField" SET value = $1 WHERE key = 'summary'`, ["Designs calm tools for busy teams.\n\nLeads research from the first interview to the shipped screen."]);
  try {
    await page.goto("/resume");
    const summary = page.getByText(/^Designs calm tools for busy teams\./);
    await expect(summary).toHaveCSS("white-space", "pre-line");
    // Rendered text keeps the break only where the page shows it.
    expect(await summary.evaluate((element) => (element as HTMLElement).innerText)).toContain("\n");
  } finally {
    await sql(`UPDATE "ProfileField" SET value = $1 WHERE key = 'summary'`, [value]);
  }
});
