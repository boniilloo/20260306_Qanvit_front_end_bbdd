/**
 * Centraliza la configuración del worker de PDF.js.
 * Debe ejecutarse ANTES de llamar a getDocument().
 *
 * Por qué: si no fijas GlobalWorkerOptions.workerSrc, PDF.js lanza
 * "No 'GlobalWorkerOptions.workerSrc' specified."
 */

import * as pdfjs from 'pdfjs-dist';

let isWorkerConfigured = false;

export function ensurePdfWorkerConfigured(): void {
  if (isWorkerConfigured) return;
  
  let workerUrl: string | undefined;

  // ───────────────────────────────────────────────────────────────────────────────
  // Opción A (ESM genérica): calcula una URL relativa al bundle.
  // Funciona bien en muchos bundlers modernos.
  // ───────────────────────────────────────────────────────────────────────────────
  try {
    workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  } catch {
    // seguimos con la opción B
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Opción B (CDN): unpkg. Úsala solo si A no funciona.
  // ───────────────────────────────────────────────────────────────────────────────
  if (!workerUrl) {
    // @ts-ignore
    const version = (pdfjs as any).version || 'latest';
    workerUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }

  // Por fin fijamos el worker:
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl!;
  isWorkerConfigured = true;
}