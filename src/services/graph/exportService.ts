// src/services/graph/exportService.ts
//
// Exporta o diagrama renderizado como SVG ou PNG, lendo diretamente o <svg>
// que o maxGraph desenha dentro do contêiner (não depende de nenhum serviço
// de back-end, ao contrário do ImageExport clássico do mx/maxGraph). A
// exportação como JSON reaproveita o próprio ModeloSSN validado.

import type { ModeloSSN } from "@/types/ssn";
import { baixarArquivo, baixarJSON, nomeArquivoSeguro } from "@/utils/download";

const NS_SVG = "http://www.w3.org/2000/svg";
const MARGEM_PADRAO = 24;

function obterSvgDoContainer(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) {
    throw new Error("Não foi possível localizar o diagrama renderizado para exportação.");
  }
  return svg as SVGSVGElement;
}

interface RetanguloExportacao {
  x: number;
  y: number;
  width: number;
  height: number;
}

function medirConteudo(svg: SVGSVGElement): RetanguloExportacao {
  // getBBox() precisa que o elemento esteja anexado ao documento — por isso
  // medimos o SVG original (ainda visível), antes de cloná-lo para exportar.
  const caixa = svg.getBBox();
  return { x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height };
}

function construirSvgExportavel(svgOriginal: SVGSVGElement, caixa: RetanguloExportacao): SVGSVGElement {
  const margem = MARGEM_PADRAO;
  const clone = svgOriginal.cloneNode(true) as SVGSVGElement;

  const viewBoxX = caixa.x - margem;
  const viewBoxY = caixa.y - margem;
  const largura = Math.max(1, Math.round(caixa.width + margem * 2));
  const altura = Math.max(1, Math.round(caixa.height + margem * 2));

  clone.setAttribute("xmlns", NS_SVG);
  clone.setAttribute("viewBox", `${viewBoxX} ${viewBoxY} ${largura} ${altura}`);
  clone.setAttribute("width", String(largura));
  clone.setAttribute("height", String(altura));

  const fundo = document.createElementNS(NS_SVG, "rect");
  fundo.setAttribute("x", String(viewBoxX));
  fundo.setAttribute("y", String(viewBoxY));
  fundo.setAttribute("width", String(largura));
  fundo.setAttribute("height", String(altura));
  fundo.setAttribute("fill", "#ffffff");
  clone.insertBefore(fundo, clone.firstChild);

  return clone;
}

function serializarSvg(svg: SVGSVGElement): string {
  const serializador = new XMLSerializer();
  return `<?xml version="1.0" standalone="no"?>\r\n${serializador.serializeToString(svg)}`;
}

export function exportarDiagramaComoSVG(container: HTMLElement, nomeEcos: string): void {
  const original = obterSvgDoContainer(container);
  const caixa = medirConteudo(original);
  const exportavel = construirSvgExportavel(original, caixa);
  baixarArquivo(serializarSvg(exportavel), nomeArquivoSeguro(nomeEcos, "svg"), "image/svg+xml");
}

export async function exportarDiagramaComoPNG(
  container: HTMLElement,
  nomeEcos: string,
  escala = 2,
): Promise<void> {
  const original = obterSvgDoContainer(container);
  const caixa = medirConteudo(original);
  const exportavel = construirSvgExportavel(original, caixa);
  const svgString = serializarSvg(exportavel);

  const largura = Number(exportavel.getAttribute("width"));
  const altura = Number(exportavel.getAttribute("height"));

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const imagem = new Image();
    await new Promise<void>((resolve, reject) => {
      imagem.onload = () => resolve();
      imagem.onerror = () => reject(new Error("Falha ao rasterizar o SVG do diagrama."));
      imagem.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador não suporta exportação em canvas.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Falha ao gerar o arquivo PNG.");
    baixarArquivo(blob, nomeArquivoSeguro(nomeEcos, "png"), "image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportarModeloComoJSON(modelo: ModeloSSN): void {
  baixarJSON(modelo, nomeArquivoSeguro(modelo.ecos, "json"));
}
