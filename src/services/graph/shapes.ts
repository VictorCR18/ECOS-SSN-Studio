// src/services/graph/shapes.ts
//
// Registra shapes customizados no maxGraph (usados pelos atores conforme a
// notação SSN) e centraliza
// a definição visual (cor, forma, perímetro) de cada tipo de ator, tipo de
// fluxo e gateway — usada por jsonToGraphConverter.ts.
//
// O maxGraph não inclui um shape de pentágono nativo (apenas rectangle,
// ellipse, rhombus, hexagon, triangle, cylinder, actor, cloud, etc.), então
// registramos um a partir de HexagonShape, seguindo o mesmo padrão de
// implementação (`redrawPath` + `addPoints`) usado pelos shapes nativos do
// próprio maxGraph (ver node_modules/@maxgraph/core/.../HexagonShape.js).

import {
  HexagonShape,
  Point,
  ShapeRegistry,
  type AbstractCanvas2D,
  type CellStyle,
  type EdgeStyleFunction,
} from "@maxgraph/core";
import type { TipoAtor, TipoFluxo } from "@/types/ssn";

/**
 * Pentágono de "corpo alongado" (como uma seta/placa apontando para a
 * direita), usado pelo ator Fornecedor na notação SSN.
 */
class PentagonShape extends HexagonShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.getBaseArcSize();
    this.addPoints(
      c,
      [
        new Point(0, 0),
        new Point(0.75 * w, 0),
        new Point(w, 0.5 * h),
        new Point(0.75 * w, h),
        new Point(0, h),
      ],
      this.isRounded,
      arcSize,
      true,
    );
  }
}

/** Pentágono espelhado, com a ponta voltada para a esquerda, do Cliente. */
class LeftPointingPentagonShape extends HexagonShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.getBaseArcSize();
    this.addPoints(
      c,
      [
        new Point(0, 0.5 * h),
        new Point(0.25 * w, 0),
        new Point(w, 0),
        new Point(w, h),
        new Point(0.25 * w, h),
      ],
      this.isRounded,
      arcSize,
      true,
    );
  }
}

/** Retângulo com recorte em V na extremidade direita, como uma cauda de andorinha. */
class RightForkShape extends HexagonShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(0.68 * w, 0.5 * h);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }
}

/** Paralelogramo com laterais inclinadas para a direita, usado pelo Agregador. */
class ParallelogramShape extends HexagonShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0.18 * w, 0);
    c.lineTo(w, 0);
    c.lineTo(0.82 * w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }
}

/** Placa de fluxo com ponta à direita, usada nos rótulos das relações. */
class FlowShape extends HexagonShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(0.75 * w, 0);
    c.lineTo(w, 0.5 * h);
    c.lineTo(0.75 * w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }
}

let shapesCustomizadosRegistrados = false;

/** Registra o shape de pentágono uma única vez (idempotente). */
export function registrarShapesCustomizados(): void {
  if (shapesCustomizadosRegistrados) return;
  ShapeRegistry.add("pentagon", PentagonShape);
  ShapeRegistry.add("leftPointingPentagon", LeftPointingPentagonShape);
  ShapeRegistry.add("rightFork", RightForkShape);
  ShapeRegistry.add("parallelogram", ParallelogramShape);
  ShapeRegistry.add("flow", FlowShape);
  shapesCustomizadosRegistrados = true;
}

/** Estilo visual (cor, forma, perímetro) de cada tipo de ator, conforme a notação SSN. */
export const ESTILO_ATOR: Record<TipoAtor, CellStyle> = {
  CoI: {
    shape: "rectangle",
    rounded: false,
    fillColor: "#2F5AC7",
    strokeColor: "#1C3A85",
    fontColor: "#FFFFFF",
    fontStyle: 1, // bold
  },
  Fornecedor: {
    shape: "pentagon",
    fillColor: "#E38B29",
    strokeColor: "#A6621A",
    fontColor: "#FFFFFF",
  },
  Cliente: {
    shape: "leftPointingPentagon",
    fillColor: "#E8C547",
    strokeColor: "#A88E22",
    fontColor: "#3A2E00",
  },
  Intermediario: {
    shape: "hexagon",
    perimeter: "hexagonPerimeter",
    fillColor: "#3FA34D",
    strokeColor: "#276B32",
    fontColor: "#FFFFFF",
  },
  Agregador: {
    shape: "parallelogram",
    perimeter: "rectanglePerimeter",
    fillColor: "#D64545",
    strokeColor: "#800a0a",
    strokeWidth: 1,
    fontColor: "#FFFFFF",
    fontStyle: 1,
  },
  ClienteDoCliente: {
    shape: "rightFork",
    fillColor: "#B8BDC2",
    strokeColor: "#424141",
    strokeWidth: 1,
    fontColor: "#1A1A1A",
  },
};

/** Tamanho padrão (largura, altura) sugerido para cada tipo de ator. */
export const TAMANHO_ATOR: Record<TipoAtor, [number, number]> = {
  CoI: [160, 60],
  Fornecedor: [150, 60],
  Cliente: [150, 60],
  Intermediario: [160, 60],
  Agregador: [160, 60],
  ClienteDoCliente: [150, 60],
};

const linhaDireta: EdgeStyleFunction = (estado, origem, destino, _pontos, resultado) => {
  if (!origem || !destino) return;
  const pontoOrigem = estado.view.getFloatingTerminalPoint(estado, origem, destino, true);
  const pontoDestino = estado.view.getFloatingTerminalPoint(estado, destino, origem, false);
  if (!pontoOrigem || !pontoDestino) return;
  resultado[0] = pontoOrigem;
  resultado.push(pontoDestino);
};

/** Estilo da aresta (relação) — igual para todos os tipos de fluxo; o rótulo os distingue. */
export function estiloRelacao(): CellStyle {
  return {
    edgeStyle: linhaDireta,
    rounded: false,
    strokeColor: "#33383D",
    strokeWidth: 1.6,
    endArrow: "none",
    endFill: false,
    fontColor: "#1A1A1A",
    fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace",
    align: "center",
    verticalAlign: "middle",
  };
}

/** Estilo da placa que identifica o tipo de fluxo sobre a aresta. */
export function estiloFluxo(): CellStyle {
  return {
    shape: "flow",
    fillColor: "#FFFFFF",
    strokeColor: "#1A1A1A",
    strokeWidth: 1,
    fontColor: "#1A1A1A",
    fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace",
    align: "center",
    verticalAlign: "middle",
  };
}

/** Dimensões compartilhadas pela placa da legenda e pelos rótulos nas arestas. */
export const DIMENSOES_FLUXO = {
  altura: 22,
  larguraMinima: 48,
  paddingHorizontal: 8,
  paddingEsquerda: 4,
} as const;

export const ESTILO_LEGENDA_FLUXO = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  width: `${DIMENSOES_FLUXO.larguraMinima}px`,
  minHeight: `${DIMENSOES_FLUXO.altura}px`,
  padding: `0 ${DIMENSOES_FLUXO.paddingHorizontal}px 0 ${DIMENSOES_FLUXO.paddingEsquerda}px`,
  backgroundColor: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #1A1A1A",
  clipPath: "polygon(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%)",
  flexShrink: "0",
} as const;

export const RECORTE_FLUXO: Record<TipoFluxo, string> = {
  P: "P",
  Ser: "Ser",
  Req: "Req",
  Des: "Des",
  Comp: "Comp",
  Sys: "Sys",
};

/** Estilo do vértice de gateway lógico (losango preto com texto branco). */
export function estiloGateway(): CellStyle {
  return {
    shape: "rhombus",
    perimeter: "rhombusPerimeter",
    fillColor: "#1A1A1A",
    strokeColor: "#000000",
    fontColor: "#FFFFFF",
    fontSize: 10,
    fontStyle: 1,
    fontFamily: "IBM Plex Mono, monospace",
  };
}
