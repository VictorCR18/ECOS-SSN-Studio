import OpenAI from "openai";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

export async function chamarOpenAI({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
  maxTokens,
  semOpcionais,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da OpenAI configurada. Adicione uma chave no Painel de Configurações.");
  }
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    ...(!semOpcionais && esforco.reasoningEffort ? { reasoning_effort: esforco.reasoningEffort } : {}),
    max_completion_tokens: maxTokens ?? 8192,
  } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;
  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) throw new RespostaVaziaError("A OpenAI retornou uma resposta vazia.");
  return texto;
}
