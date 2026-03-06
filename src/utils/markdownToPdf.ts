import jsPDF from 'jspdf';

export interface MarkdownElement {
  type: 'heading' | 'paragraph' | 'list' | 'listItem' | 'strong' | 'em' | 'code' | 'blockquote' | 'linebreak' | 'hr' | 'image';
  content: string;
  level?: number; // For headings (1-6)
  isOrdered?: boolean; // For lists
  isBold?: boolean;
  isItalic?: boolean;
  isCode?: boolean;
  alt?: string;
  widthPercent?: number;
}

export interface MarkdownPdfRenderOptions {
  loadImage?: (url: string) => Promise<HTMLImageElement>;
}

/**
 * Normalize characters that jsPDF core fonts struggle with into ASCII‑safe equivalents.
 *
 * IMPORTANT:
 * - This function should stay broadly in sync with the more complete `normalizeForPDF`
 *   helper used in other PDF utilities to avoid subtle spacing / glyph bugs.
 * - It is intentionally conservative with replacements that change semantics, but
 *   aggressively normalises "fancy" punctuation, spaces and symbols that often come
 *   from copy‑pasted Word / Google Docs text.
 */
export const normalizeUnicodeForPdf = (input: string): string => {
  if (!input) return input;

  let out = input;

  // --- Hyphens / dashes / minus signs (critical for copy‑pasted specs like "top‑down") ---
  out = out
    .replace(/\u2011/g, '-')              // non‑breaking hyphen
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-') // figure dash, en dash, em dash, horizontal bar
    .replace(/\u2212/g, '-');             // minus sign

  // --- Quotes & apostrophes ---
  out = out
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // various double quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // various single quotes
    .replace(/[\u2039\u203A]/g, "'")            // single angle quotes
    .replace(/[\u00AB\u00BB]/g, '"');           // double angle quotes

  // --- Comparison / math symbols commonly used in requirements ---
  out = out
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/≡/g, '=')
    .replace(/≈/g, '~')
    .replace(/∼/g, '~')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/±/g, '+/-')
    .replace(/∓/g, '-/+')
    .replace(/√/g, 'sqrt')
    .replace(/∞/g, 'infinity')
    .replace(/∑/g, 'sum')
    .replace(/∏/g, 'product')
    .replace(/∫/g, 'integral')
    .replace(/∂/g, 'd')
    .replace(/∆/g, 'Delta')
    .replace(/∇/g, 'nabla');

  // --- Greek letters frequently used in technical descriptions ---
  out = out
    .replace(/μ/g, 'u')  // micro (mu)
    .replace(/Ω/g, 'Ohm')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/γ/g, 'gamma')
    .replace(/δ/g, 'delta')
    .replace(/ε/g, 'epsilon')
    .replace(/ζ/g, 'zeta')
    .replace(/η/g, 'eta')
    .replace(/θ/g, 'theta')
    .replace(/λ/g, 'lambda')
    .replace(/π/g, 'pi')
    .replace(/ρ/g, 'rho')
    .replace(/σ/g, 'sigma')
    .replace(/τ/g, 'tau')
    .replace(/φ/g, 'phi')
    .replace(/ψ/g, 'psi')
    .replace(/ω/g, 'omega');

  // --- Degrees / temperature ---
  out = out
    .replace(/°C/g, 'degC')
    .replace(/°F/g, 'degF')
    .replace(/°K/g, 'K')
    .replace(/°/g, 'deg')
    .replace(/℃/g, 'degC')
    .replace(/℉/g, 'degF');

  // --- Currency ---
  out = out
    .replace(/€/g, 'EUR')
    .replace(/£/g, 'GBP')
    .replace(/¥/g, 'JPY')
    .replace(/₹/g, 'INR')
    .replace(/₽/g, 'RUB');

  // --- Fractions ---
  out = out
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8');

  // --- Arrows ---
  out = out
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->')
    .replace(/⇒/g, '=>')
    .replace(/⇐/g, '<=')
    .replace(/⇔/g, '<=>');

  // --- Bullets and list markers (keep visual semantics) ---
  out = out
    .replace(/•/g, '*')
    .replace(/‣/g, '>')
    .replace(/⁃/g, '-')
    .replace(/◦/g, 'o')
    .replace(/▪/g, '*')
    .replace(/▫/g, '*')
    .replace(/●/g, '*')  // black circle
    .replace(/◉/g, '*'); // bullseye‑style bullets

  // --- Copyright / trademark ---
  out = out
    .replace(/©/g, '(C)')
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    .replace(/℠/g, '(SM)');

  // --- Superscript / subscript digits ---
  out = out
    .replace(/⁰/g, '0')
    .replace(/¹/g, '1')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/⁴/g, '4')
    .replace(/⁵/g, '5')
    .replace(/⁶/g, '6')
    .replace(/⁷/g, '7')
    .replace(/⁸/g, '8')
    .replace(/⁹/g, '9')
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/₅/g, '5')
    .replace(/₆/g, '6')
    .replace(/₇/g, '7')
    .replace(/₈/g, '8')
    .replace(/₉/g, '9');

  // --- Special spaces / narrow no‑break spaces ---
  out = out.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

  // --- Zero‑width & BOM characters that can confuse layout engines ---
  out = out.replace(/[\u200C\u200D\uFEFF]/g, '');

  // --- Latin ligatures (common when text comes from PDFs / DTP tools) ---
  out = out
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st');

  // --- Full‑width ASCII range (used by some editors / locales) → normal ASCII ---
  out = out.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );

  // --- Ellipsis ---
  out = out.replace(/…/g, '...');

  // Keep accented characters but normalise them to composed form
  out = out.normalize('NFC');

  // Safety net: strip any remaining Greek block characters to avoid PDF glyph issues
  out = out.replace(/[\u0370-\u03FF\u1F00-\u1FFF]/g, '');

  return out;
};

/**
 * Parses Markdown text into structured elements for PDF rendering
 */
export const parseMarkdownToElements = (markdown: string): MarkdownElement[] => {
  const elements: MarkdownElement[] = [];
  const lines = markdown.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Horizontal rules: '***', '* * *', '---', '___'
    const isHr =
      /^\*{3,}$/.test(line) ||
      /^(\*\s*){3,}$/.test(line) ||
      /^-{3,}$/.test(line) ||
      /^_{3,}$/.test(line);
    if (isHr) {
      elements.push({ type: 'hr', content: '' });
      i++;
      continue;
    }
    
    // Headers (# ## ### etc.)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      elements.push({
        type: 'heading',
        content,
        level
      });
      i++;
      continue;
    }
    
    // Standalone markdown image
    const imageMatch = line.match(/^!\[([^\]]*)\]\((\S+)(?:\s+"([^"]+)")?\)$/);
    if (imageMatch) {
      const widthMatch = imageMatch[3]?.match(/w=(\d{1,3})/i);
      const widthPercent = widthMatch ? Math.min(100, Math.max(10, Number(widthMatch[1]))) : 100;
      elements.push({
        type: 'image',
        content: imageMatch[2].trim(),
        alt: imageMatch[1]?.trim() || '',
        widthPercent,
      });
      i++;
      continue;
    }

    // Unordered lists (- * +)
    if (/^[-*+]\s+/.test(line)) {
      const content = line.replace(/^[-*+]\s+/, '');
      // Skip empty list items to avoid stray bullets
      if (content.trim().length > 0) {
        elements.push({
          type: 'listItem',
          content,
          isOrdered: false
        });
      }
      i++;
      continue;
    }
    
    // Ordered lists (1. 2. etc.) - also handle numbered lists with parentheses
    if (/^\d+[\.\)]\s+/.test(line)) {
      const content = line.replace(/^\d+[\.\)]\s+/, '');
      // Skip empty ordered list items as well
      if (content.trim().length > 0) {
        elements.push({
          type: 'listItem',
          content,
          isOrdered: true
        });
      }
      i++;
      continue;
    }
    
    // Blockquotes (>)
    if (/^>\s*/.test(line)) {
      const content = line.replace(/^>\s*/, '');
      elements.push({
        type: 'blockquote',
        content
      });
      i++;
      continue;
    }
    
    // Regular paragraphs
    elements.push({
      type: 'paragraph',
      content: line
    });
    i++;
  }
  
  return elements;
};

/**
 * Processes inline Markdown formatting (bold, italic, code)
 */
export const processInlineFormatting = (text: string): MarkdownElement[] => {
  const elements: MarkdownElement[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    // Bold text (**text** or __text__)
    const boldMatch = remaining.match(/(\*\*|__)([^*_]+)\1/);
    if (boldMatch) {
      const beforeBold = remaining.substring(0, boldMatch.index);
      if (beforeBold) {
        elements.push({ type: 'paragraph', content: beforeBold });
      }
      elements.push({ type: 'strong', content: boldMatch[2], isBold: true });
      remaining = remaining.substring(boldMatch.index! + boldMatch[0].length);
      continue;
    }
    
    // Italic text (*text* or _text_)
    const italicMatch = remaining.match(/(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      const beforeItalic = remaining.substring(0, italicMatch.index);
      if (beforeItalic) {
        elements.push({ type: 'paragraph', content: beforeItalic });
      }
      elements.push({ type: 'em', content: italicMatch[2], isItalic: true });
      remaining = remaining.substring(italicMatch.index! + italicMatch[0].length);
      continue;
    }
    
    // Inline code (`code`)
    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch) {
      const beforeCode = remaining.substring(0, codeMatch.index);
      if (beforeCode) {
        elements.push({ type: 'paragraph', content: beforeCode });
      }
      elements.push({ type: 'code', content: codeMatch[1], isCode: true });
      remaining = remaining.substring(codeMatch.index! + codeMatch[0].length);
      continue;
    }
    
    // No more formatting found, add remaining as regular text
    if (remaining) {
      elements.push({ type: 'paragraph', content: remaining });
    }
    break;
  }
  
  return elements;
};

/**
 * Simple function to strip Markdown formatting for basic text rendering
 * This is used when we can't handle complex inline formatting
 */
export const stripMarkdownFormatting = (text: string): string => {
  return text
    // Remove bold/italic markers
    .replace(/(\*\*|__)([^*_]+)\1/g, '$2')
    .replace(/(\*|_)([^*_]+)\1/g, '$2')
    // Remove code markers
    .replace(/`([^`]+)`/g, '$1')
    // Remove link markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove list markers
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+[\.\)]\s+/gm, '• ')
    // Remove blockquote markers
    .replace(/^>\s*/gm, '')
    // Clean up extra whitespace
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
};

const inferImageFormat = (url: string): 'PNG' | 'JPEG' => {
  const lower = url.split('?')[0].toLowerCase().replace(/\.enc$/, '');
  if (/\.(png|webp|gif|svg|tif|tiff)$/.test(lower)) return 'PNG';
  return 'JPEG';
};

const loadImageDefault = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = url;
  });

/**
 * Renders Markdown elements to PDF with proper formatting
 */
export const renderMarkdownToPDF = (
  pdf: jsPDF,
  elements: MarkdownElement[],
  startY: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  topOffset: number = 0
): number => {
  let currentY = startY;
  const lineHeight = 5.5;
  const headingSpacing = 3;
  
  for (const element of elements) {
    // Check if we need a new page
    if (currentY + 15 > pageHeight - margin) {
      pdf.addPage();
      currentY = margin + topOffset;
    }
    
    switch (element.type) {
      case 'heading':
        // Add spacing before heading
        currentY += headingSpacing;
        
        // Set heading font size based on level
        const headingSizes = [0, 16, 14, 12, 11, 10, 9]; // h1-h6
        const fontSize = headingSizes[element.level || 1] || 11;
        
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44); // Dark color for headings
        
        // Split heading text if too long
        const headingLines = pdf.splitTextToSize(element.content, contentWidth);
        headingLines.forEach((line: string) => {
          if (currentY + 10 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin, currentY);
          currentY += fontSize * 0.6;
        });
        
        currentY += headingSpacing;
        break;
        
      case 'listItem':
        // Add bullet point or number
        const bullet = element.isOrdered ? '•' : '•';
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(60, 60, 60);
        
        // Process inline formatting in list items
        const listElements = processInlineFormatting(element.content);
        let listText = '';
        for (const listEl of listElements) {
          if (listEl.type === 'strong') {
            listText += listEl.content;
          } else if (listEl.type === 'em') {
            listText += listEl.content;
          } else if (listEl.type === 'code') {
            listText += listEl.content;
          } else {
            listText += listEl.content;
          }
        }
        
        const listLines = pdf.splitTextToSize(`${bullet} ${listText}`, contentWidth - 10);
        listLines.forEach((line: string, index: number) => {
          if (currentY + 7 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          const indent = index === 0 ? 0 : 10;
          pdf.text(line, margin + indent, currentY);
          currentY += lineHeight;
        });
        break;
        
      case 'blockquote':
        // Add left border and italic styling
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        
        // Draw left border
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, currentY - 2, margin, currentY + 8);
        
        const quoteLines = pdf.splitTextToSize(element.content, contentWidth - 10);
        quoteLines.forEach((line: string) => {
          if (currentY + 7 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin + 8, currentY);
          currentY += lineHeight;
        });
        break;
        
      case 'paragraph':
        // Process inline formatting
        const paragraphElements = processInlineFormatting(element.content);
        let paragraphText = '';
        let hasFormatting = false;
        
        for (const paraEl of paragraphElements) {
          if (paraEl.type === 'strong') {
            paragraphText += paraEl.content;
            hasFormatting = true;
          } else if (paraEl.type === 'em') {
            paragraphText += paraEl.content;
            hasFormatting = true;
          } else if (paraEl.type === 'code') {
            paragraphText += paraEl.content;
            hasFormatting = true;
          } else {
            paragraphText += paraEl.content;
          }
        }
        
        // For now, render as plain text (jsPDF doesn't support mixed formatting easily)
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(60, 60, 60);
        
        const paraLines = pdf.splitTextToSize(paragraphText, contentWidth);
        paraLines.forEach((line: string) => {
          if (currentY + 7 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin, currentY);
          currentY += lineHeight;
        });
        break;
        
      case 'strong':
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44);
        
        const strongLines = pdf.splitTextToSize(element.content, contentWidth);
        strongLines.forEach((line: string) => {
          if (currentY + 7 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin, currentY);
          currentY += lineHeight;
        });
        break;
        
      case 'em':
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(80, 80, 80);
        
        const emLines = pdf.splitTextToSize(element.content, contentWidth);
        emLines.forEach((line: string) => {
          if (currentY + 7 > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin, currentY);
          currentY += lineHeight;
        });
        break;
        
      case 'code':
        pdf.setFontSize(9);
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(0, 0, 0);
        
        // Add background for code
        const codeWidth = pdf.getTextWidth(element.content) + 4;
        const codeHeight = 4;
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, currentY - 3, codeWidth, codeHeight, 'F');
        
        pdf.text(element.content, margin + 2, currentY);
        currentY += lineHeight;
        break;
    }
    
    // Add spacing after element
    currentY += 2;
  }
  
  return currentY;
};

/**
 * Replicates the exact same formatting as the web MarkdownRenderer
 * This ensures the PDF looks identical to how it appears in the web interface
 */
export const convertMarkdownToPDF = (
  pdf: jsPDF,
  markdown: string,
  startY: number,
  margin: number,
  contentWidth: number,
  contentBottomY: number,
  topOffset: number = 0,
  options?: MarkdownPdfRenderOptions
): Promise<number> => {
  if (!markdown || !markdown.trim()) {
    return Promise.resolve(startY);
  }
  
  // Pre-process content exactly like the web MarkdownRenderer does
  const processContent = (text: string) => {
    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      const trimmedLine = line.trim();
      // Convert numbered lists with parentheses to proper markdown format
      if (/^\d+\)\s/.test(trimmedLine)) {
        // Convert "1) " to "1. " for proper markdown rendering
        return line.replace(/^(\d+)\)\s/, '$1. ');
      }
      return line;
    });
    return processedLines.join('\n');
  };
  
  const processedMarkdown = processContent(markdown);
  const normalized = normalizeUnicodeForPdf(processedMarkdown);
  
  // Parse the markdown into structured elements
  const elements = parseMarkdownToElements(normalized);
  
  // Render with exact same styling as web MarkdownRenderer
  return renderMarkdownToPDFWebStyle(pdf, elements, startY, margin, contentWidth, contentBottomY, topOffset, options);
};

/**
 * Renders text with inline formatting (bold, italic, code) to PDF
 * This replicates the exact styling from the web MarkdownRenderer
 */
export const renderInlineFormattedText = (
  pdf: jsPDF,
  text: string,
  startY: number,
  margin: number,
  contentWidth: number,
  contentBottomY: number,
  baseStyle: {
    fontSize: number;
    color: [number, number, number];
    lineHeight: number;
    marginBottom: number;
  },
  topOffset: number = 0
): number => {
  let currentY = startY;
  
  // Parse the text into formatted segments
  const segments = parseInlineFormatting(text);
  
  // Group segments into lines that fit within contentWidth
  const lines = groupSegmentsIntoLines(pdf, segments, contentWidth, baseStyle.fontSize);
  
  // Render each line
  lines.forEach((line) => {
    if (currentY + 7 > contentBottomY) {
      pdf.addPage();
      currentY = margin + topOffset;
    }
    
    let currentX = margin;
    
    // Render each segment in the line
    line.forEach((segment) => {
      // Set font style based on segment type
      pdf.setFontSize(baseStyle.fontSize);
      
      if (segment.type === 'bold') {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44); // text-foreground for bold
      } else if (segment.type === 'italic') {
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(75, 85, 99); // text-gray-600 for italic
      } else if (segment.type === 'code') {
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(0, 0, 0);
        // Add background for code
        const codeWidth = pdf.getTextWidth(segment.text) + 4;
        const codeHeight = baseStyle.fontSize * 0.8;
        pdf.setFillColor(243, 244, 246); // bg-muted
        pdf.roundedRect(currentX, currentY - codeHeight * 0.6, codeWidth, codeHeight, 1, 1, 'F');
        currentX += 2; // left padding before text
      } else {
        // For headings, default to bold font, for other content use normal
        const isHeading = baseStyle.fontSize >= 12; // Assume headings are 12pt or larger
        pdf.setFont('helvetica', isHeading ? 'bold' : 'normal');
        pdf.setTextColor(baseStyle.color[0], baseStyle.color[1], baseStyle.color[2]);
      }
      
      // Render the text
      pdf.text(segment.text, currentX, currentY);
      // Advance by text width, and if code, add right padding too
      const advance = pdf.getTextWidth(segment.text) + (segment.type === 'code' ? 2 : 0);
      currentX += advance;
    });
    
    currentY += baseStyle.lineHeight;
  });
  
  currentY += baseStyle.marginBottom;
  return currentY;
};

/**
 * Parses inline formatting and returns an array of text segments with their formatting
 */
export const parseInlineFormatting = (text: string): Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}> => {
  const segments: Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}> = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    // Find the next formatting marker
    const boldMatch = remaining.match(/(\*\*|__)([^*_]+)\1/);
    const italicMatch = remaining.match(/(\*|_)([^*_]+)\1/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\([^)]+\)/);
    
    // Find the earliest match
    let earliestMatch = null;
    let matchType = '';
    
    if (boldMatch && (!earliestMatch || boldMatch.index! < earliestMatch.index!)) {
      earliestMatch = boldMatch;
      matchType = 'bold';
    }
    if (italicMatch && (!earliestMatch || italicMatch.index! < earliestMatch.index!)) {
      earliestMatch = italicMatch;
      matchType = 'italic';
    }
    if (codeMatch && (!earliestMatch || codeMatch.index! < earliestMatch.index!)) {
      earliestMatch = codeMatch;
      matchType = 'code';
    }
    if (linkMatch && (!earliestMatch || linkMatch.index! < earliestMatch.index!)) {
      earliestMatch = linkMatch;
      matchType = 'link';
    }
    
    if (earliestMatch) {
      // Add text before the match as normal
      const beforeText = remaining.substring(0, earliestMatch.index);
      if (beforeText) {
        segments.push({ type: 'normal', text: beforeText });
      }
      
      // Add the formatted text
      if (matchType === 'bold') {
        segments.push({ type: 'bold', text: earliestMatch[2] });
      } else if (matchType === 'italic') {
        segments.push({ type: 'italic', text: earliestMatch[2] });
      } else if (matchType === 'code') {
        segments.push({ type: 'code', text: earliestMatch[1] });
      } else if (matchType === 'link') {
        segments.push({ type: 'link', text: earliestMatch[1] });
      }
      
      // Continue with remaining text
      remaining = remaining.substring(earliestMatch.index! + earliestMatch[0].length);
    } else {
      // No more formatting, add remaining as normal text
      if (remaining) {
        segments.push({ type: 'normal', text: remaining });
      }
      break;
    }
  }
  
  return segments;
};

/**
 * Groups text segments into lines that fit within the content width
 */
export const groupSegmentsIntoLines = (
  pdf: jsPDF,
  segments: Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}>,
  contentWidth: number,
  fontSize: number
): Array<Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}>> => {
  const lines: Array<Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}>> = [];
  let currentLine: Array<{type: 'normal' | 'bold' | 'italic' | 'code' | 'link', text: string}> = [];
  let currentLineWidth = 0;

  // Set font size to measure text width consistently
  pdf.setFontSize(fontSize);
  const spaceWidth = pdf.getTextWidth(' ');

  // Helper to get width for a given segment text considering its type
  const getWidth = (type: string, text: string): number => {
    if (type === 'bold') {
      pdf.setFont('helvetica', 'bold');
      return pdf.getTextWidth(text);
    }
    if (type === 'italic') {
      pdf.setFont('helvetica', 'italic');
      return pdf.getTextWidth(text);
    }
    if (type === 'code') {
      pdf.setFont('courier', 'normal');
      // Include padding similar to render (2px left + 2px right)
      return pdf.getTextWidth(text) + 4;
    }
    // normal/link
    pdf.setFont('helvetica', 'normal');
    return pdf.getTextWidth(text);
  };

  // Helper to break a long word into chunks that fit
  const breakWordToFit = (type: string, word: string, maxWidth: number): string[] => {
    const parts: string[] = [];
    let remaining = word;
    while (remaining.length > 0) {
      let low = 1;
      let high = remaining.length;
      let best = 1;
      // Binary search largest prefix that fits
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = remaining.slice(0, mid);
        const w = getWidth(type, candidate);
        if (w <= maxWidth) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      const take = Math.max(1, best);
      parts.push(remaining.slice(0, take));
      remaining = remaining.slice(take);
      // Avoid infinite loop
      if (take === 0) break;
    }
    return parts;
  };

  // Iterate segments and split into tokens (words + spaces)
  for (const segment of segments) {
    const isCode = segment.type === 'code';
    // For code, keep as a single token to preserve background; for others, split by words keeping spaces
    const tokens: Array<{ type: typeof segment.type; text: string; isSpace: boolean }> = [];
    if (isCode) {
      tokens.push({ type: segment.type, text: segment.text, isSpace: false });
    } else {
      const matches = segment.text.match(/\S+|\s+/g) || [];
      for (const m of matches) {
        const isSpace = /^\s+$/.test(m);
        tokens.push({ type: segment.type, text: m, isSpace });
      }
    }

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      // Skip leading spaces at start of line
      if (token.isSpace && currentLineWidth === 0) {
        continue;
      }

      const tokenWidth = token.isSpace ? spaceWidth : getWidth(token.type, token.text);
      if (tokenWidth > contentWidth) {
        // Token itself exceeds a full line: break it into pieces
        if (token.isSpace) {
          // Ignore excessive space
          continue;
        }
        const available = contentWidth - currentLineWidth;
        const chunks = breakWordToFit(token.type, token.text, available > 0 ? available : contentWidth);
        for (let c = 0; c < chunks.length; c++) {
          const chunk = chunks[c];
          const width = getWidth(token.type, chunk);
          if (currentLineWidth + width > contentWidth && currentLine.length > 0) {
            lines.push([...currentLine]);
            currentLine = [];
            currentLineWidth = 0;
          }
          currentLine.push({ type: token.type, text: chunk });
          currentLineWidth += width;
          // If not the last chunk, wrap to next line
          if (c < chunks.length - 1) {
            lines.push([...currentLine]);
            currentLine = [];
            currentLineWidth = 0;
          }
        }
      } else if (currentLineWidth + tokenWidth > contentWidth && currentLine.length > 0) {
        // Wrap to next line
        lines.push([...currentLine]);
        currentLine = [];
        currentLineWidth = 0;
        if (!token.isSpace) {
          currentLine.push({ type: token.type, text: token.text });
          currentLineWidth += tokenWidth;
        }
      } else {
        // Add to current line
        if (!token.isSpace) {
          currentLine.push({ type: token.type, text: token.text });
          currentLineWidth += tokenWidth;
        } else {
          // Add a single space between tokens
          currentLine.push({ type: 'normal', text: ' ' } as any);
          currentLineWidth += spaceWidth;
        }
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
};

/**
 * Renders Markdown elements to PDF with exact same styling as web MarkdownRenderer
 */
export const renderMarkdownToPDFWebStyle = async (
  pdf: jsPDF,
  elements: MarkdownElement[],
  startY: number,
  margin: number,
  contentWidth: number,
  contentBottomY: number,
  topOffset: number = 0,
  options?: MarkdownPdfRenderOptions
): Promise<number> => {
  let currentY = startY;
  const loadImage = options?.loadImage || loadImageDefault;
  
  for (const element of elements) {
    // Check if we need a new page (respecting footer space)
    if (currentY + 15 > contentBottomY) {
      pdf.addPage();
      currentY = margin + topOffset + 6; // extra breathing room after page header
    }
    
    switch (element.type) {
      case 'heading':
        // H1: text-xl font-bold text-foreground mb-4
        // H2: text-lg font-semibold text-foreground mb-3  
        // H3: text-base font-semibold text-foreground mb-2
        const headingSizes = [0, 16, 14, 12, 11, 10, 9]; // h1-h6
        const headingSize = headingSizes[element.level || 1] || 11;
        const headingMargins = [0, 4, 3, 2, 2, 2, 2]; // base spacing unit by level
        const headingMargin = headingMargins[element.level || 1] || 2;
        // More space BEFORE headings (than before), slightly less AFTER
        const beforeSpacings = [0, 8, 7, 6, 4, 3, 2];
        const beforeSpacing = beforeSpacings[element.level || 1] || 3;
        currentY += beforeSpacing;
        
        // Render heading with inline formatting support
        currentY = renderInlineFormattedText(pdf, element.content, currentY, margin, contentWidth, contentBottomY, {
          fontSize: headingSize,
          color: [26, 31, 44], // text-foreground color
          lineHeight: headingSize * 0.6,
          // Less space after compared to previous implementation
          marginBottom: headingMargin
        }, topOffset);
        break;
        
      case 'listItem':
        // li: text-sm text-gray-700 flex items-start mb-2
        // span: mr-3 mt-0.5 text-gray-600 font-medium min-w-[2rem] "•"
        
        // Add bullet point with proper spacing
        const bullet = '•';
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(75, 85, 99); // text-gray-600
        // Only draw bullet if there is actual content rendered on this line
        pdf.text(bullet, margin, currentY);
        
        // Render content with inline formatting and proper indentation
        const beforeY = currentY;
        currentY = renderInlineFormattedText(pdf, element.content, currentY, margin + 8, contentWidth - 8, contentBottomY, {
          fontSize: 10, // text-sm
          color: [55, 65, 81], // text-gray-700
          lineHeight: 5.5,
          marginBottom: 2 // mb-2
        }, topOffset);
        // If nothing advanced (empty content), avoid leaving a stray bullet by stepping back
        if (currentY === beforeY) {
          // Overwrite bullet by drawing a white dot (no-op visually on white bg), or simply move cursor down minimally
          currentY += 0.0001; // ensure no infinite loop
        }
        break;
        
      case 'blockquote':
        // blockquote: border-l-4 border-primary pl-4 italic text-gray-600 my-3
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(75, 85, 99); // text-gray-600
        
        // Draw left border (border-l-4 border-primary)
        pdf.setDrawColor(59, 130, 246); // border-primary color
        pdf.setLineWidth(1);
        pdf.line(margin, currentY - 2, margin, currentY + 8);
        
        const quoteLines = pdf.splitTextToSize(element.content, contentWidth - 20); // pl-4 equivalent
        quoteLines.forEach((line: string) => {
          if (currentY + 7 > contentBottomY) {
            pdf.addPage();
            currentY = margin + topOffset;
          }
          pdf.text(line, margin + 16, currentY); // pl-4 equivalent
          currentY += 5.5;
        });
        
        currentY += 6; // my-3 equivalent
        break;

      case 'hr':
        // Render a light separator similar to prose rule between sections
        pdf.setDrawColor(224, 224, 224);
        pdf.setLineWidth(0.3);
        pdf.line(margin, currentY, margin + contentWidth, currentY);
        currentY += 6; // spacing after rule
        break;

      case 'image':
        if (!element.content) {
          break;
        }
        try {
          const img = await loadImage(element.content);
          const naturalW = img.naturalWidth || 1;
          const naturalH = img.naturalHeight || 1;
          const aspect = naturalH / naturalW;
          const sizeFactor = (element.widthPercent || 100) / 100;
          const maxImageWidth = contentWidth * 0.9 * sizeFactor;
          const maxImageHeight = 70;
          let imageWidth = maxImageWidth;
          let imageHeight = imageWidth * aspect;
          if (imageHeight > maxImageHeight) {
            imageHeight = maxImageHeight;
            imageWidth = imageHeight / aspect;
          }

          if (currentY + imageHeight + 6 > contentBottomY) {
            pdf.addPage();
            currentY = margin + topOffset + 6;
          }

          const x = margin + (contentWidth - imageWidth) / 2;
          const format = inferImageFormat(element.content);
          pdf.addImage(img as any, format, x, currentY, imageWidth, imageHeight);
          currentY += imageHeight + 6;

          if (element.alt) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.setTextColor(120, 120, 120);
            const caption = pdf.splitTextToSize(element.alt, contentWidth * 0.9);
            caption.forEach((line: string) => {
              if (currentY + 5 > contentBottomY) {
                pdf.addPage();
                currentY = margin + topOffset + 6;
              }
              pdf.text(line, margin + (contentWidth - pdf.getTextWidth(line)) / 2, currentY);
              currentY += 4.5;
            });
          }
        } catch (_error) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(9);
          pdf.setTextColor(150, 150, 150);
          const fallback = `[Image unavailable${element.alt ? `: ${element.alt}` : ''}]`;
          const lines = pdf.splitTextToSize(fallback, contentWidth);
          lines.forEach((line: string) => {
            if (currentY + 6 > contentBottomY) {
              pdf.addPage();
              currentY = margin + topOffset + 6;
            }
            pdf.text(line, margin, currentY);
            currentY += 5;
          });
          currentY += 2;
        }
        break;
        
      case 'paragraph':
        // p: text-sm text-gray-700 leading-relaxed mb-3
        // Process inline formatting within paragraphs
        currentY = renderInlineFormattedText(pdf, element.content, currentY, margin, contentWidth, contentBottomY, {
          fontSize: 10,
          color: [55, 65, 81], // text-gray-700
          lineHeight: 6, // leading-relaxed
          marginBottom: 6 // mb-3
        }, topOffset);
        break;
        
      case 'strong':
        // strong: font-semibold text-foreground
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44); // text-foreground
        
        const strongLines = pdf.splitTextToSize(element.content, contentWidth);
        strongLines.forEach((line: string) => {
          if (currentY + 7 > contentBottomY) {
            pdf.addPage();
            currentY = margin + topOffset;
          }
          pdf.text(line, margin, currentY);
          currentY += 5.5;
        });
        break;
        
      case 'em':
        // em: italic text-gray-600
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(75, 85, 99); // text-gray-600
        
        const emLines = pdf.splitTextToSize(element.content, contentWidth);
        emLines.forEach((line: string) => {
          if (currentY + 7 > contentBottomY) {
            pdf.addPage();
            currentY = margin + topOffset;
          }
          pdf.text(line, margin, currentY);
          currentY += 5.5;
        });
        break;
        
      case 'code':
        // code: bg-muted px-1 py-0.5 rounded text-xs font-mono
        pdf.setFontSize(8); // text-xs
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(0, 0, 0);
        
        // Add background for code (bg-muted)
        const codeWidth = pdf.getTextWidth(element.content) + 4; // px-1 equivalent
        const codeHeight = 4; // py-0.5 equivalent
        pdf.setFillColor(243, 244, 246); // bg-muted color
        pdf.roundedRect(margin, currentY - 2, codeWidth, codeHeight, 1, 1, 'F');
        
        pdf.text(element.content, margin + 2, currentY);
        currentY += 5.5;
        break;
    }
    
    // Add small spacing between elements
    currentY += 1;
  }
  
  return Promise.resolve(currentY);
};
