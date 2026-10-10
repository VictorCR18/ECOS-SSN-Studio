// server/providers/tipos.ts
//
// Contrato comum a todos os provedores + erros compartilhados.

import type { ParametrosEsforco } from "../../src/services/effortService";

export interface ChamadaProvedorParams {
  apiKey: string;
  modeloId: string;
  prompt: string;
  temperatura: number;
  esforco: ParametrosEsforco;
  endpoint?: string;
  /** Teto de tokens de saída. Quando ausente, cada provedor usa o seu padrão. */
  maxTokens?: number;
  /**
   * Quando verdadeiro, o provedor NÃO envia parâmetros opcionais de
   * raciocínio/amostragem (thinking, reasoning_effort, temperature...). Usado
   * para refazer a chamada depois que o provedor rejeita esses parâmetros.
   */
  semOpcionais?: boolean;
}

/**
 * O provedor respondeu (HTTP 200), mas sem texto final — tipicamente porque o
 * orçamento de tokens foi gasto no raciocínio. É retentável, e numa chamada de
 * teste prova que o modelo existe.
 */
export class RespostaVaziaError extends Error {
  constructor(mensagem = "O modelo respondeu sem conteúdo final.") {
    super(mensagem);
    this.name = "RespostaVaziaError";
  }
}
