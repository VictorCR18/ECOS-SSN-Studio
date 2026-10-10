<script setup lang="ts">
import { computed, reactive } from "vue";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ChavesApi } from "@/types/llm";
import type { ProvedorLLM } from "@/types/ssn";
import { ProviderId } from "@/data/providerIds";

const settings = useSettingsStore();
const mostrarChave = reactive<Record<keyof ChavesApi, boolean>>({
  openai: false,
  anthropic: false,
  gemini: false,
  deepseek: false,
  nvidia: false,
  groq: false,
});
const chaveDigitada = reactive<Record<keyof ChavesApi, string>>({
  openai: "",
  anthropic: "",
  gemini: "",
  deepseek: "",
  nvidia: "",
  groq: "",
});
const modeloNovo = reactive<Record<ProvedorLLM, string>>({
  openai: "",
  anthropic: "",
  gemini: "",
  deepseek: "",
  nvidia: "",
  groq: "",
});

const provedores: {
  id: keyof ChavesApi;
  label: string;
  descricao: string;
  url: string;
}[] = [
  { id: ProviderId.OPENAI, label: "OpenAI API Key", descricao: "Modelos GPT e de raciocínio.", url: "https://platform.openai.com/api-keys" },
  { id: ProviderId.ANTHROPIC, label: "Anthropic API Key", descricao: "Modelos Claude.", url: "https://console.anthropic.com/settings/keys" },
  { id: ProviderId.GEMINI, label: "Gemini API Key", descricao: "Modelos Google Gemini.", url: "https://aistudio.google.com/apikey" },
  { id: ProviderId.DEEPSEEK, label: "DeepSeek API Key", descricao: "Modelos DeepSeek Chat e Reasoner.", url: "https://platform.deepseek.com/api_keys" },
  { id: ProviderId.NVIDIA, label: "NVIDIA NIM API Key", descricao: "Modelos disponíveis no catálogo NVIDIA NIM.", url: "https://build.nvidia.com" },
  { id: ProviderId.GROQ, label: "Groq API Key", descricao: "Modelos hospedados pela Groq.", url: "https://console.groq.com/keys" },
];

function salvarChave(provedor: keyof ChavesApi) {
  const valor = chaveDigitada[provedor].trim();
  if (valor) settings.definirChave(provedor, valor);
  chaveDigitada[provedor] = "";
}

function removerChave(provedor: keyof ChavesApi) {
  settings.definirChave(provedor, "");
  chaveDigitada[provedor] = "";
}

function adicionarModelo(provedor: ProvedorLLM) {
  settings.adicionarModeloPersonalizado(provedor, modeloNovo[provedor]);
  modeloNovo[provedor] = "";
}

function modelosVisiveis(provedor: ProvedorLLM) {
  return settings.availableModels.filter((modelo) => modelo.provider === provedor);
}

function resumo(provedor: ProvedorLLM): string {
  if (settings.carregandoModelos[provedor]) return "Carregando modelos…";
  const visiveis = modelosVisiveis(provedor);
  const verificados = visiveis.filter((m) => settings.estadoDoModelo(`${provedor}:${m.id}`) === "ok").length;
  const ocultos = ocultosDe(provedor).length;
  return (
    `${visiveis.length} modelo${visiveis.length === 1 ? "" : "s"} · ${verificados} verificado${verificados === 1 ? "" : "s"}` +
    (ocultos ? ` · ${ocultos} indisponível${ocultos === 1 ? "" : "is"} (oculto${ocultos === 1 ? "" : "s"})` : "")
  );
}

/** Explica de onde vem o número de modelos: quantos o provedor listou e o que foi descartado. */
function diagnostico(provedor: ProvedorLLM): { texto: string; detalhe: string } | undefined {
  const origem = settings.origemModelos[provedor];
  if (!origem || origem.origem !== "api" || origem.total === undefined) return undefined;
  const naoTexto = origem.ignorados?.naoTexto ?? [];
  const descontinuados = origem.ignorados?.descontinuados ?? [];
  const partes = [`O provedor listou ${origem.total}`];
  if (naoTexto.length) partes.push(`${naoTexto.length} não são de texto`);
  if (descontinuados.length) partes.push(`${descontinuados.length} descontinuados`);
  return {
    texto: partes.join(" · "),
    detalhe: [
      naoTexto.length ? `Não são de texto:\n${naoTexto.join("\n")}` : "",
      descontinuados.length ? `Descontinuados:\n${descontinuados.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function ocultosDe(provedor: ProvedorLLM) {
  return settings.modelosOcultos.filter((modelo) => modelo.provider === provedor);
}

function pendentesDeVerificacao(provedor: ProvedorLLM): number {
  return modelosVisiveis(provedor).filter((m) => settings.estadoDoModelo(`${provedor}:${m.id}`) !== "ok").length;
}

function verificarTodos(provedor: ProvedorLLM) {
  const pendentes = pendentesDeVerificacao(provedor);
  if (
    pendentes > 10 &&
    !window.confirm(
      `Isto fará ${pendentes} chamadas de teste (uma por modelo, com resposta mínima) usando a sua chave. Continuar?`,
    )
  ) {
    return;
  }
  void settings.verificarTodosDoProvedor(provedor);
}

function reverificar(provedor: ProvedorLLM) {
  settings.limparVerificacoes(provedor);
  void settings.verificarDestaques(provedor);
}

const provedoresConfigurados = computed(() =>
  provedores.filter((provedor) => Boolean(settings.chaves[provedor.id])),
);
</script>

<template>
  <v-card variant="flat" class="pa-2">
    <v-card-item>
      <v-card-title class="fonte-display text-h6">Configurações</v-card-title>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-5">
      <section id="provedores">
        <h3 class="text-subtitle-1 font-weight-bold">Provedores</h3>
        <p class="text-caption text-medium-emphasis mb-4">Chaves de API dos provedores de LLM.</p>

        <div class="d-flex flex-column ga-4">
          <div v-for="provedor in provedores" :key="provedor.id">
            <div class="d-flex align-center justify-space-between mb-1">
              <span class="text-body-2 font-weight-bold">{{ provedor.label }}</span>
              <v-icon v-if="settings.chaves[provedor.id]" icon="mdi-check-circle" color="success" size="small" />
            </div>
            <v-text-field
              v-model="chaveDigitada[provedor.id]"
              :type="mostrarChave[provedor.id] ? 'text' : 'password'"
              :placeholder="settings.chaves[provedor.id] ? 'Configurada - digite um novo valor para substituir' : 'Não configurada'"
              :append-inner-icon="mostrarChave[provedor.id] ? 'mdi-eye-off' : 'mdi-eye'"
              :prepend-inner-icon="settings.chaves[provedor.id] ? 'mdi-key-check' : 'mdi-key-variant'"
              hide-details
              density="comfortable"
              @blur="salvarChave(provedor.id)"
              @keyup.enter="salvarChave(provedor.id)"
              @click:append-inner="mostrarChave[provedor.id] = !mostrarChave[provedor.id]"
            >
              <template #append>
                <v-btn
                  v-if="settings.chaves[provedor.id]"
                  icon="mdi-delete-outline"
                  size="small"
                  variant="text"
                  aria-label="Remover chave"
                  @click="removerChave(provedor.id)"
                />
              </template>
            </v-text-field>
            <p class="text-caption text-medium-emphasis mt-1 mb-0">
              {{ provedor.descricao }}
              <a :href="provedor.url" target="_blank" rel="noopener noreferrer">Criar chave</a>
            </p>
            <div v-if="settings.chaves[provedor.id]" class="mt-1">
              <div class="d-flex align-center flex-wrap ga-2">
                <span class="text-caption text-medium-emphasis">{{ resumo(provedor.id) }}</span>
                <span
                  v-if="diagnostico(provedor.id)"
                  class="text-caption text-medium-emphasis"
                  :title="diagnostico(provedor.id)!.detalhe"
                >
                  ({{ diagnostico(provedor.id)!.texto }})
                </span>
                <v-btn
                  v-if="!settings.progressoVerificacao[provedor.id]"
                  size="x-small"
                  variant="tonal"
                  prepend-icon="mdi-shield-check-outline"
                  :disabled="pendentesDeVerificacao(provedor.id) === 0"
                  @click="verificarTodos(provedor.id)"
                >
                  Verificar todos
                </v-btn>
                <v-btn
                  v-else
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  prepend-icon="mdi-close"
                  @click="settings.cancelarVerificacaoEmLote(provedor.id)"
                >
                  Cancelar
                </v-btn>
                <v-btn size="x-small" variant="text" prepend-icon="mdi-refresh" @click="reverificar(provedor.id)">
                  Reverificar
                </v-btn>
              </div>
              <v-progress-linear
                v-if="settings.progressoVerificacao[provedor.id]"
                class="mt-1"
                height="6"
                rounded
                :model-value="(settings.progressoVerificacao[provedor.id]!.feitos / settings.progressoVerificacao[provedor.id]!.total) * 100"
              />
              <p v-if="settings.progressoVerificacao[provedor.id]" class="text-caption text-medium-emphasis mb-0">
                Testando {{ settings.progressoVerificacao[provedor.id]!.feitos }} de
                {{ settings.progressoVerificacao[provedor.id]!.total }}…
              </p>
              <div v-if="ocultosDe(provedor.id).length" class="d-flex flex-wrap ga-1 mt-1">
                <v-chip
                  v-for="oculto in ocultosDe(provedor.id)"
                  :key="oculto.chave"
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  prepend-icon="mdi-eye-off-outline"
                  :title="oculto.motivo"
                >
                  {{ oculto.label }}
                </v-chip>
              </div>
            </div>
          </div>
        </div>
        <p class="text-caption text-medium-emphasis mt-4 mb-0">
          Suas chaves ficam salvas apenas neste navegador.
        </p>
      </section>

      <section>
        <h3 class="text-subtitle-1 font-weight-bold">Modelos personalizados</h3>
        <p class="text-caption text-medium-emphasis mb-3">
          Adicione um ID aceito pelo provedor configurado.
        </p>
        <div v-for="provedor in provedoresConfigurados" :key="`modelo-${provedor.id}`" class="mb-3">
          <v-text-field
            v-model="modeloNovo[provedor.id]"
            :label="`${provedor.label} — ID do modelo`"
            placeholder="ex.: modelo-versao"
            hide-details
            density="comfortable"
            append-inner-icon="mdi-plus"
            @keyup.enter="adicionarModelo(provedor.id)"
            @click:append-inner="adicionarModelo(provedor.id)"
          />
          <div class="d-flex flex-wrap ga-1 mt-1">
            <v-chip
              v-for="modelo in settings.modelosPersonalizados[provedor.id] ?? []"
              :key="modelo"
              size="x-small"
              variant="tonal"
            >
              {{ modelo }}
            </v-chip>
          </div>
        </div>
      </section>

      <v-divider />

      <div>
        <span class="text-subtitle-2">Temperatura: {{ settings.temperatura.toFixed(2) }}</span>
        <v-slider
          :model-value="settings.temperatura"
          min="0"
          max="1"
          step="0.05"
          color="secondary"
          hide-details
          @update:model-value="settings.definirTemperatura($event)"
        />
      </div>
    </v-card-text>
  </v-card>
</template>
