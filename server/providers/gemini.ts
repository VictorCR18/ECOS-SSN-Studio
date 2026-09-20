// server/providers/gemini.ts
//
// Chamada ao Google Gemini a partir do backend (Node.js). Mesma lógica de
// src/services/providers/gemini.ts, mas sem a build "web" do SDK — aqui ele
// roda em Node normalmente, sem qualquer restrição de CORS (CORS é uma
// política aplicada pelo navegador, não existe em requisições servidor↔servidor).

import { GoogleGenAI } from "@google/genai";
import type { ParametrosEsforco } from "../../src/services/effortService";

export interface ChamadaProvedorParams {
  apiKey: string;
  modeloId: string;
  prompt: string;
  temperatura: number;
  esforco: ParametrosEsforco;
}

export async function chamarGemini({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API do Gemini configurada (GEMINI_API_KEY no servidor).");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: modeloId,
    contents: prompt,
    config: {
      temperature: temperatura,
      ...(esforco.geminiThinkingConfig
        ? { thinkingConfig: esforco.geminiThinkingConfig }
        : {}),
    },
  });

  const texto = response.text;
  if (!texto) {
    throw new Error("O Gemini retornou uma resposta vazia.");
  }
  return texto;
}
