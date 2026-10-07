// server/llmService.ts
//
// Orquestra a geração de um modelo SSN no backend: monta o prompt
// (reaproveitando src/services/promptBuilder.ts), resolve os parâmetros de
// esforço (src/services/effortService.ts), despacha para o provedor correto
// (server/providers/*) e aplica retentativas com backoff exponencial para
// falhas transitórias do provedor — mesma lógica de src/services/llmService.ts, agora rodando no
// servidor (sem CORS, com as chaves de API fora do bundle do navegador).

import type { ChavesApi, ParametrosGeracao, RespostaLLM } from "../src/types/llm";
import { LLMServiceError, MODELO_PERSONALIZADO_ID, definicaoDoModelo } from "../src/types/llm";
import { construirPrompt } from "../src/services/promptBuilder";
import { obterParametrosEsforco } from "../src/services/effortService";
import { extrairJSON } from "../src/utils/jsonExtractor";
import { validarEstrutura } from "../src/utils/ssnValidator";
import type { ProvedorLLM } from "../src/types/ssn";
import { chamarGemini, type ChamadaProvedorParams } from "./providers/gemini";
import { chamarNvidia } from "./providers/nvidia";
import { chamarGroq, RespostaGroqIncompletaError } from "./providers/groq";
import { chamarLLMPersonalizada } from "./providers/custom";

const MAX_TENTATIVAS = 8;
const ATRASO_BASE_MS = 1500;
const ATRASO_MAXIMO_MS = 15000;

class RespostaSSNIncompletaError extends Error {
  constructor() {
    super("A resposta da LLM não contém um modelo SSN completo.");
    this.name = "RespostaSSNIncompletaError";
  }
}

function statusHttpDoErro(erro: unknown): number | undefined {
  if (typeof erro !== "object" || erro === null) return undefined;
  const comoRegistro = erro as Record<string, unknown>;
  if (typeof comoRegistro.status === "number") return comoRegistro.status;
  if (typeof comoRegistro.code === "number") return comoRegistro.code;
  const resposta = comoRegistro.response as { status?: number } | undefined;
  if (typeof resposta?.status === "number") return resposta.status;
  const causa = comoRegistro.cause;
  return statusHttpDoErro(causa);
}

function ehErroRetentavel(erro: unknown): boolean {
  const status = statusHttpDoErro(erro);
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (erro instanceof Error &&
      /timeout|timed out|temporarily unavailable|overloaded|network|fetch failed|socket/i.test(erro.message)) ||
    erro instanceof RespostaGroqIncompletaError ||
    erro instanceof RespostaSSNIncompletaError
  );
}

function validarRespostaSSN(texto: string): void {
  try {
    const resultado = validarEstrutura(extrairJSON(texto));
    if (resultado.erros.length > 0) throw new RespostaSSNIncompletaError();
  } catch (erro) {
    if (erro instanceof RespostaSSNIncompletaError) throw erro;
    throw new RespostaSSNIncompletaError();
  }
}

function parametrosDaTentativa(params: ChamadaProvedorParams, tentativa: number): ChamadaProvedorParams {
  if (tentativa === 1 || params.modeloId !== "qwen/qwen3.8-27b") return params;

  // Nas novas tentativas, reduz o raciocínio para reservar tokens ao JSON final.
  return {
    ...params,
    esforco: {
      ...params.esforco,
      reasoningEffort: "default",
    },
  };
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function despacharParaProvedor(provedor: ProvedorLLM, params: ChamadaProvedorParams): Promise<string> {
  switch (provedor) {
    case "gemini":
      return chamarGemini(params);
    case "nvidia":
      return chamarNvidia(params);
    case "groq":
      return chamarGroq(params);
    case "custom":
      if (!params.endpoint) throw new Error("URL da LLM personalizada não configurada.");
      return chamarLLMPersonalizada({ ...params, endpoint: params.endpoint });
    default: {
      const _exaustivo: never = provedor;
      throw new Error(`Provedor desconhecido: ${_exaustivo}`);
    }
  }
}

async function chamarComRetry(
  provedor: ProvedorLLM,
  params: ChamadaProvedorParams,
): Promise<{ texto: string; tentativas: number }> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const texto = await despacharParaProvedor(provedor, parametrosDaTentativa(params, tentativa));
      validarRespostaSSN(texto);
      return { texto, tentativas: tentativa };
    } catch (erro) {
      ultimoErro = erro;
      const retentavel = ehErroRetentavel(erro);
      if (!retentavel || tentativa === MAX_TENTATIVAS) break;

      const atraso = Math.min(
        ATRASO_MAXIMO_MS,
        ATRASO_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 500,
      );
      console.warn(
        `[llmService] Erro retentável (tentativa ${tentativa}/${MAX_TENTATIVAS}). Aguardando ${Math.round(atraso)}ms.`,
        erro instanceof Error ? erro.message : erro,
      );
      await aguardar(atraso);
    }
  }

  throw ultimoErro;
}

function mensagemAmigavelDoErro(erro: unknown): string {
  const status = statusHttpDoErro(erro);
  if (status === 401 || status === 403) {
    return "Chave de API inválida ou sem permissão para este modelo. Verifique as variáveis de ambiente do servidor (.env) ou a chave informada no Painel de Configurações.";
  }
  if (status === 429) {
    return "O provedor retornou 'limite de taxa excedido' (429) mesmo após retentativas. Tente novamente em instantes.";
  }
  if (status === 503) {
    return "O provedor retornou 'serviço sobrecarregado' (503) mesmo após retentativas. Tente novamente em instantes.";
  }
  if (status === 504) {
    return "O provedor demorou além do limite (504) mesmo após retentativas. Tente novamente em instantes.";
  }
  if (status === 408 || status === 500 || status === 502) {
    return `O provedor retornou um erro temporário (${status}) mesmo após retentativas. Tente novamente em instantes.`;
  }
  if (erro instanceof RespostaGroqIncompletaError || erro instanceof RespostaSSNIncompletaError) {
    return "A LLM não produziu um modelo SSN completo após várias tentativas. Tente novamente com esforço de geração baixo.";
  }
  if (erro instanceof Error) return erro.message;
  return "Falha desconhecida ao chamar a LLM.";
}

export async function gerarModeloSSN(
  parametros: ParametrosGeracao,
  chaves: ChavesApi,
): Promise<RespostaLLM> {
  const definicao = definicaoDoModelo(parametros.modeloId);
  const personalizada = parametros.modeloId === MODELO_PERSONALIZADO_ID;
  if (!definicao && !personalizada) {
    throw new LLMServiceError(`Modelo desconhecido: ${parametros.modeloId}`);
  }
  if (personalizada && (!parametros.configuracaoPersonalizada?.endpoint || !parametros.configuracaoPersonalizada.modelo)) {
    throw new LLMServiceError("Configure a URL base e o ID do modelo personalizado antes de gerar.");
  }

  const prompt = construirPrompt(parametros.estrategia, {
    ecos: parametros.ecos,
    descricao: parametros.descricao,
  });
  const esforco = obterParametrosEsforco(parametros.configuracaoPersonalizada?.modelo ?? parametros.modeloId, parametros.esforco);
  const provedor = personalizada ? "custom" : (definicao?.provedor ?? "custom");
  const apiKey = chaves[provedor];
  const modeloId = personalizada ? parametros.configuracaoPersonalizada!.modelo : parametros.modeloId;

  const inicio = performance.now();
  try {
    const { texto, tentativas } = await chamarComRetry(provedor, {
      apiKey,
      modeloId,
      prompt,
      temperatura: parametros.temperatura,
      esforco,
      endpoint: parametros.configuracaoPersonalizada?.endpoint,
    });
    return { textoBruto: texto, duracaoMs: performance.now() - inicio, tentativas };
  } catch (erro) {
    throw new LLMServiceError(mensagemAmigavelDoErro(erro), erro);
  }
}
