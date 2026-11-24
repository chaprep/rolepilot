import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetData, sql } from "./support";

// The setup guide (E21): it opens by itself on a fresh install, walks
// through each step, and holds the usage ping question back until it's left.
// Hosted AI keys aren't checked here: that would reach the vendors.
test.beforeEach(async () => {
  await resetData();
});

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => violation.id)).toEqual([]);
}

const freshInstall = async () => {
  await sql(`DELETE FROM "Application"`);
  await sql(`DELETE FROM "ProfileField" WHERE key = 'name'`);
  await sql(`DELETE FROM "Setting" WHERE key IN ('setupGuide', 'usagePingChoice', 'usagePingChoiceAt', 'usagePingChoiceText')`);
};

test("opens by itself on a fresh install and walks through every step", async ({ page }) => {
  await freshInstall();
  await page.goto("/");
  await expect(page).toHaveURL("/welcome");
  await expect(page.getByRole("heading", { name: "Welcome to rolepilot" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Send a daily usage ping?" })).toHaveCount(0);
  await expectAccessible(page);

  // The environment supplies a key so Continue is available while One is optional.
  await page.getByRole("link", { name: "Let's start →" }).click();
  await expect(page.getByRole("heading", { name: "Connect OpenRouter and One" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open One dashboard" })).toHaveAttribute("href", "https://app.withone.ai/developers/connect");
  await page.getByText("Enter One Connect credentials", { exact: true }).click();
  await expect(page.getByLabel("One Connect key")).toBeVisible();
  await page.getByLabel("OpenRouter API key").fill("e2e-openrouter-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("API key saved. Select Test connection to verify OpenRouter.")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Continue →" }).click();

  // Job search: JSearch with a key, checked against the fake source.
  await expect(page.getByRole("heading", { name: "Where to look for jobs" })).toBeVisible();
  await page.getByRole("radio", { name: "Any kind of job" }).click();
  await page.getByRole("radio", { name: "JSearch" }).click();
  await page.getByLabel("JSearch API key").fill("e2e-jsearch-key");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("It works: rolepilot can search JSearch.")).toBeVisible();
  await page.getByRole("link", { name: "Continue →" }).click();

  // Scoring shares the key saved in the first step.
  await expect(page.getByText("Scoring uses the shared OpenRouter key from AI settings.")).toBeVisible();
  await page.getByRole("link", { name: "Continue →" }).click();

  // Google: the steps, the address to copy, and Connect once a client is saved.
  await expect(page.getByRole("heading", { name: "Gmail and Calendar" })).toBeVisible();
  await expect(page.getByText(/\/api\/google\/callback$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Google" })).toHaveAttribute("aria-disabled", "true");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Skip this step →" }).click();

  // Profile: the import, inside the guide.
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.locator("input[type=file]")).toBeAttached();
  await page.getByRole("link", { name: "Skip this step →" }).click();

  // Done: what's set up, and the usage ping question once the guide is behind.
  await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "JSearch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fill in your profile" })).toBeVisible();
  await page.getByRole("link", { name: "Go to the dashboard" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("dialog", { name: "Send a daily usage ping?" })).toBeVisible();
});

test("opens again from Settings, and leaving it goes back to the app for good", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await page.goto("/settings?section=about");
  await page.getByRole("link", { name: "Open the setup guide" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to rolepilot" })).toBeVisible();
  await page.getByRole("link", { name: "Let's start →" }).click();
  await page.getByRole("navigation", { name: "Setup steps" }).getByRole("link", { name: /Scoring/ }).click();
  await expect(page.getByRole("heading", { name: "How to judge a posting" })).toBeVisible();

  // Where it was left, until it's left for good.
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "How to judge a posting" })).toBeVisible();
  await page.getByRole("button", { name: "Leave setup" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Welcome to rolepilot" })).toBeVisible();
});
