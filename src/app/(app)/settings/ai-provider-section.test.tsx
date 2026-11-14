import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiProviderSection } from "./ai-provider-section";
import { saveApiKey, testOpenRouterConnection } from "./actions";
vi.mock("./actions", () => ({saveApiKey:vi.fn(),testOpenRouterConnection:vi.fn()}));
const initial = {provider:"OPENAI" as const,baseUrl:"https://openrouter.ai/api/v1",model:"ignored",keyState:"set" as const};
it("shows fixed assignments without provider, endpoint, or model controls", () => {
 render(<AiProviderSection initial={initial}/>);
 expect(screen.getByText("OpenRouter")).toBeInTheDocument();
 expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
 expect(screen.queryByRole("radio")).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
 expect(screen.getByText("typesafe/jev-1.14")).toBeInTheDocument();
});
it("saves the encrypted key through the server and clears the browser input", async () => {
 vi.mocked(saveApiKey).mockResolvedValue({ok:true,data:{keyState:"set"}});
 render(<AiProviderSection initial={initial}/>);
 fireEvent.change(screen.getByLabelText("OpenRouter API key"),{target:{value:"new-key"}});
 fireEvent.click(screen.getByRole("button",{name:"Save key"}));
 await waitFor(()=>expect(saveApiKey).toHaveBeenCalledWith({provider:"OPENAI",change:{action:"set",value:"new-key"}}));
 await waitFor(()=>expect(screen.getByLabelText("OpenRouter API key")).toHaveValue(""));
});
it("shows independent connection failures", async () => {
 vi.mocked(testOpenRouterConnection).mockResolvedValue({ok:true,data:{results:[{model:"Luna",connected:true,message:"Connected"},{model:"Jev",connected:false,message:"Not enough credits"}]}});
 render(<AiProviderSection initial={initial}/>);
 fireEvent.click(screen.getByRole("button",{name:"Test connection"}));
 expect(await screen.findByText("Jev: Not enough credits")).toBeInTheDocument();
});
