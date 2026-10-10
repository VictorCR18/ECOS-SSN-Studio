// Utilitários de teste: substitui globalThis.fetch por um roteador simulado.

export interface ChamadaRegistrada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo?: any;
}

type Resposta = { status: number; corpo?: unknown; headers?: Record<string, string> };
type Rota = (chamada: ChamadaRegistrada) => Resposta | Promise<Resposta> | undefined;

export function instalarFetchSimulado(rotas: Rota[]) {
  const original = globalThis.fetch;
  const chamadas: ChamadaRegistrada[] = [];

  globalThis.fetch = (async (entrada: any, init?: any) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const headers: Record<string, string> = {};
    const bruto = init?.headers ?? (typeof entrada === "object" && "headers" in entrada ? entrada.headers : {});
    if (bruto instanceof Headers) bruto.forEach((v, k) => (headers[k.toLowerCase()] = v));
    else for (const [k, v] of Object.entries(bruto as Record<string, string>)) headers[k.toLowerCase()] = String(v);

    let corpo: any;
    if (typeof init?.body === "string") {
      try { corpo = JSON.parse(init.body); } catch { corpo = init.body; }
    }
    const chamada: ChamadaRegistrada = { url, metodo: (init?.method ?? "GET").toUpperCase(), headers, corpo };
    chamadas.push(chamada);

    for (const rota of rotas) {
      const r = await rota(chamada);
      if (r) {
        return new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), {
          status: r.status,
          headers: { "content-type": "application/json", "retry-after-ms": "1", ...(r.headers ?? {}) },
        });
      }
    }
    return new Response(JSON.stringify({ erro: `sem rota simulada para ${url}` }), { status: 599 });
  }) as typeof fetch;

  return {
    chamadas,
    restaurar() { globalThis.fetch = original; },
  };
}

/** Resposta OpenAI-compatível (NVIDIA/Groq/OpenAI/DeepSeek). */
export function completionOk(texto: string | null) {
  return {
    id: "cmpl-1", object: "chat.completion", created: 1, model: "x",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: texto } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

export const MODELO_SSN_VALIDO = JSON.stringify({
  ecos: "Teste",
  atores: [
    { nome: "Alfa", tipo: "CoI" },
    { nome: "Beta", tipo: "Fornecedor" },
    { nome: "Gama", tipo: "Cliente" },
  ],
  relacoes: [
    { origem: "Beta", destino: "Alfa", tipo_fluxo: "P" },
    { origem: "Alfa", destino: "Gama", tipo_fluxo: "P" },
  ],
  gateways: [],
});
