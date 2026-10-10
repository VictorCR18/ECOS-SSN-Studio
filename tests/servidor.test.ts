import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import { obterParametrosEsforco } from "../src/services/effortService";
import { ehModeloDeTexto, ehModeloDescontinuado } from "../src/data/modelCatalog";
import { listarModelosDoProvedor } from "../server/listarModelos";
import { ErroModeloIndisponivelError, gerarModeloSSN, verificarModelo } from "../server/llmService";
import { LLMServiceError, type ChavesApi } from "../src/types/llm";
import { completionOk, instalarFetchSimulado, MODELO_SSN_VALIDO } from "./helpers";

let simulado: ReturnType<typeof instalarFetchSimulado> | undefined;
afterEach(() => simulado?.restaurar());

const CHAVES: ChavesApi = { openai: "", anthropic: "", gemini: "g-key", deepseek: "", nvidia: "n-key", groq: "q-key" };

describe("esforço por modelo", () => {
  it("Gemini 3.x usa thinkingLevel (nunca thinkingBudget 0)", () => {
    for (const id of ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3-flash-preview", "gemini-3.1-pro-preview"]) {
      assert.deepEqual(obterParametrosEsforco(`gemini:${id}`, "baixo"), { geminiThinkingConfig: { thinkingLevel: "low" } }, id);
      assert.deepEqual(obterParametrosEsforco(`gemini:${id}`, "alto"), { geminiThinkingConfig: { thinkingLevel: "high" } }, id);
    }
  });
  it("Gemini 2.5 Flash continua com thinkingBudget", () => {
    assert.deepEqual(obterParametrosEsforco("gemini:gemini-2.5-flash", "baixo"), { geminiThinkingConfig: { thinkingBudget: 0 } });
  });
  it("modelos sem mecanismo conhecido não recebem parâmetros (ex.: Gemma)", () => {
    assert.deepEqual(obterParametrosEsforco("gemini:gemma-3-27b-it", "alto"), {});
    assert.deepEqual(obterParametrosEsforco("nvidia:google/gemma-3-27b-it", "alto"), {});
  });
});

describe("filtros de catálogo", () => {
  it("reconhece DeepSeek V4 Pro da NVIDIA como descontinuado", () => {
    assert.equal(ehModeloDescontinuado("nvidia", "deepseek-ai/deepseek-v4-pro-0813"), true);
    assert.equal(ehModeloDescontinuado("nvidia", "deepseek-ai/deepseek-v4-pro"), true);
    assert.equal(ehModeloDescontinuado("nvidia", "moonshotai/kimi-k3"), false);
  });
  it("não esconde modelos de chat legítimos", () => {
    for (const id of [
      "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nvidia-nemotron-nano-9b-v2", "google/gemma-3-27b-it",
      "meta/llama-3.3-70b-instruct", "moonshotai/kimi-k3", "openai/gpt-oss-120b", "qwen/qwen3.6-27b",
      "gemini-3.5-flash", "gemma-3-27b-it", "mistralai/mistral-large-3", "deepseek-ai/deepseek-v3.2",
      // nomes vistos no AI Studio / build.nvidia.com / console da Groq (capturas do usuário)
      "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview",
      "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemma-4-26b-a4b-it", "gemma-4-31b-it",
      "gemini-robotics-er-2-preview", "gemini-2.5-computer-use-preview",
      "deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3", "nvidia/nemotron-3.5-lightning-30b-a3b", "minimaxai/minimax-m2.7",
    ]) assert.equal(ehModeloDeTexto(id), true, id);
  });
  it("esconde o que não é chat", () => {
    for (const id of [
      "nvidia/nv-embedqa-e5-v5", "nvidia/llama-3.2-nv-rerankqa-1b-v2", "whisper-large-v3", "playai-tts",
      "meta-llama/llama-guard-4-12b", "gemini-embedding-001", "imagen-4.0-generate-001", "veo-3.0-generate-001",
      "gemini-3.1-flash-image", "gemini-2.5-flash-preview-tts", "nvidia/nemoretriever-parse", "groq/compound",
      "gemini-3.8-flash-tts", "gemini-embedding-2", "lyria-3-pro", "openai/gpt-oss-safeguard-20b", "meta-llama/llama-prompt-guard-2-86m",
      "canopylabs/orpheus-v1-english", "gemini-3.8-live",
    ]) assert.equal(ehModeloDeTexto(id), false, id);
  });
});

describe("listagem de modelos", () => {
  it("Gemini: usa x-goog-api-key (sem Bearer), segue a paginação e filtra por generateContent", async () => {
    simulado = instalarFetchSimulado([
      (c) => {
        if (!c.url.includes("generativelanguage.googleapis.com/v1beta/models")) return undefined;
        if (!c.url.includes("pageToken=P2")) {
          return { status: 200, corpo: {
            models: [
              { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
            ],
            nextPageToken: "P2",
          } };
        }
        return { status: 200, corpo: { models: [
          { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
          { name: "models/gemma-3-27b-it", displayName: "Gemma 3 27B", supportedGenerationMethods: ["generateContent"] },
          { name: "models/imagen-4.0-generate-001", supportedGenerationMethods: ["generateContent"] },
        ] } };
      },
    ]);
    const { modelos } = await listarModelosDoProvedor("gemini", "g-key");
    assert.deepEqual(modelos.map((m) => m.id), ["gemini-3.5-flash", "gemini-3.8-flash", "gemma-3-27b-it"]);
    assert.equal(simulado.chamadas.length, 2, "deve buscar as 2 páginas");
    for (const c of simulado.chamadas) {
      assert.equal(c.headers["x-goog-api-key"], "g-key");
      assert.equal(c.headers["authorization"], undefined, "Bearer com chave de API quebra a API do Google");
    }
  });

  it("NVIDIA: remove descontinuados, embeddings e UUIDs, mantém nvidia/* e google/gemma*", async () => {
    simulado = instalarFetchSimulado([
      (c) => c.url.endsWith("integrate.api.nvidia.com/v1/models")
        ? { status: 200, corpo: { data: [
            { id: "deepseek-ai/deepseek-v4-pro-0813" },
            { id: "deepseek-ai/deepseek-v4-pro" },
            { id: "nvidia/nemotron-3-ultra-550b-a55b" },
            { id: "nvidia/nvidia-nemotron-nano-9b-v2" },
            { id: "google/gemma-3-27b-it" },
            { id: "nvidia/nv-embedqa-e5-v5" },
            { id: "52e1ddb6-c745-4802-93f5-ba012d04c336" },
            { id: "moonshotai/kimi-k3" },
            { id: "moonshotai/kimi-k3" },
          ] } }
        : undefined,
    ]);
    const resultado = await listarModelosDoProvedor("nvidia", "n-key");
    const ids = resultado.modelos.map((m) => m.id);
    assert.equal(resultado.total, 7, "7 modelos únicos: o duplicado e o UUID (função interna) não contam");
    assert.deepEqual(resultado.ignorados.descontinuados, ["deepseek-ai/deepseek-v4-pro", "deepseek-ai/deepseek-v4-pro-0813"]);
    assert.deepEqual(resultado.ignorados.naoTexto, ["nvidia/nv-embedqa-e5-v5"]);
    assert.deepEqual(ids, [
      "google/gemma-3-27b-it", "moonshotai/kimi-k3", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nvidia-nemotron-nano-9b-v2",
    ]);
  });

  it("Groq: some o que a documentação marca como desligado (Qwen 3.6, Llama 3.x, compound) e mantém o resto", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    try {
      simulado = instalarFetchSimulado([
        (c) => c.url.includes("api.groq.com/openai/v1/models")
          ? { status: 200, corpo: { data: [
              { id: "openai/gpt-oss-120b", active: true },
              { id: "openai/gpt-oss-20b", active: true },
              { id: "qwen/qwen3.8-27b", active: true },
              { id: "qwen/qwen3.6-27b", active: true },            // desligado em 14/09/26
              { id: "llama-3.1-8b-instant", active: true },          // 16/08/26 (ainda listado p/ enterprise)
              { id: "llama-3.3-70b-versatile", active: true },       // 16/08/26
              { id: "groq/compound", active: true },                 // 21/09/26
              { id: "whisper-large-v3", active: true },
              { id: "canopylabs/orpheus-v1-english", active: true },
              { id: "openai/gpt-oss-safeguard-20b", active: true },
              { id: "some/inativo", active: false },
            ] } }
          : undefined,
      ]);
      const r = await listarModelosDoProvedor("groq", "q-key");
      assert.deepEqual(r.modelos.map((m) => m.id), ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]);
      assert.deepEqual(r.ignorados.descontinuados, ["groq/compound", "llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"]);
      assert.deepEqual(r.ignorados.naoTexto, ["canopylabs/orpheus-v1-english", "openai/gpt-oss-safeguard-20b", "whisper-large-v3"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("descontinuação respeita a data: antes do desligamento o modelo ainda aparece", () => {
    const antes = Date.parse("2026-09-13T00:00:00Z");
    const depois = Date.parse("2026-09-14T00:00:00Z");
    assert.equal(ehModeloDescontinuado("groq", "qwen/qwen3.6-27b", antes), false);
    assert.equal(ehModeloDescontinuado("groq", "qwen/qwen3.6-27b", depois), true);
    assert.equal(ehModeloDescontinuado("groq", "qwen/qwen3.8-27b", depois), false);
    assert.equal(ehModeloDescontinuado("groq", "openai/gpt-oss-120b", depois), false);
  });

  it("propaga o status HTTP quando a chave é recusada", async () => {
    simulado = instalarFetchSimulado([() => ({ status: 400, corpo: { error: { message: "API key not valid" } } })]);
    await assert.rejects(() => listarModelosDoProvedor("gemini", "ruim"), (e: any) => e.status === 400);
  });
});

describe("verificação (sonda) de modelo", () => {
  const rotaNvidia = (resposta: any) => (c: any) => c.url.includes("integrate.api.nvidia.com/v1/chat/completions") ? resposta : undefined;

  it("HTTP 410 'end of life' (caso real do DeepSeek V4 Pro) => indisponivel", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 410, corpo: {
      type: "about:blank", title: "Gone", status: 410,
      detail: "The model 'deepseek-ai/deepseek-v4-pro' has reached its end of life on 2026-08-07T09:00:00Z and is no longer available.",
    } })]);
    const r = await verificarModelo("nvidia", "deepseek-ai/deepseek-v4-pro", "n-key");
    assert.equal(r.estado, "indisponivel");
    assert.equal(r.status, 410);
    assert.equal(simulado.chamadas.length, 1, "não deve insistir em modelo morto");
  });

  it("HTTP 404 => indisponivel", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 404, corpo: { detail: "Function 'abc': Not found for account 'xyz'" } })]);
    assert.equal((await verificarModelo("nvidia", "foo/bar", "n-key")).estado, "indisponivel");
  });

  it("200 com texto => ok; 200 sem texto (raciocínio gastou os tokens) => ok", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 200, corpo: completionOk("ok") })]);
    assert.equal((await verificarModelo("nvidia", "moonshotai/kimi-k3", "n-key")).estado, "ok");
    simulado.restaurar();
    simulado = instalarFetchSimulado([rotaNvidia({ status: 200, corpo: completionOk(null) })]);
    assert.equal((await verificarModelo("nvidia", "moonshotai/kimi-k3", "n-key")).estado, "ok");
  });

  it("429 prova que o modelo existe => ok", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 429, corpo: { detail: "Too Many Requests" } })]);
    assert.equal((await verificarModelo("nvidia", "moonshotai/kimi-k3", "n-key")).estado, "ok");
  });

  it("Gemini 429 com 'limit: 0' (sem cota na chave, ex.: 2.5 Pro no plano grátis) => indisponivel", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("generativelanguage") ? { status: 429, corpo: { error: { code: 429, status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-pro" } } } : undefined]);
    const r = await verificarModelo("gemini", "gemini-2.5-pro", "g-key");
    assert.equal(r.estado, "indisponivel");
    assert.match(r.motivo ?? "", /limite 0/);
  });

  it("Gemini 429 de excesso momentâneo ('limit: 5') => ok (o modelo funciona, só está no limite)", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("generativelanguage") ? { status: 429, corpo: { error: { code: 429, status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash" } } } : undefined]);
    assert.equal((await verificarModelo("gemini", "gemini-3.5-flash", "g-key")).estado, "ok");
  });

  it("401 (chave inválida) NÃO marca o modelo como morto", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 401, corpo: { detail: "Authentication failed" } })]);
    assert.equal((await verificarModelo("nvidia", "moonshotai/kimi-k3", "ruim")).estado, "desconhecido");
  });

  it("400 de parâmetro com a palavra 'deprecated' NÃO marca o modelo como morto", async () => {
    simulado = instalarFetchSimulado([rotaNvidia({ status: 400, corpo: { error: { message: "'max_tokens' is deprecated for this endpoint" } } })]);
    assert.equal((await verificarModelo("nvidia", "moonshotai/kimi-k3", "n-key")).estado, "desconhecido");
  });

  it("Groq: 404 model_not_found => indisponivel", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("api.groq.com") ? { status: 404, corpo: { error: { message: "The model `x` does not exist or you do not have access to it.", code: "model_not_found" } } } : undefined]);
    assert.equal((await verificarModelo("groq", "x", "q-key")).estado, "indisponivel");
  });

  it("Gemini: 404 'is not found for API version' => indisponivel", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("generativelanguage") ? { status: 404, corpo: { error: { code: 404, status: "NOT_FOUND", message: "models/gemini-9 is not found for API version v1beta" } } } : undefined]);
    assert.equal((await verificarModelo("gemini", "gemini-9", "g-key")).estado, "indisponivel");
  });
});

describe("geração", () => {
  const params = (modeloId: string) => ({
    ecos: "Teste", descricao: "Um ecossistema de teste", estrategia: "G1" as const, esforco: "medio" as const, modeloId, temperatura: 0.3,
  });

  it("modelo aposentado (410) => ErroModeloIndisponivelError, sem retentativas", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("nvidia.com") ? { status: 410, corpo: { title: "Gone", detail: "The model has reached its end of life and is no longer available." } } : undefined]);
    await assert.rejects(
      () => gerarModeloSSN(params("nvidia:deepseek-ai/deepseek-v4-pro"), CHAVES),
      (e: unknown) => e instanceof LLMServiceError && e.causaOriginal instanceof ErroModeloIndisponivelError
        && e.causaOriginal.detalhe.model === "nvidia:deepseek-ai/deepseek-v4-pro",
    );
    assert.equal(simulado.chamadas.length, 1);
  });

  it("provedor rejeita chat_template_kwargs (400) => repete sem parâmetros de raciocínio e avisa", async () => {
    let n = 0;
    simulado = instalarFetchSimulado([(c) => {
      if (!c.url.includes("nvidia.com")) return undefined;
      n++;
      return c.corpo?.chat_template_kwargs
        ? { status: 400, corpo: { error: { message: "Unsupported parameter: chat_template_kwargs.enable_thinking" } } }
        : { status: 200, corpo: completionOk(MODELO_SSN_VALIDO) };
    }]);
    const r = await gerarModeloSSN(params("nvidia:nvidia/nemotron-3-ultra-550b-a55b"), CHAVES);
    assert.equal(n, 2);
    assert.match(r.aviso ?? "", /não aceitou os parâmetros/);
    assert.equal(simulado.chamadas[1].corpo.chat_template_kwargs, undefined);
    assert.equal(simulado.chamadas[1].corpo.reasoning_effort, undefined);
  });

  it("NVIDIA sempre envia max_tokens explícito (evita JSON cortado)", async () => {
    simulado = instalarFetchSimulado([(c) => c.url.includes("nvidia.com") ? { status: 200, corpo: completionOk(MODELO_SSN_VALIDO) } : undefined]);
    await gerarModeloSSN(params("nvidia:moonshotai/kimi-k3"), CHAVES);
    assert.equal(simulado.chamadas[0].corpo.max_tokens, 16384);
    assert.equal(simulado.chamadas[0].corpo.reasoning_effort, "high");
  });
});
