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
// O usuário sempre pode sobrepor essa sugestão manualmente no Painel de
// Configurações — esta função só define o padrão inicial.

import type { EstrategiaPrompt } from "../types/ssn";

export const MODELO_RECOMENDADO_POR_ESTRATEGIA: Record<EstrategiaPrompt, string> = {
  G1: "nvidia/nemotron-3-ultra-550b-a55b",
  G2: "nvidia/nemotron-3-ultra-550b-a55b",
  G3: "nvidia/nemotron-3-ultra-550b-a55b",
  G4: "qwen/qwen3.8-27b",
};

export const JUSTIFICATIVA_POR_ESTRATEGIA: Record<EstrategiaPrompt, string> = {
  G1: "Sem contexto de notação, qualquer modelo tende a ter desempenho baixo; usamos o mesmo modelo de G2/G3 para manter a comparação consistente.",
  G2: "Nemotron 3 Ultra apresentou o maior salto de desempenho de G1 para G2 no experimento do TCC.",
  G3: "Nemotron 3 Ultra respondeu bem à contextualização rica (persona + few-shot) do grupo G3.",
  G4: "Qwen é o modelo recomendado para G4; a versão atualmente disponível na Groq é a 3.8.",
};

export function modeloRecomendado(estrategia: EstrategiaPrompt): string {
  return MODELO_RECOMENDADO_POR_ESTRATEGIA[estrategia];
}
