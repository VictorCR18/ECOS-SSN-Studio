// src/services/llmService.ts
//
// Cliente HTTP fino: o frontend NÃO chama mais as APIs das LLMs diretamente
// (Gemini/NVIDIA NIM/Groq) — quem faz isso agora é o backend (ver
// server/llmService.ts). Motivo: a NVIDIA NIM (e potencialmente a Groq) não
// envia cabeçalhos CORS, então o navegador bloqueia a chamada direta; além
// disso, manter as chaves de API só no servidor é mais seguro do que expô-las
// no bundle do cliente. Este módulo só monta a requisição para o endpoint
// /api/gerar-modelo (servido pelo mesmo host em produção, ou via proxy do
// Vite em desenvolvimento — ver vite.config.ts) e devolve a resposta bruta,
// que o ecosStore continua extraindo/validando normalmente.

import type { ChavesApi, ParametrosGeracao, RespostaLLM } from "@/types/llm";
import { LLMServiceError } from "@/types/llm";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

interface ErroApi {
  erro?: string;
}

export async function gerarModeloSSN(
  parametros: ParametrosGeracao,
  chaves: ChavesApi,
): Promise<RespostaLLM> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}/api/gerar-modelo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ecos: parametros.ecos,
        descricao: parametros.descricao,
        estrategia: parametros.estrategia,
        esforco: parametros.esforco,
        modeloId: parametros.modeloId,
        temperatura: parametros.temperatura,
        // Só é enviado o que o usuário efetivamente preencheu no Painel de
        // Configurações; campos vazios são ignorados e o backend usa a
        // chave do seu próprio .env como padrão.
        chaves: {
          ...(chaves.gemini ? { gemini: chaves.gemini } : {}),
          ...(chaves.nvidia ? { nvidia: chaves.nvidia } : {}),
          ...(chaves.groq ? { groq: chaves.groq } : {}),
        },
      }),
    });
  } catch {
    throw new LLMServiceError(
      "Não foi possível conectar ao backend da aplicação. Verifique se ele está rodando " +
        "(`npm run dev` inicia o frontend e a API juntos; ou `npm run dev:server` em outro terminal).",
    );
  }

  let dados: (RespostaLLM & ErroApi) | ErroApi;
  try {
    dados = await resposta.json();
  } catch {
    throw new LLMServiceError(`O backend respondeu com um corpo inválido (HTTP ${resposta.status}).`);
  }

  if (!resposta.ok) {
    throw new LLMServiceError(dados.erro ?? `Falha ao gerar o modelo (HTTP ${resposta.status}).`);
  }

  return dados as RespostaLLM;
}
