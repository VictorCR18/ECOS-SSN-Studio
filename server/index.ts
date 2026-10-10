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

import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { ErroLimiteUso, ErroModeloIndisponivelError, gerarModeloSSN, verificarModelo } from "./llmService";
import { ErroListagem, listarModelosDoProvedor } from "./listarModelos";
import { LLMServiceError } from "../src/types/llm";
import type { ChavesApi, ConfiguracaoLLMPersonalizada } from "../src/types/llm";
import type { EsforcoGeracao, EstrategiaPrompt } from "../src/types/ssn";
import { definicaoDoModelo } from "../src/types/llm";
import type { ProvedorLLM } from "../src/types/ssn";
import { separarChaveDoModelo } from "../src/data/modelCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_PROJETO = path.resolve(__dirname, "..");
const DIST_DIR = path.join(RAIZ_PROJETO, "dist");

const PORT = Number(process.env.PORT ?? 3001);

function resolverChaves(chavesRecebidas: Partial<ChavesApi> | undefined): ChavesApi {
  return {
    openai: chavesRecebidas?.openai?.trim() ?? "",
    anthropic: chavesRecebidas?.anthropic?.trim() ?? "",
    gemini: chavesRecebidas?.gemini?.trim() ?? "",
    deepseek: chavesRecebidas?.deepseek?.trim() ?? "",
    nvidia: chavesRecebidas?.nvidia?.trim() ?? "",
    groq: chavesRecebidas?.groq?.trim() ?? "",
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

interface CorpoListarModelos {
  provider?: ProvedorLLM;
  apiKey?: string;
}

app.post("/api/modelos", async (req: Request, res: Response) => {
  const corpo = req.body as CorpoListarModelos;
  if (!corpo.provider || !corpo.apiKey?.trim()) {
    res.status(400).json({ erro: "Provedor e chave de API são obrigatórios." });
    return;
  }
  try {
    res.json(await listarModelosDoProvedor(corpo.provider, corpo.apiKey.trim()));
  } catch (erro) {
    console.warn(`[modelos] Falha ao listar modelos de ${corpo.provider}:`, erro instanceof Error ? erro.message : erro);
    const status = erro instanceof ErroListagem ? erro.status : undefined;
    // 400 (Gemini devolve 400 para chave inválida), 401 e 403: a chave não serve para este provedor.
    if (status === 400 || status === 401 || status === 403) {
      res.status(401).json({ erro: "O provedor recusou a chave de API informada." });
      return;
    }
    res.status(502).json({ erro: "Não foi possível listar os modelos do provedor." });
  }
});

interface CorpoTestarModelo {
  provider?: ProvedorLLM;
  modeloId?: string;
  apiKey?: string;
}

// Chamada mínima (1 requisição curta) para saber se o provedor ainda serve o modelo.
app.post("/api/testar-modelo", async (req: Request, res: Response) => {
  const corpo = req.body as CorpoTestarModelo;
  if (!corpo.provider || !corpo.modeloId?.trim() || !corpo.apiKey?.trim()) {
    res.status(400).json({ erro: "Provedor, modelo e chave de API são obrigatórios." });
    return;
  }
  res.json(await verificarModelo(corpo.provider, corpo.modeloId.trim(), corpo.apiKey.trim()));
});

interface CorpoGerarModelo {
  ecos: string;
  descricao: string;
  estrategia: EstrategiaPrompt;
  esforco: EsforcoGeracao;
  modeloId: string;
  temperatura: number;
  chaves?: Partial<ChavesApi>;
  configuracaoPersonalizada?: ConfiguracaoLLMPersonalizada;
}

app.post("/api/gerar-modelo", async (req: Request, res: Response) => {
  const corpo = req.body as Partial<CorpoGerarModelo>;

  if (!corpo || typeof corpo.descricao !== "string" || !corpo.descricao.trim()) {
    res.status(400).json({ erro: 'Campo "descricao" é obrigatório.' });
    return;
  }
  const partesModelo = corpo.modeloId ? separarChaveDoModelo(corpo.modeloId) : undefined;
  const definicao = corpo.modeloId ? definicaoDoModelo(corpo.modeloId) : undefined;
  if (!corpo.modeloId || (!definicao && !partesModelo)) {
    res.status(400).json({ erro: `Modelo desconhecido: ${String(corpo.modeloId)}` });
    return;
  }
  const provedor = definicao?.provider ?? partesModelo!.provider;
  if (!corpo.chaves?.[provedor]?.trim()) {
    res.status(400).json({
      erro: `Nenhuma chave de API do provedor ${provedor} foi configurada. Adicione uma chave no Painel de Configurações.`,
    });
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
        configuracaoPersonalizada: corpo.configuracaoPersonalizada,
      },
      resolverChaves(corpo.chaves),
    );

    // A extração do JSON e a validação semântica/estrutural continuam no
    // frontend (src/stores/ecosStore.ts + src/utils/ssnValidator.ts), para
    // que os erros de validação apareçam na mesma UI de sempre. Aqui só
    // devolvemos a resposta bruta da LLM.
    res.json(resposta);
  } catch (erro) {
    if (erro instanceof LLMServiceError && erro.causaOriginal instanceof ErroLimiteUso) {
      res.status(429).json(erro.causaOriginal.detalhe);
      return;
    }
    if (erro instanceof LLMServiceError && erro.causaOriginal instanceof ErroModeloIndisponivelError) {
      res.status(410).json(erro.causaOriginal.detalhe);
      return;
    }
    const mensagem =
      erro instanceof LLMServiceError || erro instanceof Error
        ? erro.message
        : "Falha desconhecida ao gerar o modelo.";
    console.error("[POST /api/gerar-modelo] Falha ao chamar o provedor.");
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
  console.log(`\n[ECOS SSN Studio] API rodando em http://localhost:${PORT}`);
});
