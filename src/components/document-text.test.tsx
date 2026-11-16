import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentText } from "./document-text";

describe("DocumentText", () => {
  it("preserves spaces and renders supported emphasis and safe links", () => {
    const { container } = render(<DocumentText text="Hello **bold** and *italic*, __underlined__ and ==highlighted==: [portfolio](https://example.com)." />);
    expect(container.textContent).toBe("Hello bold and italic, underlined and highlighted: portfolio.");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("u")).toHaveTextContent("underlined");
    expect(container.querySelector("mark")).toHaveTextContent("highlighted");
    expect(screen.getByRole("link", { name: "portfolio" })).toHaveAttribute("href", "https://example.com/");
  });
  it("renders HTML literally and rejects executable links", () => {
    const { container } = render(<DocumentText text={'<script>alert(1)</script> [click](javascript:alert)'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
