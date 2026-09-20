// src/utils/storage.ts
//
// Persistência simples em localStorage para os modelos SSN gerados e para as
// preferências do usuário (chaves de API, última estratégia/esforço
// escolhidos). Não há backend nesta versão — a persistência é 100% local ao
// navegador, conforme permitido pelo requisito ("localStorage ou um backend
// simples (opcional)").

const CHAVE_MODELOS = "ecos-ssn:modelos";
const CHAVE_CONFIG = "ecos-ssn:config";

function lerJSON<T>(chave: string, valorPadrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return valorPadrao;
    return JSON.parse(bruto) as T;
  } catch (erro) {
    console.warn(`[storage] Falha ao ler "${chave}" do localStorage:`, erro);
    return valorPadrao;
  }
}

function escreverJSON(chave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (erro) {
    console.warn(`[storage] Falha ao escrever "${chave}" no localStorage:`, erro);
    return false;
  }
}

export const armazenamentoModelos = {
  carregarTodos<T>(): T[] {
    return lerJSON<T[]>(CHAVE_MODELOS, []);
  },
  salvarTodos(modelos: unknown[]): boolean {
    return escreverJSON(CHAVE_MODELOS, modelos);
  },
};

export const armazenamentoConfig = {
  carregar<T>(valorPadrao: T): T {
    return lerJSON<T>(CHAVE_CONFIG, valorPadrao);
  },
  salvar(config: unknown): boolean {
    return escreverJSON(CHAVE_CONFIG, config);
  },
};
