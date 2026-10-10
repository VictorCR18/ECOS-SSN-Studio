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
import { definicaoDoModelo } from "@/types/llm";
import { chaveDoModelo, type ConfiguracaoModelo } from "@/data/modelCatalog";
import type { ErroModeloIndisponivel } from "@/types/llm";

let controladorGeracao: AbortController | null = null;

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
  erroLimite: {
    code: "RATE_LIMIT" | "QUOTA_EXCEEDED" | "OVERLOADED";
    provider: string;
    model: string;
    retryAfterSeconds?: number;
    message: string;
  } | null;
  aviso: string | null;
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
    erroLimite: null,
    aviso: null,
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

    async gerarModelo(modeloOverride?: string) {
      const settings = useSettingsStore();
      const modeloSolicitado = modeloOverride ?? settings.modeloSelecionado;
      controladorGeracao?.abort();
      const controlador = new AbortController();
      controladorGeracao = controlador;
      this.gerando = true;
      this.erro = null;
      this.aviso = null;
      this.erroLimite = null;
      this.resultadoValidacao = null;
      this.respostaBrutaComErro = null;

      try {
        const resposta = await gerarModeloSSN(
          {
            ecos: this.nomeEcosAtual || "Ecossistema sem nome",
            descricao: this.descricaoAtual,
            estrategia: settings.estrategiaSelecionada,
            esforco: settings.esforcoSelecionado,
            modeloId: modeloSolicitado,
            temperatura: settings.temperatura,
            configuracaoPersonalizada: settings.configuracaoPersonalizada,
          },
          settings.chaves,
          controlador.signal,
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
          provedor: settings.availableModels.find((modelo) => chaveDoModelo(modelo) === modeloSolicitado)?.provider
            ?? definicaoDoModelo(modeloSolicitado)?.provider
            ?? "gemini",
          modeloId: modeloSolicitado,
          duracaoMs: resposta.duracaoMs,
          tentativas: resposta.tentativas,
          respostaBruta: resposta.textoBruto,
        };

        if (resposta.aviso) this.aviso = resposta.aviso;

        // Reajusta o esforço com base no tamanho real do modelo gerado.
        if (settings.modoEsforcoAutomatico) {
          settings.definirEsforco(sugerirEsforcoPorQuantidadeAtores(modelo.atores.length));
        }
      } catch (erro) {
        if (controlador.signal.aborted || (erro instanceof DOMException && erro.name === "AbortError")) {
          return;
        }
        // O provedor não serve mais o modelo (HTTP 404/410, "end of life"...): tira da lista e,
        // se o usuário permitir, segue para outro em vez de repetir o mesmo erro.
        const indisponivel = erro instanceof LLMServiceError
          ? erro.causaOriginal as Partial<ErroModeloIndisponivel> | undefined
          : undefined;
        if (indisponivel?.code === "MODEL_UNAVAILABLE") {
          const chave = indisponivel.model || modeloSolicitado;
          const atual = settings.availableModels.find((modelo) => chaveDoModelo(modelo) === chave);
          const rotulo = atual?.label ?? settings.rotuloDoModelo(chave);
          settings.marcarIndisponivel(chave, indisponivel.message);
          const proximo = settings.trocarModeloAutomaticamente ? this.alternativasPara(chave, atual)[0] : undefined;
          if (proximo) {
            settings.definirModelo(chaveDoModelo(proximo));
            await this.gerarModelo(chaveDoModelo(proximo));
            if (!this.erro && !this.erroLimite) {
              this.aviso = `Gerado com ${proximo.label} porque ${rotulo} não está mais disponível no provedor.`;
            }
            return;
          }
          this.erro =
            `O modelo "${rotulo}" não está mais disponível no provedor (foi descontinuado ou sua chave ` +
            "não tem acesso) e foi removido da lista. Escolha outro modelo e tente novamente.";
          return;
        }

        const limite = erro instanceof LLMServiceError
          ? erro.causaOriginal as Partial<EstadoEcos["erroLimite"]>
          : undefined;
        if (
          limite?.code === "RATE_LIMIT" ||
          limite?.code === "QUOTA_EXCEEDED" ||
          limite?.code === "OVERLOADED"
        ) {
          const chave = limite.model || modeloSolicitado;
          settings.registrarCooldown(chave, limite.retryAfterSeconds, limite.code === "QUOTA_EXCEEDED");
          if (settings.trocarModeloAutomaticamente) {
            const atual = settings.availableModels.find((modelo) => chaveDoModelo(modelo) === modeloSolicitado);
            const alternativas = this.alternativasPara(modeloSolicitado, atual);
            const proximo = alternativas[0];
            if (proximo) {
              settings.definirModelo(chaveDoModelo(proximo));
              await this.gerarModelo(chaveDoModelo(proximo));
              this.aviso = `Gerado com ${proximo.label} porque ${atual?.label ?? modeloSolicitado} atingiu o limite.`;
              return;
            }
          }
          this.erroLimite = {
            code: limite.code,
            provider: limite.provider ?? "",
            model: chave,
            retryAfterSeconds: limite.retryAfterSeconds,
            message: limite.message ?? "O provedor atingiu um limite de uso.",
          };
          return;
        }
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
        if (controladorGeracao === controlador) {
          controladorGeracao = null;
          this.gerando = false;
        }
      }
    },

    cancelarGeracao() {
      if (!this.gerando) return;
      controladorGeracao?.abort();
      controladorGeracao = null;
      this.gerando = false;
      this.aviso = "Geração cancelada.";
    },

    alternativasPara(chaveAtual: string, atual?: ConfiguracaoModelo): ConfiguracaoModelo[] {
      const settings = useSettingsStore();
      settings.limparCooldownsExpirados();
      const modelos = settings.modelosDisponiveisSemCooldown.filter(
        (modelo) => chaveDoModelo(modelo) !== chaveAtual,
      );
      return [
        ...modelos.filter((modelo) => modelo.provider === atual?.provider),
        ...modelos.filter((modelo) => modelo.provider !== atual?.provider),
      ];
    },

    async tentarNovamente() {
      const settings = useSettingsStore();
      const modelo = this.erroLimite?.model || settings.modeloSelecionado;
      this.erroLimite = null;
      await this.gerarModelo(modelo);
    },

    selecionarModeloAlternativo(modelo: ConfiguracaoModelo) {
      const settings = useSettingsStore();
      settings.definirModelo(chaveDoModelo(modelo));
      this.erroLimite = null;
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
      this.erroLimite = null;
      this.aviso = null;
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

    /** Atualiza o modelo após uma edição feita diretamente no diagrama. */
    atualizarModeloEditado(modelo: ModeloSSN) {
      this.modeloAtual = modelo;
      this.nomeEcosAtual = modelo.ecos;
      this.resultadoValidacao = validarModeloSSN(modelo);
      this.erro = null;
      if (!this.idModeloCarregado) return;

      const indice = this.historico.findIndex((item) => item.id === this.idModeloCarregado);
      if (indice < 0) return;
      const atualizadoEm = new Date().toISOString();
      this.historico[indice] = {
        ...this.historico[indice],
        atualizadoEm,
        modelo,
      };
      armazenamentoModelos.salvarTodos(this.historico);
    },
  },
});
