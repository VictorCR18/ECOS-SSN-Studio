// src/data/ssnKnowledge.ts
//
// Base de conhecimento da notação SSN usada pelos construtores de prompt
// (src/services/promptBuilder.ts). Todo o conteúdo abaixo foi portado
// diretamente de `executor_experimento.ts` (material suplementar do TCC de
// Victor Cavalcante), preservando literalmente as definições, o esquema JSON
// e os exemplos few-shot validados no experimento — para que os prompts G1–G4
// gerados por esta aplicação sejam fiéis aos usados na pesquisa.

/** Schema JSON solicitado nas estratégias G1, G2 e G3 (sem raciocínio CoT). */
export const SCHEMA_BASE = `{
  "ecos": "<nome>",
  "atores": [{"nome": "<nome>", "tipo": "<CoI|Fornecedor|Cliente|Intermediario|Agregador|ClienteDoCliente>"}],
  "relacoes": [{"origem": "<nome>", "destino": "<nome>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>"}],
  "gateways": [{"ator": "<nome de um ator já listado em 'atores'>", "direcao": "<split|join>", "logica": "<OU|XOU>", "descricao": "<descricao>"}]
}
Importante:
- Se não houver gateways, use "gateways": [].
- O campo "ator" de um gateway DEVE ser o nome de um ator já presente em "atores". Nunca invente um ator do tipo "Gateway X" apenas para representar o ponto de convergência/divergência — o split ou join é uma propriedade de um ator que já existe no modelo.
- "direcao": "split" = o ator distribui para múltiplos destinos; "join" = o ator recebe de múltiplas origens e consolida em um destino.
- "logica": "XOU" = exatamente um relacionamento ocorre por vez (exclusivo); "OU" = um, vários ou todos os relacionamentos podem ocorrer simultaneamente (inclusivo).`;

/** Schema JSON solicitado na estratégia G4 (inclui o campo raciocinio_cot). */
export const SCHEMA_G4 = `{
  "raciocinio_cot": "<Seu raciocínio passo a passo aqui>",
  "ecos": "<nome>",
  "atores": [{"nome": "<nome>", "tipo": "<CoI|Fornecedor|Cliente|Intermediario|Agregador|ClienteDoCliente>"}],
  "relacoes": [{"origem": "<nome>", "destino": "<nome>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>"}],
  "gateways": [{"ator": "<nome de um ator já listado em 'atores'>", "direcao": "<split|join>", "logica": "<OU|XOU>", "descricao": "<descricao>"}]
}
Importante:
- Se não houver gateways, use "gateways": [].
- O campo "ator" de um gateway DEVE ser o nome de um ator já presente em "atores". Nunca invente um ator do tipo "Gateway X" apenas para representar o ponto de convergência/divergência — o split ou join é uma propriedade de um ator que já existe no modelo.
- "direcao": "split" = o ator distribui para múltiplos destinos; "join" = o ator recebe de múltiplas origens e consolida em um destino.
- "logica": "XOU" = exatamente um relacionamento ocorre por vez (exclusivo); "OU" = um, vários ou todos os relacionamentos podem ocorrer simultaneamente (inclusivo).`;

/** Definições formais da notação SSN, usadas em G2, G3 e G4. */
export const DEFINICOES_SSN = `## Definições da Notação SSN

Baseado em Boucharas, Jansen e Brinkkemper (2009), com a extensão do ator
Agregador proposta por Costa et al. (2013).

**Tipos de Atores:**
- CoI (Core of Interest / Companhia de Interesse): software/plataforma central sob avaliação — pode haver múltiplos módulos autônomos, cada um modelado como um CoI separado
- Fornecedor: fornece produtos e/ou serviços ao CoI
- Cliente: consome, direta ou indiretamente, o produto/serviço do CoI
- Intermediario: revendedor, distribuidor ou canal que atua entre o CoI (ou um Agregador) e os Clientes
- ClienteDoCliente: recebe produto/serviço indiretamente, através de outro Cliente
- Agregador: consolida fluxos vindos do CoI (ou de múltiplos módulos/CoIs) antes de repassá-los aos Intermediarios — extensão de Costa et al. (2013), não presente no artigo original de 2009

**Tipos de Fluxo (convenção deste projeto):**
Boucharas et al. (2009) definem Fluxo de forma genérica — produto, serviço,
financeiro ou de conteúdo, no formato X.Y. Para tornar os modelos comparáveis
entre diferentes ECOS, usamos os seguintes códigos fixos:
- P: produto (tecnologia/componente fornecido ao CoI). Por convenção, mesmo quando o fornecimento tem caráter de serviço, use P nas relações Fornecedor→CoI.
- Ser: serviço prestado pelo CoI, Agregador ou Intermediario aos Clientes
- Req: requisito/solicitação feita ao CoI
- Des: atividade de desenvolvimento realizada sobre o CoI
- Comp: compensação financeira entre atores
- Sys: integração sistêmica entre plataformas, módulos, CoIs ou Agregadores

**Gateways:**
Boucharas et al. (2009) definem dois tipos de gateway, ortogonais à direção do fluxo:
- OU Gateway: permite que um, vários ou todos os relacionamentos de entrada/saída ocorram simultaneamente (lógica inclusiva)
- XOU Gateway: permite exatamente um relacionamento de entrada/saída por vez (lógica exclusiva)

No JSON, represente cada gateway com dois campos independentes:
- "direcao": "split" (o ator distribui para múltiplos destinos) ou "join" (o ator recebe de múltiplas origens e consolida em um destino)
- "logica": "OU" ou "XOU", conforme as definições acima

O gateway é sempre associado a um ator que já existe em "atores" — nunca crie
um ator fictício do tipo "Gateway X" só para representar o ponto de
convergência ou divergência; represente-o apenas pelas relações de
entrada/saída do próprio ator, mais o registro em "gateways".

Se não houver gateway, omita o ator da lista (use "gateways": []).

**Regras Semânticas Obrigatórias:**
1. Todo Fornecedor DEVE ter relação apontando para o CoI com tipo_fluxo P (convenção deste projeto — ver acima)
2. O CoI DEVE ter relações de saída (tipo Ser ou Sys)
3. Intermediarios recebem do CoI (ou Agregador) e repassam para Clientes — nunca recebem diretamente do CoI se houver um Agregador no caminho
4. Não modele relações diretas de Fornecedores para Clientes
5. Se houver módulos (web, mobile, MOOC), cada um é um CoI separado
6. Agregadores ficam entre o CoI e os Intermediarios; o CoI aponta para o Agregador (Sys), e o Agregador aponta para os Intermediarios (Sys)
7. Todo "ator" referenciado em "gateways" DEVE existir em "atores"`;

/** Quatro exemplos completos (few-shot) usados em G3. */
export const EXEMPLOS_G3 = `## Exemplo 1 (Pandas)
Saída:
{
  "ecos": "Pandas",
  "atores": [
    {"nome": "Pandas", "tipo": "CoI"},
    {"nome": "Contribuidores", "tipo": "Fornecedor"},
    {"nome": "Mantenedores", "tipo": "Fornecedor"},
    {"nome": "Statsmodels", "tipo": "Fornecedor"},
    {"nome": "Distribuidores de Pacotes", "tipo": "Fornecedor"},
    {"nome": "Xorbits", "tipo": "Fornecedor"},
    {"nome": "Featuretools", "tipo": "Fornecedor"},
    {"nome": "Comunidade open-source", "tipo": "Agregador"},
    {"nome": "Plataformas e IDEs", "tipo": "Intermediario"},
    {"nome": "Softwares/Frameworks", "tipo": "Cliente"},
    {"nome": "Cientistas de Dados", "tipo": "Cliente"},
    {"nome": "Usuário/Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Clientes", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "Contribuidores", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Mantenedores", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Statsmodels", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Distribuidores de Pacotes", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Xorbits", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Featuretools", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Pandas", "destino": "Comunidade open-source", "tipo_fluxo": "Sys"},
    {"origem": "Comunidade open-source", "destino": "Plataformas e IDEs", "tipo_fluxo": "Sys"},
    {"origem": "Plataformas e IDEs", "destino": "Softwares/Frameworks", "tipo_fluxo": "Ser"},
    {"origem": "Plataformas e IDEs", "destino": "Cientistas de Dados", "tipo_fluxo": "Ser"},
    {"origem": "Plataformas e IDEs", "destino": "Usuário/Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Softwares/Frameworks", "destino": "Clientes", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Plataformas e IDEs", "direcao": "split", "logica": "OU", "descricao": "Distribui o pacote Pandas simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 2 (VSCode)
Saída:
{
  "ecos": "VSCode",
  "atores": [
    {"nome": "VSCode", "tipo": "CoI"},
    {"nome": "GitHub Copilot", "tipo": "Fornecedor"},
    {"nome": "OpenAI", "tipo": "Fornecedor"},
    {"nome": "IDEs", "tipo": "Fornecedor"},
    {"nome": "Microsoft", "tipo": "Fornecedor"},
    {"nome": "Devs de Extensões", "tipo": "Fornecedor"},
    {"nome": "Github", "tipo": "Agregador"},
    {"nome": "VSCode (Plataforma)", "tipo": "Intermediario"},
    {"nome": "Copilot", "tipo": "Intermediario"},
    {"nome": "Estudantes", "tipo": "Cliente"},
    {"nome": "Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Equipe de Devs", "tipo": "Cliente"},
    {"nome": "Revisores", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "GitHub Copilot", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "OpenAI", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "IDEs", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "Microsoft", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "Devs de Extensões", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "VSCode", "destino": "Github", "tipo_fluxo": "Sys"},
    {"origem": "Github", "destino": "VSCode (Plataforma)", "tipo_fluxo": "Sys"},
    {"origem": "Github", "destino": "Copilot", "tipo_fluxo": "Sys"},
    {"origem": "VSCode (Plataforma)", "destino": "Estudantes", "tipo_fluxo": "Ser"},
    {"origem": "VSCode (Plataforma)", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "VSCode (Plataforma)", "destino": "Equipe de Devs", "tipo_fluxo": "Ser"},
    {"origem": "Copilot", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Copilot", "destino": "Equipe de Devs", "tipo_fluxo": "Ser"},
    {"origem": "Desenvolvedor", "destino": "Revisores", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Github", "direcao": "split", "logica": "OU", "descricao": "Distribui simultaneamente para VSCode (Plataforma) e Copilot"},
    {"ator": "VSCode (Plataforma)", "direcao": "split", "logica": "OU", "descricao": "Distribui ambiente de desenvolvimento simultaneamente para múltiplos tipos de clientes"},
    {"ator": "Copilot", "direcao": "split", "logica": "OU", "descricao": "Distribui assistência de IA simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 3 (LangChain)
Saída:
{
  "ecos": "LangChain",
  "atores": [
    {"nome": "LangChain", "tipo": "CoI"},
    {"nome": "APIs LLMs", "tipo": "Fornecedor"},
    {"nome": "OpenAI", "tipo": "Fornecedor"},
    {"nome": "Anthropic", "tipo": "Fornecedor"},
    {"nome": "IDEs", "tipo": "Fornecedor"},
    {"nome": "Google", "tipo": "Fornecedor"},
    {"nome": "Infraestrutura Cloud", "tipo": "Fornecedor"},
    {"nome": "Comunidade/Fórum", "tipo": "Fornecedor"},
    {"nome": "APIs/LLMs", "tipo": "Agregador"},
    {"nome": "Integradores de API", "tipo": "Intermediario"},
    {"nome": "Startups", "tipo": "Cliente"},
    {"nome": "Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Empresas de Automação", "tipo": "Cliente"},
    {"nome": "Usuários final", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "APIs LLMs", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "OpenAI", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Anthropic", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "IDEs", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Google", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Infraestrutura Cloud", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Comunidade/Fórum", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "LangChain", "destino": "APIs/LLMs", "tipo_fluxo": "Sys"},
    {"origem": "APIs/LLMs", "destino": "Integradores de API", "tipo_fluxo": "Sys"},
    {"origem": "Integradores de API", "destino": "Startups", "tipo_fluxo": "Ser"},
    {"origem": "Integradores de API", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Integradores de API", "destino": "Empresas de Automação", "tipo_fluxo": "Ser"},
    {"origem": "Startups", "destino": "Usuários final", "tipo_fluxo": "Ser"},
    {"origem": "Empresas de Automação", "destino": "Usuários final", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Integradores de API", "direcao": "split", "logica": "OU", "descricao": "Distribui integrações simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 4 (Netflix)
Saída:
{
  "ecos": "Netflix",
  "atores": [
    {"nome": "NETFLIX (EMPRESA)", "tipo": "CoI"},
    {"nome": "NETFLIX (PC)", "tipo": "CoI"},
    {"nome": "NETFLIX (MOBILE)", "tipo": "CoI"},
    {"nome": "PRODUTORAS DE MÍDIAS", "tipo": "Fornecedor"},
    {"nome": "BANCO DE DADOS", "tipo": "Fornecedor"},
    {"nome": "SERVIDORES", "tipo": "Fornecedor"},
    {"nome": "VENDEDOR DE PC", "tipo": "Fornecedor"},
    {"nome": "VENDEDOR DE SMARTPHONES", "tipo": "Fornecedor"},
    {"nome": "INTERNET", "tipo": "Intermediario"},
    {"nome": "NAVEGADORES DE INTERNET", "tipo": "Intermediario"},
    {"nome": "APP STORE", "tipo": "Intermediario"},
    {"nome": "PLAY STORE", "tipo": "Intermediario"},
    {"nome": "USUÁRIOS", "tipo": "Cliente"}
  ],
  "relacoes": [
    {"origem": "PRODUTORAS DE MÍDIAS", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "BANCO DE DADOS", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "SERVIDORES", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "NETFLIX (EMPRESA)", "destino": "INTERNET", "tipo_fluxo": "Sys"},
    {"origem": "INTERNET", "destino": "NETFLIX (PC)", "tipo_fluxo": "Sys"},
    {"origem": "INTERNET", "destino": "NETFLIX (MOBILE)", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (PC)", "destino": "NAVEGADORES DE INTERNET", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (MOBILE)", "destino": "APP STORE", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (MOBILE)", "destino": "PLAY STORE", "tipo_fluxo": "Sys"},
    {"origem": "NAVEGADORES DE INTERNET", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "APP STORE", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "PLAY STORE", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "VENDEDOR DE PC", "destino": "USUÁRIOS", "tipo_fluxo": "P"},
    {"origem": "VENDEDOR DE SMARTPHONES", "destino": "USUÁRIOS", "tipo_fluxo": "P"}
  ],
  "gateways": [
    {"ator": "INTERNET", "direcao": "split", "logica": "OU", "descricao": "Distribui o sinal da Netflix (Empresa) simultaneamente para as plataformas PC e Mobile"},
    {"ator": "NETFLIX (MOBILE)", "direcao": "split", "logica": "OU", "descricao": "Distribui o acesso mobile simultaneamente para App Store e Play Store"},
    {"ator": "USUÁRIOS", "direcao": "join", "logica": "OU", "descricao": "Consolida o serviço de streaming recebido por Navegador, App Store ou Play Store, podendo vir de um ou mais canais simultaneamente"}
  ]
}`;

/** Os mesmos quatro exemplos, agora com o campo raciocinio_cot preenchido — usados em G4. */
export const EXEMPLOS_G4 = `## Exemplo 1 (Pandas)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é Pandas. Passo 2: Fornecedores (Contribuidores, Mantenedores, Statsmodels, Distribuidores, Xorbits, Featuretools) apontam com P para Pandas (convenção do projeto). Passo 3: Clientes são Softwares/Frameworks, Cientistas, Usuário/Dev. 'Clientes' recebe de Softwares/Frameworks, portanto é ClienteDoCliente. Passo 4: Comunidade open-source atua como Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e repassa Sys ao Intermediario. Plataformas e IDEs é Intermediario (recebe Sys do Agregador e distribui Ser para Clientes). Passo 5: Plataformas e IDEs serve múltiplos Clientes simultaneamente — gateway split/OU nesse próprio ator, sem criar nó fictício. Passo 6: Todos os atores referenciados em gateways existem em atores; regras semânticas satisfeitas.",
  "ecos": "Pandas",
  "atores": [
    {"nome": "Pandas", "tipo": "CoI"},
    {"nome": "Contribuidores", "tipo": "Fornecedor"},
    {"nome": "Mantenedores", "tipo": "Fornecedor"},
    {"nome": "Statsmodels", "tipo": "Fornecedor"},
    {"nome": "Distribuidores de Pacotes", "tipo": "Fornecedor"},
    {"nome": "Xorbits", "tipo": "Fornecedor"},
    {"nome": "Featuretools", "tipo": "Fornecedor"},
    {"nome": "Comunidade open-source", "tipo": "Agregador"},
    {"nome": "Plataformas e IDEs", "tipo": "Intermediario"},
    {"nome": "Softwares/Frameworks", "tipo": "Cliente"},
    {"nome": "Cientistas de Dados", "tipo": "Cliente"},
    {"nome": "Usuário/Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Clientes", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "Contribuidores", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Mantenedores", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Statsmodels", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Distribuidores de Pacotes", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Xorbits", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Featuretools", "destino": "Pandas", "tipo_fluxo": "P"},
    {"origem": "Pandas", "destino": "Comunidade open-source", "tipo_fluxo": "Sys"},
    {"origem": "Comunidade open-source", "destino": "Plataformas e IDEs", "tipo_fluxo": "Sys"},
    {"origem": "Plataformas e IDEs", "destino": "Softwares/Frameworks", "tipo_fluxo": "Ser"},
    {"origem": "Plataformas e IDEs", "destino": "Cientistas de Dados", "tipo_fluxo": "Ser"},
    {"origem": "Plataformas e IDEs", "destino": "Usuário/Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Softwares/Frameworks", "destino": "Clientes", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Plataformas e IDEs", "direcao": "split", "logica": "OU", "descricao": "Distribui o pacote Pandas simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 2 (VSCode)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é VSCode. Passo 2: Fornecedores (GitHub Copilot, OpenAI, IDEs, Microsoft, Devs de Extensões) fornecem P ao CoI (convenção do projeto). Passo 3: Clientes são Estudantes, Desenvolvedor e Equipe de Devs. Revisores recebem serviço de Desenvolvedor, sendo ClienteDoCliente. Passo 4: Github é o Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e distribui Sys para ambos os Intermediarios: VSCode (Plataforma) e Copilot. Nenhuma relação direta do CoI para os Intermediarios — tudo passa pelo Agregador. Passo 5: Github distribui para dois Intermediarios simultaneamente — gateway split/OU em Github. VSCode (Plataforma) e Copilot servem múltiplos Clientes simultaneamente — split/OU em cada um. Passo 6: Todos os atores referenciados em gateways existem em atores; regras semânticas satisfeitas.",
  "ecos": "VSCode",
  "atores": [
    {"nome": "VSCode", "tipo": "CoI"},
    {"nome": "GitHub Copilot", "tipo": "Fornecedor"},
    {"nome": "OpenAI", "tipo": "Fornecedor"},
    {"nome": "IDEs", "tipo": "Fornecedor"},
    {"nome": "Microsoft", "tipo": "Fornecedor"},
    {"nome": "Devs de Extensões", "tipo": "Fornecedor"},
    {"nome": "Github", "tipo": "Agregador"},
    {"nome": "VSCode (Plataforma)", "tipo": "Intermediario"},
    {"nome": "Copilot", "tipo": "Intermediario"},
    {"nome": "Estudantes", "tipo": "Cliente"},
    {"nome": "Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Equipe de Devs", "tipo": "Cliente"},
    {"nome": "Revisores", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "GitHub Copilot", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "OpenAI", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "IDEs", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "Microsoft", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "Devs de Extensões", "destino": "VSCode", "tipo_fluxo": "P"},
    {"origem": "VSCode", "destino": "Github", "tipo_fluxo": "Sys"},
    {"origem": "Github", "destino": "VSCode (Plataforma)", "tipo_fluxo": "Sys"},
    {"origem": "Github", "destino": "Copilot", "tipo_fluxo": "Sys"},
    {"origem": "VSCode (Plataforma)", "destino": "Estudantes", "tipo_fluxo": "Ser"},
    {"origem": "VSCode (Plataforma)", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "VSCode (Plataforma)", "destino": "Equipe de Devs", "tipo_fluxo": "Ser"},
    {"origem": "Copilot", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Copilot", "destino": "Equipe de Devs", "tipo_fluxo": "Ser"},
    {"origem": "Desenvolvedor", "destino": "Revisores", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Github", "direcao": "split", "logica": "OU", "descricao": "Distribui simultaneamente para VSCode (Plataforma) e Copilot"},
    {"ator": "VSCode (Plataforma)", "direcao": "split", "logica": "OU", "descricao": "Distribui ambiente de desenvolvimento simultaneamente para múltiplos tipos de clientes"},
    {"ator": "Copilot", "direcao": "split", "logica": "OU", "descricao": "Distribui assistência de IA simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 3 (LangChain)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é LangChain. Passo 2: Fornecedores (APIs LLMs, OpenAI, Anthropic, IDEs, Google, Infraestrutura Cloud, Comunidade/Fórum) fornecem P ao CoI (convenção do projeto). Passo 3: Clientes são Startups, Desenvolvedor e Empresas de Automação. Usuários finais recebem serviço dos Clientes, sendo ClienteDoCliente. Passo 4: APIs/LLMs é o Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e repassa Sys ao Intermediario. Passo 5: Integradores de API serve múltiplos Clientes simultaneamente — gateway split/OU nesse ator. Passo 6: Todos os atores referenciados em gateways existem em atores; regras semânticas satisfeitas.",
  "ecos": "LangChain",
  "atores": [
    {"nome": "LangChain", "tipo": "CoI"},
    {"nome": "APIs LLMs", "tipo": "Fornecedor"},
    {"nome": "OpenAI", "tipo": "Fornecedor"},
    {"nome": "Anthropic", "tipo": "Fornecedor"},
    {"nome": "IDEs", "tipo": "Fornecedor"},
    {"nome": "Google", "tipo": "Fornecedor"},
    {"nome": "Infraestrutura Cloud", "tipo": "Fornecedor"},
    {"nome": "Comunidade/Fórum", "tipo": "Fornecedor"},
    {"nome": "APIs/LLMs", "tipo": "Agregador"},
    {"nome": "Integradores de API", "tipo": "Intermediario"},
    {"nome": "Startups", "tipo": "Cliente"},
    {"nome": "Desenvolvedor", "tipo": "Cliente"},
    {"nome": "Empresas de Automação", "tipo": "Cliente"},
    {"nome": "Usuários final", "tipo": "ClienteDoCliente"}
  ],
  "relacoes": [
    {"origem": "APIs LLMs", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "OpenAI", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Anthropic", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "IDEs", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Google", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Infraestrutura Cloud", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "Comunidade/Fórum", "destino": "LangChain", "tipo_fluxo": "P"},
    {"origem": "LangChain", "destino": "APIs/LLMs", "tipo_fluxo": "Sys"},
    {"origem": "APIs/LLMs", "destino": "Integradores de API", "tipo_fluxo": "Sys"},
    {"origem": "Integradores de API", "destino": "Startups", "tipo_fluxo": "Ser"},
    {"origem": "Integradores de API", "destino": "Desenvolvedor", "tipo_fluxo": "Ser"},
    {"origem": "Integradores de API", "destino": "Empresas de Automação", "tipo_fluxo": "Ser"},
    {"origem": "Startups", "destino": "Usuários final", "tipo_fluxo": "Ser"},
    {"origem": "Empresas de Automação", "destino": "Usuários final", "tipo_fluxo": "Ser"}
  ],
  "gateways": [
    {"ator": "Integradores de API", "direcao": "split", "logica": "OU", "descricao": "Distribui integrações simultaneamente para múltiplos tipos de clientes"}
  ]
}

## Exemplo 4 (Netflix)
Saída:
{
  "raciocinio_cot": "Passo 1: A CoI (Azul) é representada em três blocos autônomos: NETFLIX (EMPRESA), NETFLIX (PC) e NETFLIX (MOBILE). Passo 2: Fornecedores (Laranja) PRODUTORAS DE MÍDIAS, BANCO DE DADOS e SERVIDORES fornecem à NETFLIX (EMPRESA) com tipo_fluxo P (convenção do projeto); VENDEDOR DE PC e VENDEDOR DE SMARTPHONES fornecem diretamente ao Cliente, também com P. Passo 3: O Cliente (Amarelo) é USUÁRIOS. Passo 4: Os Intermediários (Verde) são INTERNET, NAVEGADORES DE INTERNET, APP STORE e PLAY STORE; os fluxos entre CoIs e Intermediários são Sys, e o fluxo final ao Cliente é Ser. Passo 5: INTERNET distribui simultaneamente para NETFLIX (PC) e NETFLIX (MOBILE) — gateway split/OU em INTERNET; NETFLIX (MOBILE) distribui simultaneamente para APP STORE e PLAY STORE — gateway split/OU em NETFLIX (MOBILE). Passo 6: USUÁRIOS recebe de três canais que podem ocorrer simultaneamente (NAVEGADORES DE INTERNET, APP STORE, PLAY STORE) — gateway join/OU em USUÁRIOS, sem criar atores fictícios do tipo 'Gateway OR': o join é representado apenas pelas três relações de entrada mais o registro em gateways. Passo 7: Todos os atores referenciados em gateways existem em atores; regras semânticas satisfeitas.",
  "ecos": "Netflix",
  "atores": [
    {"nome": "NETFLIX (EMPRESA)", "tipo": "CoI"},
    {"nome": "NETFLIX (PC)", "tipo": "CoI"},
    {"nome": "NETFLIX (MOBILE)", "tipo": "CoI"},
    {"nome": "PRODUTORAS DE MÍDIAS", "tipo": "Fornecedor"},
    {"nome": "BANCO DE DADOS", "tipo": "Fornecedor"},
    {"nome": "SERVIDORES", "tipo": "Fornecedor"},
    {"nome": "VENDEDOR DE PC", "tipo": "Fornecedor"},
    {"nome": "VENDEDOR DE SMARTPHONES", "tipo": "Fornecedor"},
    {"nome": "INTERNET", "tipo": "Intermediario"},
    {"nome": "NAVEGADORES DE INTERNET", "tipo": "Intermediario"},
    {"nome": "APP STORE", "tipo": "Intermediario"},
    {"nome": "PLAY STORE", "tipo": "Intermediario"},
    {"nome": "USUÁRIOS", "tipo": "Cliente"}
  ],
  "relacoes": [
    {"origem": "PRODUTORAS DE MÍDIAS", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "BANCO DE DADOS", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "SERVIDORES", "destino": "NETFLIX (EMPRESA)", "tipo_fluxo": "P"},
    {"origem": "NETFLIX (EMPRESA)", "destino": "INTERNET", "tipo_fluxo": "Sys"},
    {"origem": "INTERNET", "destino": "NETFLIX (PC)", "tipo_fluxo": "Sys"},
    {"origem": "INTERNET", "destino": "NETFLIX (MOBILE)", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (PC)", "destino": "NAVEGADORES DE INTERNET", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (MOBILE)", "destino": "APP STORE", "tipo_fluxo": "Sys"},
    {"origem": "NETFLIX (MOBILE)", "destino": "PLAY STORE", "tipo_fluxo": "Sys"},
    {"origem": "NAVEGADORES DE INTERNET", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "APP STORE", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "PLAY STORE", "destino": "USUÁRIOS", "tipo_fluxo": "Ser"},
    {"origem": "VENDEDOR DE PC", "destino": "USUÁRIOS", "tipo_fluxo": "P"},
    {"origem": "VENDEDOR DE SMARTPHONES", "destino": "USUÁRIOS", "tipo_fluxo": "P"}
  ],
  "gateways": [
    {"ator": "INTERNET", "direcao": "split", "logica": "OU", "descricao": "Distribui o sinal da Netflix (Empresa) simultaneamente para as plataformas PC e Mobile"},
    {"ator": "NETFLIX (MOBILE)", "direcao": "split", "logica": "OU", "descricao": "Distribui o acesso mobile simultaneamente para App Store e Play Store"},
    {"ator": "USUÁRIOS", "direcao": "join", "logica": "OU", "descricao": "Consolida o serviço de streaming recebido por Navegador, App Store ou Play Store, podendo vir de um ou mais canais simultaneamente"}
  ]
}`;
