// src/types/ssn.ts
// Tipos do domínio SSN (Software Supply Network), conforme Boucharas, Jansen e
// Brinkkemper (2009), com a extensão do ator Agregador proposta por Costa et al.
// (2013). Espelha o schema JSON produzido pelas LLMs em executor_experimento.ts.

/** Tipos de ator na notação SSN. */
export type TipoAtor =
  | "CoI"
  | "Fornecedor"
  | "Cliente"
  | "Intermediario"
  | "Agregador"
  | "ClienteDoCliente";

export const TIPOS_ATOR: TipoAtor[] = [
  "CoI",
  "Fornecedor",
  "Cliente",
  "Intermediario",
  "Agregador",
  "ClienteDoCliente",
];

/** Tipos de fluxo (artefato transacionado entre dois atores). */
export type TipoFluxo = "P" | "Ser" | "Req" | "Des" | "Comp" | "Sys";

export const TIPOS_FLUXO: TipoFluxo[] = ["P", "Ser", "Req", "Des", "Comp", "Sys"];

export const DESCRICAO_TIPO_FLUXO: Record<TipoFluxo, string> = {
  P: "Produto — tecnologia/componente fornecido ao CoI",
  Ser: "Serviço prestado aos Clientes",
  Req: "Requisito/solicitação feita ao CoI",
  Des: "Atividade de desenvolvimento realizada sobre o CoI",
  Comp: "Compensação financeira entre atores",
  Sys: "Integração sistêmica entre plataformas, módulos, CoIs ou Agregadores",
};

export type DirecaoGateway = "split" | "join";
export type LogicaGateway = "OU" | "XOU";

export interface Ator {
  nome: string;
  tipo: TipoAtor;
}

export interface Relacao {
  origem: string;
  destino: string;
  tipo_fluxo: TipoFluxo;
}

export interface Gateway {
  ator: string;
  direcao: DirecaoGateway;
  logica: LogicaGateway;
  descricao: string;
}

/** Estrutura de saída esperada da LLM (e do modelo salvo/carregado). */
export interface ModeloSSN {
  ecos: string;
  atores: Ator[];
  relacoes: Relacao[];
  gateways: Gateway[];
  /** Presente apenas quando gerado com a estratégia G4 (Chain-of-Thought). */
  raciocinio_cot?: string;
}

/** Um modelo salvo no histórico, com metadados de geração. */
export interface ModeloSalvo {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
  titulo: string;
  descricaoOriginal: string;
  modelo: ModeloSSN;
  metadados?: MetadadosGeracao;
}

export interface MetadadosGeracao {
  estrategia: EstrategiaPrompt;
  esforco: EsforcoGeracao;
  provedor: ProvedorLLM;
  modeloId: string;
  duracaoMs: number;
  tentativas: number;
  respostaBruta: string;
}

export type EstrategiaPrompt = "G1" | "G2" | "G3" | "G4";

export const ESTRATEGIAS_PROMPT: {
  valor: EstrategiaPrompt;
  titulo: string;
  descricao: string;
}[] = [
  {
    valor: "G1",
    titulo: "G1 — Baseline",
    descricao: "Instrução direta, sem qualquer contextualização sobre ECOS ou SSN (Zero-Shot).",
  },
  {
    valor: "G2",
    titulo: "G2 — Contexto Estruturado Básico",
    descricao: "Definições formais de atores, fluxos e regras semânticas da notação SSN.",
  },
  {
    valor: "G3",
    titulo: "G3 — Persona + Few-Shot",
    descricao: "Persona de especialista, estrutura de saída e exemplos completos de modelos SSN.",
  },
  {
    valor: "G4",
    titulo: "G4 — Cadeia de Raciocínio",
    descricao: "Persona + exemplos + protocolo Chain-of-Thought explícito antes da saída final.",
  },
];

export type EsforcoGeracao = "baixo" | "medio" | "alto";

export const ESFORCOS: { valor: EsforcoGeracao; titulo: string }[] = [
  { valor: "baixo", titulo: "Baixo" },
  { valor: "medio", titulo: "Médio" },
  { valor: "alto", titulo: "Alto" },
];

export type ProvedorLLM = "gemini" | "nvidia" | "groq";

export interface ErroValidacao {
  campo: string;
  mensagem: string;
  gravidade: "erro" | "aviso";
}

export interface ResultadoValidacao {
  valido: boolean;
  erros: ErroValidacao[];
  avisos: ErroValidacao[];
}
