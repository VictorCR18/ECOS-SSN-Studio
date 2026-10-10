// src/utils/modelFilter.ts
//
// Filtro do seletor de modelos (puro, sem Vue, para ser testável).
//
// Por que existe a "consulta efetiva": o v-autocomplete do Vuetify, ao receber
// foco, escreve em `search` o TÍTULO do modelo já selecionado (e usa o flag
// interno `isPristine` para continuar mostrando todos os itens). Quem filtra por
// fora com esse mesmo `search` — como o seletor fazia — passa a enxergar o título
// como uma busca digitada e esconde todos os outros modelos: depois de escolher
// um, a lista "encolhia" para ele só. Aqui, texto igual ao título selecionado
// significa "o usuário ainda não digitou nada".

export interface ItemDeModelo {
  value: string;
  title: string;
  /** Cabeçalho de grupo (provedor). */
  header?: boolean;
  /** Provedor do modelo, ou do grupo quando é cabeçalho. */
  provider?: string;
  /** ID cru do modelo, também pesquisável (ex.: `nvidia/nemotron-...`). */
  id?: string;
}

export function consultaEfetiva(busca: string | null | undefined, tituloSelecionado?: string): string {
  const consulta = (busca ?? "").trim().toLocaleLowerCase();
  if (!consulta) return "";
  if (tituloSelecionado && consulta === tituloSelecionado.trim().toLocaleLowerCase()) return "";
  return consulta;
}

/** Normaliza para comparar "nvidia/nemo", "nvidia nemo" e "nvidia-nemo" de forma tolerante. */
function normalizar(texto: string): string {
  return texto.toLocaleLowerCase().replace(/[\s/_-]+/g, " ");
}

export function filtrarModelos<T extends ItemDeModelo>(
  itens: readonly T[],
  busca: string | null | undefined,
  tituloSelecionado?: string,
): T[] {
  const consulta = consultaEfetiva(busca, tituloSelecionado);
  if (!consulta) return [...itens];

  const termos = normalizar(consulta).split(" ").filter(Boolean);
  const combina = (item: T) => {
    const alvo = normalizar(`${item.title} ${item.id ?? ""} ${item.provider ?? ""}`);
    return termos.every((termo) => alvo.includes(termo));
  };

  const resultado: T[] = [];
  for (const item of itens) {
    if (item.header) {
      const grupoTemResultado = itens.some((c) => !c.header && c.provider === item.provider && combina(c));
      if (grupoTemResultado) resultado.push(item);
    } else if (combina(item)) {
      resultado.push(item);
    }
  }
  return resultado;
}
