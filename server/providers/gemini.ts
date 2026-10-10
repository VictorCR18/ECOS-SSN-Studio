// server/providers/gemini.ts
//
// Chamada ao Google Gemini a partir do backend (Node.js). Mesma lógica de
// src/services/providers/gemini.ts, mas sem a build "web" do SDK — aqui ele
// roda em Node normalmente, sem qualquer restrição de CORS (CORS é uma
// política aplicada pelo navegador, não existe em requisições servidor↔servidor).

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { versaoPrincipalDoGemini } from "../../src/services/effortService";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

export type { ChamadaProvedorParams } from "./tipos";

const NIVEIS: Record<"low" | "medium" | "high", ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export async function chamarGemini({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
  maxTokens,
  semOpcionais,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API do Gemini configurada. Adicione uma chave no Painel de Configurações.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Gemini 3.x: o Google recomenda NÃO alterar temperature/top_p/top_k (o raciocínio
  // é otimizado para os padrões), então só enviamos temperatura nas famílias anteriores.
  const versao = versaoPrincipalDoGemini(modeloId);
  const aceitaTemperatura = !semOpcionais && !(versao !== undefined && versao >= 3);
  const pensamento = semOpcionais ? undefined : esforco.geminiThinkingConfig;

  const response = await ai.models.generateContent({
    model: modeloId,
    contents: prompt,
    config: {
      ...(aceitaTemperatura ? { temperature: temperatura } : {}),
      ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
      ...(pensamento
        ? {
            thinkingConfig: pensamento.thinkingLevel
              ? { thinkingLevel: NIVEIS[pensamento.thinkingLevel] }
              : { thinkingBudget: pensamento.thinkingBudget },
          }
        : {}),
    },
  });

  const texto = response.text;
  if (!texto) {
    throw new RespostaVaziaError("O Gemini retornou uma resposta vazia.");
  }
  return texto;
}
