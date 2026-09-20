// src/services/promptBuilder.ts
//
// Implementa os quatro construtores de prompt (G1-G4) definidos na
// metodologia do TCC (seções 4.2 e 5.2), reaproveitando as definições e
// exemplos de src/data/ssnKnowledge.ts. Cada construtor recebe o nome do
// ecossistema e a descrição livre fornecida pelo usuário e devolve o prompt
// completo (string) a ser enviado à LLM selecionada.

import type { EstrategiaPrompt } from "../types/ssn";
import {
  DEFINICOES_SSN,
  EXEMPLOS_G3,
  EXEMPLOS_G4,
  SCHEMA_BASE,
  SCHEMA_G4,
} from "../data/ssnKnowledge";

interface EntradaPrompt {
  ecos: string;
  descricao: string;
}

/**
 * G1 — Baseline (Zero-Shot).
 * Instrução direta, sem qualquer contextualização sobre a notação SSN.
 * Serve como piso de comparação: mede o quanto o conhecimento "de fábrica"
 * da LLM sobre ecossistemas de software já aproxima o resultado do formato
 * desejado, sem qualquer engenharia de prompt.
 */
function construirPromptG1({ ecos, descricao }: EntradaPrompt): string {
  return `Gere um modelo de Ecossistema de Software (ECOS) para "${ecos}" a partir da descrição abaixo, no formato de uma Software Supply Network (SSN).

Descrição do ecossistema:
"""
${descricao}
"""

Responda apenas com um objeto JSON contendo os campos: "ecos" (string), "atores" (lista de objetos com "nome" e "tipo"), "relacoes" (lista de objetos com "origem", "destino" e "tipo_fluxo") e "gateways" (lista de pontos de divergência/convergência entre atores, se houver).

Não inclua nenhum texto antes ou depois do JSON.`;
}

/**
 * G2 — Contexto Estruturado Básico.
 * Acrescenta ao G1 as definições formais da notação SSN (tipos de ator,
 * tipos de fluxo, regras semânticas) e o schema JSON exato esperado, mas
 * ainda sem persona nem exemplos completos.
 */
function construirPromptG2({ ecos, descricao }: EntradaPrompt): string {
  return `Você deve modelar o Ecossistema de Software (ECOS) "${ecos}" como uma Software Supply Network (SSN), a partir da descrição do usuário.

${DEFINICOES_SSN}

Descrição do ecossistema:
"""
${descricao}
"""

Gere a saída estritamente no seguinte formato JSON:
${SCHEMA_BASE}

Responda apenas com o objeto JSON, sem nenhum texto adicional antes ou depois.`;
}

/**
 * G3 — Persona + Few-Shot.
 * Acrescenta ao G2 uma persona de especialista em Engenharia de Ecossistemas
 * de Software e quatro exemplos completos (few-shot) de modelos SSN
 * corretamente construídos, cobrindo diferentes arranjos de atores e
 * gateways.
 */
function construirPromptG3({ ecos, descricao }: EntradaPrompt): string {
  return `Você é um pesquisador sênior especialista em Engenharia de Ecossistemas de Software (Software Ecosystems), com profundo domínio da notação Software Supply Network (SSN) proposta por Boucharas, Jansen e Brinkkemper (2009). Sua tarefa é modelar ecossistemas reais ou hipotéticos descritos em linguagem natural como um grafo SSN estruturado em JSON, seguindo rigorosamente as definições e convenções abaixo.

${DEFINICOES_SSN}

A seguir, alguns exemplos de modelos SSN corretamente construídos a partir de descrições de ecossistemas conhecidos. Estude o padrão de classificação de atores, a direção dos fluxos e o uso de gateways antes de responder.

${EXEMPLOS_G3}

Agora, modele o ecossistema abaixo seguindo exatamente o mesmo padrão dos exemplos.

Ecossistema: "${ecos}"
Descrição:
"""
${descricao}
"""

Gere a saída estritamente no seguinte formato JSON:
${SCHEMA_BASE}

Responda apenas com o objeto JSON, sem nenhum texto adicional antes ou depois.`;
}

/**
 * G4 — Cadeia de Raciocínio (Chain-of-Thought).
 * Mantém a persona e os exemplos de G3, mas exige um protocolo explícito de
 * raciocínio passo a passo — classificar o CoI, depois fornecedores, depois
 * clientes/clientes-do-cliente, depois intermediários/agregadores, depois
 * gateways — registrado no próprio campo "raciocinio_cot" do JSON de saída,
 * antes dos demais campos do modelo.
 */
function construirPromptG4({ ecos, descricao }: EntradaPrompt): string {
  return `Você é um pesquisador sênior especialista em Engenharia de Ecossistemas de Software (Software Ecosystems), com profundo domínio da notação Software Supply Network (SSN) proposta por Boucharas, Jansen e Brinkkemper (2009). Sua tarefa é modelar ecossistemas reais ou hipotéticos descritos em linguagem natural como um grafo SSN estruturado em JSON, seguindo rigorosamente as definições e convenções abaixo.

${DEFINICOES_SSN}

A seguir, alguns exemplos de modelos SSN corretamente construídos a partir de descrições de ecossistemas conhecidos. Repare que, antes do modelo final, cada exemplo registra um raciocínio passo a passo no campo "raciocinio_cot", seguindo sempre a mesma sequência:
1. Identificar o(s) CoI (um por módulo/plataforma autônoma);
2. Identificar os Fornecedores e suas relações de entrada (tipo_fluxo P) para o CoI;
3. Identificar Clientes e, quando existirem, ClientesDoCliente;
4. Identificar Intermediarios e Agregadores no caminho entre o CoI e os Clientes, e a direção correta dos fluxos Sys/Ser entre eles;
5. Identificar pontos de split (um ator distribui para vários destinos) ou join (um ator consolida várias origens) e classificar cada um como OU ou XOU;
6. Conferir que todo ator referenciado em "gateways" já existe em "atores" e que nenhuma regra semântica foi violada.

${EXEMPLOS_G4}

Agora, aplique EXATAMENTE o mesmo protocolo de raciocínio ao ecossistema abaixo, preenchendo o campo "raciocinio_cot" antes dos demais campos.

Ecossistema: "${ecos}"
Descrição:
"""
${descricao}
"""

Gere a saída estritamente no seguinte formato JSON:
${SCHEMA_G4}

Responda apenas com o objeto JSON (incluindo o campo "raciocinio_cot" dentro dele), sem nenhum texto adicional antes ou depois.`;
}

const CONSTRUTORES: Record<EstrategiaPrompt, (entrada: EntradaPrompt) => string> = {
  G1: construirPromptG1,
  G2: construirPromptG2,
  G3: construirPromptG3,
  G4: construirPromptG4,
};

/** Constrói o prompt completo para a estratégia informada. */
export function construirPrompt(estrategia: EstrategiaPrompt, entrada: EntradaPrompt): string {
  return CONSTRUTORES[estrategia](entrada);
}
