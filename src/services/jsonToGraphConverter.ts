// src/services/jsonToGraphConverter.ts
//
// Converte um ModeloSSN (JSON estruturado, sem qualquer XML) diretamente em
// células do maxGraph via chamadas de API (insertVertex/insertEdge), dentro
// de um graph.batchUpdate. Esta é a peça central do requisito "renderizar o
// diagrama a partir de um JSON estruturado, eliminando a dependência de
// XML": nenhum XML é gerado, lido ou usado em nenhum momento do fluxo — o
// próprio maxGraph.Cell é populado programaticamente a partir do objeto
// JavaScript deserializado da resposta da LLM.
//
// Mapeamento (ver services/graph/shapes.ts para os estilos):
//   - cada `ator`   -> um vértice, com forma/cor conforme o `tipo`
//   - cada `relacao`-> uma aresta, rotulada com o `tipo_fluxo`
//   - cada `gateway`-> um pequeno vértice-filho ("selo") ancorado no canto
//                      superior direito do ator correspondente

import type { AbstractGraph, Cell } from "@maxgraph/core";
import type { ModeloSSN } from "@/types/ssn";
import {
  ESTILO_ATOR,
  RECORTE_FLUXO,
  TAMANHO_ATOR,
  estiloGateway,
  estiloRelacao,
  registrarShapesCustomizados,
} from "@/services/graph/shapes";
import { aplicarLayoutHierarquico, ajustarZoomParaCaber, limparDiagrama } from "@/services/graph/layout";

export interface ResultadoConversao {
  /** Célula do maxGraph correspondente a cada ator, indexada pelo nome. */
  cellsPorAtor: Map<string, Cell>;
  /** Texto de tooltip para cada célula criada (atores, arestas e selos de gateway). */
  tooltips: Map<Cell, string>;
}

const TAMANHO_BADGE = 22;

export function converterModeloParaGrafo(graph: AbstractGraph, modelo: ModeloSSN): ResultadoConversao {
  registrarShapesCustomizados();

  const cellsPorAtor = new Map<string, Cell>();
  const tooltips = new Map<Cell, string>();

  graph.batchUpdate(() => {
    limparDiagrama(graph);
    const parent = graph.getDefaultParent();

    // 1) Atores -> vértices
    for (const ator of modelo.atores) {
      const [largura, altura] = TAMANHO_ATOR[ator.tipo];
      const cell = graph.insertVertex({
        parent,
        value: ator.nome,
        position: [0, 0], // recalculado pelo layout hierárquico logo abaixo
        size: [largura, altura],
        style: { ...ESTILO_ATOR[ator.tipo] },
      });
      cellsPorAtor.set(ator.nome, cell);
      tooltips.set(cell, `${ator.nome}\nTipo: ${ator.tipo}`);
    }

    // 2) Relações -> arestas
    for (const relacao of modelo.relacoes) {
      const origem = cellsPorAtor.get(relacao.origem);
      const destino = cellsPorAtor.get(relacao.destino);
      if (!origem || !destino) continue; // já sinalizado pelo validador

      const edge = graph.insertEdge({
        parent,
        source: origem,
        target: destino,
        value: RECORTE_FLUXO[relacao.tipo_fluxo],
        style: estiloRelacao(),
      });
      tooltips.set(
        edge,
        `${relacao.origem} → ${relacao.destino}\nFluxo: ${relacao.tipo_fluxo}`,
      );
    }

    // 3) Gateways -> selo (losango preto) ancorado no canto superior direito do ator
    for (const gateway of modelo.gateways) {
      const atorCell = cellsPorAtor.get(gateway.ator);
      if (!atorCell) continue; // já sinalizado pelo validador

      const [larguraAtor] = TAMANHO_ATOR[
        modelo.atores.find((a) => a.nome === gateway.ator)?.tipo ?? "CoI"
      ];
      const badge = graph.insertVertex({
        parent: atorCell,
        value: gateway.logica,
        position: [larguraAtor - TAMANHO_BADGE * 0.6, -TAMANHO_BADGE * 0.5],
        size: [TAMANHO_BADGE, TAMANHO_BADGE],
        style: estiloGateway(),
      });
      const rotuloDirecao = gateway.direcao === "split" ? "divide (split)" : "consolida (join)";
      tooltips.set(
        badge,
        `Gateway ${gateway.logica} em "${gateway.ator}"\n${rotuloDirecao}\n${gateway.descricao}`,
      );
    }

    aplicarLayoutHierarquico(graph);
  });

  ajustarZoomParaCaber(graph);

  return { cellsPorAtor, tooltips };
}
