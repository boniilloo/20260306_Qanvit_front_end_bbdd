import jsPDF from 'jspdf';

/**
 * Ensures a Unicode-capable font is registered in jsPDF and returns its family name.
 * We load Roboto TTFs from a public CDN to support symbols like ≥, ≈, etc.
 * Falls back to core 'helvetica' if loading fails.
 */
export async function ensurePdfUnicodeFonts(pdf: jsPDF): Promise<string> {
  const family = 'Roboto';

  // Already registered?
  try {
    pdf.setFont(family, 'normal');
    return family;
  } catch {
    // proceed to load
  }

  const sources = [
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto-Regular.ttf', name: 'Roboto-Regular.ttf', style: 'normal' as const },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto-Medium.ttf', name: 'Roboto-Medium.ttf', style: 'bold' as const },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto-Italic.ttf', name: 'Roboto-Italic.ttf', style: 'italic' as const },
  ];

  try {
    const toBase64 = async (url: string): Promise<string> => {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`Failed to fetch font: ${url}`);
      const buf = await res.arrayBuffer();
      // Convert to base64
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(sub) as any);
      }
      return btoa(binary);
    };

    const base64s = await Promise.all(sources.map(s => toBase64(s.url)));

    // Register fonts in VFS
    for (let i = 0; i < sources.length; i++) {
      pdf.addFileToVFS(sources[i].name, base64s[i]);
      pdf.addFont(sources[i].name, family, sources[i].style);
    }

    // Set default
    pdf.setFont(family, 'normal');
    return family;
  } catch (e) {
    console.warn('⚠️ Failed to load Roboto fonts for PDF, falling back to helvetica.', e);
    try {
      pdf.setFont('helvetica', 'normal');
    } catch {}
    return 'helvetica';
  }
}


