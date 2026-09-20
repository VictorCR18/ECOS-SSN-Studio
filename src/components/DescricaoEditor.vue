<script setup lang="ts">
import { computed } from "vue";
import { useEcosStore } from "@/stores/ecosStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ESTRATEGIAS_PROMPT, ESFORCOS } from "@/types/ssn";
import { MODELOS_LLM, definicaoDoModelo } from "@/types/llm";
import { modeloRecomendado, JUSTIFICATIVA_POR_ESTRATEGIA } from "@/services/modelSelector";
import { sugerirEsforcoInicial } from "@/services/effortService";

const ecos = useEcosStore();
const settings = useSettingsStore();

const estrategiaAtual = computed({
  get: () => settings.estrategiaSelecionada,
  set: (v) => settings.definirEstrategia(v),
});

const esforcoAtual = computed({
  get: () => settings.esforcoSelecionado,
  set: (v) => settings.definirEsforco(v),
});

const modeloAtual = computed({
  get: () => settings.modeloSelecionado,
  set: (v) => settings.definirModelo(v),
});

const descricaoEstrategia = computed(
  () => ESTRATEGIAS_PROMPT.find((e) => e.valor === estrategiaAtual.value)?.descricao ?? "",
);

const justificativaModelo = computed(() => JUSTIFICATIVA_POR_ESTRATEGIA[estrategiaAtual.value]);

const esforcoSugeridoInicial = computed(() =>
  ecos.descricaoAtual.trim() ? sugerirEsforcoInicial(ecos.descricaoAtual) : null,
);

function aoAlterarDescricao(valor: string | null) {
  ecos.definirDescricao(valor ?? "");
  if (settings.modoEsforcoAutomatico && esforcoSugeridoInicial.value) {
    settings.definirEsforco(esforcoSugeridoInicial.value);
  }
}

const rotuloModeloAtual = computed(() => definicaoDoModelo(modeloAtual.value)?.rotulo ?? modeloAtual.value);

const podeGerar = computed(
  () => ecos.descricaoAtual.trim().length > 10 && !ecos.gerando,
);

async function aoClicarGerar() {
  await ecos.gerarModelo();
}
</script>

<template>
  <v-card variant="flat" class="pa-2">
    <v-card-item>
      <v-card-title class="fonte-display text-h6">Descrever o Ecossistema</v-card-title>
      <v-card-subtitle>Nome, domínio, produtos e atores conhecidos</v-card-subtitle>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-4">
      <v-text-field
        :model-value="ecos.nomeEcosAtual"
        label="Nome do ECOS"
        placeholder="ex.: Pandas, Netflix, minha-startup"
        prepend-inner-icon="mdi-hexagon-multiple-outline"
        hide-details
        @update:model-value="ecos.definirNomeEcos($event ?? '')"
      />

      <v-textarea
        :model-value="ecos.descricaoAtual"
        label="Descrição do ecossistema"
        placeholder="Descreva o domínio, os principais produtos/serviços, fornecedores conhecidos, canais de distribuição e clientes-alvo..."
        rows="7"
        auto-grow
        counter
        hide-details="auto"
        @update:model-value="aoAlterarDescricao($event)"
      />

      <v-divider />

      <div>
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-subtitle-2">Estratégia de Prompt</span>
        </div>
        <v-btn-toggle v-model="estrategiaAtual" mandatory density="comfortable" divided class="mb-2">
          <v-btn v-for="e in ESTRATEGIAS_PROMPT" :key="e.valor" :value="e.valor" size="small">
            {{ e.valor }}
          </v-btn>
        </v-btn-toggle>
        <p class="text-caption text-medium-emphasis mb-0">{{ descricaoEstrategia }}</p>
      </div>

      <div>
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-subtitle-2">Esforço de Geração</span>
          <v-switch
            :model-value="settings.modoEsforcoAutomatico"
            label="Automático"
            density="compact"
            color="secondary"
            hide-details
            @update:model-value="settings.definirModoEsforcoAutomatico(Boolean($event))"
          />
        </div>
        <v-btn-toggle
          v-model="esforcoAtual"
          mandatory
          density="comfortable"
          divided
          :disabled="settings.modoEsforcoAutomatico"
        >
          <v-btn v-for="e in ESFORCOS" :key="e.valor" :value="e.valor" size="small">
            {{ e.titulo }}
          </v-btn>
        </v-btn-toggle>
        <p v-if="settings.modoEsforcoAutomatico" class="text-caption text-medium-emphasis mt-1 mb-0">
          Ajustado automaticamente conforme o tamanho estimado do ECOS (≤10 atores: Baixo · 11–25: Médio ·
          >25: Alto).
        </p>
      </div>

      <div>
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-subtitle-2">Modelo (LLM)</span>
          <v-switch
            :model-value="settings.modoModeloAutomatico"
            label="Recomendado"
            density="compact"
            color="secondary"
            hide-details
            @update:model-value="settings.definirModoModeloAutomatico(Boolean($event))"
          />
        </div>
        <v-select
          v-model="modeloAtual"
          :items="MODELOS_LLM"
          item-title="rotulo"
          item-value="id"
          :disabled="settings.modoModeloAutomatico"
          density="comfortable"
          hide-details
        />
        <p class="text-caption text-medium-emphasis mt-1 mb-0">
          <template v-if="settings.modoModeloAutomatico">
            <strong>{{ rotuloModeloAtual }}</strong> — {{ justificativaModelo }}
          </template>
          <template v-else>
            Sugestão do TCC para {{ estrategiaAtual }}: {{ definicaoDoModelo(modeloRecomendado(estrategiaAtual))?.rotulo }}
          </template>
        </p>
      </div>

      <v-btn
        color="primary"
        size="large"
        block
        :loading="ecos.gerando"
        :disabled="!podeGerar"
        prepend-icon="mdi-auto-fix"
        @click="aoClicarGerar"
      >
        Gerar Modelo SSN
      </v-btn>

      <v-alert
        v-if="ecos.erro"
        type="error"
        variant="tonal"
        density="comfortable"
        closable
        @click:close="ecos.erro = null"
      >
        {{ ecos.erro }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>
