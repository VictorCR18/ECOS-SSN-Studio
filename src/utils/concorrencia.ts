// src/utils/concorrencia.ts

/** Executa `tarefa` para cada item com no máximo `limite` execuções simultâneas. */
export async function executarComLimite<T>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<void>,
  deveParar?: () => boolean,
): Promise<void> {
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      if (deveParar?.()) return;
      const item = itens[proximo++];
      try {
        await tarefa(item);
      } catch (erro) {
        console.warn("[concorrencia] tarefa falhou:", erro);
      }
    }
  });
  await Promise.all(trabalhadores);
}
