// Converte um ModeloSSN em células do maxGraph, sem gerar XML.

import { Geometry, type AbstractGraph, type Cell } from "@maxgraph/core";
import type { ModeloSSN } from "@/types/ssn";
import {
  ESTILO_ATOR,
  RECORTE_FLUXO,
  TAMANHO_ATOR,
  estiloGateway,
  estiloRelacao,
  registrarShapesCustomizados,
} from "@/services/graph/shapes";
import {
  aplicarLayoutHierarquico,
  ajustarZoomParaCaber,
  limparDiagrama,
} from "@/services/graph/layout";

export interface ResultadoConversao {
  /** Célula do maxGraph correspondente a cada ator, indexada pelo nome. */
  cellsPorAtor: Map<string, Cell>;
  /** Texto de tooltip para cada célula criada (atores, arestas e gateways lógicos). */
  tooltips: Map<Cell, string>;
}

interface GatewayInserido {
  cell: Cell;
  id?: string;
  tipoFluxo: string;
  membros?: string[];
}

const TAMANHO_BADGE = 42;
const ESPACAMENTO_GATEWAY = 32;

export function converterModeloParaGrafo(
  graph: AbstractGraph,
  modelo: ModeloSSN,
): ResultadoConversao {
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

    // Gateways são indexados por ator/direção e, quando possível, por id.
    const gatewaysPorChave = new Map<string, GatewayInserido[]>();
    const gatewaysPorId = new Map<string, GatewayInserido>();
    const gatewaysVisuais: {
      atorCell: Cell;
      gatewayCell: Cell;
      direcao: "split" | "join";
    }[] = [];

    for (const gateway of modelo.gateways) {
      if (gateway.eh_logico === false || !gateway.tipo_fluxo) continue;

      const atorCell = cellsPorAtor.get(gateway.ator);
      if (!atorCell) continue; // já sinalizado pelo validador

      const gatewayCell = graph.insertVertex({
        parent,
        value: gateway.logica,
        position: [0, 0], // recalculado pelo layout hierárquico logo abaixo
        size: [TAMANHO_BADGE, TAMANHO_BADGE],
        style: estiloGateway(),
      });

      const info: GatewayInserido = {
        cell: gatewayCell,
        id: gateway.id,
        tipoFluxo: gateway.tipo_fluxo,
        membros: gateway.membros,
      };

      const chave = `${gateway.ator}\0${gateway.direcao}`;
      const lista = gatewaysPorChave.get(chave) ?? [];
      lista.push(info);
      gatewaysPorChave.set(chave, lista);
      if (gateway.id) gatewaysPorId.set(gateway.id, info);

      gatewaysVisuais.push({ atorCell, gatewayCell, direcao: gateway.direcao });

      const rotuloDirecao =
        gateway.direcao === "split" ? "divide (split)" : "consolida (join)";
      const rotuloMembros = gateway.membros?.length
        ? `\nMembros: ${gateway.membros.join(", ")}`
        : "";
      tooltips.set(
        gatewayCell,
        `Gateway ${gateway.logica} em "${gateway.ator}"\n${rotuloDirecao}\nAplica-se somente a relações de fluxo "${gateway.tipo_fluxo}"${rotuloMembros}\n${gateway.descricao}`,
      );
    }

    // Gateways encadeados não recebem a conexão automática com o ator final.
    const gatewaysEncadeados = new Set<string>();
    for (const gateway of modelo.gateways) {
      if (!gateway.membros) continue;
      for (const membro of gateway.membros) {
        if (gatewaysPorId.has(membro)) gatewaysEncadeados.add(membro);
      }
    }

    // 3) Relações -> arestas, passando pelos gateways quando aplicável.
    const conectoresGateway = new Set<Cell>();
    const criarAresta = (
      source: Cell,
      target: Cell,
      value: string,
      tooltip?: string,
    ): Cell => {
      const edge = graph.insertEdge({
        parent,
        source,
        target,
        value,
        style: estiloRelacao(),
      });
      if (tooltip) tooltips.set(edge, tooltip);
      return edge;
    };

    // Prioriza membros explícitos e usa um gateway sem membros como fallback.
    const gatewayAplicavel = (
      candidatos: GatewayInserido[] | undefined,
      origemOuGatewayId: string,
      tipoFluxo: string,
    ): GatewayInserido | undefined => {
      if (!candidatos) return undefined;
      const doTipo = candidatos.filter((c) => c.tipoFluxo === tipoFluxo);
      const matchExplicito = doTipo.find(
        (c) => c.membros && c.membros.includes(origemOuGatewayId),
      );
      if (matchExplicito) return matchExplicito;
      return doTipo.find((c) => !c.membros);
    };

    for (const relacao of modelo.relacoes) {
      const origem = cellsPorAtor.get(relacao.origem);
      const destino = cellsPorAtor.get(relacao.destino);
      if (!origem || !destino) continue; // já sinalizado pelo validador

      const gatewaySplit = gatewayAplicavel(
        gatewaysPorChave.get(`${relacao.origem}\0split`),
        relacao.origem,
        relacao.tipo_fluxo,
      );
      const gatewayJoin = gatewayAplicavel(
        gatewaysPorChave.get(`${relacao.destino}\0join`),
        relacao.destino,
        relacao.tipo_fluxo,
      );
      let source = origem;
      let target = destino;

      if (gatewaySplit) {
        source = gatewaySplit.cell;
        if (!conectoresGateway.has(gatewaySplit.cell)) {
          // Só liga origem->gateway diretamente se este gateway NÃO for, ele
          // mesmo, membro de um gateway "pai" (split encadeado). Se for, a
          // aresta correta (pai->este gateway) é criada no passo 3b.
          if (!gatewaySplit.id || !gatewaysEncadeados.has(gatewaySplit.id)) {
            criarAresta(origem, gatewaySplit.cell, "");
          }
          conectoresGateway.add(gatewaySplit.cell);
        }
      }
      if (gatewayJoin) {
        target = gatewayJoin.cell;
        if (!conectoresGateway.has(gatewayJoin.cell)) {
          // Idem para join: só liga gateway->destino final se este gateway
          // não estiver encadeado num gateway "pai" (ex.: gw_mobile, que
          // desemboca em gw_canal, e não direto em USUÁRIOS).
          if (!gatewayJoin.id || !gatewaysEncadeados.has(gatewayJoin.id)) {
            criarAresta(gatewayJoin.cell, destino, "");
          }
          conectoresGateway.add(gatewayJoin.cell);
        }
      }

      criarAresta(
        source,
        target,
        RECORTE_FLUXO[relacao.tipo_fluxo],
        `${relacao.origem} → ${relacao.destino}\nFluxo: ${relacao.tipo_fluxo}`,
      );
    }

    // 3b) Encadeamento gateway -> gateway: quando um gateway lista o `id` de
    // outro gateway em `membros`, isso não é uma `relacao` do JSON — é o
    // losango "de baixo" alimentando o losango "de cima" (ex.: App
    // Store+Play Store consolidados num OU, que por sua vez é uma das
    // alternativas do OU maior junto com Navegadores).
    for (const gateway of modelo.gateways) {
      if (!gateway.id || !gateway.membros) continue;
      const destinoInfo = gatewaysPorId.get(gateway.id);
      if (!destinoInfo) continue;

      for (const membro of gateway.membros) {
        const origemGatewayInfo = gatewaysPorId.get(membro);
        if (!origemGatewayInfo) continue; // é nome de ator, já tratado no loop de relações acima
        if (gateway.direcao === "join") {
          criarAresta(origemGatewayInfo.cell, destinoInfo.cell, "");
        } else {
          criarAresta(destinoInfo.cell, origemGatewayInfo.cell, "");
        }
      }
    }

    aplicarLayoutHierarquico(graph);

    // Mantém o(s) losango(s) fora do ator, com uma aresta explícita entre os dois.
    // Quando há mais de um gateway no mesmo ator+direção, escalona a posição
    // em x para não sobrepor um losango no outro.
    const ocorrenciaPorAtorDirecao = new Map<string, number>();
    for (const { atorCell, gatewayCell, direcao } of gatewaysVisuais) {
      const atorGeometry = atorCell.getGeometry();
      const gatewayGeometry = gatewayCell.getGeometry();
      if (!atorGeometry || !gatewayGeometry) continue;

      const chaveOcorrencia = `${atorCell.id}\0${direcao}`;
      const indice = ocorrenciaPorAtorDirecao.get(chaveOcorrencia) ?? 0;
      ocorrenciaPorAtorDirecao.set(chaveOcorrencia, indice + 1);

      const deslocamento = (gatewayGeometry.width + ESPACAMENTO_GATEWAY) * indice;
      const x =
        direcao === "split"
          ? atorGeometry.x + atorGeometry.width + ESPACAMENTO_GATEWAY + deslocamento
          : atorGeometry.x - gatewayGeometry.width - ESPACAMENTO_GATEWAY - deslocamento;
      const y =
        atorGeometry.y + (atorGeometry.height - gatewayGeometry.height) / 2;
      graph
        .getDataModel()
        .setGeometry(
          gatewayCell,
          new Geometry(x, y, gatewayGeometry.width, gatewayGeometry.height),
        );
    }
  });

  ajustarZoomParaCaber(graph);

  return { cellsPorAtor, tooltips };
}