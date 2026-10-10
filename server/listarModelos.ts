// server/listarModelos.ts
//
// Lista os modelos de TEXTO que cada provedor diz servir para a chave informada.
//
// Pontos que importam (e que a versão anterior errava):
//  - Gemini: a chave vai no cabeçalho `x-goog-api-key`. Mandar `Authorization: Bearer
//    <chave>` junto com `?key=` faz a API do Google tratar a chave como token OAuth e
//    recusar (401), derrubando a listagem inteira para o catálogo fixo. Além disso a
//    resposta é paginada (50 por página por padrão) — sem seguir `nextPageToken`
//    modelos ficam de fora.
//  - Groq: a resposta traz `active`; modelos inativos não devem ser oferecidos.
//  - NVIDIA: `/v1/models` mistura chat com embeddings/rerank/voz/imagem e ainda lista
//    modelos já aposentados. Aqui tiramos o que obviamente não é chat e o que se sabe
//    descontinuado; o resto é confirmado pela sonda (`verificarModelo`).
//  - Todos: IDs que são UUID (funções internas) e modelos que não são de texto saem.

import { ehIdDeModeloUtilizavel, ehModeloDeTexto, ehModeloDescontinuado } from "../src/data/modelCatalog";
import { ProviderId } from "../src/data/providerIds";
import type { ProvedorLLM } from "../src/types/ssn";
import type { ModeloListado } from "../src/types/llm";

const TIMEOUT_MS = 20_000;
const MAX_PAGINAS_GEMINI = 10;

/** Falha ao falar com o provedor, com o status HTTP para o endpoint decidir a resposta. */
export class ErroListagem extends Error {
  constructor(
    mensagem: string,
    public readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroListagem";
  }
}

async function buscarJSON<T>(url: string, headers: Record<string, string>): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (erro) {
    throw new ErroListagem(`Falha de rede ao consultar o provedor: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  if (!resposta.ok) {
    throw new ErroListagem(`O provedor respondeu HTTP ${resposta.status}.`, resposta.status);
  }
  return (await resposta.json()) as T;
}

interface RespostaGemini {
  models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
}

async function listarGemini(apiKey: string): Promise<ModeloListado[]> {
  const modelos: ModeloListado[] = [];
  let token: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS_GEMINI; pagina++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (token) url.searchParams.set("pageToken", token);
    const dados = await buscarJSON<RespostaGemini>(url.toString(), { "x-goog-api-key": apiKey });
    for (const modelo of dados.models ?? []) {
      const id = modelo.name?.replace(/^models\//, "");
      if (id && modelo.supportedGenerationMethods?.includes("generateContent")) {
        modelos.push({ id, label: modelo.displayName });
      }
    }
    token = dados.nextPageToken;
    if (!token) break;
  }
  return modelos;
}

interface RespostaOpenAICompativel {
  data?: { id?: string; active?: boolean }[];
}

async function listarCompativelComOpenAI(url: string, apiKey: string): Promise<ModeloListado[]> {
  const dados = await buscarJSON<RespostaOpenAICompativel>(url, { Authorization: `Bearer ${apiKey}` });
  return (dados.data ?? []).flatMap((modelo) =>
    modelo.id && modelo.active !== false ? [{ id: modelo.id, label: modelo.id }] : [],
  );
}

async function listarAnthropic(apiKey: string): Promise<ModeloListado[]> {
  const dados = await buscarJSON<{ data?: { id?: string; display_name?: string }[] }>(
    "https://api.anthropic.com/v1/models?limit=1000",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  );
  return (dados.data ?? []).flatMap((m) => (m.id ? [{ id: m.id, label: m.display_name ?? m.id }] : []));
}

const PADRAO_CHAT_OPENAI = /^(gpt-|chatgpt-|o\d)/i;

export interface ResultadoListagemServidor {
  modelos: ModeloListado[];
  /** Quantos modelos o provedor devolveu (antes de qualquer filtro nosso). */
  total: number;
  /** O que foi descartado e por quê — para o usuário poder conferir o que não está aparecendo. */
  ignorados: { naoTexto: string[]; descontinuados: string[] };
}

export async function listarModelosDoProvedor(provider: ProvedorLLM, apiKey: string): Promise<ResultadoListagemServidor> {
  let bruto: ModeloListado[];
  switch (provider) {
    case ProviderId.GEMINI:
      bruto = await listarGemini(apiKey);
      break;
    case ProviderId.ANTHROPIC:
      bruto = await listarAnthropic(apiKey);
      break;
    case ProviderId.NVIDIA:
      bruto = await listarCompativelComOpenAI("https://integrate.api.nvidia.com/v1/models", apiKey);
      break;
    case ProviderId.GROQ:
      bruto = await listarCompativelComOpenAI("https://api.groq.com/openai/v1/models", apiKey);
      break;
    case ProviderId.DEEPSEEK:
      bruto = await listarCompativelComOpenAI("https://api.deepseek.com/models", apiKey);
      break;
    case ProviderId.OPENAI:
      bruto = (await listarCompativelComOpenAI("https://api.openai.com/v1/models", apiKey)).filter((m) =>
        PADRAO_CHAT_OPENAI.test(m.id),
      );
      break;
    default: {
      const _exaustivo: never = provider;
      throw new ErroListagem(`Provedor desconhecido: ${String(_exaustivo)}`);
    }
  }

  const vistos = new Set<string>();
  const unicos = bruto.filter((m) => ehIdDeModeloUtilizavel(m.id) && (vistos.has(m.id) ? false : (vistos.add(m.id), true)));

  const ignorados = { naoTexto: [] as string[], descontinuados: [] as string[] };
  const modelos = unicos.filter((m) => {
    if (ehModeloDescontinuado(provider, m.id)) return ignorados.descontinuados.push(m.id), false;
    if (!ehModeloDeTexto(m.id)) return ignorados.naoTexto.push(m.id), false;
    return true;
  });
  modelos.sort((a, b) => a.id.localeCompare(b.id));
  ignorados.naoTexto.sort();
  ignorados.descontinuados.sort();
  return { modelos, total: unicos.length, ignorados };
}
