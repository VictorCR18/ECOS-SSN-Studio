<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ConnectionHandler,
  Graph,
  ImageBox,
  InternalEvent,
  UndoManager,
  RubberBandHandler,
  getDefaultPlugins,
  Cell,
  type FitPlugin,
  type TooltipHandler,
} from "@maxgraph/core";
import { useEcosStore } from "@/stores/ecosStore";
import { converterModeloParaGrafo } from "@/services/jsonToGraphConverter";
import { ajustarZoomParaCaber } from "@/services/graph/layout";
import { RECORTE_FLUXO } from "@/services/graph/shapes";
import { TIPOS_FLUXO, type TipoFluxo } from "@/types/ssn";
import {
  exportarDiagramaComoPNG,
  exportarDiagramaComoSVG,
  exportarModeloComoJSON,
} from "@/services/graph/exportService";

const ecos = useEcosStore();
const containerRef = ref<HTMLDivElement | null>(null);
const exportandoPng = ref(false);
const tooltips = ref(new Map<Cell, string>());

defineProps<{ telaCheia: boolean }>();
const emit = defineEmits<{ alternarTelaCheia: [] }>();

let graph: Graph | null = null;
let undoManager: UndoManager | null = null;
let connectionHandler: ConnectionHandler | null = null;
let removerConexao: (() => void) | null = null;
let resultadoRenderizacao: ReturnType<typeof converterModeloParaGrafo> | null = null;

const menuFluxo = ref<{ x: number; y: number; origem: Cell; destino: Cell } | null>(null);
const tiposFluxo = TIPOS_FLUXO;
const pontoConexao =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Ccircle cx='6' cy='6' r='4.75' fill='%2343A047' stroke='white' stroke-width='1.25'/%3E%3C/svg%3E";

onMounted(() => {
  if (!containerRef.value) return;

  InternalEvent.disableContextMenu(containerRef.value);
  graph = new Graph(containerRef.value, undefined, [...getDefaultPlugins(), RubberBandHandler]);
  const rubberBand = graph.getPlugin<RubberBandHandler>("RubberBandHandler");
  if (rubberBand) {
    rubberBand.isForceRubberbandEvent = (evento) => !evento.getState();
  }
  graph.setPanning(true);
  graph.setConnectable(true);
  graph.setCellsMovable(true);
  graph.setDisconnectOnMove(false);
  graph.setCellsBendable(true);
  graph.setEdgeLabelsMovable(true);
  graph.setCellsEditable(true); // permite renomear um ator com duplo clique
  graph.setHtmlLabels(false);
  graph.container.tabIndex = 0;

  undoManager = new UndoManager();
  const registrarEdicao = (_sender: unknown, evento: { getProperty: (nome: string) => unknown }) => {
    const edicao = evento.getProperty("edit");
    if (edicao) undoManager?.undoableEditHappened(edicao as never);
  };
  graph.getDataModel().addListener(InternalEvent.UNDO, registrarEdicao);
  graph.getView().addListener(InternalEvent.UNDO, registrarEdicao);
  graph.container.addEventListener("pointerdown", focarDiagrama);
  graph.container.addEventListener("keydown", aoTeclar, true);
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, aoMudarSelecao);
  connectionHandler = graph.getPlugin<ConnectionHandler>("ConnectionHandler") ?? null;

  const tooltipHandler = graph.getPlugin<TooltipHandler>("TooltipHandler");
  if (tooltipHandler) {
    tooltipHandler.getTooltipForCell = (cell: Cell) => tooltips.value.get(cell) ?? "";
  }

  renderizarModeloAtual();
});

onBeforeUnmount(() => {
  graph?.container.removeEventListener("pointerdown", focarDiagrama);
  graph?.container.removeEventListener("keydown", aoTeclar, true);
  graph?.getSelectionModel().removeListener(aoMudarSelecao);
  removerConexao?.();
  removerConexao = null;
  graph?.destroy();
  graph = null;
  undoManager = null;
  connectionHandler = null;
});

function renderizarModeloAtual() {
  if (!graph || !ecos.modeloAtual) return;
  resultadoRenderizacao = converterModeloParaGrafo(graph, ecos.modeloAtual);
  tooltips.value = resultadoRenderizacao.tooltips;
  configurarConexoes();
  undoManager?.clear();
}

function configurarConexoes() {
  if (!graph || !connectionHandler) return;
  connectionHandler.connectImage = new ImageBox(pontoConexao, 12, 12);
  connectionHandler.cursorConnect = "crosshair";
  connectionHandler.createTarget = false;
  connectionHandler.outlineConnect = false;
  connectionHandler.isValidSource = (cell) =>
    Boolean(resultadoRenderizacao?.cellsPorAtor && [...resultadoRenderizacao.cellsPorAtor.values()].includes(cell));
  connectionHandler.isValidTarget = (cell) =>
    Boolean(resultadoRenderizacao?.cellsPorAtor && [...resultadoRenderizacao.cellsPorAtor.values()].includes(cell));
  connectionHandler.validateConnection = (source, target) => {
    if (!source || !target) return null;
    if (source === target) return "Um ator não pode se conectar a si mesmo.";
    return graph?.getEdgeValidationError(null, source, target) ?? null;
  };

  if (!removerConexao) {
    const aoConectar = (_sender: unknown, evento: { getProperty: (nome: string) => unknown }) => {
      const edge = evento.getProperty("cell");
      const origem = evento.getProperty("terminal");
      const mouse = evento.getProperty("event");
      if (!(edge instanceof Cell) || !(origem instanceof Cell) || !(mouse instanceof MouseEvent)) return;
      const destino = edge.getTerminal(false);
      if (!destino || !resultadoRenderizacao?.cellsPorAtor) return;
      const graphAtual = graph;
      if (!graphAtual) return;
      graphAtual.removeCells([edge], true);
      const rect = graphAtual.container.getBoundingClientRect();
      menuFluxo.value = {
        x: mouse.clientX - rect.left,
        y: mouse.clientY - rect.top,
        origem,
        destino,
      };
    };
    connectionHandler.addListener(InternalEvent.CONNECT, aoConectar);
    removerConexao = () => connectionHandler?.removeListener(aoConectar);
  }

  atualizarIconeDoAtorSelecionado();
}

function atualizarIconeDoAtorSelecionado() {
  if (!graph || !connectionHandler || connectionHandler.isConnecting()) return;
  const selecionado = graph.getSelectionCell();
  const eAtor = selecionado && resultadoRenderizacao?.cellsPorAtor
    ? [...resultadoRenderizacao.cellsPorAtor.values()].includes(selecionado)
    : false;
  if (!eAtor || !selecionado) {
    if (connectionHandler.iconState && !connectionHandler.currentState) connectionHandler.destroyIcons();
    return;
  }
  if (connectionHandler.iconState?.cell === selecionado) return;
  connectionHandler.destroyIcons();
  const estado = graph.getView().getState(selecionado);
  if (!estado) return;
  connectionHandler.icons = connectionHandler.createIcons(estado);
  const icone = connectionHandler.icons[0];
  if (icone?.node) {
    icone.node.setAttribute("title", "Arraste para conectar a outro elemento");
    icone.node.setAttribute("data-graph-ui", "true");
  }
}

function escolherTipoFluxo(tipoFluxo: TipoFluxo) {
  const pendente = menuFluxo.value;
  if (!pendente || !graph || !ecos.modeloAtual || !resultadoRenderizacao) return;
  const origem = [...resultadoRenderizacao.cellsPorAtor.entries()].find(([, cell]) => cell === pendente.origem)?.[0];
  const destino = [...resultadoRenderizacao.cellsPorAtor.entries()].find(([, cell]) => cell === pendente.destino)?.[0];
  if (!origem || !destino) return cancelarFluxo();

  const duplicada = ecos.modeloAtual.relacoes.some(
    (relacao) => relacao.origem === origem && relacao.destino === destino && relacao.tipo_fluxo === tipoFluxo,
  );
  if (!duplicada) {
    ecos.atualizarModeloEditado({
      ...ecos.modeloAtual,
      relacoes: [...ecos.modeloAtual.relacoes, { origem, destino, tipo_fluxo: tipoFluxo }],
    });
  }
  menuFluxo.value = null;
}

function cancelarFluxo() {
  menuFluxo.value = null;
}

function aoMudarSelecao() {
  atualizarIconeDoAtorSelecionado();
}

watch(
  () => ecos.modeloAtual,
  async () => {
    await nextTick();
    renderizarModeloAtual();
  },
);

function aoZoomIn() {
  graph?.zoomIn();
}
function aoZoomOut() {
  graph?.zoomOut();
}
function aoAjustarZoom() {
  if (graph) ajustarZoomParaCaber(graph);
}
function aoZoomReal() {
  graph?.zoomActual();
}

function focarDiagrama(evento: PointerEvent) {
  const alvo = evento.target as HTMLElement;
  if (!alvo.closest("input, textarea, [contenteditable='true']")) {
    graph?.container.focus();
  }
}

function aoTeclar(evento: KeyboardEvent) {
  const alvo = evento.target as HTMLElement;
  if (alvo.closest("input, textarea, [contenteditable='true']")) return;

  const tecla = evento.key.toLowerCase();
  if ((evento.ctrlKey || evento.metaKey) && tecla === "z") {
    evento.preventDefault();
    if (evento.shiftKey) undoManager?.redo();
    else undoManager?.undo();
    return;
  }

  if ((evento.ctrlKey || evento.metaKey) && tecla === "y") {
    evento.preventDefault();
    undoManager?.redo();
    return;
  }

  if (evento.key === "Backspace" || evento.key === "Delete") {
    const celulasSelecionadas = graph?.getSelectionCells() ?? [];
    if (celulasSelecionadas.length > 0) {
      evento.preventDefault();
      const removidas = celulasSelecionadas
        .map((cell) => resultadoRenderizacao?.relacoesPorAresta.get(cell))
        .filter((relacao): relacao is { origem: string; destino: string; tipoFluxo: string } => Boolean(relacao));
      graph?.removeCells(celulasSelecionadas, true);
      if (removidas.length > 0 && ecos.modeloAtual) {
        const relacoes = ecos.modeloAtual.relacoes.filter(
          (relacao) => !removidas.some(
            (removida) => relacao.origem === removida.origem
              && relacao.destino === removida.destino
              && relacao.tipo_fluxo === removida.tipoFluxo,
          ),
        );
        ecos.atualizarModeloEditado({ ...ecos.modeloAtual, relacoes });
      }
    }
  }
}

function aoExportarSVG() {
  if (!containerRef.value || !ecos.modeloAtual) return;
  exportarDiagramaComoSVG(containerRef.value, ecos.modeloAtual.ecos);
}

async function aoExportarPNG() {
  if (!containerRef.value || !ecos.modeloAtual) return;
  exportandoPng.value = true;
  try {
    await exportarDiagramaComoPNG(containerRef.value, ecos.modeloAtual.ecos);
  } finally {
    exportandoPng.value = false;
  }
}

function aoExportarJSON() {
  if (!ecos.modeloAtual) return;
  exportarModeloComoJSON(ecos.modeloAtual);
}
</script>

<template>
  <v-card
    variant="flat"
    class="pa-0 d-flex flex-column"
    :class="{ 'diagrama-tela-cheia': telaCheia }"
    style="height: 100%"
  >
    <v-toolbar density="compact" color="surface" flat class="px-2" style="flex: none">
      <span class="fonte-display text-subtitle-1 mr-4">Diagrama SSN</span>
      <v-btn-group density="comfortable" variant="outlined" divided class="mr-2">
        <v-btn icon="mdi-magnify-minus-outline" size="small" @click="aoZoomOut" />
        <v-btn icon="mdi-magnify-plus-outline" size="small" @click="aoZoomIn" />
        <v-btn icon="mdi-fit-to-page-outline" size="small" @click="aoAjustarZoom" />
        <v-btn icon="mdi-magnify-scan" size="small" @click="aoZoomReal" />
      </v-btn-group>

      <v-spacer />

      <v-btn
        class="mr-2"
        :icon="telaCheia ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
        size="small"
        variant="text"
        :aria-label="telaCheia ? 'Sair da tela cheia' : 'Abrir diagrama em tela cheia'"
        :title="telaCheia ? 'Sair da tela cheia' : 'Abrir diagrama em tela cheia'"
        @click="emit('alternarTelaCheia')"
      />

      <v-btn-group density="comfortable" variant="outlined" divided>
        <v-btn
          prepend-icon="mdi-code-json"
          size="small"
          :disabled="!ecos.modeloAtual"
          @click="aoExportarJSON"
        >
          JSON
        </v-btn>
        <v-btn
          prepend-icon="mdi-svg"
          size="small"
          :disabled="!ecos.modeloAtual"
          @click="aoExportarSVG"
        >
          SVG
        </v-btn>
        <v-btn
          prepend-icon="mdi-file-image-outline"
          size="small"
          :loading="exportandoPng"
          :disabled="!ecos.modeloAtual"
          @click="aoExportarPNG"
        >
          PNG
        </v-btn>
      </v-btn-group>

      <v-btn
        class="ml-2"
        prepend-icon="mdi-content-save-outline"
        color="secondary"
        variant="flat"
        size="small"
        :disabled="!ecos.modeloAtual"
        @click="ecos.salvarModeloAtual()"
      >
        Salvar
      </v-btn>
    </v-toolbar>

    <div class="fundo-blueprint flex-grow-1" style="min-height: 0; position: relative">
      <div ref="containerRef" class="container-diagrama" />

      <div
        v-if="menuFluxo"
        class="menu-fluxo"
        :style="{ left: `${menuFluxo.x}px`, top: `${menuFluxo.y}px` }"
        role="menu"
        @pointerdown.stop
      >
        <span class="menu-fluxo-titulo">Tipo de fluxo</span>
        <button
          v-for="tipo in tiposFluxo"
          :key="tipo"
          type="button"
          class="menu-fluxo-opcao"
          role="menuitem"
          @click="escolherTipoFluxo(tipo)"
        >
          <span class="menu-fluxo-placa">{{ RECORTE_FLUXO[tipo] }}</span>
        </button>
        <button type="button" class="menu-fluxo-cancelar" @click="cancelarFluxo">Cancelar</button>
      </div>

      <div
        v-if="!ecos.modeloAtual && !ecos.gerando"
        class="d-flex flex-column align-center justify-center text-center pa-8"
        style="position: absolute; inset: 0; pointer-events: none"
      >
        <v-icon icon="mdi-graph-outline" size="56" class="mb-3 text-medium-emphasis" />
        <p class="text-body-1 text-medium-emphasis" style="max-width: 360px">
          Descreva um ecossistema de software à esquerda e clique em "Gerar Modelo SSN" para ver o
          diagrama aqui.
        </p>
      </div>

    </div>
  </v-card>
</template>

<style scoped>
.menu-fluxo {
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 96px;
  padding: 8px;
  border: 1px solid rgba(26, 26, 26, 0.3);
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
}

.menu-fluxo-titulo {
  padding: 0 4px 3px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.72rem;
  font-weight: 600;
}

.menu-fluxo-opcao,
.menu-fluxo-cancelar {
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.menu-fluxo-opcao {
  padding: 2px 4px;
}

.menu-fluxo-opcao:hover,
.menu-fluxo-cancelar:hover {
  background: rgba(var(--v-theme-primary), 0.1);
}

.menu-fluxo-placa {
  display: inline-flex;
  width: 48px;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 8px 0 4px;
  border: 1px solid #1a1a1a;
  background: #fff;
  color: #1a1a1a;
  clip-path: polygon(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%);
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
}

.menu-fluxo-cancelar {
  margin-top: 3px;
  padding: 4px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-size: 0.75rem;
}
</style>
