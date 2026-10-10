import { ProviderId, type ProvedorLLM } from "./providerIds";

/**
 * Catálogo mantido manualmente conforme os catálogos oficiais dos provedores.
 * Revise os IDs quando os provedores publicarem versões novas ou aposentarem modelos.
 */
export interface ConfiguracaoModelo {
  id: string;
  label: string;
  provider: ProvedorLLM;
  family: string;
  capabilities: { supportsReasoning: boolean };
  custom?: boolean;
  /** Modelo em "preview" no provedor: pode ser retirado sem aviso. */
  preview?: boolean;
}

const ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdDeModeloUtilizavel(id: string): boolean {
  return Boolean(id.trim()) && !ID_UUID_RE.test(id.trim());
}

/**
 * Modelos que o provedor já aposentou mas que ainda aparecem na listagem
 * pública. A NVIDIA, por exemplo, mantém o DeepSeek V4 Pro em
 * `GET /v1/models`, porém a chamada devolve HTTP 410 ("reached its end of
 * life"). Esta lista é só um atalho para não oferecer o que já se sabe estar
 * morto; a verificação real (`/api/testar-modelo`) cobre o que não estiver aqui.
 */
interface Descontinuacao {
  id: string;
  /** Data de desligamento (ISO). Ausente = já está fora do ar. */
  desde?: string;
}

const MODELOS_DESCONTINUADOS: Partial<Record<ProvedorLLM, readonly Descontinuacao[]>> = {
  [ProviderId.NVIDIA]: [
    { id: "deepseek-ai/deepseek-v4-pro" },
    { id: "deepseek-ai/deepseek-v4-pro-0813" },
    { id: "deepseek-ai/deepseek-v4-flash" },
    { id: "deepseek-ai/deepseek-v4-flash-0731" },
  ],
  // Fonte: página "Model Deprecation" da Groq. Vale para os planos free e developer — clientes
  // enterprise com contrato seguem com alguns destes modelos, e por isso a API ainda os lista.
  [ProviderId.GROQ]: [
    { id: "groq/compound", desde: "2026-09-21" },
    { id: "groq/compound-mini", desde: "2026-09-21" },
    { id: "qwen/qwen3.6-27b", desde: "2026-09-14" },
    { id: "llama-3.1-8b-instant", desde: "2026-08-16" },
    { id: "llama-3.3-70b-versatile", desde: "2026-08-16" },
    { id: "qwen/qwen3-32b", desde: "2026-07-17" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", desde: "2026-07-17" },
    { id: "moonshotai/kimi-k2-instruct-0905", desde: "2026-04-15" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", desde: "2026-03-09" },
    { id: "meta-llama/llama-guard-4-12b", desde: "2026-03-05" },
    { id: "moonshotai/kimi-k2-instruct", desde: "2025-10-10" },
    { id: "gemma2-9b-it", desde: "2025-10-08" },
    { id: "deepseek-r1-distill-llama-70b", desde: "2025-10-02" },
    { id: "llama3-70b-8192", desde: "2025-08-30" },
    { id: "llama3-8b-8192", desde: "2025-08-30" },
    { id: "mistral-saba-24b", desde: "2025-07-30" },
    { id: "qwen-qwq-32b", desde: "2025-07-14" },
    { id: "mixtral-8x7b-32768", desde: "2025-03-20" },
  ],
};

export function ehModeloDescontinuado(provider: ProvedorLLM, id: string, agora = Date.now()): boolean {
  const alvo = id.trim().toLowerCase();
  return (MODELOS_DESCONTINUADOS[provider] ?? []).some(
    (item) => item.id === alvo && (!item.desde || agora >= Date.parse(item.desde)),
  );
}

/**
 * Heurística conservadora para tirar da lista o que não conversa em texto
 * (embeddings, rerank, voz, imagem, vídeo, classificadores de segurança...).
 * Prefere errar para o lado de MANTER o modelo: um falso positivo aqui
 * esconderia um modelo bom, enquanto um falso negativo é pego pela verificação.
 */
const PADRAO_NAO_CHAT = new RegExp(
  [
    "embed", "rerank", "reward", "guard", "moderat", "safety", "whisper",
    "(^|[/_.-])(tts|asr|stt)([/_.-]|$)", "transcri", "parakeet", "canary", "riva",
    "(^|[/_.-])clip([/_.-]|$)", "imagen", "(^|[/_.-])veo([/_.-]|$)", "lyria",
    "diffusion", "(^|[/_.-])flux", "dall-e", "(^|[/_.-])sora", "realtime", "aqa",
    "orpheus", "playai", "deplot", "retriever", "(^|[/_.-])bge-", "nemoretriever",
    "-image(-|$)", "image-generation", "native-audio", "(^|[/_.-])live([/_.-]|$)",
    "(^|[/_.-])parse([/_.-]|$)", "compound",
  ].join("|"),
  "i",
);

export function ehModeloDeTexto(id: string): boolean {
  return !PADRAO_NAO_CHAT.test(id);
}

export const CATALOGO_MODELOS: ConfiguracaoModelo[] = [
  { id: "gpt-5", label: "GPT-5", provider: ProviderId.OPENAI, family: "GPT", capabilities: { supportsReasoning: true } },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: ProviderId.OPENAI, family: "GPT", capabilities: { supportsReasoning: true } },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: ProviderId.ANTHROPIC, family: "Claude", capabilities: { supportsReasoning: true } },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: ProviderId.ANTHROPIC, family: "Claude", capabilities: { supportsReasoning: true } },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: ProviderId.GEMINI, family: "Gemini", capabilities: { supportsReasoning: true } },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: ProviderId.GEMINI, family: "Gemini", capabilities: { supportsReasoning: true } },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: ProviderId.GEMINI, family: "Gemini", capabilities: { supportsReasoning: true } },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: ProviderId.DEEPSEEK, family: "DeepSeek", capabilities: { supportsReasoning: false } },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner", provider: ProviderId.DEEPSEEK, family: "DeepSeek", capabilities: { supportsReasoning: true } },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra", provider: ProviderId.NVIDIA, family: "Nemotron", capabilities: { supportsReasoning: true } },
  { id: "moonshotai/kimi-k3", label: "Kimi K3", provider: ProviderId.NVIDIA, family: "Kimi", capabilities: { supportsReasoning: true } },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", provider: ProviderId.GROQ, family: "GPT-OSS", capabilities: { supportsReasoning: true } },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (preview)", provider: ProviderId.GROQ, family: "Qwen", capabilities: { supportsReasoning: true }, preview: true },
];

export const rotuloDoProvedor: Record<ProvedorLLM, string> = {
  [ProviderId.OPENAI]: "OpenAI",
  [ProviderId.ANTHROPIC]: "Anthropic",
  [ProviderId.GEMINI]: "Gemini",
  [ProviderId.DEEPSEEK]: "DeepSeek",
  [ProviderId.NVIDIA]: "NVIDIA NIM",
  [ProviderId.GROQ]: "Groq",
};

export function modelosDoCatalogo(provider: ProvedorLLM): ConfiguracaoModelo[] {
  return CATALOGO_MODELOS.filter((modelo) => modelo.provider === provider);
}

export function validarCatalogoDeModelos(): string[] {
  const ids = new Set<string>();
  const erros: string[] = [];
  for (const modelo of CATALOGO_MODELOS) {
    const chave = `${modelo.provider}:${modelo.id}`;
    if (!(modelo.provider in rotuloDoProvedor)) erros.push(`Provedor inválido: ${modelo.provider}`);
    if (ids.has(chave)) erros.push(`Modelo duplicado: ${chave}`);
    ids.add(chave);
  }
  return erros;
}

export function chaveDoModelo(modelo: Pick<ConfiguracaoModelo, "provider" | "id">): string {
  return `${modelo.provider}:${modelo.id}`;
}

export function separarChaveDoModelo(chave: string): { provider: ProvedorLLM; id: string } | undefined {
  const indice = chave.indexOf(":");
  if (indice <= 0) return undefined;
  const provider = chave.slice(0, indice) as ProvedorLLM;
  if (!(provider in rotuloDoProvedor)) return undefined;
  return { provider, id: chave.slice(indice + 1) };
}
