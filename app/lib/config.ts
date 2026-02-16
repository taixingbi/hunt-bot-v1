/**
 * App config. Orchestrator URL from environment.
 */

function fromEnv(name: string, fallback: string): string {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const trimmed = v.split("#")[0].trim().replace(/^["']|["']$/g, "").trim();
  return trimmed || fallback;
}

let cachedOrchestratorUrl: string | null = null;

export const config = {
  get orchestratorUrl(): string {
    if (cachedOrchestratorUrl === null) {
      cachedOrchestratorUrl = (
        fromEnv("MCP_TOOL_ORCHESTRATOR_URL", "") ||
        fromEnv("ORCHESTRATOR_URL", "https://mcp-orchestrator-v1-dev.fly.dev")
      ).replace(/\/$/, "");
    }
    return cachedOrchestratorUrl;
  },
};
