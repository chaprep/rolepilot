import { afterEach, expect, it, vi } from "vitest";

import { copyText } from "./copy-text";

afterEach(() => vi.unstubAllGlobals());

it("uses the clipboard directly in a secure context", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await expect(copyText("Application draft")).resolves.toBe(true);
  expect(writeText).toHaveBeenCalledWith("Application draft");
  expect(document.querySelector("textarea")).toBeNull();
});

it.each([true, false])("copies through the fallback when the clipboard is unavailable (secure: %s)", async (secure) => {
  const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
  vi.stubGlobal("isSecureContext", secure);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const original = document.execCommand;
  document.execCommand = vi.fn((operation) => {
    expect(operation).toBe("copy");
    expect(document.querySelector("textarea")?.value).toBe("Application draft");
    return true;
  });
  try {
    await expect(copyText("Application draft")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledTimes(secure ? 1 : 0);
    expect(document.querySelector("textarea")).toBeNull();
  } finally {
    document.execCommand = original;
  }
});

it("cleans up when copying through the fallback fails", async () => {
  vi.stubGlobal("navigator", {});
  const original = document.execCommand;
  document.execCommand = vi.fn(() => { throw new Error("Copy unavailable"); });
  try {
    await expect(copyText("Application draft")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  } finally {
    document.execCommand = original;
  }
});
