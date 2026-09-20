<script setup lang="ts">
import { useEcosStore } from "@/stores/ecosStore";

const ecos = useEcosStore();

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
</script>

<template>
  <v-card variant="flat" class="pa-2">
    <v-card-item>
      <v-card-title class="fonte-display text-subtitle-1">Modelos Salvos</v-card-title>
      <v-card-subtitle>Persistidos neste navegador (localStorage)</v-card-subtitle>
    </v-card-item>

    <v-card-text>
      <p v-if="ecos.historico.length === 0" class="text-body-2 text-medium-emphasis">
        Nenhum modelo salvo ainda. Gere um modelo e clique em "Salvar" para guardá-lo aqui.
      </p>

      <v-list v-else density="comfortable" class="pa-0 scroll-discreta" style="max-height: 320px; overflow-y: auto">
        <v-list-item
          v-for="item in ecos.historico"
          :key="item.id"
          :active="item.id === ecos.idModeloCarregado"
          rounded="lg"
          class="mb-1"
          @click="ecos.carregarModelo(item.id)"
        >
          <v-list-item-title class="fonte-display text-body-2">{{ item.titulo }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ item.modelo.atores.length }} atores ·
            <span v-if="item.metadados">{{ item.metadados.estrategia }} · {{ item.metadados.modeloId }} ·</span>
            {{ formatarData(item.atualizadoEm) }}
          </v-list-item-subtitle>

          <template #append>
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              size="small"
              density="comfortable"
              @click.stop="ecos.excluirModelo(item.id)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>
