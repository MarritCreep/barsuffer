import type { PdfPage } from '../logic/inbar';

/**
 * Достаёт текст с координатами из PDF прямо в браузере (pdf.js).
 * Библиотека грузится только при импорте, чтобы не утяжелять сайт.
 */
export async function readPdf(file: File): Promise<PdfPage[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfPage['items'] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, font: it.fontName });
    }
    pages.push({ height, items });
  }
  await task.destroy();
  return pages;
}
