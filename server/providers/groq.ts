// server/providers/groq.ts
//
// Chamada à Groq a partir do backend. A Groq também não envia cabeçalhos de
// CORS para chamadas diretas do navegador em todos os planos/rotas — rodar
// no servidor evita esse problema de uma vez por todas, além de manter a
// chave de API fora do bundle do cliente.

import Groq from "groq-sdk";
import type { ParametrosEsforco } from "../../src/services/effortService";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

export class RespostaGroqIncompletaError extends RespostaVaziaError {
  constructor() {
    super("O modelo Groq não produziu conteúdo final. Uma nova tentativa será feita automaticamente.");
    this.name = "RespostaGroqIncompletaError";
  }
}

function camposExtrasDeEsforco(esforco: ParametrosEsforco): Record<string, unknown> {
  return esforco.reasoningEffort ? { reasoning_effort: esforco.reasoningEffort } : {};
}

// Tetos de saída por modelo, só para quem precisa deles. O tier atual da Groq limita o
// Qwen 3.8 (preview) a 1000 tokens de saída por minuto.
const TETO_DE_SAIDA_POR_MODELO: Record<string, number> = {
  "qwen/qwen3.8-27b": 1000,
};

export async function chamarGroq({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
  maxTokens,
  semOpcionais,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da Groq configurada. Adicione uma chave no Painel de Configurações.");
  }

  const client = new Groq({ apiKey });

  const completion = (await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    ...((maxTokens ?? TETO_DE_SAIDA_POR_MODELO[modeloId])
      ? { max_completion_tokens: maxTokens ?? TETO_DE_SAIDA_POR_MODELO[modeloId] }
      : {}),
    ...(semOpcionais ? {} : camposExtrasDeEsforco(esforco)),
  } as Parameters<typeof client.chat.completions.create>[0])) as Groq.Chat.ChatCompletion;

  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) {
    throw new RespostaGroqIncompletaError();
  }
  return texto;
}
