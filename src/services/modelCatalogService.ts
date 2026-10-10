import type { ProvedorLLM } from "@/types/ssn";
import type { ResultadoVerificacao } from "@/types/llm";
import {
  ehIdDeModeloUtilizavel,
  ehModeloDescontinuado,
  modelosDoCatalogo,
  type ConfiguracaoModelo,
} from "@/data/modelCatalog";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const cache = new Map<ProvedorLLM, ResultadoListagem>();

export interface ResultadoListagem {
  modelos: ConfiguracaoModelo[];
  /** "api": lista real do provedor. "catalogo": a consulta falhou e usamos o catálogo fixo. */
  origem: "api" | "catalogo";
  /** Motivo da falha, quando `origem` é "catalogo". */
  erro?: string;
  /** Quantos modelos o provedor listou (antes dos nossos filtros). Só quando `origem` é "api". */
  total?: number;
  /** Modelos descartados: não são de texto ou já foram descontinuados. */
  ignorados?: { naoTexto: string[]; descontinuados: string[] };
}

export function invalidarCacheDeModelos(provider: ProvedorLLM): void {
  cache.delete(provider);
}

function catalogoComoFallback(provider: ProvedorLLM, erro: string): ResultadoListagem {
  return {
    modelos: modelosDoCatalogo(provider).filter(
      (modelo) => ehIdDeModeloUtilizavel(modelo.id) && !ehModeloDescontinuado(provider, modelo.id),
    ),
    origem: "catalogo",
    erro,
  };
}

export async function listarModelosDoProvedor(
  provider: ProvedorLLM,
  apiKey: string,
): Promise<ResultadoListagem> {
  const cached = cache.get(provider);
  if (cached) return cached;

  try {
    const resposta = await fetch(`${BASE_URL}/api/modelos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
      throw new Error(corpo.erro ?? `HTTP ${resposta.status}`);
    }
    const dados = (await resposta.json()) as {
      modelos?: { id: string; label?: string }[];
      total?: number;
      ignorados?: { naoTexto: string[]; descontinuados: string[] };
    };
    const catalogo = modelosDoCatalogo(provider);
    const modelos = (dados.modelos ?? [])
      .filter((modelo) => modelo.id && ehIdDeModeloUtilizavel(modelo.id) && !ehModeloDescontinuado(provider, modelo.id))
      .map((modelo): ConfiguracaoModelo => {
        const definicaoCatalogo = catalogo.find((item) => item.id === modelo.id);
        return definicaoCatalogo
          ? definicaoCatalogo
          : {
              id: modelo.id,
              label: modelo.label || modelo.id,
              provider,
              family: "Outros modelos",
              capabilities: { supportsReasoning: false },
            };
      });

    // Lista vazia não é "nenhum modelo": é uma resposta inútil. Cai para o catálogo para o
    // usuário não ficar sem opção alguma com uma chave válida.
    if (modelos.length === 0) {
      return catalogoComoFallback(provider, "O provedor não devolveu nenhum modelo de texto.");
    }
    const resultado: ResultadoListagem = {
      modelos,
      origem: "api",
      total: dados.total ?? modelos.length,
      ignorados: dados.ignorados ?? { naoTexto: [], descontinuados: [] },
    };
    cache.set(provider, resultado);
    return resultado;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.warn(`[modelos] Não foi possível listar modelos de ${provider}:`, mensagem);
    // Falhas não entram no cache: a próxima tentativa consulta o provedor de novo.
    return catalogoComoFallback(provider, mensagem);
  }
}

/** Faz uma chamada mínima ao modelo para saber se o provedor ainda o serve. */
export async function verificarModelo(
  provider: ProvedorLLM,
  modeloId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ResultadoVerificacao> {
  try {
    const resposta = await fetch(`${BASE_URL}/api/testar-modelo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, modeloId, apiKey }),
      signal,
    });
    if (!resposta.ok) return { estado: "desconhecido", status: resposta.status };
    return (await resposta.json()) as ResultadoVerificacao;
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    return { estado: "desconhecido", motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}
