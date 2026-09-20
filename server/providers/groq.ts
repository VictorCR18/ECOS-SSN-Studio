// server/providers/groq.ts
//
// Chamada à Groq a partir do backend. A Groq também não envia cabeçalhos de
// CORS para chamadas diretas do navegador em todos os planos/rotas — rodar
// no servidor evita esse problema de uma vez por todas, além de manter a
// chave de API fora do bundle do cliente.

import Groq from "groq-sdk";
import type { ParametrosEsforco } from "../../src/services/effortService";
import type { ChamadaProvedorParams } from "./gemini";

export class RespostaGroqIncompletaError extends Error {
  constructor() {
    super("O modelo Groq não produziu conteúdo final. Uma nova tentativa será feita automaticamente.");
    this.name = "RespostaGroqIncompletaError";
  }
}

function camposExtrasDeEsforco(esforco: ParametrosEsforco): Record<string, unknown> {
  return esforco.reasoningEffort ? { reasoning_effort: esforco.reasoningEffort } : {};
}

function limiteDeTokensDoModelo(modeloId: string): number | undefined {
  // O tier atual da Groq limita o Qwen 3.8 a 1000 tokens de saída por minuto.
  return modeloId === "qwen/qwen3.8-27b" ? 1000 : undefined;
}

export async function chamarGroq({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da Groq configurada (GROQ_API_KEY no servidor).");
  }

  const client = new Groq({ apiKey });

  const completion = (await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    ...(limiteDeTokensDoModelo(modeloId)
      ? { max_completion_tokens: limiteDeTokensDoModelo(modeloId) }
      : {}),
    ...camposExtrasDeEsforco(esforco),
  } as Parameters<typeof client.chat.completions.create>[0])) as Groq.Chat.ChatCompletion;

  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) {
    throw new RespostaGroqIncompletaError();
  }
  return texto;
}
