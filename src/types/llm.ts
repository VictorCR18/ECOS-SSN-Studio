// src/types/llm.ts
// Tipos relacionados à integração com provedores de LLM.

import type { EsforcoGeracao, EstrategiaPrompt, ProvedorLLM } from "./ssn";

/** Um modelo concreto oferecido por um provedor (ex.: "qwen/qwen3.8-27b" via Groq). */
export interface DefinicaoModeloLLM {
  id: string;
  provedor: ProvedorLLM;
  rotulo: string;
  /** Curto texto explicando o desempenho relatado no TCC para este modelo. */
  notaDesempenho?: string;
}

export const MODELOS_LLM: DefinicaoModeloLLM[] = [
  {
    id: "gemini-3.5-flash",
    provedor: "gemini",
    rotulo: "Gemini 3.5 Flash",
    notaDesempenho: "Ampla janela de contexto (1M tokens); bom custo-benefício geral.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    provedor: "nvidia",
    rotulo: "Nemotron 3 Ultra",
    notaDesempenho:
      "Maior salto de desempenho entre G1→G2 no experimento; recomendado para G2/G3.",
  },
  {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    provedor: "nvidia",
    rotulo: "DeepSeek V4 Pro",
    notaDesempenho: "Código aberto, otimizado para contextos extensos.",
  },
  {
    id: "moonshotai/kimi-k3",
    provedor: "nvidia",
    rotulo: "Kimi K3",
    notaDesempenho: "Sempre raciocina (\"always reasons\"); não permite desligar o thinking.",
  },
  {
    id: "openai/gpt-oss-120b",
    provedor: "groq",
    rotulo: "GPT-OSS 120B",
    notaDesempenho: "Modelo de raciocínio; não aceita reasoning_effort=off.",
  },
  {
    id: "qwen/qwen3.8-27b",
    provedor: "groq",
    rotulo: "Qwen 3.8",
    notaDesempenho: "Substituto atual do Qwen usado no experimento, disponibilizado pela Groq.",
  },
];

export function definicaoDoModelo(id: string): DefinicaoModeloLLM | undefined {
  return MODELOS_LLM.find((m) => m.id === id);
}

export function modelosDoProvedor(provedor: ProvedorLLM): DefinicaoModeloLLM[] {
  return MODELOS_LLM.filter((m) => m.provedor === provedor);
}

/** Chaves de API mantidas apenas em memória/localStorage do navegador do usuário. */
export interface ChavesApi {
  gemini: string;
  nvidia: string;
  groq: string;
}

export interface ParametrosGeracao {
  ecos: string;
  descricao: string;
  estrategia: EstrategiaPrompt;
  esforco: EsforcoGeracao;
  modeloId: string;
  temperatura: number;
}

export interface RespostaLLM {
  textoBruto: string;
  duracaoMs: number;
  tentativas: number;
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
