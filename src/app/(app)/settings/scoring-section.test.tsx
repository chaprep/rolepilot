import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoringSection } from "./scoring-section";
it("shows Jev scoring and links to the shared key without scorer or TypeSafe key controls", () => {
 render(<ScoringSection initial={{scorer:"JEV",keyState:"set"}}/>);
 expect(screen.getByText("Jev through OpenRouter")).toBeInTheDocument();
 expect(screen.getByRole("link")).toHaveAttribute("href","/settings?section=ai");
 expect(screen.queryByRole("radio")).not.toBeInTheDocument();
 expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
