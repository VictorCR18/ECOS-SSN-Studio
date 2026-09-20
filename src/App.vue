<script setup lang="ts">
import { ref } from "vue";
import { useTheme } from "vuetify";
import { useDisplay } from "vuetify";
import { useEcosStore } from "@/stores/ecosStore";

import DescricaoEditor from "@/components/DescricaoEditor.vue";
import ConfigPanel from "@/components/ConfigPanel.vue";
import ModelHistory from "@/components/ModelHistory.vue";
import DiagramViewer from "@/components/DiagramViewer.vue";
import SsnLegend from "@/components/SsnLegend.vue";
import ValidationPanel from "@/components/ValidationPanel.vue";

const ecos = useEcosStore();
const theme = useTheme();
const { mobile } = useDisplay();

const drawerAberto = ref(true);
const drawerRecolhido = ref(false);
const diagramaExpandido = ref(false);
const painelDireitaAberto = ref(true);
const painelAtivo = ref(["editor"]);

function alternarTema() {
  theme.global.name.value = theme.global.name.value === "ecosLight" ? "ecosDark" : "ecosLight";
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-nav-icon v-if="mobile" @click="drawerAberto = !drawerAberto" />
      <v-icon icon="mdi-graph-outline" class="ml-2 mr-2" />
      <v-toolbar-title class="fonte-display font-weight-medium">
        ECOS SSN Studio
      </v-toolbar-title>
      <v-chip size="small" variant="flat" color="secondary" class="ml-3 d-none d-sm-flex">
        Geração automática via LLM
      </v-chip>

      <v-spacer />

      <v-btn
        prepend-icon="mdi-file-plus-outline"
        variant="text"
        class="d-none d-sm-flex"
        @click="ecos.novoModelo()"
      >
        Novo Modelo
      </v-btn>
      <v-btn icon="mdi-file-plus-outline" class="d-flex d-sm-none" @click="ecos.novoModelo()" />

      <v-btn icon @click="alternarTema">
        <v-icon>{{ theme.global.current.value.dark ? "mdi-weather-sunny" : "mdi-weather-night" }}</v-icon>
      </v-btn>

      <v-btn v-if="mobile" icon="mdi-format-list-bulleted" @click="painelDireitaAberto = !painelDireitaAberto" />
    </v-app-bar>

    <v-navigation-drawer
      v-if="!diagramaExpandido || mobile"
      v-model="drawerAberto"
      :permanent="!mobile"
      :temporary="mobile"
      :rail="!mobile && drawerRecolhido"
      width="380"
    >
      <div v-if="!drawerRecolhido || mobile" class="d-flex align-center px-3 py-2">
        <span class="fonte-display text-subtitle-1">Menu do modelo</span>
        <v-spacer />
        <v-btn
          icon="mdi-chevron-left"
          variant="text"
          size="small"
          aria-label="Recolher menu lateral"
          title="Recolher menu lateral"
          @click="drawerRecolhido = true"
        />
      </div>

      <div v-if="drawerRecolhido && !mobile" class="d-flex flex-column align-center ga-2 pa-2">
        <v-tooltip text="Geração de Modelo" location="right">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-file-document-edit-outline" variant="text" @click="painelAtivo = ['editor']; drawerRecolhido = false" />
          </template>
        </v-tooltip>
        <v-tooltip text="Configurações de API" location="right">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-cog-outline" variant="text" @click="painelAtivo = ['config']; drawerRecolhido = false" />
          </template>
        </v-tooltip>
        <v-tooltip text="Modelos Salvos" location="right">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-history" variant="text" @click="painelAtivo = ['historico']; drawerRecolhido = false" />
          </template>
        </v-tooltip>
        <v-btn
          icon="mdi-chevron-right"
          variant="text"
          size="small"
          aria-label="Expandir menu lateral"
          title="Expandir menu lateral"
          @click="drawerRecolhido = false"
        />
      </div>

      <v-expansion-panels v-if="!drawerRecolhido || mobile" v-model="painelAtivo" multiple variant="accordion">
        <v-expansion-panel value="editor" title="Geração de Modelo" prepend-icon="mdi-file-document-edit-outline">
          <v-expansion-panel-text class="pa-0">
            <DescricaoEditor />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel value="config" title="Configurações de API" prepend-icon="mdi-cog-outline">
          <v-expansion-panel-text class="pa-0">
            <ConfigPanel />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel value="historico" title="Modelos Salvos" prepend-icon="mdi-history">
          <v-expansion-panel-text class="pa-0">
            <ModelHistory />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-navigation-drawer>

    <v-navigation-drawer
      v-if="!diagramaExpandido"
      v-model="painelDireitaAberto"
      location="right"
      :permanent="!mobile"
      :temporary="mobile"
      width="300"
    >
      <SsnLegend />
    </v-navigation-drawer>

    <v-main class="fill-height">
      <div class="d-flex flex-column pa-3 ga-3" style="height: 100%">
        <ValidationPanel />
        <div style="flex: 1; min-height: 0">
          <DiagramViewer
            :tela-cheia="diagramaExpandido"
            @alternar-tela-cheia="diagramaExpandido = !diagramaExpandido"
          />
        </div>
      </div>
    </v-main>
  </v-app>
</template>
