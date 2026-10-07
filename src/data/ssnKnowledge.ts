// src/data/ssnKnowledge.ts
//
// Base de conhecimento da notação SSN usada pelos construtores de prompt
// (src/services/promptBuilder.ts). Todo o conteúdo abaixo foi portado
// diretamente de `executor_experimento.ts` (material suplementar do TCC de
// Victor Cavalcante), preservando literalmente as definições, o esquema JSON
// e os exemplos few-shot validados no experimento — para que os prompts G1–G4
// gerados por esta aplicação sejam fiéis aos usados na pesquisa.
//

/** Schema JSON solicitado nas estratégias G1, G2 e G3 (sem raciocínio CoT). */
export const SCHEMA_BASE = `{
  "ecos": "<nome>",
  "atores": [{"nome": "<nome>", "tipo": "<CoI|Fornecedor|Cliente|Intermediario|Agregador|ClienteDoCliente>"}],
  "relacoes": [{"origem": "<nome>", "destino": "<nome>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>"}],
  "gateways": [{"id": "<opcional, mas OBRIGATÓRIO se este ator+direção tiver mais de um gateway do mesmo tipo_fluxo: identificador curto e único, ex. 'gw_x'>", "ator": "<nome de um ator já listado em 'atores'>", "eh_logico": true, "direcao": "<split|join>", "logica": "<OU|XOU>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>", "membros": ["<opcional, mas OBRIGATÓRIO na mesma situação acima: nomes de atores e/ou 'id's de outros gateways que ESTE gateway consolida/divide>"], "descricao": "<descricao>"}]
}
Importante:
- Se não houver gateways, use "gateways": [].
- O campo "ator" de um gateway DEVE ser o nome de um ator já presente em "atores". Nunca invente um ator do tipo "Gateway X" apenas para representar o ponto de convergência/divergência — o split ou join é uma propriedade de um ator que já existe no modelo.
- Inclua um item em "gateways" SOMENTE quando houver decisão/convergência lógica OU ou XOU. Uma simples distribuição para vários destinos ou consolidação de vários fluxos, sem regra lógica, deve aparecer apenas em "relacoes" e não deve gerar gateway.
- "direcao" indica SOMENTE a topologia: "split" = o ator envia para dois ou mais destinos; "join" = o ator recebe de duas ou mais origens. Nunca use "OU" ou "XOU" no campo "direcao".
- "logica" indica SOMENTE a regra de seleção: "XOU" = exatamente uma saída/entrada pode ocorrer por vez (exclusivo); "OU" = uma, várias ou todas podem ocorrer simultaneamente (inclusivo). Nunca use "split" ou "join" no campo "logica".
- "tipo_fluxo" indica A QUAL tipo de fluxo (P|Ser|Req|Des|Comp|Sys) esse gateway se refere. Só as relações do ator, nessa direção, com esse mesmo tipo_fluxo passam pelo losango. Se o mesmo ator também tiver relações de OUTRO tipo_fluxo (ex.: um Cliente que recebe o serviço por vários canais alternativos — Ser — e também compra hardware de um Fornecedor — P), essas outras relações NÃO fazem parte do gateway e seguem diretas, pois não são alternativas do mesmo fluxo.
- "eh_logico": true somente quando houver decisão ou regra lógica explícita. Fan-out/fan-in normal de infraestrutura, canais, plataformas ou lojas não é gateway e deve ficar apenas em "relacoes".
- NÃO confunda direção com lógica: um ator pode se ramificar ou convergir estruturalmente (direção) sem que isso represente uma decisão OU/XOU (lógica). Só crie o gateway quando o MESMO fluxo (mesmo tipo_fluxo) puder passar por caminhos alternativos e mutuamente substituíveis — nunca apenas porque o ator tem múltiplas saídas/entradas, e nunca misturando relações de tipo_fluxo diferentes num único gateway.
- Os campos "id" e "membros" são OPCIONAIS na maioria dos casos (um único gateway naquele ator+direção+tipo_fluxo já sabe, sozinho, quais relações lhe pertencem). Mas se o MESMO ator+direção tiver mais de um gateway do mesmo tipo_fluxo — por exemplo, um losango "de baixo" que consolida um subconjunto dos canais e cujo resultado alimenta um losango "de cima" que consolida o restante —, cada um desses gateways DEVE ter um "id" único e DEVE declarar "membros" explicitamente: a lista dos nomes de atores e/ou dos "id"s de outros gateways que ele agrupa. NUNCA deixe "membros" ausente nessa situação — um gateway sem "membros" é tratado como "pega-tudo" daquele tipo_fluxo e acaba absorvendo relações que pertencem ao outro gateway, deixando esse outro gateway sem nenhuma relação associada (órfão, sem nenhuma aresta, no diagrama final).
- Exemplo: ator A com saídas para B e C, onde B e C são alternativas reais para o mesmo fluxo Ser -> gateway {"ator":"A","direcao":"split","logica":"OU","tipo_fluxo":"Ser"}; atores B e C convergindo em A como caminhos alternativos de um mesmo fluxo -> gateway {"ator":"A","direcao":"join","logica":"XOU","tipo_fluxo":"Ser"}. Se B e C são apenas destinos distintos que sempre recebem o fluxo (sem alternativa), ou se representam tipos de fluxo diferentes, não é gateway (ou não fazem parte do mesmo gateway).`;

/** Schema JSON solicitado na estratégia G4 (inclui o campo raciocinio_cot). */
export const SCHEMA_G4 = `{
  "raciocinio_cot": "<Seu raciocínio passo a passo aqui>",
  "ecos": "<nome>",
  "atores": [{"nome": "<nome>", "tipo": "<CoI|Fornecedor|Cliente|Intermediario|Agregador|ClienteDoCliente>"}],
  "relacoes": [{"origem": "<nome>", "destino": "<nome>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>"}],
  "gateways": [{"id": "<opcional, mas OBRIGATÓRIO se este ator+direção tiver mais de um gateway do mesmo tipo_fluxo: identificador curto e único, ex. 'gw_x'>", "ator": "<nome de um ator já listado em 'atores'>", "eh_logico": true, "direcao": "<split|join>", "logica": "<OU|XOU>", "tipo_fluxo": "<P|Ser|Req|Des|Comp|Sys>", "membros": ["<opcional, mas OBRIGATÓRIO na mesma situação acima: nomes de atores e/ou 'id's de outros gateways que ESTE gateway consolida/divide>"], "descricao": "<descricao>"}]
}
Importante:
- Se não houver gateways, use "gateways": [].
- O campo "ator" de um gateway DEVE ser o nome de um ator já presente em "atores". Nunca invente um ator do tipo "Gateway X" apenas para representar o ponto de convergência/divergência — o split ou join é uma propriedade de um ator que já existe no modelo.
- Inclua um item em "gateways" SOMENTE quando houver decisão/convergência lógica OU ou XOU. Uma simples distribuição para vários destinos ou consolidação de vários fluxos, sem regra lógica, deve aparecer apenas em "relacoes" e não deve gerar gateway.
- "direcao" indica SOMENTE a topologia: "split" = o ator envia para dois ou mais destinos; "join" = o ator recebe de duas ou mais origens. Nunca use "OU" ou "XOU" no campo "direcao".
- "logica" indica SOMENTE a regra de seleção: "XOU" = exatamente uma saída/entrada pode ocorrer por vez (exclusivo); "OU" = uma, várias ou todas podem ocorrer simultaneamente (inclusivo). Nunca use "split" ou "join" no campo "logica".
- "tipo_fluxo" indica A QUAL tipo de fluxo (P|Ser|Req|Des|Comp|Sys) esse gateway se refere. Só as relações do ator, nessa direção, com esse mesmo tipo_fluxo passam pelo losango. Se o mesmo ator também tiver relações de OUTRO tipo_fluxo (ex.: um Cliente que recebe o serviço por vários canais alternativos — Ser — e também compra hardware de um Fornecedor — P), essas outras relações NÃO fazem parte do gateway e seguem diretas, pois não são alternativas do mesmo fluxo.
- "eh_logico": true somente quando houver decisão ou regra lógica explícita. Fan-out/fan-in normal de infraestrutura, canais, plataformas ou lojas não é gateway e deve ficar apenas em "relacoes".
- NÃO confunda direção com lógica: um ator pode se ramificar ou convergir estruturalmente (direção) sem que isso represente uma decisão OU/XOU (lógica). Só crie o gateway quando o MESMO fluxo (mesmo tipo_fluxo) puder passar por caminhos alternativos e mutuamente substituíveis — nunca apenas porque o ator tem múltiplas saídas/entradas, e nunca misturando relações de tipo_fluxo diferentes num único gateway.
- No campo "raciocinio_cot", justifique explicitamente cada gateway (ou a ausência deles) com base nessa distinção — incluindo, quando o ator tiver relações de mais de um tipo_fluxo, por que só um desses tipos entra no gateway — para que o raciocínio nunca contradiga o array "gateways" final.
- Os campos "id" e "membros" são OPCIONAIS na maioria dos casos (um único gateway naquele ator+direção+tipo_fluxo já sabe, sozinho, quais relações lhe pertencem). Mas se o MESMO ator+direção tiver mais de um gateway do mesmo tipo_fluxo — por exemplo, um losango "de baixo" que consolida um subconjunto dos canais e cujo resultado alimenta um losango "de cima" que consolida o restante —, cada um desses gateways DEVE ter um "id" único e DEVE declarar "membros" explicitamente: a lista dos nomes de atores e/ou dos "id"s de outros gateways que ele agrupa. NUNCA deixe "membros" ausente nessa situação — um gateway sem "membros" é tratado como "pega-tudo" daquele tipo_fluxo e acaba absorvendo relações que pertencem ao outro gateway, deixando esse outro gateway sem nenhuma relação associada (órfão, sem nenhuma aresta, no diagrama final).
- Exemplo: ator A com saídas para B e C, onde B e C são alternativas reais para o mesmo fluxo Ser -> gateway {"ator":"A","direcao":"split","logica":"OU","tipo_fluxo":"Ser"}; atores B e C convergindo em A como caminhos alternativos de um mesmo fluxo -> gateway {"ator":"A","direcao":"join","logica":"XOU","tipo_fluxo":"Ser"}. Se B e C são apenas destinos distintos que sempre recebem o fluxo (sem alternativa), ou se representam tipos de fluxo diferentes, não é gateway (ou não fazem parte do mesmo gateway).`;

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
- "direcao": "split" (topologia: o ator envia para dois ou mais destinos) ou "join" (topologia: o ator recebe de duas ou mais origens)
- "logica": "OU" ou "XOU" (regra de seleção independente da direção)

O gateway é sempre associado a um ator que já existe em "atores" — nunca crie
um ator fictício do tipo "Gateway X" só para representar o ponto de
convergência ou divergência. Registre-o em "gateways" somente quando existir
uma regra lógica OU/XOU; uma ramificação ou convergência comum é representada
somente pelas relações de entrada/saída do próprio ator.

Se não houver gateway, omita o ator da lista (use "gateways": []).

**Regras Semânticas Obrigatórias:**
1. Todo Fornecedor DEVE ter relação apontando para o CoI com tipo_fluxo P (convenção deste projeto — ver acima)
2. O CoI DEVE ter relações de saída (tipo Ser ou Sys)
3. Intermediarios recebem do CoI (ou Agregador) e repassam para Clientes — nunca recebem diretamente do CoI se houver um Agregador no caminho
4. Não modele relações diretas de Fornecedores para Clientes
5. Se houver módulos (web, mobile, MOOC), cada um é um CoI separado
6. Agregadores ficam entre o CoI e os Intermediarios; o CoI aponta para o Agregador (Sys), e o Agregador aponta para os Intermediarios (Sys)
7. Todo "ator" referenciado em "gateways" DEVE existir em "atores"
8. Um gateway lógico "split" deve corresponder a pelo menos duas relações com origem no ator E com o mesmo tipo_fluxo do gateway; um gateway lógico "join" deve corresponder a pelo menos duas relações com destino no ator E com o mesmo tipo_fluxo do gateway
9. A direção e a lógica são campos independentes: não confunda "split/join" com "OU/XOU"
10. Não crie gateway para fan-out/fan-in meramente estrutural, sem decisão ou regra lógica
11. Direção (split/join) é sobre TOPOLOGIA; lógica (OU/XOU) é sobre SEMÂNTICA de decisão — as duas coisas não andam sempre juntas. Um ator pode ter várias saídas/entradas (direção) sem que isso seja um gateway: se os destinos/origens são categorias distintas que SEMPRE recebem/enviam o fluxo em paralelo (ex.: um Intermediario distribuindo para vários tipos de Cliente diferentes, ou um CoI encaminhando para módulos/lojas de distribuição diferentes), é apenas fan-out/fan-in estrutural e fica só em "relacoes". Só é gateway lógico quando o MESMO fluxo pode ocorrer por caminhos alternativos e mutuamente substituíveis (ex.: um Cliente pode obter o mesmo serviço por um OU mais de entre vários canais possíveis) — aí sim a direção (split/join) vem acompanhada de uma lógica (OU/XOU) real.
12. Um gateway é sempre de um único tipo_fluxo. Se um ator recebe/envia relações de tipos de fluxo diferentes (ex.: um Cliente que recebe o serviço — Ser — por vários canais alternativos e também compra um produto — P — de um Fornecedor), o gateway cobre SOMENTE as relações do tipo_fluxo que representa a alternativa real; as relações de outro tipo_fluxo tocando o mesmo ator não passam pelo losango e ficam representadas diretamente pelas suas próprias relações, mesmo compartilhando o mesmo ator de origem/destino.`;

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
  "gateways": []
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
  "gateways": []
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
  "gateways": []
  }
}`;

/** Os mesmos quatro exemplos, agora com o campo raciocinio_cot preenchido — usados em G4. */
export const EXEMPLOS_G4 = `## Exemplo 1 (Pandas)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é Pandas. Passo 2: Fornecedores (Contribuidores, Mantenedores, Statsmodels, Distribuidores, Xorbits, Featuretools) apontam com P para Pandas (convenção do projeto). Passo 3: Clientes são Softwares/Frameworks, Cientistas, Usuário/Dev. 'Clientes' recebe de Softwares/Frameworks, portanto é ClienteDoCliente. Passo 4: Comunidade open-source atua como Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e repassa Sys ao Intermediario. Plataformas e IDEs é Intermediario (recebe Sys do Agregador e distribui Ser para Clientes). Passo 5: Plataformas e IDEs distribui simultaneamente para três tipos de clientes distintos, que recebem o serviço em paralelo e sempre — não são caminhos alternativos para o mesmo fluxo, apenas categorias diferentes de cliente. Isso é direção (split) sem lógica (nenhuma decisão OU/XOU real), então não é gateway (regra 10/11). Passo 6: gateways permanece vazio; todas as relações estão cobertas e as regras semânticas estão satisfeitas.",
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
  "gateways": []
}

## Exemplo 2 (VSCode)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é VSCode. Passo 2: Fornecedores (GitHub Copilot, OpenAI, IDEs, Microsoft, Devs de Extensões) fornecem P ao CoI (convenção do projeto). Passo 3: Clientes são Estudantes, Desenvolvedor e Equipe de Devs. Revisores recebem serviço de Desenvolvedor, sendo ClienteDoCliente. Passo 4: Github é o Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e distribui Sys para ambos os Intermediarios: VSCode (Plataforma) e Copilot. Nenhuma relação direta do CoI para os Intermediarios — tudo passa pelo Agregador. Passo 5: Github distribui para dois módulos de produto diferentes (VSCode e Copilot), e cada um desses distribui para vários tipos de cliente — em todos os casos os destinos são categorias distintas que recebem o fluxo em paralelo e sempre, não alternativas para o mesmo fluxo. É apenas direção (split) estrutural, sem decisão OU/XOU, então nenhum desses atores é gateway (regra 10/11). Passo 6: gateways permanece vazio; regras semânticas satisfeitas.",
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
  "gateways": []
}

## Exemplo 3 (LangChain)
Saída:
{
  "raciocinio_cot": "Passo 1: CoI é LangChain. Passo 2: Fornecedores (APIs LLMs, OpenAI, Anthropic, IDEs, Google, Infraestrutura Cloud, Comunidade/Fórum) fornecem P ao CoI (convenção do projeto). Passo 3: Clientes são Startups, Desenvolvedor e Empresas de Automação. Usuários finais recebem serviço dos Clientes, sendo ClienteDoCliente. Passo 4: APIs/LLMs é o Agregador (extensão de Costa et al. 2013) — recebe Sys do CoI e repassa Sys ao Intermediario. Passo 5: Integradores de API distribui simultaneamente para três tipos de clientes distintos, que recebem o serviço em paralelo e sempre — categorias diferentes, não alternativas do mesmo fluxo. É direção (split) sem lógica, portanto não é gateway (regra 10/11). Passo 6: gateways permanece vazio; regras semânticas satisfeitas.",
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
  "gateways": []
}
}`;
