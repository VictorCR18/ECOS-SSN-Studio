<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useEcosStore } from "@/stores/ecosStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ESTRATEGIAS_PROMPT, ESFORCOS } from "@/types/ssn";
import { sugerirEsforcoInicial } from "@/services/effortService";
import { chaveDoModelo, rotuloDoProvedor } from "@/data/modelCatalog";
import { filtrarModelos, type ItemDeModelo } from "@/utils/modelFilter";

const ecos = useEcosStore();
const settings = useSettingsStore();
const buscaModelo = ref("");

onMounted(() => {
  // Não chamar garantirModeloDisponivel() antes: a carga marca os provedores como "carregando"
  // e, ao terminar, reajusta a seleção. Chamar antes zerava a escolha salva (fora do catálogo).
  void settings.carregarModelosConfigurados();
});

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

const esforcoSugeridoInicial = computed(() =>
  ecos.descricaoAtual.trim() ? sugerirEsforcoInicial(ecos.descricaoAtual) : null,
);

function aoAlterarDescricao(valor: string | null) {
  ecos.definirDescricao(valor ?? "");
  if (settings.modoEsforcoAutomatico && esforcoSugeridoInicial.value) {
    settings.definirEsforco(esforcoSugeridoInicial.value);
  }
}

interface ItemSeletor extends ItemDeModelo {
  type?: "subheader";
  disabled?: boolean;
  subtitle?: string;
  prependIcon?: string;
}

function segundosDeCooldown(chave: string): number {
  return Math.max(0, Math.ceil((settings.cooldowns[chave] - Date.now()) / 1000));
}

const modelosDisponiveis = computed<ItemSeletor[]>(() => {
  if (!settings.algumaChaveConfigurada) {
    return [{ value: "__adicionar-chave__", title: "＋ Adicionar chave de API" }];
  }
  const itens: ItemSeletor[] = [];
  let provedorAnterior: string | undefined;
  for (const modelo of settings.availableModels) {
    if (modelo.provider !== provedorAnterior) {
      provedorAnterior = modelo.provider;
      itens.push({
        value: `header:${modelo.provider}`,
        title: rotuloDoProvedor[modelo.provider],
        type: "subheader",
        header: true,
        provider: modelo.provider,
      });
    }
    const chave = chaveDoModelo(modelo);
    const emCooldown = settings.cooldowns[chave] > Date.now();
    const estado = settings.estadoDoModelo(chave);
    const detalhes = [
      modelo.id !== modelo.label ? modelo.id : "",
      modelo.preview ? "preview" : "",
      estado === "ok" ? "" : settings.verificando[chave] ? "verificando…" : "não verificado",
    ].filter(Boolean);
    itens.push({
      value: chave,
      title: emCooldown
        ? `${modelo.label} — Limite atingido · volta em ${segundosDeCooldown(chave)}s`
        : modelo.label,
      subtitle: detalhes.join(" · ") || undefined,
      prependIcon: estado === "ok" ? "mdi-check-circle-outline" : "mdi-help-circle-outline",
      disabled: emCooldown,
      provider: modelo.provider,
      id: modelo.id,
    });
  }
  return itens;
});

const tituloSelecionado = computed(
  () => modelosDisponiveis.value.find((item) => item.value === settings.modeloSelecionado)?.title,
);

// O filtro vive aqui (e não no Vuetify, ver `no-filter` no template) para poder buscar também
// pelo ID cru ("nvidia/nemo", "google/gemma") e para não esconder os demais modelos quando o
// Vuetify copia o título do selecionado para o campo de busca.
const modelosFiltrados = computed(() =>
  filtrarModelos(modelosDisponiveis.value, buscaModelo.value, tituloSelecionado.value),
);

const listasIncompletas = computed(() =>
  (Object.keys(settings.chaves) as (keyof typeof settings.chaves)[]).flatMap((provider) => {
    const origem = settings.origemModelos[provider];
    return settings.chaves[provider] && origem?.origem === "catalogo"
      ? [{ provider, rotulo: rotuloDoProvedor[provider], erro: origem.erro }]
      : [];
  }),
);

const carregandoLista = computed(() => Object.values(settings.carregandoModelos).some(Boolean));

const podeGerar = computed(
  () => ecos.descricaoAtual.trim().length > 10 && !ecos.gerando && Boolean(settings.modeloSelecionado),
);

function atualizarModelo(valor: string) {
  settings.definirModelo(valor);
}

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
            label="Automático"
            density="compact"
            color="secondary"
            hide-details
            @update:model-value="settings.definirModoModeloAutomatico(Boolean($event))"
          />
        </div>
        <v-autocomplete
          :model-value="modeloAtual"
          :items="modelosFiltrados"
          item-title="title"
          item-value="value"
          :item-props="(item: ItemSeletor) => ({ subtitle: item.subtitle, prependIcon: item.prependIcon, disabled: item.disabled })"
          v-model:search="buscaModelo"
          no-filter
          :loading="carregandoLista"
          :no-data-text="settings.algumaChaveConfigurada ? 'Nenhum modelo encontrado' : 'Adicione uma chave de API'"
          :disabled="settings.modoModeloAutomatico && settings.algumaChaveConfigurada"
          density="comfortable"
          hide-details
          @update:model-value="atualizarModelo"
        />
        <p v-if="!settings.algumaChaveConfigurada" class="text-caption text-medium-emphasis mt-1 mb-0">
          Nenhum modelo disponível. Adicione uma chave de API para gerar modelos.
        </p>
        <v-alert
          v-for="lista in listasIncompletas"
          :key="lista.provider"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2 text-caption"
        >
          Não consegui obter a lista completa de {{ lista.rotulo }}
          <span v-if="lista.erro">({{ lista.erro }})</span>. Mostrando só os modelos conhecidos.
        </v-alert>
        <v-alert
          v-if="settings.avisoModelo"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2 text-caption"
          closable
          @click:close="settings.limparAvisoModelo()"
        >
          {{ settings.avisoModelo }}
        </v-alert>
        <v-switch
          :model-value="settings.somenteVerificados"
          label="Mostrar só modelos já verificados"
          density="compact"
          color="secondary"
          hide-details
          @update:model-value="settings.definirSomenteVerificados(Boolean($event))"
        />
        <v-switch
          :model-value="settings.trocarModeloAutomaticamente"
          label="Trocar automaticamente de modelo quando atingir o limite"
          density="compact"
          color="secondary"
          hide-details
          @update:model-value="settings.definirTrocaAutomatica(Boolean($event))"
        />
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
      <v-alert v-if="ecos.aviso" type="info" variant="tonal" density="comfortable">
        {{ ecos.aviso }}
      </v-alert>

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
