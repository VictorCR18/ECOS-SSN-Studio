// server/providers/nvidia.ts
//
// Chamada à NVIDIA NIM a partir do backend. É exatamente esta chamada que
// precisa rodar no servidor: integrate.api.nvidia.com não envia cabeçalhos
// de CORS, então o navegador bloqueia a requisição por política de
// same-origin — de um servidor Node.js, essa restrição simplesmente não existe.

import OpenAI from "openai";
import type { ParametrosEsforco } from "../../src/services/effortService";
import { RespostaVaziaError, type ChamadaProvedorParams } from "./tipos";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// A NIM aplica um teto de saída bem baixo quando `max_tokens` não é enviado, o que
// corta o JSON SSN no meio (ou o gasta todo no raciocínio e devolve `content` nulo).
const MAX_TOKENS_PADRAO = 16384;

function camposExtrasDeEsforco(esforco: ParametrosEsforco): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (esforco.chatTemplateKwargs) extras.chat_template_kwargs = esforco.chatTemplateKwargs;
  if (esforco.reasoningEffort) extras.reasoning_effort = esforco.reasoningEffort;
  return extras;
}

export async function chamarNvidia({
  apiKey,
  modeloId,
  prompt,
  temperatura,
  esforco,
  maxTokens,
  semOpcionais,
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da NVIDIA NIM configurada. Adicione uma chave no Painel de Configurações.");
  }

  const client = new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });

  const completion = await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    max_tokens: maxTokens ?? MAX_TOKENS_PADRAO,
    ...(semOpcionais ? {} : camposExtrasDeEsforco(esforco)),
  } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;

  const texto = completion.choices[0]?.message?.content;
  if (!texto?.trim()) {
    throw new RespostaVaziaError("O modelo NVIDIA NIM retornou uma resposta vazia.");
  }
  return texto;
}
