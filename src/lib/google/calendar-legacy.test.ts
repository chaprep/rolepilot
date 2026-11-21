import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ property: "dossierApplication" }));
vi.mock("./account", () => ({ googleFetch: async () => ({ id: "old-event", extendedProperties: { private: { [state.property]: "application-id" } } }) }));
vi.mock("./endpoints", () => ({ googleUrl: () => "https://calendar.example.test" }));
import { getEvent } from "./calendar";
it("links old and new Calendar private properties to the same application", async () => {
  for (const property of ["dossierApplication", "rolepilotApplication"]) {
    state.property = property;
    expect(await getEvent("primary", "old-event")).toMatchObject({ applicationId: "application-id" });
  }
});
