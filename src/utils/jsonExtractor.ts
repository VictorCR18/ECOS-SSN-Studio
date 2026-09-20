// src/utils/jsonExtractor.ts
//
// LLMs frequentemente envolvem a resposta em cercas de código Markdown
// (```json ... ```) ou adicionam texto explicativo antes/depois do JSON,
// mesmo quando instruídas a não fazê-lo. Esta função tenta extrair o maior
// objeto JSON válido da resposta bruta.

export class ErroExtracaoJSON extends Error {
  constructor(
    message: string,
    public readonly textoOriginal: string,
  ) {
    super(message);
    this.name = "ErroExtracaoJSON";
  }
}

export function extrairJSON(textoBruto: string): unknown {
  const semCercas = textoBruto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(semCercas);
  } catch {
    // Alguns modelos ainda deixam texto solto antes/depois do objeto —
    // localiza o primeiro '{' e o último '}' correspondente.
    const inicio = semCercas.indexOf("{");
    const fim = semCercas.lastIndexOf("}");
    if (inicio === -1 || fim === -1 || fim <= inicio) {
      throw new ErroExtracaoJSON(
        "Não foi possível localizar um objeto JSON na resposta da LLM.",
        textoBruto,
      );
    }
    const candidato = semCercas.slice(inicio, fim + 1);
    try {
      return JSON.parse(candidato);
    } catch (erro) {
      throw new ErroExtracaoJSON(
        `A resposta da LLM não é um JSON válido: ${(erro as Error).message}`,
        textoBruto,
      );
    }
  }
}
