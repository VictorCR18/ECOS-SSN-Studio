# ECOS SSN Studio

Aplicação web para modelagem de **Ecossistemas de Software (ECOS)** que gera
automaticamente modelos **SSN (Software Supply Network)** a partir de
descrições textuais, usando LLMs, e renderiza o diagrama resultante
diretamente de um **JSON estruturado** — sem qualquer dependência de XML.

Evolução conceitual do [ECOS Modeling](https://github.com/ronierlima/ecos-front),
construída para o TCC de Victor Cavalcante (2026), reaproveitando as
definições de notação, os construtores de prompt (G1–G4) e a lógica de
seleção de LLM/esforço documentados em `executor_experimento.ts`.

## Principais funcionalidades

- **Geração por descrição livre**: descreva o ecossistema (nome, domínio,
  produtos, atores conhecidos) e gere o modelo SSN automaticamente.
- **4 estratégias de prompt (G1–G4)**, replicando a metodologia do TCC:
  baseline, contexto estruturado, persona + few-shot e cadeia de raciocínio
  (Chain-of-Thought).
- **Seleção automática de LLM por estratégia**, conforme a conclusão do TCC
  (Qwen 3.8 para G4, Nemotron 3 Ultra para G2/G3), sempre sobrescrevível
  manualmente.
- **Esforço de geração adaptativo** (Baixo/Médio/Alto), estimado a partir do
  tamanho do ECOS e traduzido para o mecanismo de raciocínio específico de
  cada modelo (`thinkingBudget` no Gemini, `reasoning_effort` na Groq,
  `chat_template_kwargs` na NVIDIA NIM).
- **Renderização 100% a partir de JSON** com [maxGraph](https://github.com/maxGraph/maxGraph):
  o JSON retornado pela LLM é convertido diretamente em células do grafo via
  chamadas de API (`insertVertex`/`insertEdge`) — nenhum XML é gerado, lido
  ou usado em nenhum momento.
- **Notação visual fiel ao TCC**: cor/forma por tipo de ator, rótulo de fluxo
  na aresta, selo de gateway (split/join, OU/XOU) anotado sobre o ator.
- **Validação estrutural e semântica** do JSON gerado, com mensagens de erro
  específicas e opção de nova tentativa.
- **Diagrama interativo**: zoom, pan, arrastar nós, tooltips.
- **Exportação** em JSON, SVG e PNG.
- **Persistência local** dos modelos gerados (localStorage).
- **Backend próprio** que faz as chamadas às LLMs — evita bloqueio de CORS
  (a API da NVIDIA NIM, por exemplo, não envia cabeçalhos CORS e por isso
  **não pode** ser chamada diretamente do navegador) e mantém as chaves de
  API fora do bundle do cliente.

## Por que existe um backend?

`executor_experimento.ts` (o script original do TCC) roda em Node.js, então
chama `integrate.api.nvidia.com` etc. sem qualquer restrição — CORS é uma
política **do navegador**, que não existe em chamadas servidor↔servidor. Uma
versão 100% frontend desta aplicação (chamando as LLMs direto do browser)
funciona com o Gemini (a Google libera CORS de propósito para uso client-side
via a build "web" do SDK), mas a NVIDIA NIM bloqueia a requisição com o erro:

```
Access to fetch at 'https://integrate.api.nvidia.com/v1/chat/completions'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

Por isso este projeto tem um `server/` (Express) que reaproveita o
`promptBuilder`/`effortService`/`modelSelector` de `src/services/` e faz as
chamadas às três APIs a partir do servidor. O frontend só fala com o próprio
backend (`/api/gerar-modelo`).

## Stack técnica

| Camada          | Tecnologia                                  |
| --------------- | -------------------------------------------- |
| Frontend        | Vue 3 (Composition API) + Vite + Vuetify 3 (tema customizado) |
| Estado          | Pinia                                        |
| Diagrama        | maxGraph (`@maxgraph/core`)                  |
| Backend         | Node.js + Express (`server/`)                |
| LLMs (no backend) | `@google/genai` (Gemini), `openai` SDK (NVIDIA NIM), `groq-sdk` (Groq) |

## Como executar

Pré-requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env   # preencha ao menos uma chave de API
npm run dev            # sobe o Vite (5173) e a API Express (3001) juntos
```

Abra `http://localhost:5173`. Em desenvolvimento, o Vite faz proxy de
`/api/*` para a API (ver `vite.config.ts`) — do ponto de vista do navegador,
tudo é "same-origin", então não há CORS a se preocupar mesmo em dev.

Se preferir rodar cada processo separadamente (dois terminais):

```bash
npm run dev:server   # API Express em http://localhost:3001
npm run dev:client   # Vite em http://localhost:5173
```

### Build e execução em produção

```bash
npm run build   # type-check (frontend + backend) e build do frontend em dist/
npm start        # um único processo Express serve a API e os arquivos de dist/
```

`npm start` sobe só a API/servidor (porta `3001` por padrão, configurável via
`PORT` no `.env`) e serve o `dist/` gerado pelo build — não precisa de mais
nada além do Node.js rodando.

### Chaves de API

Você precisa de ao menos **uma** chave configurada no `.env` (raiz do
projeto — variáveis lidas pelo `server/index.ts`, nunca pelo `vite`/cliente):

```bash
GEMINI_API_KEY=...
NVIDIA_API_KEY=...
GROQ_API_KEY=...
```

- **Google Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **NVIDIA NIM** (Nemotron 3 Ultra, DeepSeek V4 Pro, Kimi K3): [build.nvidia.com](https://build.nvidia.com)
- **Groq** (GPT-OSS 120B, Qwen 3.8): [console.groq.com/keys](https://console.groq.com/keys)

O **Painel de Configurações** da aplicação mostra quais provedores já estão
configurados no servidor (via `GET /api/status`) e permite, opcionalmente,
informar uma chave pessoal por navegador (fica só no `localStorage` do
cliente e é enviada a cada requisição para `/api/gerar-modelo`, onde o
backend a usa no lugar da sua própria — útil se várias pessoas usam a mesma
instalação com chaves diferentes). Isso é só um *override*: sem preencher
nada, a aplicação usa sempre as chaves do `.env` do servidor.

## Estrutura do projeto

```
server/                    Backend Express (única parte que fala com as APIs de LLM)
  index.ts                    Rotas /api/status e /api/gerar-modelo, serve dist/ em produção
  llmService.ts                Orquestração (reaproveita promptBuilder/effortService de src/)
  providers/                   Chamada a cada provedor (Gemini/NVIDIA/Groq), sem CORS

src/
  components/         Componentes Vue (editor, config, diagrama, legenda, histórico, validação)
  data/               Base de conhecimento SSN (definições, schema, exemplos few-shot)
  plugins/            Configuração do Vuetify (tema customizado)
  services/
    promptBuilder.ts       Construtores de prompt G1–G4 (usado pelo backend)
    effortService.ts       Tradução de esforço -> parâmetros por modelo/provedor (usado pelo backend)
    modelSelector.ts        Seleção automática de LLM por estratégia
    llmService.ts            Cliente HTTP fino: só chama /api/gerar-modelo
    jsonToGraphConverter.ts  JSON SSN -> células do maxGraph (sem XML)
    graph/
      shapes.ts              Shape customizado (pentágono) + estilos por tipo de ator
      layout.ts               Layout hierárquico automático + zoom
      exportService.ts        Exportação SVG/PNG/JSON
  stores/             Pinia (ecosStore: modelo/geração/histórico; settingsStore: config + status do backend)
  types/              Tipos TypeScript do domínio SSN e de LLM (compartilhados com o backend)
  utils/              Extração de JSON da resposta da LLM, validação, storage, download, id
```

Os módulos em `src/services/promptBuilder.ts`, `effortService.ts`,
`modelSelector.ts`, `src/data/ssnKnowledge.ts` e `src/types/*` são puros
(sem nenhuma API de navegador) e por isso são importados **tanto pelo
frontend quanto pelo `server/`** — um único arquivo-fonte para a lógica de
prompt/esforço, sem duplicação.

## Notação SSN

Baseada em Boucharas, Jansen e Brinkkemper (2009), com a extensão do ator
**Agregador** proposta por Costa et al. (2013):

| Ator               | Forma                         | Cor      |
| ------------------ | ------------------------------ | -------- |
| CoI                 | Retângulo                     | Azul     |
| Fornecedor          | Pentágono alongado             | Laranja  |
| Cliente             | Pentágono alongado             | Amarelo  |
| Intermediário       | Hexágono alongado               | Verde    |
| Agregador           | Losango                        | Vermelho |
| Cliente do Cliente  | Retângulo arredondado          | Cinza    |

Fluxos: `P` (produto), `Ser` (serviço), `Req` (requisito), `Des`
(desenvolvimento), `Comp` (compensação financeira), `Sys` (integração
sistêmica). Gateways (`OU`/`XOU`, `split`/`join`) aparecem como um selo em
losango preto ancorado no canto do ator correspondente.

## Limitações conhecidas

- Histórico e preferências vivem no `localStorage` do navegador; limpar os
  dados do site apaga o histórico de modelos salvos.
- O layout automático (hierárquico) prioriza clareza estrutural; ajustes
  manuais de posição não são persistidos entre gerações do mesmo modelo
  (cada nova geração reconstrói o diagrama do zero).
- `npm start` roda o backend via `tsx` (sem passo de build/transpilação
  separado para o servidor) — adequado para uso pessoal/local ou um único
  processo Node em produção; para um deploy mais robusto, considere
  compilar `server/` com `tsc` e rodar o `.js` resultante com `node`.
#   E C O S - S S N - S t u d i o  
 