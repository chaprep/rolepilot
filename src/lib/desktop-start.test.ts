import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";

it.each(["newer-database", "port-busy"])("keeps desktop recovery usable for %s without release downloads", async (kind) => {
  const dom = new JSDOM(readFileSync("desktop/start/index.html", "utf8"));
  const { document } = dom.window;
  runInNewContext(readFileSync("desktop/start/start.js", "utf8"), {
    document,
    window: { rolepilot: { state: async () => ({ screen: "local-problem", kind, detail: "Port unavailable", log: "/tmp/rolepilot.log", version: "1.13.0", localAvailable: true }) } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(document.getElementById("local-problem")!.hidden).toBe(false);
  expect(document.getElementById("problem-retry")!.hidden).toBe(kind === "newer-database");
  expect(document.activeElement?.id).toBe(kind === "newer-database" ? "problem-choose" : "problem-retry");
  expect(document.body.textContent).not.toContain("Download the latest version");
  if (kind === "newer-database") expect(document.getElementById("problem-text")!.textContent).toContain("Nothing was changed");
  dom.window.close();
});
