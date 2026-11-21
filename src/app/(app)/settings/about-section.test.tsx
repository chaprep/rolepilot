import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AboutSection } from "./about-section";
it("shows install facts and setup without telemetry controls or upstream contact", () => {
  render(<AboutSection facts={[{ label: "Version", value: "1.13.0" }]} />);
  expect(screen.getByText("1.13.0")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open the setup guide" })).toHaveAttribute("href", "/welcome?step=start");
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByText(/pm.me/)).not.toBeInTheDocument();
});
