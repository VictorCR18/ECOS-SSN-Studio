import Anthropic from "@anthropic-ai/sdk";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

export async function chamarAnthropic({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
  maxTokens,
  semOpcionais,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da Anthropic configurada. Adicione uma chave no Painel de Configurações.");
  }
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: modeloId,
    max_tokens: maxTokens ?? 12288,
    temperature: temperatura,
    system: "Responda somente com o JSON solicitado.",
    messages: [{ role: "user", content: prompt }],
    ...(!semOpcionais && esforco.anthropicThinkingBudget
      ? { thinking: { type: "enabled", budget_tokens: esforco.anthropicThinkingBudget } }
      : {}),
  });
  const texto = message.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("");
  if (!texto.trim()) throw new RespostaVaziaError("A Anthropic retornou uma resposta vazia.");
  return texto;
}
