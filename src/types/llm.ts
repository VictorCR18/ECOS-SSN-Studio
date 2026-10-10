// src/types/llm.ts
// Tipos relacionados à integração com provedores de LLM.

import {
  modelosDoCatalogo,
  separarChaveDoModelo,
  type ConfiguracaoModelo,
} from "../data/modelCatalog";
import type { EsforcoGeracao, EstrategiaPrompt } from "./ssn";

export type { ConfiguracaoModelo as DefinicaoModeloLLM };
type DefinicaoModeloLLM = ConfiguracaoModelo;

export function definicaoDoModelo(chave: string): DefinicaoModeloLLM | undefined {
  const modelo = separarChaveDoModelo(chave);
  if (!modelo) return undefined;
  return {
    id: modelo.id,
    label: modelo.id,
    provider: modelo.provider,
    family: "Outros modelos",
    capabilities: { supportsReasoning: false },
  };
}

export function modelosDoProvedor(provedor: DefinicaoModeloLLM["provider"]): DefinicaoModeloLLM[] {
  return modelosDoCatalogo(provedor);
}

/** Chaves de API mantidas apenas em memória/localStorage do navegador do usuário. */
export interface ChavesApi {
  openai: string;
  anthropic: string;
  gemini: string;
  deepseek: string;
  nvidia: string;
  groq: string;
}

/** Configuração de qualquer endpoint compatível com OpenAI Chat Completions. */
export interface ConfiguracaoLLMPersonalizada {
  nome: string;
  endpoint: string;
  modelo: string;
}

export interface ParametrosGeracao {
  ecos: string;
  descricao: string;
  estrategia: EstrategiaPrompt;
  esforco: EsforcoGeracao;
  modeloId: string;
  temperatura: number;
  configuracaoPersonalizada?: ConfiguracaoLLMPersonalizada;
}

export interface ErroLimiteUso {
  code: "RATE_LIMIT" | "QUOTA_EXCEEDED" | "OVERLOADED";
  provider: string;
  model: string;
  retryAfterSeconds?: number;
  message: string;
}

export interface RespostaLLM {
  textoBruto: string;
  duracaoMs: number;
  tentativas: number;
  /** Observação para o usuário (ex.: o provedor rejeitou os parâmetros de raciocínio e a chamada foi refeita sem eles). */
  aviso?: string;
}

/** O provedor não serve mais o modelo (404/410, "end of life", sem acesso na conta...). */
export interface ErroModeloIndisponivel {
  code: "MODEL_UNAVAILABLE";
  provider: string;
  /** Chave composta `provedor:id`, a mesma usada pelo seletor de modelos. */
  model: string;
  message: string;
}

/**
 * Resultado de uma chamada mínima de teste a um modelo.
 *  - ok: o provedor respondeu (inclui 429, que prova que o modelo existe);
 *  - indisponivel: 404/410/"deprecated"/sem acesso — não vale a pena oferecer;
 *  - desconhecido: falha transitória (timeout, 5xx, rede); não dá para concluir.
 */
export interface ResultadoVerificacao {
  estado: "ok" | "indisponivel" | "desconhecido";
  status?: number;
  motivo?: string;
}

/** Resposta de `/api/modelos`. */
export interface ModeloListado {
  id: string;
  label?: string;
}

/** Erro de alto nível lançado pelo llmService, já traduzido para o usuário final. */
export class LLMServiceError extends Error {
  constructor(
    message: string,
    public readonly causaOriginal?: unknown,
  ) {
    super(message);
    this.name = "LLMServiceError";
  }
}
