// src/services/effortService.ts
//
// Traduz o nível de esforço de geração escolhido pelo usuário (Baixo, Médio,
// Alto) para os parâmetros específicos de "raciocínio" de cada modelo/API,
// conforme documentado em executor_experimento.ts. Cada provedor/modelo tem
// um mecanismo diferente:
//  - Gemini 2.5: thinkingConfig.thinkingBudget (tokens); Gemini 3.x: thinkingConfig.thinkingLevel
//  - Groq (GPT-OSS, Qwen 3.8): campo reasoning_effort (string)
//  - NVIDIA NIM (Nemotron 3 Ultra): chat_template_kwargs; Kimi K3: reasoning_effort
//    com uma chave booleana ligando/desligando o "thinking"
//
// Também contém a heurística de sugestão automática de esforço com base no
// tamanho do ECOS, conforme a conclusão do TCC:
//   - até 10 atores  -> Baixo
//   - 11 a 25 atores -> Médio
//   - mais de 25     -> Alto

import type { EsforcoGeracao } from "../types/ssn";
import { separarChaveDoModelo } from "../data/modelCatalog";

type MecanismoEsforco =
  | { tipo: "gemini_thinking_budget"; valores: Record<EsforcoGeracao, number> }
  | { tipo: "gemini_thinking_level"; valores: Record<EsforcoGeracao, "low" | "medium" | "high"> }
  | { tipo: "anthropic_thinking_budget"; valores: Record<EsforcoGeracao, number> }
  | { tipo: "reasoning_effort"; valores: Record<EsforcoGeracao, string> }
  | { tipo: "chat_template_kwargs_bool"; chave: string; valores: Record<EsforcoGeracao, boolean> };

/**
 * Tabela de mecanismos de esforço por modelo. Modelos não listados usam o
 * mecanismo padrão do seu provedor (ver `mecanismoPadraoDoProvedor`).
 */
const MECANISMOS_POR_MODELO: Record<string, MecanismoEsforco> = {
  "gpt-5": {
    tipo: "reasoning_effort",
    valores: { baixo: "low", medio: "medium", alto: "high" },
  },
  "gpt-5-mini": {
    tipo: "reasoning_effort",
    valores: { baixo: "low", medio: "medium", alto: "high" },
  },
  "claude-sonnet-4-5-20250929": {
    tipo: "anthropic_thinking_budget",
    valores: { baixo: 1024, medio: 4096, alto: 8192 },
  },
  "claude-haiku-4-5-20251001": {
    tipo: "anthropic_thinking_budget",
    valores: { baixo: 1024, medio: 4096, alto: 8192 },
  },
  // Nemotron 3 Ultra só permite ligar/desligar o thinking (sem granularidade).
  "nvidia/nemotron-3-ultra-550b-a55b": {
    tipo: "chat_template_kwargs_bool",
    chave: "enable_thinking",
    valores: { baixo: false, medio: true, alto: true },
  },
  // Kimi K3 "always reasons": não existe nível "off"; usamos low/high/max.
  "moonshotai/kimi-k3": {
    tipo: "reasoning_effort",
    valores: { baixo: "low", medio: "high", alto: "max" },
  },
  // GPT-OSS 120B não aceita reasoning_effort="off"; usamos low/medium/high.
  "openai/gpt-oss-120b": {
    tipo: "reasoning_effort",
    valores: { baixo: "low", medio: "medium", alto: "high" },
  },
  // Qwen 3.8 aceita "default", "low" e "high".
  "qwen/qwen3.8-27b": {
    tipo: "reasoning_effort",
    valores: { baixo: "default", medio: "low", alto: "high" },
  },
};

/**
 * Gemini: a família 3.x (3.5 Flash, 3.6, 3.7, 3.8...) controla o raciocínio por
 * `thinkingLevel` e NÃO aceita bem `thinkingBudget` (o valor 0, usado antes para
 * "Baixo", é recusado porque esses modelos só funcionam pensando; enviar os dois
 * campos juntos devolve HTTP 400). A família 2.5 segue usando `thinkingBudget`.
 * Usamos "low" (e não "minimal") para "Baixo" porque o Gemini 3.7 Flash e o 3.1 Pro
 * não aceitam "minimal".
 */
export function versaoPrincipalDoGemini(id: string): number | undefined {
  const m = /^gemini-(\d+)(?:\.\d+)?-/.exec(id);
  return m ? Number(m[1]) : undefined;
}

function mecanismoDoGemini(id: string): MecanismoEsforco | undefined {
  const versao = versaoPrincipalDoGemini(id);
  if (versao !== undefined && versao >= 3) {
    return { tipo: "gemini_thinking_level", valores: { baixo: "low", medio: "medium", alto: "high" } };
  }
  if (/^gemini-2\.5-flash/.test(id)) {
    return { tipo: "gemini_thinking_budget", valores: { baixo: 0, medio: 1024, alto: 4096 } };
  }
  return undefined;
}

/** Parâmetros extras (fora de model/messages/temperature) a mesclar na chamada da API. */
export interface ParametrosEsforco {
  /** Para o SDK do Gemini: mesclar em `config.thinkingConfig` (`thinkingLevel` no 3.x, `thinkingBudget` no 2.5). */
  geminiThinkingConfig?: { thinkingBudget?: number; thinkingLevel?: "low" | "medium" | "high" };
  /** Para o SDK da Anthropic: orçamento do extended thinking. */
  anthropicThinkingBudget?: number;
  /** Para Groq/OpenAI-compatible: campo de nível raiz do corpo da requisição. */
  reasoningEffort?: string;
  /** Para NVIDIA NIM: campo `chat_template_kwargs` do corpo da requisição. */
  chatTemplateKwargs?: Record<string, boolean>;
}

export function obterParametrosEsforco(modeloId: string, esforco: EsforcoGeracao): ParametrosEsforco {
  const id = separarChaveDoModelo(modeloId)?.id ?? modeloId;
  const mecanismo = MECANISMOS_POR_MODELO[id] ?? mecanismoDoGemini(id);
  if (!mecanismo) return {};

  switch (mecanismo.tipo) {
    case "gemini_thinking_budget":
      return { geminiThinkingConfig: { thinkingBudget: mecanismo.valores[esforco] } };
    case "gemini_thinking_level":
      return { geminiThinkingConfig: { thinkingLevel: mecanismo.valores[esforco] } };
    case "anthropic_thinking_budget":
      return { anthropicThinkingBudget: mecanismo.valores[esforco] };
    case "reasoning_effort":
      return { reasoningEffort: mecanismo.valores[esforco] };
    case "chat_template_kwargs_bool":
      return { chatTemplateKwargs: { [mecanismo.chave]: mecanismo.valores[esforco] } };
    default:
      return {};
  }
}

/** Limiares de atores usados para sugerir automaticamente o esforço (conclusão do TCC). */
export const LIMIARES_TAMANHO_ECOS = { pequeno: 10, medio: 25 };

/** Sugere o esforço a partir de uma contagem já conhecida de atores (ex.: após gerar um modelo). */
export function sugerirEsforcoPorQuantidadeAtores(quantidadeAtores: number): EsforcoGeracao {
  if (quantidadeAtores <= LIMIARES_TAMANHO_ECOS.pequeno) return "baixo";
  if (quantidadeAtores <= LIMIARES_TAMANHO_ECOS.medio) return "medio";
  return "alto";
}

/**
 * Estima heuristicamente o tamanho do ECOS a partir da descrição textual,
 * ANTES da primeira geração (quando ainda não há atores conhecidos). Conta
 * candidatos a nomes de ator: sequências de palavras capitalizadas e itens
 * separados por vírgula/ponto-e-vírgula/quebra de linha, deduplicados por
 * forma normalizada.
 */
export function estimarTamanhoEcosPorDescricao(descricao: string): number {
  const texto = descricao.trim();
  if (!texto) return 0;

  const candidatos = new Set<string>();

  // 1) Sequências de 1+ palavras iniciadas por maiúscula (possíveis nomes próprios).
  const nomesProprios = texto.match(/\b(?:[A-ZÀ-Ý][\wÀ-ÿ.'-]*\s*){1,4}/g) ?? [];
  for (const nome of nomesProprios) {
    const normalizado = nome.trim().toLowerCase();
    if (normalizado.length >= 2) candidatos.add(normalizado);
  }

  // 2) Itens de listas separadas por vírgula (comuns em descrições do tipo
  // "atores conhecidos: A, B, C").
  const trechoListas = texto.split(/atores conhecidos|conhecidos:|produtos:/i)[1] ?? "";
  const itensLista = trechoListas
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2 && s.length <= 40);
  for (const item of itensLista) candidatos.add(item);

  return candidatos.size;
}

/** Sugestão de esforço para uso antes da primeira geração (heurística sobre a descrição). */
export function sugerirEsforcoInicial(descricao: string): EsforcoGeracao {
  return sugerirEsforcoPorQuantidadeAtores(estimarTamanhoEcosPorDescricao(descricao));
}
