// src/services/llmService.ts
//
// Cliente HTTP fino: o frontend NÃO chama mais as APIs das LLMs diretamente
// (Gemini/NVIDIA NIM/Groq) — quem faz isso agora é o backend (ver
// server/llmService.ts). Motivo: a NVIDIA NIM (e potencialmente a Groq) não
// envia cabeçalhos CORS, então o navegador bloqueia a chamada direta; além
// disso, manter as chaves de API só no servidor é mais seguro do que expô-las
// no bundle do cliente. Este módulo só monta a requisição para o endpoint
// /api/gerar-modelo (servido pelo mesmo host em produção, ou via proxy do
// Vite em desenvolvimento — ver vite.config.ts) e devolve a resposta bruta,
// que o ecosStore continua extraindo/validando normalmente.

import type { ChavesApi, ErroLimiteUso, ErroModeloIndisponivel, ParametrosGeracao, RespostaLLM } from "@/types/llm";
import { LLMServiceError } from "@/types/llm";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

interface ErroApi {
  erro?: string;
  code?: ErroLimiteUso["code"] | ErroModeloIndisponivel["code"];
  provider?: string;
  model?: string;
  retryAfterSeconds?: number;
  message?: string;
}

export async function gerarModeloSSN(
  parametros: ParametrosGeracao,
  chaves: ChavesApi,
  signal?: AbortSignal,
): Promise<RespostaLLM> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}/api/gerar-modelo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ecos: parametros.ecos,
        descricao: parametros.descricao,
        estrategia: parametros.estrategia,
        esforco: parametros.esforco,
        modeloId: parametros.modeloId,
        temperatura: parametros.temperatura,
        configuracaoPersonalizada: parametros.configuracaoPersonalizada,
        // As chaves são enviadas somente nesta requisição e nunca persistidas pelo backend.
        chaves: {
          ...(chaves.openai ? { openai: chaves.openai } : {}),
          ...(chaves.anthropic ? { anthropic: chaves.anthropic } : {}),
          ...(chaves.gemini ? { gemini: chaves.gemini } : {}),
          ...(chaves.deepseek ? { deepseek: chaves.deepseek } : {}),
          ...(chaves.nvidia ? { nvidia: chaves.nvidia } : {}),
          ...(chaves.groq ? { groq: chaves.groq } : {}),
        },
      }),
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") {
      throw erro;
    }
    throw new LLMServiceError(
      "Não foi possível conectar ao backend da aplicação. Verifique se ele está rodando " +
        "(`npm run dev` inicia o frontend e a API juntos; ou `npm run dev:server` em outro terminal).",
    );
  }

  let dados: (RespostaLLM & ErroApi) | ErroApi;
  try {
    dados = await resposta.json();
  } catch {
    throw new LLMServiceError(`O backend respondeu com um corpo inválido (HTTP ${resposta.status}).`);
  }

  if (!resposta.ok) {
    if (dados.code === "MODEL_UNAVAILABLE") {
      throw new LLMServiceError(dados.message ?? "O modelo não está mais disponível no provedor.", {
        code: "MODEL_UNAVAILABLE",
        provider: dados.provider ?? "",
        model: dados.model ?? parametros.modeloId,
        message: dados.message ?? "O modelo não está mais disponível no provedor.",
      } satisfies ErroModeloIndisponivel);
    }
    if (dados.code === "RATE_LIMIT" || dados.code === "QUOTA_EXCEEDED" || dados.code === "OVERLOADED") {
      throw new LLMServiceError(dados.message ?? "O provedor atingiu um limite de uso.", {
        code: dados.code,
        provider: dados.provider ?? "",
        model: dados.model ?? parametros.modeloId,
        retryAfterSeconds: dados.retryAfterSeconds,
        message: dados.message ?? "O provedor atingiu um limite de uso.",
      } satisfies ErroLimiteUso);
    }
    throw new LLMServiceError(dados.erro ?? `Falha ao gerar o modelo (HTTP ${resposta.status}).`);
  }

  return dados as RespostaLLM;
}
