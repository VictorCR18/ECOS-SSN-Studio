// server/llmService.ts
//
// Orquestra a geração de um modelo SSN no backend: monta o prompt
// (reaproveitando src/services/promptBuilder.ts), resolve os parâmetros de
// esforço (src/services/effortService.ts), despacha para o provedor correto
// (server/providers/*) e aplica retentativas com backoff exponencial para
// falhas transitórias do provedor — mesma lógica de src/services/llmService.ts, agora rodando no
// servidor (sem CORS, com as chaves de API fora do bundle do navegador).

import type {
  ChavesApi,
  ErroModeloIndisponivel,
  ParametrosGeracao,
  RespostaLLM,
  ResultadoVerificacao,
} from "../src/types/llm";
import { LLMServiceError, definicaoDoModelo } from "../src/types/llm";
import { construirPrompt } from "../src/services/promptBuilder";
import { obterParametrosEsforco } from "../src/services/effortService";
import { extrairJSON } from "../src/utils/jsonExtractor";
import { validarEstrutura } from "../src/utils/ssnValidator";
import type { ProvedorLLM } from "../src/types/ssn";
import { chamarGemini } from "./providers/gemini";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./providers/tipos";
import { chamarNvidia } from "./providers/nvidia";
import { chamarGroq } from "./providers/groq";
import { chamarOpenAI } from "./providers/openai";
import { chamarAnthropic } from "./providers/anthropic";
import { chamarDeepSeek } from "./providers/deepseek";
import { separarChaveDoModelo, type ConfiguracaoModelo } from "../src/data/modelCatalog";
import { ProviderId } from "../src/data/providerIds";

const MAX_TENTATIVAS = 8;
const ATRASO_BASE_MS = 1500;
const ATRASO_MAXIMO_MS = 15000;

class RespostaSSNIncompletaError extends Error {
  constructor() {
    super("A resposta da LLM não contém um modelo SSN completo.");
    this.name = "RespostaSSNIncompletaError";
  }
}

export interface DetalheErroLimiteUso {
  code: "RATE_LIMIT" | "QUOTA_EXCEEDED" | "OVERLOADED";
  provider: ProvedorLLM;
  model: string;
  retryAfterSeconds?: number;
  message: string;
}

export class ErroLimiteUso extends Error {
  constructor(public readonly detalhe: DetalheErroLimiteUso) {
    super(detalhe.message);
    this.name = "ErroLimiteUso";
  }
}

export class ErroModeloIndisponivelError extends Error {
  constructor(public readonly detalhe: ErroModeloIndisponivel) {
    super(detalhe.message);
    this.name = "ErroModeloIndisponivelError";
  }
}

export function statusHttpDoErro(erro: unknown): number | undefined {
  if (typeof erro !== "object" || erro === null) return undefined;
  const comoRegistro = erro as Record<string, unknown>;
  if (typeof comoRegistro.status === "number") return comoRegistro.status;
  if (typeof comoRegistro.code === "number") return comoRegistro.code;
  const resposta = comoRegistro.response as { status?: number } | undefined;
  if (typeof resposta?.status === "number") return resposta.status;
  const causa = comoRegistro.cause;
  return statusHttpDoErro(causa);
}

function retryAfterDoErro(erro: unknown): number | undefined {
  if (typeof erro !== "object" || erro === null) return undefined;
  const registro = erro as Record<string, unknown>;
  const headers = registro.headers as Record<string, unknown> | undefined;
  const resposta = registro.response as Record<string, unknown> | undefined;
  const respostaHeaders = resposta?.headers as Record<string, unknown> | undefined;
  const headerObjeto = headers as { get?: (nome: string) => string | null } | undefined;
  const respostaHeaderObjeto = respostaHeaders as { get?: (nome: string) => string | null } | undefined;
  const valor = headerObjeto?.get?.("retry-after") ?? respostaHeaderObjeto?.get?.("retry-after") ??
    headers?.["retry-after"] ?? headers?.["Retry-After"] ??
    respostaHeaders?.["retry-after"] ?? respostaHeaders?.["Retry-After"];
  const segundos = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : undefined;
}

export function mensagemDoErroDoProvedor(erro: unknown): string {
  if (!(erro instanceof Error)) return "";
  const registro = erro as Error & { error?: { code?: string; message?: string } };
  return `${erro.message} ${registro.error?.code ?? ""} ${registro.error?.message ?? ""}`.toLowerCase();
}

/**
 * Frases que, DENTRO de um 4xx, indicam que o problema é o modelo (aposentado,
 * inexistente, sem acesso na conta) e não a requisição. Exigimos o contexto
 * "model" porque erros de parâmetro também usam "deprecated" (ex.: `max_tokens
 * is deprecated`) e não podem esconder um modelo que funciona.
 */
const PADRAO_MODELO_INDISPONIVEL = new RegExp(
  [
    "model[\\s\\S]{0,120}?(?:end of life|deprecated|decommission|no longer (?:available|supported|served)|not found|does not exist|retired|discontinued|removed)",
    "(?:end of life|deprecated|decommission)[\\s\\S]{0,60}?model",
    "not found for account",
    "unknown model",
    "invalid model",
    "model_not_found",
    "model_decommissioned",
    "model_permission",
    "degraded",
  ].join("|"),
  "i",
);

/** Verdadeiro quando o erro significa "este modelo não está mais disponível para esta chave". */
export function modeloIndisponivelPeloErro(erro: unknown): boolean {
  const status = statusHttpDoErro(erro);
  if (status === 404 || status === 410) return true;
  if (status === undefined || status < 400 || status >= 500) return false;
  if (status === 401 || status === 408 || status === 429) return false;
  return PADRAO_MODELO_INDISPONIVEL.test(mensagemDoErroDoProvedor(erro));
}

/** O provedor recusou um parâmetro opcional (raciocínio, temperatura...) — dá para tentar de novo sem ele. */
export function rejeitouParametroOpcional(erro: unknown): boolean {
  const status = statusHttpDoErro(erro);
  if (status !== 400 && status !== 422) return false;
  if (modeloIndisponivelPeloErro(erro)) return false;
  return /reasoning|thinking|chat_template|enable_thinking|thinking_?level|thinking_?budget|budget|temperature|unsupported (?:value|parameter)|unrecognized (?:request )?argument|extra inputs|unknown (?:field|parameter)/i.test(
    mensagemDoErroDoProvedor(erro),
  );
}

function resumirMensagemDoErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.replace(/\s+/g, " ").slice(0, 300);
}

function criarErroLimite(erro: unknown, provider: ProvedorLLM, model: string): DetalheErroLimiteUso | undefined {
  const status = statusHttpDoErro(erro);
  if (status !== 429 && status !== 503) return undefined;
  const mensagem = mensagemDoErroDoProvedor(erro);
  const quota = /insufficient[_ -]?quota|quota exceeded|daily quota|billing|exceeded your current quota/.test(mensagem);
  const code = quota ? "QUOTA_EXCEEDED" : status === 503 ? "OVERLOADED" : "RATE_LIMIT";
  return {
    code,
    provider,
    model,
    retryAfterSeconds: retryAfterDoErro(erro),
    message: quota
      ? "A cota deste provedor foi esgotada."
      : code === "OVERLOADED"
        ? "O provedor está sobrecarregado."
        : "O limite de requisições deste provedor foi atingido.",
  };
}

function ehErroRetentavel(erro: unknown): boolean {
  if (erro instanceof ErroLimiteUso) return false;
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
    erro instanceof RespostaVaziaError ||
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
  if (tentativa === 1 || params.semOpcionais || params.modeloId !== "qwen/qwen3.8-27b") return params;

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
    case ProviderId.GEMINI:
      return chamarGemini(params);
    case ProviderId.NVIDIA:
      return chamarNvidia(params);
    case ProviderId.GROQ:
      return chamarGroq(params);
    case ProviderId.OPENAI:
      return chamarOpenAI(params);
    case ProviderId.ANTHROPIC:
      return chamarAnthropic(params);
    case ProviderId.DEEPSEEK:
      return chamarDeepSeek(params);
    default: {
      const _exaustivo: never = provedor;
      throw new Error(`Provedor desconhecido: ${_exaustivo}`);
    }
  }
}

async function chamarComRetry(
  provedor: ProvedorLLM,
  params: ChamadaProvedorParams,
): Promise<{ texto: string; tentativas: number; aviso?: string }> {
  let ultimoErro: unknown;
  let corrente = params;
  let aviso: string | undefined;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const texto = await despacharParaProvedor(provedor, parametrosDaTentativa(corrente, tentativa));
      validarRespostaSSN(texto);
      return { texto, tentativas: tentativa, aviso };
    } catch (erro) {
      ultimoErro = erro;
      const chaveModelo = `${provedor}:${params.modeloId}`;
      const limite = criarErroLimite(erro, provedor, chaveModelo);
      if (limite) {
        if (
          tentativa === 1 &&
          limite.code !== "QUOTA_EXCEEDED" &&
          limite.retryAfterSeconds !== undefined &&
          limite.retryAfterSeconds <= 5
        ) {
          await aguardar(limite.retryAfterSeconds * 1000);
          continue;
        }
        throw new ErroLimiteUso(limite);
      }

      // 404/410/"end of life": não adianta tentar de novo, o modelo saiu do ar.
      if (modeloIndisponivelPeloErro(erro)) {
        throw new ErroModeloIndisponivelError({
          code: "MODEL_UNAVAILABLE",
          provider: provedor,
          model: chaveModelo,
          message: resumirMensagemDoErro(erro),
        });
      }

      // O provedor recusou o parâmetro de raciocínio/temperatura: refaz uma vez sem eles.
      if (!corrente.semOpcionais && rejeitouParametroOpcional(erro)) {
        console.warn(`[llmService] ${chaveModelo} rejeitou parâmetros opcionais; repetindo sem eles.`, resumirMensagemDoErro(erro));
        corrente = { ...corrente, esforco: {}, semOpcionais: true };
        aviso =
          "O provedor não aceitou os parâmetros de raciocínio/temperatura deste modelo; " +
          "a geração foi refeita com os padrões do modelo (o esforço escolhido não foi aplicado).";
        continue;
      }

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
  if (erro instanceof ErroLimiteUso) return erro.detalhe.message;
  if (erro instanceof ErroModeloIndisponivelError) {
    return "Este modelo não está mais disponível no provedor (descontinuado ou sem acesso para a sua chave).";
  }
  const status = statusHttpDoErro(erro);
  if (status === 401 || status === 403) {
    return "Chave de API inválida ou sem permissão para este modelo. Verifique a chave informada no Painel de Configurações.";
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
  if (erro instanceof RespostaVaziaError || erro instanceof RespostaSSNIncompletaError) {
    return "A LLM não produziu um modelo SSN completo após várias tentativas. Tente novamente com esforço de geração baixo.";
  }
  if (erro instanceof Error) return erro.message;
  return "Falha desconhecida ao chamar a LLM.";
}

export async function gerarModeloSSN(
  parametros: ParametrosGeracao,
  chaves: ChavesApi,
): Promise<RespostaLLM> {
  const partes = separarChaveDoModelo(parametros.modeloId);
  const definicao: ConfiguracaoModelo | undefined = definicaoDoModelo(parametros.modeloId) ??
    (partes
      ? {
          id: partes.id,
          label: partes.id,
          provider: partes.provider,
          family: "Outros modelos",
          capabilities: { supportsReasoning: false },
        }
      : undefined);
  if (!definicao) {
    throw new LLMServiceError(`Modelo desconhecido: ${parametros.modeloId}`);
  }

  const prompt = construirPrompt(parametros.estrategia, {
    ecos: parametros.ecos,
    descricao: parametros.descricao,
  });
  const esforco = obterParametrosEsforco(parametros.modeloId, parametros.esforco);
  const provedor = definicao.provider;
  const apiKey = chaves[provedor];
  const modeloId = definicao.id;

  const inicio = performance.now();
  try {
    const { texto, tentativas, aviso } = await chamarComRetry(provedor, {
      apiKey,
      modeloId,
      prompt,
      temperatura: parametros.temperatura,
      esforco,
      endpoint: parametros.configuracaoPersonalizada?.endpoint,
    });
    return { textoBruto: texto, duracaoMs: performance.now() - inicio, tentativas, ...(aviso ? { aviso } : {}) };
  } catch (erro) {
    throw new LLMServiceError(mensagemAmigavelDoErro(erro), erro);
  }
}

const TIMEOUT_VERIFICACAO_MS = 25_000;

/**
 * Faz UMA chamada mínima ao modelo para saber se o provedor ainda o serve. A
 * listagem pública não basta: a NVIDIA continua listando modelos aposentados
 * que respondem HTTP 410.
 */
export async function verificarModelo(
  provedor: ProvedorLLM,
  modeloId: string,
  apiKey: string,
): Promise<ResultadoVerificacao> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      despacharParaProvedor(provedor, {
        apiKey,
        modeloId,
        prompt: "Responda apenas com a palavra: ok",
        temperatura: 0,
        esforco: {},
        maxTokens: 64,
        semOpcionais: true,
      }),
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error("timeout na verificação do modelo")), TIMEOUT_VERIFICACAO_MS);
      }),
    ]);
    return { estado: "ok" };
  } catch (erro) {
    const status = statusHttpDoErro(erro);
    const motivo = resumirMensagemDoErro(erro);
    // 200 sem texto (orçamento gasto no raciocínio) e 429 (limite) provam que o modelo existe.
    if (erro instanceof RespostaVaziaError) return { estado: "ok" };
    if (status === 429) {
      // "limit: 0" = a sua chave/plano não tem cota nenhuma para este modelo (ex.: Gemini 2.5 Pro
      // no plano gratuito mostra 0/0 no AI Studio). Listado, mas inutilizável para você.
      if (/limit:\s*0\b/i.test(mensagemDoErroDoProvedor(erro))) {
        return { estado: "indisponivel", status, motivo: "Sem cota para este modelo na sua chave/plano (limite 0)." };
      }
      // Qualquer outro 429 só indica excesso momentâneo: o modelo existe e funciona.
      return { estado: "ok", status, motivo: "Limite de uso atingido, mas o modelo existe." };
    }
    if (modeloIndisponivelPeloErro(erro)) return { estado: "indisponivel", status, motivo };
    if (status === 401) return { estado: "desconhecido", status, motivo: "Chave de API inválida para este provedor." };
    return { estado: "desconhecido", status, motivo };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
