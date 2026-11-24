import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiProviderSection } from "./ai-provider-section";
import { saveApiKey, testOpenRouterConnection } from "./actions";
vi.mock("./actions", () => ({saveApiKey:vi.fn(),testOpenRouterConnection:vi.fn()}));
const initial = {provider:"OPENAI" as const,baseUrl:"https://openrouter.ai/api/v1",model:"ignored",keyState:"set" as const};
it("shows the OpenRouter connection without provider, endpoint, or model controls", () => {
 render(<AiProviderSection initial={initial}/>);
 const heading = screen.getByRole("heading", { name: "OpenRouter" });
 expect(heading.closest(".rounded-panel")).toContainElement(screen.getByLabelText("OpenRouter API key"));
 expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
 expect(screen.queryByRole("radio")).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
});
it("saves the encrypted key through the server and clears the browser input", async () => {
 vi.mocked(saveApiKey).mockResolvedValue({ok:true,data:{keyState:"set"}});
 render(<AiProviderSection initial={initial}/>);
 fireEvent.change(screen.getByLabelText("OpenRouter API key"),{target:{value:"new-key"}});
 fireEvent.click(screen.getByRole("button",{name:"Save key"}));
 await waitFor(()=>expect(saveApiKey).toHaveBeenCalledWith({provider:"OPENAI",change:{action:"set",value:"new-key"}}));
 await waitFor(()=>expect(screen.getByLabelText("OpenRouter API key")).toHaveValue(""));
 expect(screen.getByRole("status")).toHaveTextContent("API key saved. Select Test connection");
 expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
});
it("shows a connection status without naming backend models", async () => {
 const message = "OpenRouter did not pass all connection checks. Check your OpenRouter credits and access, then try again.";
 vi.mocked(testOpenRouterConnection).mockResolvedValue({ok:true,data:{connected:false,message}});
 render(<AiProviderSection initial={initial}/>);
 fireEvent.click(screen.getByRole("button",{name:"Test connection"}));
 expect(screen.getByRole("status")).toHaveTextContent("Checking your OpenRouter connection…");
 expect(await screen.findByText(message)).toBeInTheDocument();
 expect(screen.getByRole("status")).not.toHaveClass("text-success");
});

it("shows a green confirmation when the saved key passes its connection test", async () => {
  vi.mocked(testOpenRouterConnection).mockResolvedValue({
    ok: true,
    data: { connected: true, message: "OpenRouter connection verified." },
  });
  render(<AiProviderSection initial={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await screen.findByText("OpenRouter connection verified.");
  expect(screen.getByRole("status")).toHaveClass("text-success");
});
