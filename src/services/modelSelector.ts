// src/services/modelSelector.ts
//
// Seleção automática do modelo mais adequado por estratégia de prompt
// (G1-G4), conforme a conclusão do TCC de Victor Cavalcante:
//  - G4 (Chain-of-Thought): Qwen obteve o melhor desempenho global,
//    especialmente em precisão de relações;
//  - G3 (Persona + Few-Shot): Nemotron 3 Ultra respondeu melhor à
//    contextualização rica;
//  - G2 (Contexto Estruturado Básico): Nemotron 3 Ultra já alcança um
//    patamar competitivo partindo de um G1 fraco;
//  - G1 (Baseline): qualquer modelo serve; usamos o mesmo de G2/G3 para
//    manter a comparação consistente entre estratégias.
//
// Esta preferência só define o padrão inicial; o store sempre valida a
// disponibilidade do provedor antes de aplicá-la.

import type { EstrategiaPrompt } from "../types/ssn";
import { chaveDoModelo } from "../data/modelCatalog";
import { ProviderId } from "../data/providerIds";

const NEMOTRON = chaveDoModelo({ provider: ProviderId.NVIDIA, id: "nvidia/nemotron-3-ultra-550b-a55b" });
const QWEN_38 = chaveDoModelo({ provider: ProviderId.GROQ, id: "qwen/qwen3.8-27b" });
const GPT_OSS_120B = chaveDoModelo({ provider: ProviderId.GROQ, id: "openai/gpt-oss-120b" });

/**
 * Preferências por estratégia, em ordem. O Qwen 3.8 está em "preview" na Groq (pode sair
 * sem aviso) e o Qwen 3.6 já foi desligado (14/09/26), então o plano B do G4 é o GPT-OSS 120B,
 * que a própria Groq indica como substituto.
 */
export const MODELOS_PREFERIDOS_POR_ESTRATEGIA: Record<EstrategiaPrompt, string[]> = {
  G1: [NEMOTRON],
  G2: [NEMOTRON],
  G3: [NEMOTRON],
  G4: [QWEN_38, GPT_OSS_120B],
};

/** Primeira preferência da estratégia (mantido por compatibilidade). */
export function modeloRecomendado(estrategia: EstrategiaPrompt): string {
  return MODELOS_PREFERIDOS_POR_ESTRATEGIA[estrategia][0];
}

/** Todas as preferências, da mais para a menos desejada. */
export function modelosRecomendados(estrategia: EstrategiaPrompt): string[] {
  return MODELOS_PREFERIDOS_POR_ESTRATEGIA[estrategia];
}
