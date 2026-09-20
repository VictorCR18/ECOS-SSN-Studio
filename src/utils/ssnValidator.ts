// src/utils/ssnValidator.ts
//
// Valida o JSON retornado pela LLM contra o schema SSN e as regras
// semânticas obrigatórias descritas em src/data/ssnKnowledge.ts
// (DEFINICOES_SSN, seção "Regras Semânticas Obrigatórias").
//
// A validação é dividida em duas camadas:
//   1) Estrutural — o objeto tem o formato esperado (campos, tipos, enums)?
//   2) Semântica  — o modelo resultante respeita as regras de composição da
//      notação SSN (ex.: todo Fornecedor aponta para o CoI com fluxo "P")?
//
// Violações estruturais são sempre "erro" (o modelo não pode ser
// renderizado). Violações semânticas são "aviso" por padrão — o diagrama
// ainda é renderizável, mas o usuário deve revisar o resultado — exceto
// referências a atores inexistentes, que impedem a renderização e por isso
// são "erro".

import {
  TIPOS_ATOR,
  TIPOS_FLUXO,
  type ErroValidacao,
  type ModeloSSN,
  type ResultadoValidacao,
} from "../types/ssn";

function ehString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validarEstrutura(valor: unknown): { erros: ErroValidacao[]; modelo?: ModeloSSN } {
  const erros: ErroValidacao[] = [];

  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return {
      erros: [{ campo: "$", mensagem: "A resposta não é um objeto JSON.", gravidade: "erro" }],
    };
  }
  const obj = valor as Record<string, unknown>;

  if (!ehString(obj.ecos)) {
    erros.push({ campo: "ecos", mensagem: 'Campo "ecos" ausente ou vazio.', gravidade: "erro" });
  }

  if (!Array.isArray(obj.atores)) {
    erros.push({ campo: "atores", mensagem: 'Campo "atores" ausente ou não é uma lista.', gravidade: "erro" });
  }
  if (!Array.isArray(obj.relacoes)) {
    erros.push({ campo: "relacoes", mensagem: 'Campo "relacoes" ausente ou não é uma lista.', gravidade: "erro" });
  }
  // "gateways" é opcional/pode ser omitido por alguns modelos — tratamos ausência como lista vazia.
  const gatewaysBruto = obj.gateways ?? [];
  if (!Array.isArray(gatewaysBruto)) {
    erros.push({ campo: "gateways", mensagem: 'Campo "gateways" não é uma lista.', gravidade: "erro" });
  }

  if (erros.length > 0) return { erros };

  const atoresBrutos = obj.atores as unknown[];
  const nomesValidos = new Set<string>();
  atoresBrutos.forEach((a, i) => {
    if (typeof a !== "object" || a === null) {
      erros.push({ campo: `atores[${i}]`, mensagem: "Ator não é um objeto.", gravidade: "erro" });
      return;
    }
    const ator = a as Record<string, unknown>;
    if (!ehString(ator.nome)) {
      erros.push({ campo: `atores[${i}].nome`, mensagem: "Nome do ator ausente ou vazio.", gravidade: "erro" });
    } else {
      nomesValidos.add(ator.nome as string);
    }
    if (!ehString(ator.tipo) || !TIPOS_ATOR.includes(ator.tipo as never)) {
      erros.push({
        campo: `atores[${i}].tipo`,
        mensagem: `Tipo de ator inválido: "${String(ator.tipo)}". Esperado um de: ${TIPOS_ATOR.join(", ")}.`,
        gravidade: "erro",
      });
    }
  });

  const relacoesBrutas = obj.relacoes as unknown[];
  relacoesBrutas.forEach((r, i) => {
    if (typeof r !== "object" || r === null) {
      erros.push({ campo: `relacoes[${i}]`, mensagem: "Relação não é um objeto.", gravidade: "erro" });
      return;
    }
    const rel = r as Record<string, unknown>;
    if (!ehString(rel.origem) || !nomesValidos.has(rel.origem as string)) {
      erros.push({
        campo: `relacoes[${i}].origem`,
        mensagem: `Ator de origem "${String(rel.origem)}" não existe em "atores".`,
        gravidade: "erro",
      });
    }
    if (!ehString(rel.destino) || !nomesValidos.has(rel.destino as string)) {
      erros.push({
        campo: `relacoes[${i}].destino`,
        mensagem: `Ator de destino "${String(rel.destino)}" não existe em "atores".`,
        gravidade: "erro",
      });
    }
    if (!ehString(rel.tipo_fluxo) || !TIPOS_FLUXO.includes(rel.tipo_fluxo as never)) {
      erros.push({
        campo: `relacoes[${i}].tipo_fluxo`,
        mensagem: `Tipo de fluxo inválido: "${String(rel.tipo_fluxo)}". Esperado um de: ${TIPOS_FLUXO.join(", ")}.`,
        gravidade: "erro",
      });
    }
  });

  const gatewaysBrutos = gatewaysBruto as unknown[];
  gatewaysBrutos.forEach((g, i) => {
    if (typeof g !== "object" || g === null) {
      erros.push({ campo: `gateways[${i}]`, mensagem: "Gateway não é um objeto.", gravidade: "erro" });
      return;
    }
    const gw = g as Record<string, unknown>;
    if (!ehString(gw.ator) || !nomesValidos.has(gw.ator as string)) {
      erros.push({
        campo: `gateways[${i}].ator`,
        mensagem: `Gateway referencia o ator "${String(gw.ator)}", que não existe em "atores".`,
        gravidade: "erro",
      });
    }
    if (gw.direcao !== "split" && gw.direcao !== "join") {
      erros.push({
        campo: `gateways[${i}].direcao`,
        mensagem: `Direção de gateway inválida: "${String(gw.direcao)}". Esperado "split" ou "join".`,
        gravidade: "erro",
      });
    }
    if (gw.logica !== "OU" && gw.logica !== "XOU") {
      erros.push({
        campo: `gateways[${i}].logica`,
        mensagem: `Lógica de gateway inválida: "${String(gw.logica)}". Esperado "OU" ou "XOU".`,
        gravidade: "erro",
      });
    }
  });

  if (erros.length > 0) return { erros };

  const modelo: ModeloSSN = {
    ecos: obj.ecos as string,
    atores: atoresBrutos as ModeloSSN["atores"],
    relacoes: relacoesBrutas as ModeloSSN["relacoes"],
    gateways: gatewaysBrutos as ModeloSSN["gateways"],
    ...(ehString(obj.raciocinio_cot) ? { raciocinio_cot: obj.raciocinio_cot as string } : {}),
  };
  return { erros: [], modelo };
}

/** Regras semânticas obrigatórias (seção "Regras Semânticas" de DEFINICOES_SSN). */
function validarSemantica(modelo: ModeloSSN): ErroValidacao[] {
  const avisos: ErroValidacao[] = [];
  const tipoPorNome = new Map(modelo.atores.map((a) => [a.nome, a.tipo]));

  // Regra 1: todo Fornecedor deve ter uma relação de saída do tipo P.
  for (const ator of modelo.atores) {
    if (ator.tipo !== "Fornecedor") continue;
    const temFluxoP = modelo.relacoes.some((r) => r.origem === ator.nome && r.tipo_fluxo === "P");
    if (!temFluxoP) {
      avisos.push({
        campo: `atores["${ator.nome}"]`,
        mensagem: `O Fornecedor "${ator.nome}" não possui nenhuma relação de saída com tipo_fluxo "P".`,
        gravidade: "aviso",
      });
    }
  }

  // Regra 2: todo CoI deve ter ao menos uma relação de saída (Ser ou Sys).
  for (const ator of modelo.atores) {
    if (ator.tipo !== "CoI") continue;
    const temSaida = modelo.relacoes.some(
      (r) => r.origem === ator.nome && (r.tipo_fluxo === "Ser" || r.tipo_fluxo === "Sys"),
    );
    if (!temSaida) {
      avisos.push({
        campo: `atores["${ator.nome}"]`,
        mensagem: `O CoI "${ator.nome}" não possui relação de saída do tipo "Ser" ou "Sys".`,
        gravidade: "aviso",
      });
    }
  }

  // Regra 4: nenhuma relação direta Fornecedor -> Cliente.
  for (const rel of modelo.relacoes) {
    if (tipoPorNome.get(rel.origem) === "Fornecedor" && tipoPorNome.get(rel.destino) === "Cliente") {
      avisos.push({
        campo: `relacoes`,
        mensagem: `Relação direta de Fornecedor ("${rel.origem}") para Cliente ("${rel.destino}") — a notação SSN não prevê esse caminho.`,
        gravidade: "aviso",
      });
    }
  }

  // Regra 3: Intermediario não deveria receber diretamente do CoI quando há Agregador no modelo.
  const existeAgregador = modelo.atores.some((a) => a.tipo === "Agregador");
  if (existeAgregador) {
    for (const rel of modelo.relacoes) {
      if (tipoPorNome.get(rel.origem) === "CoI" && tipoPorNome.get(rel.destino) === "Intermediario") {
        avisos.push({
          campo: "relacoes",
          mensagem: `"${rel.origem}" (CoI) envia fluxo diretamente para o Intermediario "${rel.destino}", ignorando o Agregador presente no modelo.`,
          gravidade: "aviso",
        });
      }
    }
  }

  // Atores desconectados (nem origem nem destino de nenhuma relação).
  for (const ator of modelo.atores) {
    const participaDeAlgumaRelacao = modelo.relacoes.some(
      (r) => r.origem === ator.nome || r.destino === ator.nome,
    );
    if (!participaDeAlgumaRelacao) {
      avisos.push({
        campo: `atores["${ator.nome}"]`,
        mensagem: `O ator "${ator.nome}" não participa de nenhuma relação.`,
        gravidade: "aviso",
      });
    }
  }

  return avisos;
}

export function validarModeloSSN(valorBruto: unknown): ResultadoValidacao {
  const { erros, modelo } = validarEstrutura(valorBruto);
  if (erros.length > 0 || !modelo) {
    return { valido: false, erros, avisos: [] };
  }
  const avisos = validarSemantica(modelo);
  return { valido: true, erros: [], avisos };
}
