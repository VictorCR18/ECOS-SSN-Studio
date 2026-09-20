// server/providers/nvidia.ts
//
// Chamada à NVIDIA NIM a partir do backend. É exatamente esta chamada que
// precisa rodar no servidor: integrate.api.nvidia.com não envia cabeçalhos
// de CORS, então o navegador bloqueia a requisição por política de
// same-origin — de um servidor Node.js, essa restrição simplesmente não existe.

import OpenAI from "openai";
import type { ParametrosEsforco } from "../../src/services/effortService";
import type { ChamadaProvedorParams } from "./gemini";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

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
}: ChamadaProvedorParams): Promise<string> {
  if (!apiKey) {
    throw new Error("Nenhuma chave de API da NVIDIA NIM configurada (NVIDIA_API_KEY no servidor).");
  }

  const client = new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });

  const completion = await client.chat.completions.create({
    model: modeloId,
    messages: [{ role: "user", content: prompt }],
    temperature: temperatura,
    stream: false,
    ...camposExtrasDeEsforco(esforco),
  } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;

  const texto = completion.choices[0]?.message?.content;
  if (!texto) {
    throw new Error("O modelo NVIDIA NIM retornou uma resposta vazia.");
  }
  return texto;
}
