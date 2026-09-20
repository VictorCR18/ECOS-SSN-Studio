// src/services/graph/layout.ts
//
// A resposta da LLM não traz posições — apenas atores e relações. Usamos o
// algoritmo hierárquico (Sugiyama) nativo do maxGraph para posicionar os
// atores automaticamente, da esquerda (Fornecedores, sem entrada) para a
// direita (Clientes/ClientesDoCliente, folhas do grafo), e então ajustamos o
// zoom para que o diagrama inteiro caiba no contêiner visível.

import { HierarchicalLayout, type AbstractGraph } from "@maxgraph/core";
import type { FitPlugin } from "@maxgraph/core";

export function aplicarLayoutHierarquico(graph: AbstractGraph): void {
  const layout = new HierarchicalLayout(graph, "west", true);
  layout.intraCellSpacing = 50;
  layout.interRankCellSpacing = 110;
  layout.interHierarchySpacing = 60;
  layout.execute(graph.getDefaultParent());
}

/** Ajusta o zoom para que todo o diagrama caiba no contêiner (via FitPlugin nativo). */
export function ajustarZoomParaCaber(graph: AbstractGraph): void {
  const fit = graph.getPlugin<FitPlugin>("fit");
  fit?.fitCenter({ margin: 32 });
}

/** Remove todos os atores (e seus filhos/arestas) do diagrama atual. */
export function limparDiagrama(graph: AbstractGraph): void {
  const parent = graph.getDefaultParent();
  const raizes = graph.getChildVertices(parent);
  if (raizes.length > 0) {
    graph.removeCells(raizes, true);
  }
}
