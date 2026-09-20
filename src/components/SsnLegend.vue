<script setup lang="ts">
import { DESCRICAO_TIPO_FLUXO, TIPOS_FLUXO } from "@/types/ssn";

interface ItemLegenda {
  tipo: string;
  rotulo: string;
  cor: string;
  formaCss: string;
}

const ITENS_ATOR: ItemLegenda[] = [
  { tipo: "CoI", rotulo: "CoI (Core of Interest)", cor: "#2F5AC7", formaCss: "forma-retangulo" },
  { tipo: "Fornecedor", rotulo: "Fornecedor", cor: "#E38B29", formaCss: "forma-pentagono" },
  { tipo: "Cliente", rotulo: "Cliente", cor: "#E8C547", formaCss: "forma-pentagono-esquerda" },
  { tipo: "Intermediario", rotulo: "Intermediário", cor: "#3FA34D", formaCss: "forma-hexagono" },
  { tipo: "Agregador", rotulo: "Agregador", cor: "#D64545", formaCss: "forma-losango" },
  { tipo: "ClienteDoCliente", rotulo: "Cliente do Cliente", cor: "#9AA0A6", formaCss: "forma-bifurcacao-direita" },
];
</script>

<template>
  <v-card variant="flat" class="pa-2">
    <v-card-item>
      <v-card-title class="fonte-display text-subtitle-1">Legenda da Notação SSN</v-card-title>
    </v-card-item>
    <v-card-text class="d-flex flex-column ga-5">
      <div>
        <p class="text-caption text-medium-emphasis mb-2">Tipos de Ator</p>
        <div class="d-flex flex-column ga-2">
          <div v-for="item in ITENS_ATOR" :key="item.tipo" class="d-flex align-center ga-3">
            <span class="forma-legenda" :class="item.formaCss" :style="{ '--cor-forma': item.cor }" />
            <span class="text-body-2">{{ item.rotulo }}</span>
          </div>
        </div>
      </div>

      <v-divider />

      <div>
        <p class="text-caption text-medium-emphasis mb-2">Tipos de Fluxo</p>
        <div class="d-flex flex-column ga-1">
          <div v-for="tipo in TIPOS_FLUXO" :key="tipo" class="d-flex align-start ga-2">
            <v-chip size="x-small" label class="fonte-mono" variant="outlined">{{ tipo }}</v-chip>
            <span class="text-caption">{{ DESCRICAO_TIPO_FLUXO[tipo] }}</span>
          </div>
        </div>
      </div>

      <v-divider />

      <div class="d-flex align-center ga-3">
        <span class="selo-gateway">OU</span>
        <span class="text-body-2">Gateway — anotação sobre o ator (split/join, lógica OU/XOU)</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.forma-legenda {
  display: inline-block;
  width: 26px;
  height: 20px;
  background-color: var(--cor-forma);
  flex-shrink: 0;
}
.forma-retangulo {
  border-radius: 2px;
}
.forma-retangulo-arredondado {
  border-radius: 8px;
}
.forma-pentagono {
  clip-path: polygon(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%);
}
.forma-pentagono-esquerda {
  clip-path: polygon(0 50%, 25% 0, 100% 0, 100% 100%, 25% 100%);
}
.forma-bifurcacao-direita {
  clip-path: polygon(0 0, 100% 0, 68% 50%, 100% 100%, 0 100%);
  border: 1px solid #000;
}
.forma-hexagono {
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
}
.forma-losango {
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}
.selo-gateway {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background-color: #1a1a1a;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  flex-shrink: 0;
}
</style>
