// src/services/effortService.ts
//
// Traduz o nível de esforço de geração escolhido pelo usuário (Baixo, Médio,
// Alto) para os parâmetros específicos de "raciocínio" de cada modelo/API,
// conforme documentado em executor_experimento.ts. Cada provedor/modelo tem
// um mecanismo diferente:
//  - Gemini: thinkingConfig.thinkingBudget (número de tokens de raciocínio)
//  - Groq (GPT-OSS, Kimi K3, Qwen 3.8): campo reasoning_effort (string)
//  - NVIDIA NIM (Nemotron 3 Ultra, DeepSeek V4 Pro): chat_template_kwargs
//    com uma chave booleana ligando/desligando o "thinking"
//
// Também contém a heurística de sugestão automática de esforço com base no
// tamanho do ECOS, conforme a conclusão do TCC:
//   - até 10 atores  -> Baixo
//   - 11 a 25 atores -> Médio
//   - mais de 25     -> Alto

import type { EsforcoGeracao } from "../types/ssn";

type MecanismoEsforco =
  | { tipo: "gemini_thinking_budget"; valores: Record<EsforcoGeracao, number> }
  | { tipo: "reasoning_effort"; valores: Record<EsforcoGeracao, string> }
  | { tipo: "chat_template_kwargs_bool"; chave: string; valores: Record<EsforcoGeracao, boolean> };

/**
 * Tabela de mecanismos de esforço por modelo. Modelos não listados usam o
 * mecanismo padrão do seu provedor (ver `mecanismoPadraoDoProvedor`).
 */
const MECANISMOS_POR_MODELO: Record<string, MecanismoEsforco> = {
  "gemini-3.5-flash": {
    tipo: "gemini_thinking_budget",
    valores: { baixo: 0, medio: 1024, alto: 4096 },
  },
  // Nemotron 3 Ultra só permite ligar/desligar o thinking (sem granularidade).
  "nvidia/nemotron-3-ultra-550b-a55b": {
    tipo: "chat_template_kwargs_bool",
    chave: "enable_thinking",
    valores: { baixo: false, medio: true, alto: true },
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    tipo: "chat_template_kwargs_bool",
    chave: "thinking",
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

/** Parâmetros extras (fora de model/messages/temperature) a mesclar na chamada da API. */
export interface ParametrosEsforco {
  /** Para o SDK do Gemini: mesclar em `config.thinkingConfig`. */
  geminiThinkingConfig?: { thinkingBudget: number };
  /** Para Groq/OpenAI-compatible: campo de nível raiz do corpo da requisição. */
  reasoningEffort?: string;
  /** Para NVIDIA NIM: campo `chat_template_kwargs` do corpo da requisição. */
  chatTemplateKwargs?: Record<string, boolean>;
}

export function obterParametrosEsforco(modeloId: string, esforco: EsforcoGeracao): ParametrosEsforco {
  const mecanismo = MECANISMOS_POR_MODELO[modeloId];
  if (!mecanismo) return {};

  switch (mecanismo.tipo) {
    case "gemini_thinking_budget":
      return { geminiThinkingConfig: { thinkingBudget: mecanismo.valores[esforco] } };
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
