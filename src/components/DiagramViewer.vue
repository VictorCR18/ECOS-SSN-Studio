<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Graph,
  InternalEvent,
  UndoManager,
  RubberBandHandler,
  getDefaultPlugins,
  type Cell,
  type FitPlugin,
  type TooltipHandler,
} from "@maxgraph/core";
import { useEcosStore } from "@/stores/ecosStore";
import { converterModeloParaGrafo } from "@/services/jsonToGraphConverter";
import { ajustarZoomParaCaber } from "@/services/graph/layout";
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

  const tooltipHandler = graph.getPlugin<TooltipHandler>("TooltipHandler");
  if (tooltipHandler) {
    tooltipHandler.getTooltipForCell = (cell: Cell) => tooltips.value.get(cell) ?? "";
  }

  renderizarModeloAtual();
});

onBeforeUnmount(() => {
  graph?.container.removeEventListener("pointerdown", focarDiagrama);
  graph?.container.removeEventListener("keydown", aoTeclar, true);
  graph?.destroy();
  graph = null;
  undoManager = null;
});

function renderizarModeloAtual() {
  if (!graph || !ecos.modeloAtual) return;
  const resultado = converterModeloParaGrafo(graph, ecos.modeloAtual);
  tooltips.value = resultado.tooltips;
  undoManager?.clear();
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
      graph?.removeCells(celulasSelecionadas, true);
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

      <div
        v-if="ecos.gerando"
        class="d-flex flex-column align-center justify-center"
        style="position: absolute; inset: 0"
      >
        <v-progress-circular indeterminate color="primary" size="48" class="mb-3" />
        <p class="text-body-2 text-medium-emphasis">Gerando modelo SSN…</p>
      </div>
    </div>
  </v-card>
</template>
