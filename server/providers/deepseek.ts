import OpenAI from "openai";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export async function chamarDeepSeek({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  maxTokens,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da DeepSeek configurada. Adicione uma chave no Painel de Configurações.");
  }
  const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  const completion = await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    max_tokens: maxTokens ?? 8192,
  } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;
  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) throw new RespostaVaziaError("A DeepSeek retornou uma resposta vazia.");
  return texto;
}
