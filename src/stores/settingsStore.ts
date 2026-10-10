import { defineStore } from "pinia";
import type { ChavesApi, ConfiguracaoLLMPersonalizada } from "@/types/llm";
import type { EsforcoGeracao, EstrategiaPrompt, ProvedorLLM } from "@/types/ssn";
import {
  CATALOGO_MODELOS,
  chaveDoModelo,
  ehIdDeModeloUtilizavel,
  ehModeloDescontinuado,
  modelosDoCatalogo,
  separarChaveDoModelo,
  validarCatalogoDeModelos,
  type ConfiguracaoModelo,
} from "@/data/modelCatalog";
import { ProviderId } from "@/data/providerIds";
import { armazenamentoConfig } from "@/utils/storage";
import { modelosRecomendados } from "@/services/modelSelector";
import {
  invalidarCacheDeModelos,
  listarModelosDoProvedor,
  verificarModelo as verificarModeloNoServidor,
} from "@/services/modelCatalogService";
import { registroValido, type RegistroVerificacao } from "@/utils/verificacao";
import { executarComLimite } from "@/utils/concorrencia";

/** Quantas chamadas de teste ao mesmo tempo (evita estourar o rate limit dos provedores). */
const CONCORRENCIA_VERIFICACAO = 3;

interface ConfigPersistida {
  chaves: ChavesApi;
  configuracaoPersonalizada: ConfiguracaoLLMPersonalizada;
  temperatura: number;
  modoEsforcoAutomatico: boolean;
  modoModeloAutomatico: boolean;
  modelosPersonalizados: Partial<Record<ProvedorLLM, string[]>>;
  trocarModeloAutomaticamente: boolean;
  /** Resultado das chamadas de teste por modelo (`provedor:id`), com validade. */
  verificacoes: Record<string, RegistroVerificacao>;
  /** Mostra só os modelos que já responderam a uma chamada de teste. */
  somenteVerificados: boolean;
}

const CONFIG_PADRAO: ConfigPersistida = {
  chaves: {
    [ProviderId.OPENAI]: "",
    [ProviderId.ANTHROPIC]: "",
    [ProviderId.GEMINI]: "",
    [ProviderId.DEEPSEEK]: "",
    [ProviderId.NVIDIA]: "",
    [ProviderId.GROQ]: "",
  },
  configuracaoPersonalizada: { nome: "LLM personalizada", endpoint: "", modelo: "" },
  temperatura: 0.3,
  modoEsforcoAutomatico: true,
  modoModeloAutomatico: true,
  modelosPersonalizados: {},
  trocarModeloAutomaticamente: false,
  verificacoes: {},
  somenteVerificados: false,
};

interface EstadoSettings extends ConfigPersistida {
  estrategiaSelecionada: EstrategiaPrompt;
  esforcoSelecionado: EsforcoGeracao;
  modeloSelecionado: string;
  modelosDinamicos: Partial<Record<ProvedorLLM, ConfiguracaoModelo[]>>;
  cooldowns: Record<string, number>;
  trocarModeloAutomaticamente: boolean;
  /** Provedores cuja lista de modelos ainda está sendo consultada. */
  carregandoModelos: Partial<Record<ProvedorLLM, boolean>>;
  /** De onde veio a lista de cada provedor (e o erro, se caiu para o catálogo fixo). */
  origemModelos: Partial<
    Record<
      ProvedorLLM,
      {
        origem: "api" | "catalogo";
        erro?: string;
        total?: number;
        ignorados?: { naoTexto: string[]; descontinuados: string[] };
      }
    >
  >;
  /** Modelos com chamada de teste em andamento. */
  verificando: Record<string, boolean>;
  /** Progresso da verificação em lote por provedor. */
  progressoVerificacao: Partial<Record<ProvedorLLM, { feitos: number; total: number }>>;
  /** Aviso (fechável) quando um modelo é removido da lista por estar indisponível. */
  avisoModelo: string | null;
}

/** Lista "crua" de um provedor: dinâmica (ou catálogo, enquanto não carrega) + modelos digitados pelo usuário. */
function modelosBrutosDoProvedor(estado: EstadoSettings, provider: ProvedorLLM): ConfiguracaoModelo[] {
  const base = estado.modelosDinamicos[provider] ?? modelosDoCatalogo(provider);
  const personalizados = (estado.modelosPersonalizados[provider] ?? [])
    .filter(ehIdDeModeloUtilizavel)
    .map((id): ConfiguracaoModelo => ({
      id,
      label: id,
      provider,
      family: "Personalizados",
      capabilities: { supportsReasoning: false },
      custom: true,
    }));
  return [...base, ...personalizados].filter(
    (modelo, indice, lista) => lista.findIndex((item) => item.id === modelo.id) === indice,
  );
}

function registroDe(estado: EstadoSettings, modelo: ConfiguracaoModelo): RegistroVerificacao | undefined {
  return registroValido(estado.verificacoes[chaveDoModelo(modelo)]);
}

type ChavesPersistidas = Partial<ChavesApi> & {
  custom?: string;
  google?: string;
  googleai?: string;
  googleAi?: string;
  geminiApiKey?: string;
};

function migrarChaveModelo(chave: string): string {
  const separada = separarChaveDoModelo(chave);
  if (separada) return ehIdDeModeloUtilizavel(separada.id) ? chave : "";
  const legado = chave.match(/^(?:google|googleai|google-ai):(.+)$/i);
  if (legado) return `${ProviderId.GEMINI}:${legado[1]}`;
  const modelo = CATALOGO_MODELOS.find((item) => item.id === chave);
  return modelo ? chaveDoModelo(modelo) : "";
}

export const useSettingsStore = defineStore("settings", {
  state: (): EstadoSettings => {
    const persistido = armazenamentoConfig.carregar<Partial<ConfigPersistida> & {
      chaves?: ChavesPersistidas;
      geminiApiKey?: string;
      modeloSelecionado?: string;
    }>({});
    if (import.meta.env.DEV) {
      const errosCatalogo = validarCatalogoDeModelos();
      if (errosCatalogo.length > 0) {
        console.error("[modelos] Catálogo inválido:", errosCatalogo);
      }
    }
    const modelosSelecionados = migrarChaveModelo(persistido.modeloSelecionado ?? "");
    const chavesPersistidas: ChavesPersistidas = persistido.chaves ?? {};
    const chaves = {
      ...CONFIG_PADRAO.chaves,
      ...chavesPersistidas,
      gemini: chavesPersistidas.gemini ||
        chavesPersistidas.google ||
        chavesPersistidas.googleai ||
        chavesPersistidas.googleAi ||
        chavesPersistidas.geminiApiKey ||
        persistido.geminiApiKey ||
        "",
    };
    // Descarta verificações vencidas já na carga.
    const verificacoes = Object.fromEntries(
      Object.entries(persistido.verificacoes ?? {}).filter(([, registro]) => registroValido(registro)),
    );
    return {
      ...CONFIG_PADRAO,
      ...persistido,
      chaves,
      configuracaoPersonalizada: {
        ...CONFIG_PADRAO.configuracaoPersonalizada,
        ...persistido.configuracaoPersonalizada,
      },
      modelosPersonalizados: persistido.modelosPersonalizados ?? {},
      estrategiaSelecionada: "G3",
      esforcoSelecionado: "medio",
      modeloSelecionado: modelosSelecionados,
      // Sem lista dinâmica ainda: o getter usa o catálogo até a consulta ao provedor terminar.
      // (Antes isto começava como `[]`, o que zerava a seleção salva a cada recarga.)
      modelosDinamicos: {},
      cooldowns: {},
      trocarModeloAutomaticamente: persistido.trocarModeloAutomaticamente ?? false,
      verificacoes,
      somenteVerificados: persistido.somenteVerificados ?? false,
      carregandoModelos: {},
      origemModelos: {},
      verificando: {},
      progressoVerificacao: {},
      avisoModelo: null,
    };
  },

  getters: {
    algumaChaveConfigurada: (estado) =>
      Object.values(estado.chaves).some((chave) => Boolean(chave.trim())),
    availableModels: (estado): ConfiguracaoModelo[] =>
      (Object.keys(estado.chaves) as ProvedorLLM[]).flatMap((provider) => {
        if (!estado.chaves[provider].trim()) return [];
        return modelosBrutosDoProvedor(estado, provider).filter((modelo) => {
          if (ehModeloDescontinuado(provider, modelo.id)) return false;
          const registro = registroDe(estado, modelo);
          if (registro?.estado === "indisponivel") return false;
          if (estado.somenteVerificados && registro?.estado !== "ok") return false;
          return true;
        });
      }),
    /** Modelos que o provedor lista mas que a chamada de teste mostrou indisponíveis. */
    modelosOcultos: (estado): { chave: string; label: string; provider: ProvedorLLM; motivo?: string }[] =>
      (Object.keys(estado.chaves) as ProvedorLLM[]).flatMap((provider) => {
        if (!estado.chaves[provider].trim()) return [];
        return modelosBrutosDoProvedor(estado, provider).flatMap((modelo) => {
          const registro = registroDe(estado, modelo);
          return registro?.estado === "indisponivel"
            ? [{ chave: chaveDoModelo(modelo), label: modelo.label, provider, motivo: registro.motivo }]
            : [];
        });
      }),
    /** "ok" | "indisponivel" | undefined (ainda não verificado ou vencido). */
    estadoDoModelo: (estado) => (chave: string): RegistroVerificacao["estado"] | undefined =>
      registroValido(estado.verificacoes[chave])?.estado,
    modelosDisponiveisSemCooldown(): ConfiguracaoModelo[] {
      const agora = Date.now();
      return this.availableModels.filter((modelo) => !(this.cooldowns[chaveDoModelo(modelo)] > agora));
    },
  },

  actions: {
    persistir() {
      const {
        chaves,
        configuracaoPersonalizada,
        temperatura,
        modoEsforcoAutomatico,
        modoModeloAutomatico,
        modelosPersonalizados,
        trocarModeloAutomaticamente,
        modeloSelecionado,
        verificacoes,
        somenteVerificados,
      } = this;
      armazenamentoConfig.salvar({
        chaves,
        configuracaoPersonalizada,
        temperatura,
        modoEsforcoAutomatico,
        modoModeloAutomatico,
        modelosPersonalizados,
        trocarModeloAutomaticamente,
        modeloSelecionado,
        verificacoes,
        somenteVerificados,
      });
    },

    definirChave(provedor: keyof ChavesApi, valor: string) {
      invalidarCacheDeModelos(provedor);
      this.chaves[provedor] = valor.trim();
      // A chave mudou: o que foi verificado com a anterior não vale para a nova (permissões diferem).
      this.limparVerificacoes(provedor, false);
      delete this.modelosDinamicos[provedor];
      delete this.origemModelos[provedor];
      this.persistir();
      this.garantirModeloDisponivel();
      if (this.chaves[provedor]) {
        void this.carregarModelosDoProvedor(provedor).then(() => {
          this.garantirModeloDisponivel();
          void this.verificarDestaques(provedor);
        });
      }
    },

    async carregarModelosDoProvedor(provider: ProvedorLLM) {
      const chave = this.chaves[provider];
      if (!chave.trim()) return;
      this.carregandoModelos[provider] = true;
      try {
        const resultado = await listarModelosDoProvedor(provider, chave);
        // A chave pode ter sido trocada/removida enquanto a consulta rodava.
        if (this.chaves[provider] !== chave) return;
        this.modelosDinamicos[provider] = resultado.modelos;
        this.origemModelos[provider] = {
          origem: resultado.origem,
          erro: resultado.erro,
          total: resultado.total,
          ignorados: resultado.ignorados,
        };
      } finally {
        this.carregandoModelos[provider] = false;
      }
    },

    async carregarModelosConfigurados() {
      const provedores = (Object.keys(this.chaves) as ProvedorLLM[]).filter(
        (provider) => Boolean(this.chaves[provider].trim()),
      );
      await Promise.all(provedores.map((provider) => this.carregarModelosDoProvedor(provider)));
      this.garantirModeloDisponivel();
      void this.verificarDestaques();
    },

    /** Rótulo amigável de um modelo, mesmo que ele já tenha saído da lista visível. */
    rotuloDoModelo(chave: string): string {
      const sep = separarChaveDoModelo(chave);
      if (!sep) return chave;
      return modelosBrutosDoProvedor(this, sep.provider).find((m) => m.id === sep.id)?.label ?? sep.id;
    },

    /**
     * Chamada mínima ao modelo para saber se o provedor ainda o serve. O resultado fica em
     * cache (com validade) e, se o modelo estiver fora do ar, ele some da lista.
     */
    async verificarModelo(chave: string, opcoes: { forcar?: boolean } = {}): Promise<"ok" | "indisponivel" | "desconhecido"> {
      const sep = separarChaveDoModelo(chave);
      if (!sep) return "desconhecido";
      const apiKey = this.chaves[sep.provider]?.trim();
      if (!apiKey) return "desconhecido";

      const existente = registroValido(this.verificacoes[chave]);
      if (existente && !opcoes.forcar) return existente.estado;
      if (this.verificando[chave]) return "desconhecido";

      this.verificando[chave] = true;
      try {
        const resultado = await verificarModeloNoServidor(sep.provider, sep.id, apiKey);
        if (this.chaves[sep.provider]?.trim() !== apiKey) return "desconhecido";
        if (resultado.estado === "ok" || resultado.estado === "indisponivel") {
          const rotulo = this.rotuloDoModelo(chave);
          this.verificacoes[chave] = { estado: resultado.estado, em: Date.now(), motivo: resultado.motivo };
          this.persistir();
          if (resultado.estado === "indisponivel") {
            this.avisoModelo =
              `O modelo "${rotulo}" não está mais disponível no provedor e foi removido da lista` +
              (resultado.status ? ` (HTTP ${resultado.status}).` : ".");
            this.garantirModeloDisponivel();
          }
        }
        return resultado.estado;
      } finally {
        delete this.verificando[chave];
      }
    },

    /** Registra que o provedor recusou o modelo durante uma geração (ex.: HTTP 410). */
    marcarIndisponivel(chave: string, motivo?: string) {
      const rotulo = this.rotuloDoModelo(chave);
      this.verificacoes[chave] = { estado: "indisponivel", em: Date.now(), motivo };
      this.persistir();
      this.avisoModelo = `O modelo "${rotulo}" não está mais disponível no provedor e foi removido da lista.`;
      this.garantirModeloDisponivel();
    },

    /**
     * Verifica em segundo plano o que o usuário mais provavelmente vai usar: os modelos do
     * catálogo, os digitados por ele e o selecionado. Respeita a validade do cache, então
     * em geral custa poucas chamadas por dia.
     */
    async verificarDestaques(somenteProvedor?: ProvedorLLM) {
      const provedores = (Object.keys(this.chaves) as ProvedorLLM[]).filter(
        (p) => this.chaves[p].trim() && (!somenteProvedor || p === somenteProvedor),
      );
      const candidatos = provedores.flatMap((provider) =>
        modelosBrutosDoProvedor(this, provider)
          .filter((m) => !ehModeloDescontinuado(provider, m.id))
          .filter(
            (m) =>
              m.custom ||
              CATALOGO_MODELOS.some((c) => c.provider === provider && c.id === m.id) ||
              chaveDoModelo(m) === this.modeloSelecionado,
          )
          .map(chaveDoModelo),
      );
      await executarComLimite(
        candidatos.filter((chave) => !registroValido(this.verificacoes[chave])),
        CONCORRENCIA_VERIFICACAO,
        async (chave) => {
          await this.verificarModelo(chave);
        },
      );
    },

    /** Verificação em lote de todos os modelos de um provedor (cada um custa uma chamada mínima). */
    async verificarTodosDoProvedor(provider: ProvedorLLM) {
      if (this.progressoVerificacao[provider]) return;
      const pendentes = modelosBrutosDoProvedor(this, provider)
        .filter((m) => !ehModeloDescontinuado(provider, m.id))
        .map(chaveDoModelo)
        .filter((chave) => !registroValido(this.verificacoes[chave]));
      if (pendentes.length === 0) return;

      this.progressoVerificacao[provider] = { feitos: 0, total: pendentes.length };
      try {
        await executarComLimite(
          pendentes,
          CONCORRENCIA_VERIFICACAO,
          async (chave) => {
            await this.verificarModelo(chave);
            const progresso = this.progressoVerificacao[provider];
            if (progresso) progresso.feitos += 1;
          },
          () => !this.progressoVerificacao[provider],
        );
      } finally {
        delete this.progressoVerificacao[provider];
      }
    },

    cancelarVerificacaoEmLote(provider: ProvedorLLM) {
      delete this.progressoVerificacao[provider];
    },

    limparVerificacoes(provider?: ProvedorLLM, persistir = true) {
      for (const chave of Object.keys(this.verificacoes)) {
        if (!provider || chave.startsWith(`${provider}:`)) delete this.verificacoes[chave];
      }
      if (persistir) this.persistir();
    },

    definirSomenteVerificados(ativo: boolean) {
      this.somenteVerificados = ativo;
      this.persistir();
      this.garantirModeloDisponivel();
    },

    limparAvisoModelo() {
      this.avisoModelo = null;
    },

    adicionarModeloPersonalizado(provider: ProvedorLLM, id: string) {
      const modeloId = id.trim();
      if (!ehIdDeModeloUtilizavel(modeloId)) return;
      const atuais = this.modelosPersonalizados[provider] ?? [];
      if (!atuais.includes(modeloId)) this.modelosPersonalizados[provider] = [...atuais, modeloId];
      this.persistir();
      this.garantirModeloDisponivel();
    },

    definirConfiguracaoPersonalizada(campo: keyof ConfiguracaoLLMPersonalizada, valor: string) {
      this.configuracaoPersonalizada[campo] = valor;
      this.persistir();
    },

    definirTemperatura(valor: number) {
      this.temperatura = valor;
      this.persistir();
    },

    definirEstrategia(estrategia: EstrategiaPrompt) {
      this.estrategiaSelecionada = estrategia;
      if (this.modoModeloAutomatico) this.garantirModeloDisponivel();
    },

    definirModelo(modeloId: string) {
      if (modeloId === "__adicionar-chave__") {
        window.dispatchEvent(new CustomEvent("ecos:abrir-provedores"));
        return;
      }
      this.modeloSelecionado = modeloId;
      this.persistir();
      // Escolheu um modelo ainda não verificado: testa agora. Se estiver morto, ele sai da lista
      // e a seleção é reajustada (com aviso), em vez de o erro só aparecer na hora de gerar.
      if (this.estadoDoModelo(modeloId) !== "ok") void this.verificarModelo(modeloId);
    },

    definirModoModeloAutomatico(ativo: boolean) {
      this.modoModeloAutomatico = ativo;
      this.persistir();
      if (ativo) this.garantirModeloDisponivel();
    },

    definirEsforco(esforco: EsforcoGeracao) {
      this.esforcoSelecionado = esforco;
    },

    definirModoEsforcoAutomatico(ativo: boolean) {
      this.modoEsforcoAutomatico = ativo;
      this.persistir();
    },

    definirTrocaAutomatica(ativo: boolean) {
      this.trocarModeloAutomaticamente = ativo;
      this.persistir();
    },

    registrarCooldown(chave: string, segundos?: number, cota = false) {
      const duracao = cota ? 60 * 60 * 1000 : Math.max(0, segundos ?? 0) * 1000;
      if (duracao > 0) this.cooldowns[chave] = Date.now() + duracao;
    },

    limparCooldownsExpirados() {
      const agora = Date.now();
      for (const [chave, liberaEm] of Object.entries(this.cooldowns)) {
        if (liberaEm <= agora) delete this.cooldowns[chave];
      }
    },

    garantirModeloDisponivel() {
      this.limparCooldownsExpirados();
      const disponiveis = this.modelosDisponiveisSemCooldown;
      const chaves = new Set(disponiveis.map(chaveDoModelo));

      // Modo automático: segue a recomendação da estratégia (com plano B). No modo manual a
      // escolha do usuário é respeitada — antes ela era sobrescrita a cada recarga.
      if (this.modoModeloAutomatico) {
        const preferido = modelosRecomendados(this.estrategiaSelecionada).find((chave) => chaves.has(chave));
        if (preferido) {
          this.modeloSelecionado = preferido;
          return;
        }
      }

      if (chaves.has(this.modeloSelecionado)) return;

      // A lista do provedor da seleção salva ainda está carregando: não zera a escolha à toa.
      const provedorDaSelecao = separarChaveDoModelo(this.modeloSelecionado)?.provider;
      if (provedorDaSelecao && this.carregandoModelos[provedorDaSelecao] && this.chaves[provedorDaSelecao]?.trim()) return;

      this.modeloSelecionado = disponiveis[0] ? chaveDoModelo(disponiveis[0]) : "";
    },
  },
});
