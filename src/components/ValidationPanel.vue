<script setup lang="ts">
import { ref } from "vue";
import { useEcosStore } from "@/stores/ecosStore";

const ecos = useEcosStore();
const mostrarRespostaBruta = ref(false);
</script>

<template>
  <div class="d-flex flex-column ga-2">
    <v-alert
      v-if="ecos.resultadoValidacao && !ecos.resultadoValidacao.valido"
      type="error"
      variant="tonal"
      density="comfortable"
    >
      <p class="font-weight-medium mb-2">
        A resposta da LLM não corresponde ao schema SSN esperado ({{ ecos.resultadoValidacao.erros.length }}
        problema(s)).
      </p>
      <ul class="text-body-2 pl-4 mb-2">
        <li v-for="(erro, i) in ecos.resultadoValidacao.erros" :key="i">
          <strong>{{ erro.campo }}</strong> — {{ erro.mensagem }}
        </li>
      </ul>
      <div class="d-flex ga-2">
        <v-btn size="small" variant="tonal" :loading="ecos.gerando" @click="ecos.gerarModelo()">
          Tentar novamente
        </v-btn>
        <v-btn size="small" variant="text" @click="mostrarRespostaBruta = true">Ver resposta bruta</v-btn>
      </div>
    </v-alert>

    <v-alert
      v-else-if="ecos.resultadoValidacao && ecos.resultadoValidacao.avisos.length > 0"
      type="warning"
      variant="tonal"
      density="comfortable"
    >
      <p class="font-weight-medium mb-2">
        Modelo gerado com {{ ecos.resultadoValidacao.avisos.length }} observação(ões) de consistência
        semântica (o diagrama abaixo já reflete o modelo — revise se necessário):
      </p>
      <ul class="text-body-2 pl-4 mb-0">
        <li v-for="(aviso, i) in ecos.resultadoValidacao.avisos" :key="i">
          <strong>{{ aviso.campo }}</strong> — {{ aviso.mensagem }}
        </li>
      </ul>
    </v-alert>

    <v-expansion-panels v-if="ecos.modeloAtual?.raciocinio_cot" variant="accordion">
      <v-expansion-panel title="Raciocínio da LLM (Chain-of-Thought)">
        <v-expansion-panel-text class="text-body-2 fonte-mono">
          {{ ecos.modeloAtual.raciocinio_cot }}
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-dialog v-model="mostrarRespostaBruta" max-width="720">
      <v-card>
        <v-card-title>Resposta bruta da LLM</v-card-title>
        <v-card-text>
          <pre class="text-caption fonte-mono" style="white-space: pre-wrap; word-break: break-word">{{
            ecos.respostaBrutaComErro
          }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="mostrarRespostaBruta = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
