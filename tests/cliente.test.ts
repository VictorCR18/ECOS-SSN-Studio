import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { consultaEfetiva, filtrarModelos, type ItemDeModelo } from "../src/utils/modelFilter";
import { registroValido, VALIDADE_INDISPONIVEL_MS, VALIDADE_OK_MS } from "../src/utils/verificacao";
import { executarComLimite } from "../src/utils/concorrencia";

const ITENS: ItemDeModelo[] = [
  { value: "header:gemini", title: "Gemini", header: true, provider: "gemini" },
  { value: "gemini:gemini-3.5-flash", title: "Gemini 3.5 Flash", provider: "gemini", id: "gemini-3.5-flash" },
  { value: "gemini:gemma-3-27b-it", title: "Gemma 3 27B", provider: "gemini", id: "gemma-3-27b-it" },
  { value: "header:nvidia", title: "NVIDIA NIM", header: true, provider: "nvidia" },
  { value: "nvidia:nvidia/nemotron-3-ultra-550b-a55b", title: "Nemotron 3 Ultra", provider: "nvidia", id: "nvidia/nemotron-3-ultra-550b-a55b" },
  { value: "nvidia:google/gemma-3-27b-it", title: "google/gemma-3-27b-it", provider: "nvidia", id: "google/gemma-3-27b-it" },
  { value: "header:groq", title: "Groq", header: true, provider: "groq" },
  { value: "groq:qwen/qwen3.6-27b", title: "Qwen 3.6 27B", provider: "groq", id: "qwen/qwen3.6-27b" },
];
const valores = (l: ItemDeModelo[]) => l.map((i) => i.value);

describe("filtro do seletor de modelos", () => {
  it("REGRESSÃO: busca igual ao título do modelo selecionado não esconde os demais", () => {
    // Vuetify coloca o título do selecionado em `search` ao focar o campo.
    const r = filtrarModelos(ITENS, "Nemotron 3 Ultra", "Nemotron 3 Ultra");
    assert.equal(r.length, ITENS.length);
  });
  it("sem busca mostra tudo, com cabeçalhos", () => {
    assert.equal(filtrarModelos(ITENS, "", undefined).length, ITENS.length);
    assert.equal(filtrarModelos(ITENS, null, undefined).length, ITENS.length);
  });
  it("achar pelo ID cru: 'nvidia/nemo' encontra o Nemotron cujo título é só 'Nemotron 3 Ultra'", () => {
    assert.deepEqual(valores(filtrarModelos(ITENS, "nvidia/nemo", "Qwen 3.6 27B")), [
      "header:nvidia", "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
    ]);
  });
  it("achar 'google/gemma' (NVIDIA) e 'gemma' (Gemini) com cabeçalhos dos grupos certos", () => {
    assert.deepEqual(valores(filtrarModelos(ITENS, "google/gemma", undefined)), ["header:nvidia", "nvidia:google/gemma-3-27b-it"]);
    assert.deepEqual(valores(filtrarModelos(ITENS, "gemma", undefined)), [
      "header:gemini", "gemini:gemma-3-27b-it", "header:nvidia", "nvidia:google/gemma-3-27b-it",
    ]);
  });
  it("busca por provedor e por vários termos", () => {
    assert.deepEqual(valores(filtrarModelos(ITENS, "gemini flash", undefined)), ["header:gemini", "gemini:gemini-3.5-flash"]);
    assert.deepEqual(valores(filtrarModelos(ITENS, "groq", undefined)), ["header:groq", "groq:qwen/qwen3.6-27b"]);
  });
  it("sem resultado devolve lista vazia (nada de cabeçalho solto)", () => {
    assert.deepEqual(filtrarModelos(ITENS, "zzz", undefined), []);
  });
  it("consultaEfetiva", () => {
    assert.equal(consultaEfetiva("  Qwen 3.6 27B ", "qwen 3.6 27b"), "");
    assert.equal(consultaEfetiva("qwen 3", "Qwen 3.6 27B"), "qwen 3");
  });
});

describe("validade das verificações", () => {
  const t0 = 1_000_000;
  it("ok vale mais que indisponível", () => {
    assert.ok(registroValido({ estado: "ok", em: t0 }, t0 + VALIDADE_OK_MS - 1));
    assert.equal(registroValido({ estado: "ok", em: t0 }, t0 + VALIDADE_OK_MS), undefined);
    assert.ok(registroValido({ estado: "indisponivel", em: t0 }, t0 + VALIDADE_INDISPONIVEL_MS - 1));
    assert.equal(registroValido({ estado: "indisponivel", em: t0 }, t0 + VALIDADE_INDISPONIVEL_MS), undefined);
    assert.equal(registroValido(undefined), undefined);
  });
});

describe("executarComLimite", () => {
  it("respeita o limite de simultaneidade e processa todos", async () => {
    let ativos = 0, pico = 0, feitos = 0;
    await executarComLimite([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      ativos++; pico = Math.max(pico, ativos);
      await new Promise((r) => setTimeout(r, 5));
      ativos--; feitos++;
    });
    assert.equal(feitos, 7);
    assert.ok(pico <= 3 && pico >= 2, `pico=${pico}`);
  });
  it("uma tarefa que falha não derruba as demais", async () => {
    let feitos = 0;
    await executarComLimite([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error("x"); feitos++; });
    assert.equal(feitos, 2);
  });
});
