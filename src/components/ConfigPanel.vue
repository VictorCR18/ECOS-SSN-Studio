<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSettingsStore } from "@/stores/settingsStore";

const settings = useSettingsStore();

const mostrarChave = ref({ gemini: false, nvidia: false, groq: false });

function alternarVisibilidade(provedor: keyof typeof mostrarChave.value) {
  mostrarChave.value[provedor] = !mostrarChave.value[provedor];
}

onMounted(() => {
  settings.carregarStatusServidor();
});

function corDoStatus(configurado: boolean | undefined) {
  if (settings.carregandoStatusServidor || configurado === undefined) return "default";
  return configurado ? "success" : "warning";
}

function textoDoStatus(configurado: boolean | undefined) {
  if (settings.carregandoStatusServidor) return "verificando…";
  if (configurado === undefined) return "backend indisponível";
  return configurado ? "configurada no servidor" : "sem chave no servidor";
}
</script>

<template>
  <v-card variant="flat" class="pa-2">
    <v-card-item>
      <v-card-title class="fonte-display text-h6">Configurações de API</v-card-title>
      <v-card-subtitle>As chamadas às LLMs são feitas pelo backend</v-card-subtitle>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-4">
      <v-alert type="info" variant="tonal" density="comfortable">
        As chamadas à Gemini, NVIDIA NIM e Groq são feitas pelo <strong>backend</strong> (evita bloqueio
        de CORS e mantém as chaves fora do navegador). Configure as chaves no <code>.env</code> do
        servidor (<code>GEMINI_API_KEY</code>, <code>NVIDIA_API_KEY</code>, <code>GROQ_API_KEY</code>) —
        veja o <code>.env.example</code>. Os campos abaixo são <strong>opcionais</strong>: só use se quiser
        sobrescrever, neste navegador, a chave configurada no servidor.
      </v-alert>

      <div class="d-flex flex-wrap ga-2">
        <v-chip size="small" :color="corDoStatus(settings.statusServidor?.gemini)" variant="tonal">
          Gemini: {{ textoDoStatus(settings.statusServidor?.gemini) }}
        </v-chip>
        <v-chip size="small" :color="corDoStatus(settings.statusServidor?.nvidia)" variant="tonal">
          NVIDIA NIM: {{ textoDoStatus(settings.statusServidor?.nvidia) }}
        </v-chip>
        <v-chip size="small" :color="corDoStatus(settings.statusServidor?.groq)" variant="tonal">
          Groq: {{ textoDoStatus(settings.statusServidor?.groq) }}
        </v-chip>
        <v-btn
          icon="mdi-refresh"
          size="x-small"
          variant="text"
          :loading="settings.carregandoStatusServidor"
          @click="settings.carregarStatusServidor()"
        />
      </div>

      <v-text-field
        :model-value="settings.chaves.gemini"
        label="Chave pessoal — Google Gemini (opcional)"
        :type="mostrarChave.gemini ? 'text' : 'password'"
        :append-inner-icon="mostrarChave.gemini ? 'mdi-eye-off' : 'mdi-eye'"
        prepend-inner-icon="mdi-key-variant"
        hide-details
        @click:append-inner="alternarVisibilidade('gemini')"
        @update:model-value="settings.definirChave('gemini', $event ?? '')"
      />

      <v-text-field
        :model-value="settings.chaves.nvidia"
        label="Chave pessoal — NVIDIA NIM (opcional)"
        :type="mostrarChave.nvidia ? 'text' : 'password'"
        :append-inner-icon="mostrarChave.nvidia ? 'mdi-eye-off' : 'mdi-eye'"
        prepend-inner-icon="mdi-key-variant"
        hide-details
        @click:append-inner="alternarVisibilidade('nvidia')"
        @update:model-value="settings.definirChave('nvidia', $event ?? '')"
      />

      <v-text-field
        :model-value="settings.chaves.groq"
        label="Chave pessoal — Groq (opcional)"
        :type="mostrarChave.groq ? 'text' : 'password'"
        :append-inner-icon="mostrarChave.groq ? 'mdi-eye-off' : 'mdi-eye'"
        prepend-inner-icon="mdi-key-variant"
        hide-details
        @click:append-inner="alternarVisibilidade('groq')"
        @update:model-value="settings.definirChave('groq', $event ?? '')"
      />

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
