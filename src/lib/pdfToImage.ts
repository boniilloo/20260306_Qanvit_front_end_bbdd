/**
 * Carga un ArrayBuffer de PDF y devuelve un Blob JPEG de la primera página.
 * Escala el render para buena nitidez y devuelve calidad 0.85 por defecto.
 */

import * as pdfjs from 'pdfjs-dist';
import { ensurePdfWorkerConfigured } from './pdfjsSetup';

export type PdfToImageOptions = {
  maxWidth?: number;         // Ancho máximo en píxeles (p.ej. miniaturas en cards)
  scale?: number;            // Factor de escalado adicional (por defecto 1)
  quality?: number;          // Calidad JPEG [0..1]
  background?: string;       // Fondo para PDFs con transparencia (default: #fff)
};

export async function pdfFirstPageToJpeg(
  pdfBuffer: ArrayBuffer,
  opts: PdfToImageOptions = {}
): Promise<Blob> {
  const {
    maxWidth,
    scale = 1.5, // Mantenemos la escala 1.5 del código original
    quality = 0.8, // Mantenemos la calidad 0.8 del código original
    background = '#ffffff',
  } = opts;

  // Ensure PDF.js worker is configured before loading document
  ensurePdfWorkerConfigured();

  // 1) Cargar documento
  const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
  const pdf = await loadingTask.promise;

  // 2) Tomar la primera página
  const page = await pdf.getPage(1);

  // 3) Configurar viewport (escala base = 1)
  const baseViewport = page.getViewport({ scale: 1 });

  // 4) Calcular escala final respetando maxWidth si viene
  let finalScale = scale;
  if (maxWidth && baseViewport.width * scale > maxWidth) {
    finalScale = maxWidth / baseViewport.width;
  }
  
  const viewport = page.getViewport({ scale: finalScale });

  // 5) Crear canvas offscreen para render
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear el contexto 2D del canvas');
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // Pintar fondo por si hay transparencias
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 6) Render de la página en el canvas
  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    canvas: canvas,
  });
  await renderTask.promise;

  // 7) Exportar a JPEG
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falló'))), 'image/jpeg', quality)
  );

  // Limpieza
  canvas.width = 0;
  canvas.height = 0;
  pdf.cleanup();
  await pdf.destroy();

  return blob;
}