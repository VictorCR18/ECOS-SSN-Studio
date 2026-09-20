// server/llmService.ts
//
// Orquestra a geração de um modelo SSN no backend: monta o prompt
// (reaproveitando src/services/promptBuilder.ts), resolve os parâmetros de
// esforço (src/services/effortService.ts), despacha para o provedor correto
// (server/providers/*) e aplica retentativas com backoff exponencial para
// 429/503 — mesma lógica de src/services/llmService.ts, agora rodando no
// servidor (sem CORS, com as chaves de API fora do bundle do navegador).

import type { ChavesApi, ParametrosGeracao, RespostaLLM } from "../src/types/llm";
import { LLMServiceError, definicaoDoModelo } from "../src/types/llm";
import { construirPrompt } from "../src/services/promptBuilder";
import { obterParametrosEsforco } from "../src/services/effortService";
import { extrairJSON } from "../src/utils/jsonExtractor";
import { validarEstrutura } from "../src/utils/ssnValidator";
import type { ProvedorLLM } from "../src/types/ssn";
import { chamarGemini, type ChamadaProvedorParams } from "./providers/gemini";
import { chamarNvidia } from "./providers/nvidia";
import { chamarGroq, RespostaGroqIncompletaError } from "./providers/groq";

const MAX_TENTATIVAS = 4;
const ATRASO_BASE_MS = 1500;

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
  return resposta?.status;
}

function ehErroRetentavel(erro: unknown): boolean {
  const status = statusHttpDoErro(erro);
  return (
    status === 429 ||
    status === 503 ||
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

      const atraso = ATRASO_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 500;
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
  if (!definicao) {
    throw new LLMServiceError(`Modelo desconhecido: ${parametros.modeloId}`);
  }

  const prompt = construirPrompt(parametros.estrategia, {
    ecos: parametros.ecos,
    descricao: parametros.descricao,
  });
  const esforco = obterParametrosEsforco(parametros.modeloId, parametros.esforco);
  const apiKey = chaves[definicao.provedor];

  const inicio = performance.now();
  try {
    const { texto, tentativas } = await chamarComRetry(definicao.provedor, {
      apiKey,
      modeloId: parametros.modeloId,
      prompt,
      temperatura: parametros.temperatura,
      esforco,
    });
    return { textoBruto: texto, duracaoMs: performance.now() - inicio, tentativas };
  } catch (erro) {
    throw new LLMServiceError(mensagemAmigavelDoErro(erro), erro);
  }
}
