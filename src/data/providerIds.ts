export const ProviderId = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
  DEEPSEEK: "deepseek",
  NVIDIA: "nvidia",
  GROQ: "groq",
} as const;

export type ProvedorLLM = (typeof ProviderId)[keyof typeof ProviderId];
