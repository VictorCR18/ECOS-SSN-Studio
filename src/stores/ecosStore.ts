// src/stores/ecosStore.ts
//
// Store principal da aplicação: mantém o modelo SSN atualmente carregado, o
// estado de uma geração em andamento (loading/erro/avisos) e o histórico de
// modelos salvos localmente.

import { defineStore } from "pinia";
import type { MetadadosGeracao, ModeloSalvo, ModeloSSN, ResultadoValidacao } from "@/types/ssn";
import { gerarModeloSSN } from "@/services/llmService";
import { extrairJSON, ErroExtracaoJSON } from "@/utils/jsonExtractor";
import { validarModeloSSN } from "@/utils/ssnValidator";
import { armazenamentoModelos } from "@/utils/storage";
import { gerarId } from "@/utils/id";
import { sugerirEsforcoPorQuantidadeAtores } from "@/services/effortService";
import { useSettingsStore } from "@/stores/settingsStore";
import { LLMServiceError } from "@/types/llm";

interface EstadoEcos {
  descricaoAtual: string;
  nomeEcosAtual: string;
  modeloAtual: ModeloSSN | null;
  metadadosAtuais: MetadadosGeracao | null;
  resultadoValidacao: ResultadoValidacao | null;
  respostaBrutaComErro: string | null;
  gerando: boolean;
  erro: string | null;
  historico: ModeloSalvo[];
  idModeloCarregado: string | null;
}

export const useEcosStore = defineStore("ecos", {
  state: (): EstadoEcos => ({
    descricaoAtual: "",
    nomeEcosAtual: "",
    modeloAtual: null,
    metadadosAtuais: null,
    resultadoValidacao: null,
    respostaBrutaComErro: null,
    gerando: false,
    erro: null,
    historico: armazenamentoModelos.carregarTodos<ModeloSalvo>(),
    idModeloCarregado: null,
  }),

  getters: {
    quantidadeAtoresAtual: (estado) => estado.modeloAtual?.atores.length ?? 0,
    temModeloValido: (estado) => Boolean(estado.modeloAtual) && estado.resultadoValidacao?.valido === true,
  },

  actions: {
    definirDescricao(descricao: string) {
      this.descricaoAtual = descricao;
    },

    definirNomeEcos(nome: string) {
      this.nomeEcosAtual = nome;
    },

    async gerarModelo() {
      const settings = useSettingsStore();
      this.gerando = true;
      this.erro = null;
      this.resultadoValidacao = null;
      this.respostaBrutaComErro = null;

      try {
        const resposta = await gerarModeloSSN(
          {
            ecos: this.nomeEcosAtual || "Ecossistema sem nome",
            descricao: this.descricaoAtual,
            estrategia: settings.estrategiaSelecionada,
            esforco: settings.esforcoSelecionado,
            modeloId: settings.modeloSelecionado,
            temperatura: settings.temperatura,
          },
          settings.chaves,
        );

        let jsonBruto: unknown;
        try {
          jsonBruto = extrairJSON(resposta.textoBruto);
        } catch (erroExtracao) {
          this.respostaBrutaComErro = resposta.textoBruto;
          throw erroExtracao;
        }

        const validacao = validarModeloSSN(jsonBruto);
        this.resultadoValidacao = validacao;

        if (!validacao.valido) {
          this.respostaBrutaComErro = resposta.textoBruto;
          return;
        }

        const modelo = jsonBruto as ModeloSSN;
        this.modeloAtual = modelo;
        this.nomeEcosAtual = modelo.ecos;
        this.idModeloCarregado = null;
        this.metadadosAtuais = {
          estrategia: settings.estrategiaSelecionada,
          esforco: settings.esforcoSelecionado,
          provedor: settings.modeloSelecionado.includes("gemini")
            ? "gemini"
            : settings.modeloSelecionado.includes("nvidia") ||
                settings.modeloSelecionado.startsWith("nvidia/") ||
                settings.modeloSelecionado.startsWith("deepseek") ||
                settings.modeloSelecionado.startsWith("moonshotai")
              ? "nvidia"
              : "groq",
          modeloId: settings.modeloSelecionado,
          duracaoMs: resposta.duracaoMs,
          tentativas: resposta.tentativas,
          respostaBruta: resposta.textoBruto,
        };

        // Reajusta a sugestão de esforço com base no tamanho real do modelo gerado.
        if (settings.modoEsforcoAutomatico) {
          settings.definirEsforco(sugerirEsforcoPorQuantidadeAtores(modelo.atores.length));
        }
      } catch (erro) {
        if (erro instanceof ErroExtracaoJSON) {
          this.erro = erro.message;
        } else if (erro instanceof LLMServiceError) {
          this.erro = erro.message;
        } else if (erro instanceof Error) {
          this.erro = erro.message;
        } else {
          this.erro = "Falha desconhecida ao gerar o modelo.";
        }
      } finally {
        this.gerando = false;
      }
    },

    salvarModeloAtual(tituloPersonalizado?: string) {
      if (!this.modeloAtual) return;
      const agora = new Date().toISOString();

      if (this.idModeloCarregado) {
        const indice = this.historico.findIndex((m) => m.id === this.idModeloCarregado);
        if (indice >= 0) {
          this.historico[indice] = {
            ...this.historico[indice],
            atualizadoEm: agora,
            titulo: tituloPersonalizado ?? this.historico[indice].titulo,
            descricaoOriginal: this.descricaoAtual,
            modelo: this.modeloAtual,
            metadados: this.metadadosAtuais ?? this.historico[indice].metadados,
          };
          armazenamentoModelos.salvarTodos(this.historico);
          return;
        }
      }

      const novo: ModeloSalvo = {
        id: gerarId(),
        criadoEm: agora,
        atualizadoEm: agora,
        titulo: tituloPersonalizado || this.modeloAtual.ecos,
        descricaoOriginal: this.descricaoAtual,
        modelo: this.modeloAtual,
        metadados: this.metadadosAtuais ?? undefined,
      };
      this.historico.unshift(novo);
      this.idModeloCarregado = novo.id;
      armazenamentoModelos.salvarTodos(this.historico);
    },

    carregarModelo(id: string) {
      const encontrado = this.historico.find((m) => m.id === id);
      if (!encontrado) return;
      this.modeloAtual = encontrado.modelo;
      this.nomeEcosAtual = encontrado.modelo.ecos;
      this.descricaoAtual = encontrado.descricaoOriginal;
      this.metadadosAtuais = encontrado.metadados ?? null;
      this.idModeloCarregado = encontrado.id;
      this.resultadoValidacao = { valido: true, erros: [], avisos: [] };
      this.erro = null;
      this.respostaBrutaComErro = null;
    },

    excluirModelo(id: string) {
      this.historico = this.historico.filter((m) => m.id !== id);
      armazenamentoModelos.salvarTodos(this.historico);
      if (this.idModeloCarregado === id) this.idModeloCarregado = null;
    },

    novoModelo() {
      this.modeloAtual = null;
      this.metadadosAtuais = null;
      this.resultadoValidacao = null;
      this.erro = null;
      this.respostaBrutaComErro = null;
      this.idModeloCarregado = null;
      this.descricaoAtual = "";
      this.nomeEcosAtual = "";
    },

    /** Substitui o modelo atual diretamente (ex.: edição manual do JSON bruto). */
    definirModeloManualmente(modelo: ModeloSSN) {
      this.modeloAtual = modelo;
      this.nomeEcosAtual = modelo.ecos;
      this.resultadoValidacao = validarModeloSSN(modelo);
      this.erro = null;
    },
  },
});
