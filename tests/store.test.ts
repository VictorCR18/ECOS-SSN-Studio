import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { instalarFetchSimulado, type ChamadaRegistrada } from "./helpers";

// ---- ambiente de navegador mínimo ---------------------------------------------------------
const memoria = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, String(v)),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
};
(globalThis as any).window = Object.assign(new EventTarget(), { confirm: () => true });

const { useSettingsStore } = await import("@/stores/settingsStore");
const { useEcosStore } = await import("@/stores/ecosStore");
const { invalidarCacheDeModelos } = await import("@/services/modelCatalogService");

// ---- API simulada ------------------------------------------------------------------------------
interface ConfigApi {
  listas: Partial<Record<string, { id: string; label?: string }[] | number>>; // número = status HTTP de erro
  /** estado da sonda por `provedor:id`; padrão "ok" */
  sonda?: Record<string, "ok" | "indisponivel" | "desconhecido">;
  gerar?: (c: ChamadaRegistrada) => { status: number; corpo: unknown };
}
let simulado: ReturnType<typeof instalarFetchSimulado>;
let cfg: ConfigApi;
const sondas = () => simulado.chamadas.filter((c) => c.url.endsWith("/api/testar-modelo"));

function instalarApi(config: ConfigApi) {
  cfg = config;
  simulado = instalarFetchSimulado([
    (c) => {
      if (c.url.endsWith("/api/modelos")) {
        const lista = cfg.listas[c.corpo.provider];
        if (typeof lista === "number") return { status: lista, corpo: { erro: "recusado" } };
        return { status: 200, corpo: { modelos: lista ?? [] } };
      }
      if (c.url.endsWith("/api/testar-modelo")) {
        const estado = cfg.sonda?.[`${c.corpo.provider}:${c.corpo.modeloId}`] ?? "ok";
        return { status: 200, corpo: { estado, ...(estado === "indisponivel" ? { status: 410, motivo: "end of life" } : {}) } };
      }
      if (c.url.endsWith("/api/gerar-modelo")) return cfg.gerar?.(c);
      return undefined;
    },
  ]);
}

function salvarConfig(extra: Record<string, unknown>) {
  memoria.set("ecos-ssn:config", JSON.stringify({ chaves: {}, ...extra }));
}
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const chavesDisponiveis = (s: ReturnType<typeof useSettingsStore>) => s.availableModels.map((m) => `${m.provider}:${m.id}`);

beforeEach(() => {
  memoria.clear();
  for (const p of ["openai", "anthropic", "gemini", "deepseek", "nvidia", "groq"] as const) invalidarCacheDeModelos(p);
  setActivePinia(createPinia());
});
afterEach(() => simulado?.restaurar());

const NVIDIA = [
  { id: "nvidia/nemotron-3-ultra-550b-a55b" },
  { id: "nvidia/nvidia-nemotron-nano-9b-v2" },
  { id: "google/gemma-3-27b-it" },
  { id: "moonshotai/kimi-k3" },
  { id: "foo/morto-1" },
];
const GEMINI = [{ id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" }, { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }, { id: "gemma-3-27b-it" }];

describe("lista de modelos (queixa: Gemini, nvidia/nemo… e google/gemma… não apareciam)", () => {
  it("mostra a lista completa de cada provedor com chave", async () => {
    salvarConfig({ chaves: { gemini: "g", nvidia: "n", groq: "q" } });
    instalarApi({ listas: { gemini: GEMINI, nvidia: NVIDIA, groq: [{ id: "openai/gpt-oss-120b" }, { id: "qwen/qwen3.8-27b" }] } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    const chaves = chavesDisponiveis(s);
    for (const esperado of [
      "gemini:gemini-3.5-flash", "gemini:gemini-3.8-flash", "gemini:gemma-3-27b-it",
      "nvidia:nvidia/nemotron-3-ultra-550b-a55b", "nvidia:nvidia/nvidia-nemotron-nano-9b-v2", "nvidia:google/gemma-3-27b-it",
      "groq:openai/gpt-oss-120b", "groq:qwen/qwen3.8-27b",
    ]) expect(chaves).toContain(esperado);
  });

  it("DeepSeek V4 Pro (aposentado) nunca aparece, mesmo se o provedor ainda o listar", async () => {
    salvarConfig({ chaves: { nvidia: "n" } });
    instalarApi({ listas: { nvidia: [...NVIDIA, { id: "deepseek-ai/deepseek-v4-pro-0813" }, { id: "deepseek-ai/deepseek-v4-pro" }] } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    expect(chavesDisponiveis(s).filter((c) => c.includes("deepseek-v4"))).toEqual([]);
  });

  it("falha na listagem cai para o catálogo (sem o modelo aposentado) e expõe o motivo", async () => {
    salvarConfig({ chaves: { nvidia: "n", gemini: "g" } });
    instalarApi({ listas: { nvidia: 502, gemini: 401 } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    expect(s.origemModelos.gemini?.origem).toBe("catalogo");
    expect(s.origemModelos.gemini?.erro).toContain("recusado");
    const chaves = chavesDisponiveis(s);
    expect(chaves).toContain("nvidia:moonshotai/kimi-k3");
    expect(chaves).toContain("gemini:gemini-3.5-flash");
    expect(chaves.some((c) => c.includes("deepseek-v4"))).toBe(false);
  });

  it("lista vazia do provedor não deixa o usuário sem nenhum modelo", async () => {
    salvarConfig({ chaves: { groq: "q" } });
    instalarApi({ listas: { groq: [] } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    expect(chavesDisponiveis(s)).toContain("groq:openai/gpt-oss-120b");
  });
});

describe("diagnóstico da lista", () => {
  it("guarda quantos o provedor listou e o que foi descartado (para explicar 'por que tem poucos')", async () => {
    salvarConfig({ chaves: { groq: "q" } });
    instalarApi({ listas: { groq: [{ id: "openai/gpt-oss-120b" }] } });
    // o servidor simulado devolve só `modelos`; aqui checamos o valor padrão quando faltam os campos
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    expect(s.origemModelos.groq?.origem).toBe("api");
    expect(s.origemModelos.groq?.total).toBe(1);
    expect(s.origemModelos.groq?.ignorados).toEqual({ naoTexto: [], descontinuados: [] });
  });
});

describe("seleção de modelo", () => {
  it("REGRESSÃO: escolha manual fora do catálogo sobrevive à recarga da página", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:google/gemma-3-27b-it" });
    instalarApi({ listas: { nvidia: NVIDIA } });
    const s = useSettingsStore();
    expect(s.modeloSelecionado).toBe("nvidia:google/gemma-3-27b-it");
    const carga = s.carregarModelosConfigurados();
    expect(s.modeloSelecionado).toBe("nvidia:google/gemma-3-27b-it"); // durante o carregamento
    await carga;
    expect(s.modeloSelecionado).toBe("nvidia:google/gemma-3-27b-it"); // depois
  });

  it("REGRESSÃO: no modo manual a recomendação da estratégia não sobrescreve a escolha", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:moonshotai/kimi-k3" });
    instalarApi({ listas: { nvidia: NVIDIA } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    s.garantirModeloDisponivel();
    expect(s.modeloSelecionado).toBe("nvidia:moonshotai/kimi-k3");
  });

  it("modo automático: G3 → Nemotron; G4 → GPT-OSS 120B quando o Qwen 3.8 (preview) saiu do ar", async () => {
    salvarConfig({ chaves: { nvidia: "n", groq: "q" }, modoModeloAutomatico: true });
    instalarApi({ listas: { nvidia: NVIDIA, groq: [{ id: "openai/gpt-oss-20b" }, { id: "openai/gpt-oss-120b" }] } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    s.definirEstrategia("G3");
    expect(s.modeloSelecionado).toBe("nvidia:nvidia/nemotron-3-ultra-550b-a55b");
    s.definirEstrategia("G4");
    expect(s.modeloSelecionado).toBe("groq:openai/gpt-oss-120b");
  });
});

describe("verificação de modelos", () => {
  it("modelo morto detectado pela sonda some da lista, gera aviso e a seleção migra", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:moonshotai/kimi-k3" });
    instalarApi({ listas: { nvidia: NVIDIA }, sonda: { "nvidia:foo/morto-1": "indisponivel" } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    expect(chavesDisponiveis(s)).toContain("nvidia:foo/morto-1");

    expect(await s.verificarModelo("nvidia:foo/morto-1")).toBe("indisponivel");
    expect(chavesDisponiveis(s)).not.toContain("nvidia:foo/morto-1");
    expect(s.modelosOcultos.map((m) => m.chave)).toEqual(["nvidia:foo/morto-1"]);
    expect(s.avisoModelo).toContain("foo/morto-1");
  });

  it("escolher no seletor um modelo não verificado e morto: testa na hora e troca a seleção", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:moonshotai/kimi-k3" });
    instalarApi({ listas: { nvidia: NVIDIA }, sonda: { "nvidia:foo/morto-1": "indisponivel" } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();

    s.definirModelo("nvidia:foo/morto-1");
    await esperar();
    expect(s.modeloSelecionado).not.toBe("nvidia:foo/morto-1");
    expect(chavesDisponiveis(s)).toContain(s.modeloSelecionado);
    expect(s.avisoModelo).toBeTruthy();
  });

  it("verificação em segundo plano só testa destaques (catálogo + selecionado), não a lista inteira", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:google/gemma-3-27b-it" });
    instalarApi({ listas: { nvidia: NVIDIA } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    const testados = sondas().map((c) => c.corpo.modeloId).sort();
    expect(testados).toEqual(["google/gemma-3-27b-it", "moonshotai/kimi-k3", "nvidia/nemotron-3-ultra-550b-a55b"]);
  });

  it("resultado fica em cache: reabrir o app não repete as chamadas de teste", async () => {
    salvarConfig({ chaves: { nvidia: "n" } });
    instalarApi({ listas: { nvidia: NVIDIA } });
    let s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    const antes = sondas().length;
    expect(antes).toBeGreaterThan(0);

    setActivePinia(createPinia()); // "recarrega" a página: estado novo, localStorage igual
    invalidarCacheDeModelos("nvidia");
    s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    expect(sondas().length).toBe(antes);
    expect(s.estadoDoModelo("nvidia:moonshotai/kimi-k3")).toBe("ok");
  });

  it("falha transitória da sonda ('desconhecido') NÃO esconde o modelo nem entra no cache", async () => {
    salvarConfig({ chaves: { nvidia: "n" } });
    instalarApi({ listas: { nvidia: NVIDIA }, sonda: { "nvidia:moonshotai/kimi-k3": "desconhecido" } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    expect(chavesDisponiveis(s)).toContain("nvidia:moonshotai/kimi-k3");
    expect(s.estadoDoModelo("nvidia:moonshotai/kimi-k3")).toBeUndefined();
  });

  it("'somente verificados' mostra apenas os que responderam", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, somenteVerificados: true });
    instalarApi({ listas: { nvidia: NVIDIA } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    expect(chavesDisponiveis(s).sort()).toEqual(["nvidia:moonshotai/kimi-k3", "nvidia:nvidia/nemotron-3-ultra-550b-a55b"]);
  });

  it("trocar a chave de um provedor invalida as verificações dele", async () => {
    salvarConfig({ chaves: { nvidia: "n" } });
    instalarApi({ listas: { nvidia: NVIDIA } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    expect(s.estadoDoModelo("nvidia:moonshotai/kimi-k3")).toBe("ok");
    s.definirChave("nvidia", "outra-chave");
    expect(s.estadoDoModelo("nvidia:moonshotai/kimi-k3")).toBeUndefined();
  });

  it("verificarTodosDoProvedor testa só o que falta e reporta progresso", async () => {
    salvarConfig({ chaves: { nvidia: "n" } });
    instalarApi({ listas: { nvidia: NVIDIA }, sonda: { "nvidia:foo/morto-1": "indisponivel" } });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    await esperar(50);
    await s.verificarTodosDoProvedor("nvidia");
    expect(s.progressoVerificacao.nvidia).toBeUndefined();
    expect(chavesDisponiveis(s)).not.toContain("nvidia:foo/morto-1");
    expect(chavesDisponiveis(s)).toContain("nvidia:nvidia/nvidia-nemotron-nano-9b-v2");
    expect(s.estadoDoModelo("nvidia:google/gemma-3-27b-it")).toBe("ok");
  });
});

describe("geração com modelo aposentado (HTTP 410 do servidor)", () => {
  const corpo410 = (model: string) => ({ status: 410, corpo: { code: "MODEL_UNAVAILABLE", provider: "nvidia", model, message: "end of life" } });

  it("mostra mensagem clara, esconde o modelo e não fica em loop", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, modeloSelecionado: "nvidia:foo/morto-1" });
    instalarApi({ listas: { nvidia: NVIDIA }, gerar: (c) => corpo410(c.corpo.modeloId) });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    s.modeloSelecionado = "nvidia:foo/morto-1";
    const ecos = useEcosStore();
    ecos.definirDescricao("Descrição longa o suficiente do ecossistema");
    await ecos.gerarModelo();
    expect(ecos.erro).toMatch(/não está mais disponível/);
    expect(ecos.gerando).toBe(false);
    expect(chavesDisponiveis(s)).not.toContain("nvidia:foo/morto-1");
  });

  it("com troca automática ligada, gera com o próximo modelo disponível", async () => {
    salvarConfig({ chaves: { nvidia: "n" }, modoModeloAutomatico: false, trocarModeloAutomaticamente: true });
    const ssn = { ecos: "X", atores: [{ nome: "A", tipo: "CoI" }], relacoes: [], gateways: [] };
    instalarApi({
      listas: { nvidia: NVIDIA },
      gerar: (c) => c.corpo.modeloId === "nvidia:foo/morto-1"
        ? corpo410(c.corpo.modeloId)
        : { status: 200, corpo: { textoBruto: JSON.stringify(ssn), duracaoMs: 5, tentativas: 1 } },
    });
    const s = useSettingsStore();
    await s.carregarModelosConfigurados();
    s.modeloSelecionado = "nvidia:foo/morto-1";
    const ecos = useEcosStore();
    ecos.definirDescricao("Descrição longa o suficiente do ecossistema");
    await ecos.gerarModelo();
    expect(ecos.erro).toBeNull();
    expect(ecos.modeloAtual?.ecos).toBe("X");
    expect(ecos.aviso).toMatch(/não está mais disponível/);
    expect(s.modeloSelecionado).not.toBe("nvidia:foo/morto-1");
  });
});
