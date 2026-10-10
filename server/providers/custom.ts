import OpenAI from "openai";
import type { ChamadaProvedorParams } from "./tipos";

interface ChamadaLLMPersonalizadaParams extends ChamadaProvedorParams {
  endpoint: string;
}

/** Chama qualquer serviço que exponha o contrato OpenAI Chat Completions. */
export async function chamarLLMPersonalizada({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  endpoint,
}: ChamadaLLMPersonalizadaParams): Promise<string> {
  if (!endpoint.trim()) {
    throw new Error("Informe a URL base da API da LLM personalizada.");
  }
  if (!apiKey) {
    throw new Error("Informe a chave de API da LLM personalizada.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: endpoint.trim().replace(/\/$/, ""),
  });
  const completion = await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
  } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;

  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) {
    throw new Error("A LLM personalizada retornou uma resposta vazia.");
  }
  return texto;
}
