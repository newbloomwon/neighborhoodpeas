// Type stubs so TypeScript can import Person C's plain-JS agents (src/person-c/**.mjs).
declare module "*/person-c/agents/walkNarratorAgent.mjs" {
  export function runWalkNarratorAgent(args: { blockFixture: unknown; nextBlockFixture?: unknown; language?: "en" | "es"; candidateOverrideText?: string | null }): unknown;
  export function buildDeterministicBlockNarration(blockFixture: unknown, language?: "en" | "es"): string;
}
declare module "*/person-c/agents/orchestrator.mjs" {
  export function detectLanguage(text?: string, explicitLanguage?: "en" | "es" | null): "en" | "es";
  export function answerSpokenBlockQuestion(args: { question?: string; blockId?: string; language?: "en" | "es" | null; candidateLLMResponse?: string | null; blockFixture?: unknown }): unknown;
  export function orchestratePersonCAgent(request?: Record<string, unknown>): unknown;
}
