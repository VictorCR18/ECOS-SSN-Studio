// src/utils/download.ts

export function baixarArquivo(conteudo: BlobPart, nomeArquivo: string, tipoMime: string): void {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function baixarJSON(objeto: unknown, nomeArquivo: string): void {
  baixarArquivo(JSON.stringify(objeto, null, 2), nomeArquivo, "application/json");
}

/** Normaliza um nome de ECOS para um nome de arquivo seguro. */
export function nomeArquivoSeguro(base: string, extensao: string): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${limpo || "modelo-ssn"}.${extensao}`;
}
