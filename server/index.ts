// server/index.ts
//
// Backend mínimo cuja única razão de existir é evitar CORS e manter as
// chaves de API fora do navegador: recebe a descrição do ecossistema do
// frontend, monta o prompt e chama o provedor de LLM correto a partir do
// servidor (onde CORS simplesmente não se aplica), devolvendo o JSON bruto
// para o frontend validar/renderizar.
//
// Em desenvolvimento, o Vite (porta 5173) faz proxy de /api para cá (ver
// vite.config.ts) — do ponto de vista do navegador, tudo é "same-origin".
// Em produção (`npm run build && npm start`), este mesmo processo também
// serve os arquivos estáticos gerados em dist/.

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { gerarModeloSSN } from "./llmService";
import { LLMServiceError } from "../src/types/llm";
import type { ChavesApi } from "../src/types/llm";
import type { EsforcoGeracao, EstrategiaPrompt } from "../src/types/ssn";
import { MODELOS_LLM, definicaoDoModelo } from "../src/types/llm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_PROJETO = path.resolve(__dirname, "..");
const DIST_DIR = path.join(RAIZ_PROJETO, "dist");

const PORT = Number(process.env.PORT ?? 3001);

function chavesDoAmbiente(): ChavesApi {
  return {
    gemini: process.env.GEMINI_API_KEY ?? "",
    nvidia: process.env.NVIDIA_API_KEY ?? "",
    groq: process.env.GROQ_API_KEY ?? "",
  };
}

/** Mescla chaves enviadas pelo cliente (override opcional) com as do servidor. */
function resolverChaves(chavesRecebidas: Partial<ChavesApi> | undefined): ChavesApi {
  const doAmbiente = chavesDoAmbiente();
  return {
    gemini: chavesRecebidas?.gemini?.trim() || doAmbiente.gemini,
    nvidia: chavesRecebidas?.nvidia?.trim() || doAmbiente.nvidia,
    groq: chavesRecebidas?.groq?.trim() || doAmbiente.groq,
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/status", (_req: Request, res: Response) => {
  const chaves = chavesDoAmbiente();
  res.json({
    gemini: Boolean(chaves.gemini),
    nvidia: Boolean(chaves.nvidia),
    groq: Boolean(chaves.groq),
    modelos: MODELOS_LLM.map((m) => ({ id: m.id, provedor: m.provedor, rotulo: m.rotulo })),
  });
});

interface CorpoGerarModelo {
  ecos: string;
  descricao: string;
  estrategia: EstrategiaPrompt;
  esforco: EsforcoGeracao;
  modeloId: string;
  temperatura: number;
  chaves?: Partial<ChavesApi>;
}

app.post("/api/gerar-modelo", async (req: Request, res: Response) => {
  const corpo = req.body as Partial<CorpoGerarModelo>;

  if (!corpo || typeof corpo.descricao !== "string" || !corpo.descricao.trim()) {
    res.status(400).json({ erro: 'Campo "descricao" é obrigatório.' });
    return;
  }
  if (!corpo.modeloId || !definicaoDoModelo(corpo.modeloId)) {
    res.status(400).json({ erro: `Modelo desconhecido: ${String(corpo.modeloId)}` });
    return;
  }

  try {
    const resposta = await gerarModeloSSN(
      {
        ecos: corpo.ecos || "Ecossistema sem nome",
        descricao: corpo.descricao,
        estrategia: corpo.estrategia ?? "G3",
        esforco: corpo.esforco ?? "medio",
        modeloId: corpo.modeloId,
        temperatura: typeof corpo.temperatura === "number" ? corpo.temperatura : 0.3,
      },
      resolverChaves(corpo.chaves),
    );

    // A extração do JSON e a validação semântica/estrutural continuam no
    // frontend (src/stores/ecosStore.ts + src/utils/ssnValidator.ts), para
    // que os erros de validação apareçam na mesma UI de sempre. Aqui só
    // devolvemos a resposta bruta da LLM.
    res.json(resposta);
  } catch (erro) {
    const mensagem =
      erro instanceof LLMServiceError || erro instanceof Error
        ? erro.message
        : "Falha desconhecida ao gerar o modelo.";
    console.error("[POST /api/gerar-modelo]", mensagem);
    res.status(502).json({ erro: mensagem });
  }
});

// Em produção, serve o build do frontend (dist/) a partir deste mesmo processo.
app.use(express.static(DIST_DIR));
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(DIST_DIR, "index.html"), (erro) => {
    if (erro) next(erro);
  });
});

app.listen(PORT, () => {
  const chaves = chavesDoAmbiente();
  console.log(`\n[ECOS SSN Studio] API rodando em http://localhost:${PORT}`);
  console.log(
    `  Gemini: ${chaves.gemini ? "configurada" : "não configurada"} · ` +
      `NVIDIA NIM: ${chaves.nvidia ? "configurada" : "não configurada"} · ` +
      `Groq: ${chaves.groq ? "configurada" : "não configurada"}`,
  );
  if (!chaves.gemini && !chaves.nvidia && !chaves.groq) {
    console.warn(
      "  Nenhuma chave de API configurada no .env — configure GEMINI_API_KEY / NVIDIA_API_KEY / GROQ_API_KEY, " +
        "ou informe uma chave pessoal no Painel de Configurações do app.\n",
    );
  }
});
