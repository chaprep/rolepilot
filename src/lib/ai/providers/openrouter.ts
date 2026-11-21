import type { UsageTask } from "@/lib/usage";
import type { ToolTurnRequest } from "../provider";
import { modelForTask } from "../assignments";
import { OpenAICompatibleProvider } from "./openai-compatible";

/** Every entry point, including compound jobs, routes by the actual request task. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  toolTurn(request: ToolTurnRequest) { return this.sendToolTurn(request); }

  protected usageProvider(): string { return "OPENROUTER"; }
  protected modelForTask(task: UsageTask): string {
    return task === "connection-check" ? super.modelForTask(task) : modelForTask(task);
  }
  protected effortForRequest(): "medium" { return "medium"; }
  protected reasoningEffort(): "medium" { return "medium"; }
  protected requiresEffort(): boolean { return true; }
}
