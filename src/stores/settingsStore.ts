// src/stores/settingsStore.ts
//
// Estado de configuração persistido localmente: preferências de geração
// (estratégia/esforço/modelo atualmente selecionados) e, opcionalmente,
// chaves de API pessoais que sobrescrevem as do servidor para este
// navegador (ver comentário em CONFIG_PADRAO). Também mantém o status de
// quais provedores já têm chave configurada no backend (GET /api/status).

import { defineStore } from "pinia";
import type { ChavesApi } from "@/types/llm";
import type { EsforcoGeracao, EstrategiaPrompt } from "@/types/ssn";
import { armazenamentoConfig } from "@/utils/storage";
import { modeloRecomendado } from "@/services/modelSelector";

interface ConfigPersistida {
  chaves: ChavesApi;
  temperatura: number;
  modoEsforcoAutomatico: boolean;
  modoModeloAutomatico: boolean;
}

export interface StatusServidor {
  gemini: boolean;
  nvidia: boolean;
  groq: boolean;
}

// As chaves aqui são um OVERRIDE OPCIONAL por usuário/navegador: se
// preenchidas, são enviadas junto com cada requisição a /api/gerar-modelo e
// o backend as usa no lugar da sua própria (GEMINI_API_KEY / NVIDIA_API_KEY /
// GROQ_API_KEY no .env do servidor — ver server/index.ts). Deixe em branco
// para usar sempre as chaves configuradas no servidor.
const CONFIG_PADRAO: ConfigPersistida = {
  chaves: { gemini: "", nvidia: "", groq: "" },
  temperatura: 0.3,
  modoEsforcoAutomatico: true,
  modoModeloAutomatico: true,
};

interface EstadoSettings extends ConfigPersistida {
  estrategiaSelecionada: EstrategiaPrompt;
  esforcoSelecionado: EsforcoGeracao;
  modeloSelecionado: string;
  statusServidor: StatusServidor | null;
  carregandoStatusServidor: boolean;
}

export const useSettingsStore = defineStore("settings", {
  state: (): EstadoSettings => {
    const persistido = armazenamentoConfig.carregar<ConfigPersistida>(CONFIG_PADRAO);
    return {
      ...CONFIG_PADRAO,
      ...persistido,
      estrategiaSelecionada: "G3",
      esforcoSelecionado: "medio",
      modeloSelecionado: modeloRecomendado("G3"),
      statusServidor: null,
      carregandoStatusServidor: false,
    };
  },

  getters: {
    algumaChaveConfigurada: (estado) =>
      Boolean(estado.chaves.gemini || estado.chaves.nvidia || estado.chaves.groq),
  },

  actions: {
    persistir() {
      const { chaves, temperatura, modoEsforcoAutomatico, modoModeloAutomatico } = this;
      armazenamentoConfig.salvar({ chaves, temperatura, modoEsforcoAutomatico, modoModeloAutomatico });
    },

    definirChave(provedor: keyof ChavesApi, valor: string) {
      this.chaves[provedor] = valor;
      this.persistir();
    },

    definirTemperatura(valor: number) {
      this.temperatura = valor;
      this.persistir();
    },

    definirEstrategia(estrategia: EstrategiaPrompt) {
      this.estrategiaSelecionada = estrategia;
      if (this.modoModeloAutomatico) {
        this.modeloSelecionado = modeloRecomendado(estrategia);
      }
    },

    definirModelo(modeloId: string) {
      this.modeloSelecionado = modeloId;
    },

    definirModoModeloAutomatico(ativo: boolean) {
      this.modoModeloAutomatico = ativo;
      this.persistir();
      if (ativo) {
        this.modeloSelecionado = modeloRecomendado(this.estrategiaSelecionada);
      }
    },

    definirEsforco(esforco: EsforcoGeracao) {
      this.esforcoSelecionado = esforco;
    },

    definirModoEsforcoAutomatico(ativo: boolean) {
      this.modoEsforcoAutomatico = ativo;
      this.persistir();
    },

    async carregarStatusServidor() {
      const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
      this.carregandoStatusServidor = true;
      try {
        const resposta = await fetch(`${BASE_URL}/api/status`);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        this.statusServidor = await resposta.json();
      } catch (erro) {
        console.warn("[settingsStore] Não foi possível consultar /api/status:", erro);
        this.statusServidor = null;
      } finally {
        this.carregandoStatusServidor = false;
      }
    },
  },
});
