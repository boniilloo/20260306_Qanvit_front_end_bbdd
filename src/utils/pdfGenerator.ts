import jsPDF from 'jspdf';
import { convertMarkdownToPDF, normalizeUnicodeForPdf } from './markdownToPdf';
import type { Propuesta } from '@/types/chat';
import { userCrypto } from '@/lib/userCrypto';

export interface RFXSpecsData {
  projectName: string;
  description: string;
  technicalRequirements: string;
  companyRequirements: string;
  userName?: string; // Firstname Lastname
  userEmail?: string;
  // Optional new sections
  projectTimeline?: Array<{
    id: string;
    label: string;
    key: string;
    date: { type: 'absolute'; date: string } | { type: 'relative'; amount: number; unit: 'days' | 'weeks' | 'months' | 'years'; from: 'rfq_launch' | 'previous' };
  }>;
  imageCategories?: Array<{
    id: string;
    name: string;
    images: string[];
  }>;
  date?: string;
  // PDF customization
  pdfHeaderBgColor?: string; // hex
  pdfHeaderTextColor?: string; // hex
  pdfSectionHeaderBgColor?: string; // hex
  pdfSectionHeaderTextColor?: string; // hex
  pdfLogoUrl?: string; // public URL
  pdfLogoBgEnabled?: boolean;
  pdfLogoBgColor?: string; // hex
  pdfPagesLogoUrl?: string; // optional different logo for pages > 1
  pdfPagesLogoBgEnabled?: boolean;
  pdfPagesLogoBgColor?: string;
  pdfPagesLogoUseHeader?: boolean; // reuse first-page logo
}

export interface RFXCandidatesReportData {
  rfxName: string;
  candidates: Propuesta[];
  userName?: string;
  userEmail?: string;
  date?: string;
  companyLogos?: {[key: string]: string | null};
  productData?: {[key: string]: { product_url?: string; images?: string[] }};
  onProgress?: (current: number, total: number) => void;
}

/**
 * Generates a PDF document from RFX Specifications data
 * @param specs - The RFX specifications data
 * @param returnBlob - If true, returns the blob instead of opening in new window
 * @returns Promise that resolves when PDF is generated and opened in new window, or returns the blob if returnBlob is true
 */
export const generateRFXSpecsPDF = async (
  specs: RFXSpecsData, 
  returnBlob: boolean = false,
  decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>,
  isEncrypted: boolean = false
): Promise<void | Blob> => {
  try {
    // Create a new PDF document (A4 size, portrait orientation)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Page settings
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const footerHeight = 18; // Actual footer height
    const contentWidth = pageWidth - 2 * margin;
    const maxContentHeight = pageHeight - margin - footerHeight; // Available content area
    let currentY = margin;
    let sectionIndex = 1;

    // Helper function to add text with automatic page breaks
    const addText = (
      text: string,
      fontSize: number,
      isBold: boolean = false,
      color: [number, number, number] = [0, 0, 0]
    ): void => {
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      pdf.setTextColor(color[0], color[1], color[2]);

      const lines = pdf.splitTextToSize(text, contentWidth);
      
      lines.forEach((line: string) => {
        // Check if we need a new page (respecting footer space)
        if (currentY + 10 > maxContentHeight) {
          pdf.addPage();
          currentY = margin;
        }
        
        pdf.text(line, margin, currentY);
        currentY += fontSize * 0.5; // Line height
      });
    };

    // Helper function to add a section separator
    const addSeparator = (): void => {
      currentY += 5;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 8;
    };

    // Utility to parse hex color like #RRGGBB -> [r,g,b]
    const hexToRgb = (hex?: string, fallback: [number, number, number] = [0,0,0]): [number, number, number] => {
      if (!hex || typeof hex !== 'string') return fallback;
      const m = hex.trim().match(/^#?([a-fA-F0-9]{6})$/);
      if (!m) return fallback;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    const headerBg = hexToRgb(specs.pdfHeaderBgColor, [26,31,44]);
    const headerText = hexToRgb(specs.pdfHeaderTextColor, [255,255,255]);
    const pagesHeaderText: [number, number, number] = ((headerText[0] + headerText[1] + headerText[2]) / 3 > 200)
      ? [26, 31, 44] // fallback to dark on light colors (e.g., white)
      : headerText;
    const sectionBg = hexToRgb(specs.pdfSectionHeaderBgColor, [128,200,240]);
    const sectionText = hexToRgb(specs.pdfSectionHeaderTextColor, [255,255,255]);
    const logoBg = hexToRgb(specs.pdfLogoBgColor, [255,255,255]);

    // --- HEADER ---
    pdf.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    pdf.rect(0, 0, pageWidth, 40, 'F');
    
    pdf.setTextColor(headerText[0], headerText[1], headerText[2]);
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RFX Specifications', margin, 20);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const dateText = specs.date || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    pdf.text(dateText, margin, 30);

    // (User info now rendered below project title, outside header)

    // Track blob URLs created for decrypted images so we can clean them up at the end
    const blobUrlsToCleanup: string[] = [];

    // Helper function to load image, decrypting if necessary
    const loadImageSafe = async (url: string): Promise<HTMLImageElement> => {
      // Check if image is encrypted (.enc extension) and we have decrypt function
      // Handle URLs with query parameters by checking the path part
      const urlPath = url.split('?')[0];
      const isEncryptedFile = isEncrypted && urlPath.endsWith('.enc') && !!decryptFile;
      
      if (isEncryptedFile && decryptFile) {
        try {
          console.log('🔐 [PDF] Decrypting image:', url);
          // Download encrypted blob
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch encrypted image: ${response.status}`);
          const encryptedBuffer = await response.arrayBuffer();
          
          // Extract IV (first 12 bytes) and encrypted data
          const ivBytes = encryptedBuffer.slice(0, 12);
          const dataBytes = encryptedBuffer.slice(12);
          
          // Convert IV to base64
          const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
          
          // Decrypt
          const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
          if (!decryptedBuffer) throw new Error('Failed to decrypt image');
          
          // Detect MIME type based on original extension
          const originalExt = url.split('/').pop()?.split('?')[0].replace('.enc', '').split('.').pop()?.toLowerCase() || 'jpg';
          let mimeType = 'image/jpeg';
          if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'webp') mimeType = 'image/webp';
          else if (originalExt === 'tif' || originalExt === 'tiff') mimeType = 'image/tiff';
          else if (originalExt === 'gif') mimeType = 'image/gif';
          else if (originalExt === 'svg') mimeType = 'image/svg+xml';
          
          // Create blob URL from decrypted data
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          
          // Store blob URL for cleanup later (after PDF generation completes)
          blobUrlsToCleanup.push(blobUrl);
          
          console.log('✅ [PDF] Image decrypted, blob URL created:', blobUrl);
          
          // Load image from blob URL
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              // DON'T revoke the blob URL here - jsPDF needs it later
              console.log('✅ [PDF] Image loaded successfully');
              resolve(image);
            };
            image.onerror = () => {
              console.error('❌ [PDF] Failed to load decrypted image');
              reject(new Error('Failed to load decrypted image'));
            };
            image.src = blobUrl;
          });
          
          return img;
        } catch (error) {
          console.error('❌ [PDF] Error decrypting image:', error);
          throw error;
        }
      } else {
        // Normal image loading
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Failed to load image'));
          image.src = url;
        });
      }
    };

    // Prepare company logo reference to reuse in later page headers
    let headerLogoImage: HTMLImageElement | null = null;
    let pagesLogoImage: HTMLImageElement | null = null;

    // Optional logo on top-right with aspect-aware sizing and vertical centering
    if (specs.pdfLogoUrl) {
      try {
        const img = await loadImageSafe(specs.pdfLogoUrl);
        headerLogoImage = img; // reuse for other pages
        // Header box is 40mm tall: center the logo vertically
        const headerHeight = 40; // mm
        const padding = 4; // inner padding from header edges for background
        const maxH = headerHeight - padding * 2; // available max height
        const maxW = 40; // reasonable width cap so it doesn't overlap too far into header

        const naturalW = img.naturalWidth || 1;
        const naturalH = img.naturalHeight || 1;
        const aspect = naturalW / naturalH; // >1 wide, <1 tall

        let logoW = 24;
        let logoH = 16;
        if (aspect >= 1) {
          // Landscape: let it use as much height as possible first; width follows aspect
          logoH = maxH;                          // use all available height (stays within header)
          logoW = logoH * aspect;                // width derived from aspect
          const absoluteMaxW = Math.min(maxW, contentWidth * 0.45); // avoid taking too much header width
          if (logoW > absoluteMaxW) {
            logoW = absoluteMaxW;
            logoH = logoW / aspect;             // rescale height to keep aspect
          }
        } else {
          // Portrait: limit height to maxH
          logoH = Math.min(maxH, 28);
          logoW = logoH * aspect;
        }

        const x = pageWidth - margin - logoW - 2; // small 2mm buffer from right
        const y = (headerHeight - logoH) / 2; // vertically centered in header

        if (specs.pdfLogoBgEnabled) {
          pdf.setFillColor(logoBg[0], logoBg[1], logoBg[2]);
          pdf.roundedRect(x - 2, y - 2, logoW + 4, logoH + 4, 2, 2, 'F');
        }

        // Ensure transparency for PNG by drawing to a canvas and using PNG data URL
        const isPng = /\.png(\?|$)/i.test(specs.pdfLogoUrl);
        if (isPng) {
          const canvas = document.createElement('canvas');
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height); // keep alpha channel
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            pdf.addImage(dataUrl, 'PNG', x, y, logoW, logoH);
          } else {
            pdf.addImage(img, 'PNG' as any, x, y, logoW, logoH);
          }
        } else {
          pdf.addImage(img, 'JPEG' as any, x, y, logoW, logoH);
        }
      } catch (e) {
        // ignore logo failure
      }
    }

    currentY = 50;

    // --- PROJECT NAME ---
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(26, 31, 44);
    const projectNameLines = pdf.splitTextToSize(normalizeUnicodeForPdf(specs.projectName), contentWidth);
    projectNameLines.forEach((line: string) => {
      if (currentY + 10 > maxContentHeight) {
        pdf.addPage();
        currentY = margin;
      }
      pdf.text(line, margin, currentY);
      currentY += 9;
    });

    // Author info (below project name, outside the blue header)
    if (specs.userName || specs.userEmail) {
      currentY += 2;
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(60, 60, 60);
      if (specs.userName) {
        const line = normalizeUnicodeForPdf(`Created by: ${specs.userName}`);
        const lines = pdf.splitTextToSize(line, contentWidth);
        lines.forEach((l: string) => {
          if (currentY + 6 > maxContentHeight) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(l, margin, currentY);
          currentY += 5.5;
        });
      }
      if (specs.userEmail) {
        const line = normalizeUnicodeForPdf(`Contact email: ${specs.userEmail}`);
        const lines = pdf.splitTextToSize(line, contentWidth);
        lines.forEach((l: string) => {
          if (currentY + 6 > maxContentHeight) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(l, margin, currentY);
          currentY += 5.5;
        });
      }
      // small separation before the first section header
      currentY += 3;
    }

    currentY += 5;
    addSeparator();

    // --- SECTION 1: PROJECT DESCRIPTION ---
    pdf.setFillColor(sectionBg[0], sectionBg[1], sectionBg[2]);
    pdf.roundedRect(margin - 2, currentY - 6, contentWidth + 4, 10, 2, 2, 'F');
    
    pdf.setTextColor(sectionText[0], sectionText[1], sectionText[2]);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(normalizeUnicodeForPdf(`${sectionIndex}. Project Description`), margin + 2, currentY);
    sectionIndex += 1;
    currentY += 12;

    if (specs.description && specs.description.trim()) {
      // Use Markdown converter for proper formatting
      currentY = await convertMarkdownToPDF(
        pdf,
        specs.description,
        currentY,
        margin,
        contentWidth,
        pageHeight - footerHeight,
        12,
        { loadImage: loadImageSafe }
      );
    } else {
      pdf.setTextColor(150, 150, 150);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(11);
      pdf.text('No description provided', margin, currentY);
      currentY += 5.5;
    }

    currentY += 5;
    addSeparator();

    // --- SECTION 2: TECHNICAL SPECIFICATIONS ---
    // Force a new page before Technical Specifications
    pdf.addPage();
    const afterHeaderOffset = 29; // ensure we don't overlap page header
    currentY = margin + afterHeaderOffset;
    pdf.setFillColor(sectionBg[0], sectionBg[1], sectionBg[2]);
    pdf.roundedRect(margin - 2, currentY - 6, contentWidth + 4, 10, 2, 2, 'F');
    
    pdf.setTextColor(sectionText[0], sectionText[1], sectionText[2]);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(normalizeUnicodeForPdf(`${sectionIndex}. Technical Specifications`), margin + 2, currentY);
    sectionIndex += 1;
    currentY += 12;

    if (specs.technicalRequirements && specs.technicalRequirements.trim()) {
      // Use Markdown converter for proper formatting
      currentY = await convertMarkdownToPDF(
        pdf,
        specs.technicalRequirements,
        currentY,
        margin,
        contentWidth,
        pageHeight - footerHeight,
        12,
        { loadImage: loadImageSafe }
      );
    } else {
      pdf.setTextColor(150, 150, 150);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(11);
      pdf.text('No technical specifications provided', margin, currentY);
      currentY += 5.5;
    }

    currentY += 5;
    addSeparator();

    // --- SECTION 3: COMPANY REQUIREMENTS ---
    // Force a new page before Company Requirements
    pdf.addPage();
    currentY = margin + afterHeaderOffset;
    pdf.setFillColor(sectionBg[0], sectionBg[1], sectionBg[2]);
    pdf.roundedRect(margin - 2, currentY - 6, contentWidth + 4, 10, 2, 2, 'F');
    
    pdf.setTextColor(sectionText[0], sectionText[1], sectionText[2]);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(normalizeUnicodeForPdf(`${sectionIndex}. Company Requirements`), margin + 2, currentY);
    sectionIndex += 1;
    currentY += 12;
  
  // Render Company Requirements content right after the header
  if (specs.companyRequirements && specs.companyRequirements.trim()) {
    // Use Markdown converter for proper formatting
    currentY = await convertMarkdownToPDF(
      pdf,
      specs.companyRequirements,
      currentY,
      margin,
      contentWidth,
      pageHeight - footerHeight,
      18,
      { loadImage: loadImageSafe }
    );
  } else {
    pdf.setTextColor(150, 150, 150);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(11);
    pdf.text('No company requirements provided', margin, currentY);
    currentY += 5.5;
  }
    // --- SECTION 4: PROJECT TIMELINE (optional) ---
    if (specs.projectTimeline && specs.projectTimeline.length > 0) {
      // Start on a new page for timeline
      pdf.addPage();
      currentY = margin + afterHeaderOffset;
      pdf.setFillColor(sectionBg[0], sectionBg[1], sectionBg[2]);
      pdf.roundedRect(margin - 2, currentY - 6, contentWidth + 4, 10, 2, 2, 'F');
      pdf.setTextColor(sectionText[0], sectionText[1], sectionText[2]);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(normalizeUnicodeForPdf(`${sectionIndex}. Project Timeline`), margin + 2, currentY);
      sectionIndex += 1;
      currentY += 12;
      
      // Compute absolute dates for milestones
      const parseIso = (iso: string): Date | null => {
        try {
          if (!iso) return null;
          const d = new Date(iso);
          return isNaN(d.getTime()) ? null : d;
        } catch { return null; }
      };
      const addToDate = (base: Date, unit: string, amount: number): Date => {
        const d = new Date(base.getTime());
        if (unit === 'days') d.setDate(d.getDate() + amount);
        else if (unit === 'weeks') d.setDate(d.getDate() + amount * 7);
        else if (unit === 'months') d.setMonth(d.getMonth() + amount);
        else if (unit === 'years') d.setFullYear(d.getFullYear() + amount);
        return d;
      };
      const formatDate = (d: Date): string => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      let rfqLaunchAbs: Date | null = null;
      for (const m of specs.projectTimeline) {
        if (m.key === 'rfx_launch' && m.date && m.date.type === 'absolute') {
          const d = parseIso(m.date.date);
          if (d) { rfqLaunchAbs = d; break; }
        }
      }

      const computedDates: Array<Date | null> = [];
      let prevAbs: Date | null = null;
      for (const m of specs.projectTimeline) {
        let abs: Date | null = null;
        if (m.date?.type === 'absolute') {
          abs = parseIso(m.date.date);
        } else if (m.date?.type === 'relative') {
          const base = m.date.from === 'rfq_launch' ? rfqLaunchAbs : prevAbs;
          if (base) abs = addToDate(base, m.date.unit, m.date.amount);
        }
        computedDates.push(abs);
        if (abs) prevAbs = abs;
      }

      // Styled table box
      const tableX = margin;
      const tableY = currentY;
      const colIndexX = tableX + 2; // column for index
      const colMilestoneX = tableX + 12;
      const colDateX = pageWidth - margin - 50;
      const colMilestoneWidth = (colDateX - colMilestoneX) - 6;
      const rowBaseHeight = 7;

      // Header background (give it a bit more height so first data row doesn't overlap)
      pdf.setFillColor(238, 242, 255); // indigo-50
      const headerBandHeight = 12;
      const headerBandTop = tableY - 2;
      pdf.roundedRect(tableX - 1, headerBandTop, contentWidth + 2, headerBandHeight, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(26, 31, 44);
      // Center header texts vertically within the header band
      const headerCenterY = headerBandTop + headerBandHeight / 2;
      const headerBaselineAdjust = 3.5; // tweak for font size 11 baseline
      const headerTextY = headerCenterY + headerBaselineAdjust;
      pdf.text('#', colIndexX, headerTextY);
      pdf.text(normalizeUnicodeForPdf('Milestone'), colMilestoneX, headerTextY);
      pdf.text(normalizeUnicodeForPdf('Date'), colDateX, headerTextY);
      currentY = tableY + 16;

      // Rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      for (let i = 0; i < specs.projectTimeline.length; i++) {
        const m = specs.projectTimeline[i];
        const abs = computedDates[i];
        const label = normalizeUnicodeForPdf(m.label || '-');
        const labelLines = pdf.splitTextToSize(label, colMilestoneWidth);
        const labelBlockHeight = Math.max(5.5, labelLines.length * 5.5);
        const rowHeight = Math.max(rowBaseHeight, labelBlockHeight);

        // Page break if needed
        if (currentY + rowHeight + 6 > maxContentHeight) {
          pdf.addPage();
          currentY = margin + afterHeaderOffset;
        }

        // Alternating background
        if (i % 2 === 0) {
          pdf.setFillColor(248, 250, 252); // slate-50
          pdf.rect(tableX, currentY - 7, contentWidth, rowHeight + 6, 'F');
        }

        // Index vertically centered
        pdf.setTextColor(71, 85, 105); // slate-600
        pdf.setFont('helvetica', 'bolditalic'); // Bold + italic for milestone numbers
        const indexY = currentY + (rowHeight - 5.5) / 2 + 4.0 - 2.5; // approximate baseline centering
        pdf.text(String(i + 1), colIndexX, indexY);
        pdf.setFont('helvetica', 'normal');

        // Milestone label (multi-line), vertically centered block
        pdf.setTextColor(31, 41, 55); // slate-800
        const labelStartY = currentY + (rowHeight - labelLines.length * 5.5) / 2 + 3.0 - 2.5; // tweak for baseline
        labelLines.forEach((line: string, idx: number) => {
          pdf.text(line, colMilestoneX, labelStartY + idx * 5.5);
        });

        // Date (computed or fallback), vertically centered
        const dateText = abs ? formatDate(abs) : (m.date?.type === 'absolute' ? (m.date.date || '—') : '—');
        pdf.setTextColor(31, 41, 55);
        const dateY = currentY + (rowHeight - 5.5) / 2 + 4.0 - 2.5;
        pdf.text(normalizeUnicodeForPdf(dateText), colDateX, dateY);

        currentY += rowHeight + 6;
      }
    }

    // --- SECTION 5: IMAGES (optional) ---
    if (specs.imageCategories && specs.imageCategories.length > 0) {
      // Start on a new page for images
      pdf.addPage();
      currentY = margin + afterHeaderOffset;
      pdf.setFillColor(sectionBg[0], sectionBg[1], sectionBg[2]);
      pdf.roundedRect(margin - 2, currentY - 6, contentWidth + 4, 10, 2, 2, 'F');
      pdf.setTextColor(sectionText[0], sectionText[1], sectionText[2]);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(normalizeUnicodeForPdf(`${sectionIndex}. Images`), margin + 2, currentY);
      sectionIndex += 1;
      currentY += 12;

      // For each category, print the category title then a grid of images (2 per row, larger, preserving aspect ratio)
      for (const cat of specs.imageCategories) {
        // New page if needed
        if (currentY + 12 > maxContentHeight) {
          pdf.addPage();
          currentY = margin + afterHeaderOffset;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44);
        pdf.setFontSize(12);
        const title = normalizeUnicodeForPdf(cat.name || 'Untitled category');
        const titleLines = pdf.splitTextToSize(title, contentWidth);
        // Estimate if title + first image row would overflow; if so, move both to next page
        const titleHeightEstimate = titleLines.length * 6;
        const estimatedGap = 6; // matches 'gap' used later for grid
        const minFirstRowWidth = (contentWidth - estimatedGap) / 2;
        const minFirstRowHeightEstimate = minFirstRowWidth * 0.75; // conservative 4:3 estimate
        if (currentY + titleHeightEstimate + minFirstRowHeightEstimate > maxContentHeight) {
          pdf.addPage();
          currentY = margin + afterHeaderOffset;
        }
        titleLines.forEach((line: string) => {
          if (currentY + 8 > maxContentHeight) {
            pdf.addPage();
            currentY = margin + afterHeaderOffset;
          }
          pdf.text(line, margin, currentY);
          currentY += 6;
        });
        
        // If no images, show a light note
        if (!cat.images || cat.images.length === 0) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(10);
          pdf.setTextColor(120, 120, 120);
          pdf.text('No images provided', margin, currentY);
          currentY += 8;
          continue;
        }

        // Image grid (2 per row, preserve aspect ratio)
        const imagesPerRow = 2;
        const gap = 6;
        const maxImageWidth = (contentWidth - gap * (imagesPerRow - 1)) / imagesPerRow;

        type RowItem = { kind: 'img' | 'placeholder'; url: string; el?: HTMLImageElement; w: number; h: number; format: 'JPEG' | 'PNG' };
        // Helper to detect format from URL, handling encrypted files (.enc)
        const getFormatFromUrl = (u: string): 'JPEG' | 'PNG' => {
          // Remove .enc extension if present, then check original extension
          const urlWithoutEnc = u.replace(/\.enc(\?|$)/i, '');
          return (/\.png(\?|$)/i.test(urlWithoutEnc) ? 'PNG' : 'JPEG');
        };

        let buffer: RowItem[] = [];
        const flushRow = () => {
          if (buffer.length === 0) return;
          let rowHeight = Math.max(...buffer.map(b => b.h));
          // Page break if needed for this row
          if (currentY + rowHeight + 8 > maxContentHeight) {
            pdf.addPage();
            currentY = margin + afterHeaderOffset;
          }
          // After potential page break, compute available height and scale row if too tall
          const availableForRow = Math.max(10, maxContentHeight - currentY - 8);
          let scale = 1;
          if (rowHeight > availableForRow) {
            scale = availableForRow / rowHeight;
            rowHeight = availableForRow;
          }
          buffer.forEach((b, idx) => {
            const w = b.w * scale;
            const h = b.h * scale;
            const x = margin + idx * (maxImageWidth + gap) + (maxImageWidth - w) / 2; // center within cell width
            const y = currentY;
            // Subtle border
            pdf.setDrawColor(230, 230, 230);
            pdf.rect(x - 0.5, y - 0.5, w + 1, h + 1);
            if (b.kind === 'img' && b.el) {
              try {
                pdf.addImage(b.el, b.format, x, y, w, h);
              } catch {
                // If addImage fails after load, fallback to placeholder box
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(x, y, w, h);
              }
            } else {
              pdf.setDrawColor(200, 200, 200);
              pdf.rect(x, y, w, h);
              pdf.setFont('helvetica', 'italic');
              pdf.setFontSize(8);
              pdf.setTextColor(150, 150, 150);
              const truncated = b.url.length > 40 ? b.url.slice(0, 37) + '...' : b.url;
              pdf.text(normalizeUnicodeForPdf(truncated), x + 2, y + Math.min(h / 2, 10));
            }
          });
          currentY += rowHeight + 10;
          buffer = [];
        };

        for (const url of cat.images) {
          try {
            // Use loadImageSafe to handle encrypted images
            const img = await loadImageSafe(url);
            const aspect = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.75;
            const w = maxImageWidth;
            const h = w * aspect; // preserve aspect ratio by width
            buffer.push({ kind: 'img', url, el: img, w, h, format: getFormatFromUrl(url) });
          } catch (e) {
            // Placeholder with default ratio if image can't be loaded
            const w = maxImageWidth;
            const h = w * 0.75;
            buffer.push({ kind: 'placeholder', url, w, h, format: 'JPEG' });
          }

          if (buffer.length === imagesPerRow) {
            flushRow();
          }
        }
        // Flush any remaining images in the last row
        flushRow();
      }
    }

    // (Company Requirements content already rendered above)

    // --- FOOTER (on all pages) ---
    const totalPages = (pdf as any).internal.pages.length - 1; // Subtract 1 because pages array includes an empty first element
    
    // Load FQ Source logo
    let logoImage: any = null;
    try {
      // Create a promise to load the image
      const loadLogo = () => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous'; // Enable CORS
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load logo'));
          img.src = 'https://fukzxedgbszcpakqkrjf.supabase.co/storage/v1/object/public/fq-logos//logo_200x200.png';
        });
      };
      
      // Load the logo (this will be async, but we'll handle it in the loop)
      logoImage = await loadLogo();
    } catch (error) {
      console.warn('⚠️ Could not load FQ Source logo, using text fallback:', error);
    }
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      // --- HEADER (all pages except first) ---
      if (i > 1) {
        const headerHeight = 16; // header band height
        const headerTop = margin - 4; // push header down from very top for more breathing room
        const textY = headerTop + 10; // baseline of the left title
        // Left: project name
        pdf.setTextColor(pagesHeaderText[0], pagesHeaderText[1], pagesHeaderText[2]);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(10);
        const leftTitle = normalizeUnicodeForPdf(specs.projectName);
        const maxTitleWidth = pageWidth - 2 * margin - 50; // leave space for logo
        const titleLines = pdf.splitTextToSize(leftTitle, maxTitleWidth);
        const title = Array.isArray(titleLines) ? String(titleLines[0] || '') : String(titleLines || '');
        pdf.text(title, margin, textY);

        // Decide which logo to use on pages > 1
        const shouldReuseHeader = specs.pdfPagesLogoUseHeader !== false; // default true
        const pagesLogoUrl = shouldReuseHeader ? (specs.pdfLogoUrl || '') : (specs.pdfPagesLogoUrl || '');

        // Preload pages logo if different and not yet loaded
        if (!shouldReuseHeader && pagesLogoUrl && !pagesLogoImage) {
          try {
            pagesLogoImage = await loadImageSafe(pagesLogoUrl);
          } catch (err) {
            console.error('❌ [PDF] Failed to load pages logo:', err);
          }
        }

        const logoImageToUse = shouldReuseHeader ? headerLogoImage : pagesLogoImage;
        const bgEnabled = shouldReuseHeader ? specs.pdfLogoBgEnabled : (specs.pdfPagesLogoBgEnabled || false);
        const bgColor = shouldReuseHeader ? logoBg : hexToRgb(specs.pdfPagesLogoBgColor, [255,255,255]);

        if (logoImageToUse && pagesLogoUrl) {
          try {
            const naturalW = logoImageToUse.naturalWidth || 1;
            const naturalH = logoImageToUse.naturalHeight || 1;
            const aspect = naturalW / naturalH;
            const maxH = headerHeight - 4; // padding
            const maxW = 40;
            let logoW = 20;
            let logoH = 12;
            if (aspect >= 1) {
              logoH = maxH;
              logoW = logoH * aspect;
              const absoluteMaxW = Math.min(maxW, (pageWidth - 2 * margin) * 0.45);
              if (logoW > absoluteMaxW) {
                logoW = absoluteMaxW;
                logoH = logoW / aspect;
              }
            } else {
              logoH = Math.min(maxH, 14);
              logoW = logoH * aspect;
            }
            const x = pageWidth - margin - logoW - 2;
            const y = headerTop + (headerHeight - logoH) / 2; // vertically centered in header band
            if (bgEnabled) {
              pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
              pdf.roundedRect(x - 2, y - 2, logoW + 4, logoH + 4, 2, 2, 'F');
            }
            const isPng = /\.png(\?|$)/i.test(pagesLogoUrl);
            if (isPng) {
              const canvas = document.createElement('canvas');
              canvas.width = naturalW;
              canvas.height = naturalH;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(logoImageToUse, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                pdf.addImage(dataUrl, 'PNG', x, y, logoW, logoH);
              } else {
                pdf.addImage(logoImageToUse, 'PNG' as any, x, y, logoW, logoH);
              }
            } else {
              pdf.addImage(logoImageToUse, 'JPEG' as any, x, y, logoW, logoH);
            }
          } catch {}
        }

        // Separator line under header
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, headerTop + headerHeight, pageWidth - margin, headerTop + headerHeight);
      }
      
      // Footer line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
      
      // Footer content positioning
      const footerY = pageHeight - 15;
      const logoSize = 5; // Smaller logo size
      let currentX = margin;
      
      // Add FQ Source logo (leftmost position)
      if (logoImage) {
        try {
          // Center logo vertically with text (text baseline is at footerY, so adjust logo position)
          const logoY = footerY - logoSize/2 - 1; // Slight adjustment to center with text
          pdf.addImage(logoImage, 'PNG', currentX, logoY, logoSize, logoSize);
          
          // Add clickable link to the logo
          pdf.link(currentX, logoY, logoSize, logoSize, { url: 'https://fqsource.com/' });
          
          currentX += logoSize + 5; // Move position after logo
        } catch (error) {
          console.warn('⚠️ Could not add logo image:', error);
        }
      }
      
      // Footer text - "Generated using FQ Source" (next to logo)
      pdf.setTextColor(26, 31, 44); // FQ Source brand color
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      
      const linkText = 'Generated using FQ Source';
      const linkWidth = pdf.getTextWidth(linkText);
      pdf.text(linkText, currentX, footerY);
      
      // Add the link annotation
      pdf.link(currentX, footerY - 3, linkWidth, 4, { url: 'https://fqsource.com/' });
      
      // Footer text - Right side (page numbers)
      pdf.setTextColor(120, 120, 120);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `Page ${i} of ${totalPages}`,
        pageWidth - margin - 20,
        footerY
      );
    }

    // Generate filename
    const sanitizedProjectName = specs.projectName
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50);
    const filename = `rfx_specs_${sanitizedProjectName}_${new Date().getTime()}.pdf`;

    // Generate PDF blob and open in new window or return it
    try {
      // Generate blob
      const pdfBlob = pdf.output('blob');
      
      // If returnBlob is true, just return the blob
      if (returnBlob) {
        return pdfBlob;
      }
      
      // Create download URL
      const url = URL.createObjectURL(pdfBlob);
      
      // Open PDF in new window - clean view with just the PDF
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>RFX Specifications - ${specs.projectName}</title>
              <style>
                body { 
                  margin: 0; 
                  padding: 0; 
                  background: #f5f5f5;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                iframe {
                  width: 100vw;
                  height: 100vh;
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <iframe src="${url}" title="RFX Specifications PDF"></iframe>
              
              <script>
                // Auto-cleanup after 10 minutes
                setTimeout(() => {
                  console.log('Cleaning up PDF URL...');
                  URL.revokeObjectURL('${url}');
                }, 600000);
                
                // Handle window close
                window.addEventListener('beforeunload', () => {
                  URL.revokeObjectURL('${url}');
                });
              </script>
            </body>
          </html>
        `);
        newWindow.document.close();
      } else {
        throw new Error('Popup was blocked by browser');
      }
      
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      throw error;
    } finally {
      // Clean up blob URLs created for decrypted images
      console.log(`🧹 [PDF] Cleaning up ${blobUrlsToCleanup.length} blob URLs`);
      blobUrlsToCleanup.forEach(blobUrl => {
        URL.revokeObjectURL(blobUrl);
      });
    }
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    // Clean up blob URLs even on error
    console.log(`🧹 [PDF] Cleaning up ${blobUrlsToCleanup.length} blob URLs (error path)`);
    blobUrlsToCleanup.forEach(blobUrl => {
      URL.revokeObjectURL(blobUrl);
    });
    throw new Error('Failed to generate PDF');
  }
};

/**
 * Normalize text for jsPDF rendering - removes special characters that cause spacing issues
 */
function normalizeForPDF(text: string): string {
  return text
    // Replace various hyphens and dashes
    .replace(/\u2011/g, '-')  // non-breaking hyphen
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')  // figure dash, en dash, em dash, horizontal bar
    .replace(/\u2212/g, '-')  // minus sign
    
    // Replace special quotes and apostrophes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // various double quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // various single quotes
    .replace(/[\u2039\u203A]/g, "'")  // single angle quotes
    .replace(/[\u00AB\u00BB]/g, '"')  // double angle quotes
    
    // Replace mathematical symbols with ASCII equivalents
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
    .replace(/∇/g, 'nabla')
    
    // Replace Greek letters used in technical contexts
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
    .replace(/ω/g, 'omega')
    
    // Replace degree and temperature symbols
    .replace(/°C/g, 'degC')
    .replace(/°F/g, 'degF')
    .replace(/°K/g, 'K')
    .replace(/°/g, 'deg')
    .replace(/℃/g, 'degC')
    .replace(/℉/g, 'degF')
    
    // Replace currency symbols (keep basic ones, normalize special)
    .replace(/€/g, 'EUR')
    .replace(/£/g, 'GBP')
    .replace(/¥/g, 'JPY')
    .replace(/₹/g, 'INR')
    .replace(/₽/g, 'RUB')
    
    // Replace fraction symbols
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8')
    
    // Replace arrows
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->')
    .replace(/⇒/g, '=>')
    .replace(/⇐/g, '<=')
    .replace(/⇔/g, '<=>')
    
    // Replace bullets and list markers
    .replace(/•/g, '*')
    .replace(/‣/g, '>')
    .replace(/⁃/g, '-')
    .replace(/◦/g, 'o')
    .replace(/▪/g, '*')
    .replace(/▫/g, '*')
    
    // Replace copyright, trademark, etc.
    .replace(/©/g, '(C)')
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    .replace(/℠/g, '(SM)')
    
    // Replace superscript and subscript numbers
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
    .replace(/₉/g, '9')
    
    // Replace special spaces with regular space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    
    // Replace ellipsis
    .replace(/…/g, '...')
    
    // Keep accented characters but normalize them
    .normalize('NFC');
}

/**
 * Custom text splitting function that avoids justification issues
 * Splits text into lines that fit within maxWidth without justification
 */
function splitTextManually(pdf: jsPDF, text: string, maxWidth: number): string[] {
  // First normalize the text to avoid special character issues
  const normalizedText = normalizeForPDF(text);
  
  const words = normalizedText.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = pdf.getTextWidth(testLine);
    
    if (testWidth > maxWidth && currentLine) {
      // Current line is full, push it and start new line
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  // Push the last line
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Generates a PDF report of RFX Candidates in landscape format (PowerPoint style)
 * @param data - The RFX candidates report data
 * @returns Promise that resolves when PDF is generated and opened in new window
 */
export const generateRFXCandidatesReport = async (data: RFXCandidatesReportData, returnBlob: boolean = false): Promise<void | Blob> => {
  try {
    console.log('🔄 [PDF Generator] Starting RFX Candidates Report generation...');
    
    // Create a new PDF document (A4 size, landscape orientation for PowerPoint style)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Page settings for landscape
    const pageWidth = pdf.internal.pageSize.getWidth(); // ~297mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // ~210mm
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const contentHeight = pageHeight - 2 * margin - 15; // Reserve space for footer

    // Brand colors
    const darkBlue = [26, 31, 44]; // #1A1F2C
    const lightBlue = [128, 200, 240]; // #80c8f0

    // Helper to extract justification data
    const getJustificationData = (propuesta: Propuesta) => {
      if (propuesta.justification_sentence || propuesta.justification_pros || propuesta.justification_cons) {
        return {
          sentence: propuesta.justification_sentence || 'No summary available.',
          pros: propuesta.justification_pros || [],
          cons: propuesta.justification_cons || []
        };
      }
      if (propuesta.justification) {
        if (typeof propuesta.justification === 'object' && propuesta.justification !== null) {
          return {
            sentence: propuesta.justification.sentence || 'No summary available.',
            pros: propuesta.justification.pros || [],
            cons: propuesta.justification.cons || []
          };
        }
        if (typeof propuesta.justification === 'string') {
          try {
            const parsed = JSON.parse(propuesta.justification);
            return {
              sentence: parsed?.sentence || 'No summary available.',
              pros: parsed?.pros || [],
              cons: parsed?.cons || []
            };
          } catch (_err) {
            return { sentence: propuesta.justification, pros: [], cons: [] };
          }
        }
      }
      return { sentence: 'No summary available.', pros: [], cons: [] };
    };

    // Load FQ Source logo
    let logoImage: any = null;
    try {
      const loadLogo = () => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load logo'));
          img.src = 'https://fukzxedgbszcpakqkrjf.supabase.co/storage/v1/object/public/fq-logos//logo_200x200.png';
        });
      };
      logoImage = await loadLogo();
    } catch (error) {
      console.warn('⚠️ Could not load FQ Source logo:', error);
    }

    // --- COVER PAGE ---
    // Background with brand color
    pdf.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Title
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(36);
    pdf.setFont('helvetica', 'bold');
    const titleText = 'FQ Candidates Report';
    const titleWidth = pdf.getTextWidth(titleText);
    pdf.text(titleText, (pageWidth - titleWidth) / 2, 60);

    // RFX Name
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'normal');
    const rfxNameLines = pdf.splitTextToSize(normalizeUnicodeForPdf(data.rfxName), contentWidth - 40);
    let currentY = 80;
    rfxNameLines.forEach((line: string) => {
      const lineWidth = pdf.getTextWidth(line);
      pdf.text(line, (pageWidth - lineWidth) / 2, currentY);
      currentY += 10;
    });

    // Metadata
    currentY += 10;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'italic');
    const dateText = data.date || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dateWidth = pdf.getTextWidth(dateText);
    pdf.text(dateText, (pageWidth - dateWidth) / 2, currentY);
    
    if (data.userName) {
      currentY += 8;
      const authorText = normalizeUnicodeForPdf(`Prepared by: ${data.userName}`);
      const authorWidth = pdf.getTextWidth(authorText);
      pdf.text(authorText, (pageWidth - authorWidth) / 2, currentY);
    }

    // Candidates count
    currentY += 20;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(lightBlue[0], lightBlue[1], lightBlue[2]);
    const countText = `${data.candidates.length} Candidate${data.candidates.length !== 1 ? 's' : ''} Identified`;
    const countWidth = pdf.getTextWidth(countText);
    pdf.text(countText, (pageWidth - countWidth) / 2, currentY);

    // --- CANDIDATE PAGES ---
    for (let index = 0; index < data.candidates.length; index++) {
      const candidate = data.candidates[index];
      console.log(`📄 Processing candidate ${index + 1}: ${candidate.empresa}`);
      
      // Update progress
      if (data.onProgress) {
        data.onProgress(index + 1, data.candidates.length);
      }
      
      // Add new page for each candidate
      pdf.addPage();

      const justification = getJustificationData(candidate);
      const technicalMatch = candidate.match;
      const companyMatch = candidate.company_match ?? candidate.match;
      const overallMatch = (candidate.company_match !== undefined && candidate.company_match !== null)
        ? Math.round((candidate.match + candidate.company_match) / 2)
        : candidate.match;

      // --- HEADER SECTION ---
      currentY = margin;
      
      // Header background (reduced height from 35 to 28mm)
      pdf.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      pdf.rect(0, 0, pageWidth, 28, 'F');

      // Company logo (if available) with favicon fallback
      let logoWidth = 0;
      let logoStatus = ''; // For debugging in PDF
      const companyLogoUrl = data.companyLogos?.[candidate.id_company_revision];
      
      // Helper to load logo with fallback
      const loadLogoWithFallback = async (logoUrl: string, companyName: string, websiteUrl?: string): Promise<{img: HTMLImageElement | null, status: string}> => {
        console.log(`🖼️ [PDF Logo] Candidate ${index + 1}: ${companyName}`);
        console.log(`   Logo URL: ${logoUrl || 'NO LOGO'}`);
        console.log(`   Website: ${websiteUrl || 'NO WEBSITE'}`);
        
        // Try proxy first (solves CORS/HTTP2 issues)
        try {
          const stripped = logoUrl.replace(/^https?:\/\//i, '');
          const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&output=png`;
          console.log(`   🔄 Trying proxy: ${proxiedUrl}`);
          
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => {
              console.log(`   ✅ Proxy logo loaded successfully (${image.naturalWidth}x${image.naturalHeight})`);
              resolve(image);
            };
            image.onerror = () => {
              console.log(`   ❌ Proxy logo failed to load`);
              reject(new Error('Failed to load via proxy'));
            };
            image.src = proxiedUrl;
            setTimeout(() => {
              console.log(`   ⏱️ Proxy logo timeout`);
              reject(new Error('Timeout'));
            }, 5000);
          });
          return { img, status: '✓ Logo (proxy)' };
        } catch (proxyError) {
          console.log(`   🔄 Trying original logo...`);
          // Try original logo as fallback
          try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onload = () => {
                console.log(`   ✅ Original logo loaded successfully (${image.naturalWidth}x${image.naturalHeight})`);
                resolve(image);
              };
              image.onerror = (e) => {
                console.log(`   ❌ Original logo failed to load`);
                reject(new Error('Failed to load'));
              };
              image.src = logoUrl;
              setTimeout(() => {
                console.log(`   ⏱️ Original logo timeout`);
                reject(new Error('Timeout'));
              }, 3000);
            });
            return { img, status: '⚠ Logo original (proxy falló)' };
          } catch (error) {
            console.log(`   🔄 Trying favicon fallback...`);
            // Try favicon as last resort if we have a website
            if (websiteUrl) {
              try {
                const url = new URL(websiteUrl);
                const faviconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(websiteUrl)}&size=128`;
                console.log(`   Favicon URL: ${faviconUrl}`);
                
                // Try without crossOrigin first (some favicons block CORS)
                let img: HTMLImageElement;
                try {
                  img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const image = new Image();
                    // Try without crossOrigin first
                    image.onload = () => {
                      console.log(`   ✅ Favicon loaded without CORS (${image.naturalWidth}x${image.naturalHeight})`);
                      resolve(image);
                    };
                    image.onerror = () => {
                      console.log(`   ❌ Favicon failed without CORS, trying with CORS...`);
                      reject(new Error('Failed without CORS'));
                    };
                    image.src = faviconUrl;
                    setTimeout(() => reject(new Error('Timeout')), 3000);
                  });
                } catch (e) {
                  // Try with crossOrigin if without failed
                  img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const image = new Image();
                    image.crossOrigin = 'anonymous';
                    image.onload = () => {
                      console.log(`   ✅ Favicon loaded with CORS (${image.naturalWidth}x${image.naturalHeight})`);
                      resolve(image);
                    };
                    image.onerror = () => {
                      console.log(`   ❌ Favicon failed with CORS`);
                      reject(new Error('Failed with CORS'));
                    };
                    image.src = faviconUrl;
                    setTimeout(() => reject(new Error('Timeout')), 3000);
                  });
                }
                
                return { img, status: '⚠ Favicon' };
              } catch (faviconError) {
                console.log(`   ❌ Favicon fallback failed:`, faviconError);
                return { img: null, status: '✗ Todo falló' };
              }
            }
            console.log(`   ⚠️ No website available for favicon fallback`);
            return { img: null, status: '✗ Logo falló, sin website' };
          }
        }
      };
      
      if (companyLogoUrl) {
        try {
          const result = await loadLogoWithFallback(companyLogoUrl, candidate.empresa, candidate.website);
          logoStatus = result.status;
          
          if (result.img) {
            const maxLogoSize = 20; // Maximum size in mm (20x20 square)
            const naturalW = result.img.naturalWidth || 1;
            const naturalH = result.img.naturalHeight || 1;
            
            // Calculate size maintaining aspect ratio within 20x20mm square
            let logoW, logoH;
            if (naturalW > naturalH) {
              // Wider than tall - limit width to 20mm
              logoW = maxLogoSize;
              logoH = (naturalH / naturalW) * maxLogoSize;
            } else {
              // Taller than wide - limit height to 20mm
              logoH = maxLogoSize;
              logoW = (naturalW / naturalH) * maxLogoSize;
            }
            
            // Position in top-left corner with small margin from edge
            // Center the logo within the 20x20mm square
            const squareX = margin;
            const squareY = 4; // 5mm from top (adjusted to align with company name)
            const logoX = squareX + (maxLogoSize - logoW) / 2; // Center horizontally
            const logoY = squareY + (maxLogoSize - logoH) / 2; // Center vertically

            // Add logo - use canvas to preserve transparency
            try {
              const canvas = document.createElement('canvas');
              canvas.width = naturalW;
              canvas.height = naturalH;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Clear canvas to preserve transparency
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(result.img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                pdf.addImage(dataUrl, 'PNG', logoX, logoY, logoW, logoH);
                console.log(`   🎨 Logo added to PDF successfully via canvas (${logoW.toFixed(1)}x${logoH.toFixed(1)}mm, centered)`);
              }
            } catch (canvasError) {
              // Canvas is tainted (no crossOrigin), try adding image directly
              console.log(`   ⚠️ Canvas tainted, adding image directly`);
              try {
                // For tainted images, we need to use the src directly
                pdf.addImage(result.img.src, 'PNG', logoX, logoY, logoW, logoH);
                console.log(`   🎨 Logo added to PDF successfully (direct, ${logoW.toFixed(1)}x${logoH.toFixed(1)}mm, centered)`);
              } catch (directError) {
                console.log(`   ❌ Failed to add image directly:`, directError);
              }
            }

            logoWidth = maxLogoSize + 4; // Reserve space for logo (20mm square + 4mm spacing)
          } else {
            console.log(`   ⚠️ No logo image available, continuing without logo`);
          }
        } catch (error) {
          console.log(`   ❌ Error adding logo to PDF:`, error);
          logoStatus = '✗ Error al procesar';
        }
      } else {
        console.log(`🖼️ [PDF Logo] Candidate ${index + 1}: ${candidate.empresa} - NO LOGO URL IN DATABASE`);
        logoStatus = '✗ Sin logo en BD';
      }

      // Company name and product name in header (positioned next to logo)
      const companyNameX = margin + logoWidth;
      const availableWidth = contentWidth - logoWidth - 90; // Leave space for score boxes (overall + tech/company)
      
      // Company name (smaller)
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14); // Reduced from 20
      pdf.setFont('helvetica', 'bold');
      const companyNameLines = pdf.splitTextToSize(normalizeUnicodeForPdf(candidate.empresa), availableWidth);
      pdf.text(companyNameLines[0] || candidate.empresa, companyNameX, 12);
      
      // Product name (below company name)
      if (candidate.producto) {
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(lightBlue[0], lightBlue[1], lightBlue[2]);
        const productNameLines = pdf.splitTextToSize(normalizeUnicodeForPdf(candidate.producto), availableWidth);
        pdf.text(productNameLines[0] || candidate.producto, companyNameX, 19);
      }

      // --- SCORES IN HEADER (Top Right) ---
      // Overall Match (main score, larger)
      const overallBoxWidth = 50;
      const overallBoxHeight = 25;
      const overallBoxX = pageWidth - margin - overallBoxWidth - 35; // Leave space for tech/company
      const overallBoxY = 5;

      // Score box background - color based on score
      let scoreColor = [220, 38, 38]; // red
      if (overallMatch >= 80) {
        scoreColor = [34, 197, 94]; // green
      } else if (overallMatch >= 60) {
        scoreColor = [251, 191, 36]; // yellow
      } else if (overallMatch >= 40) {
        scoreColor = [249, 115, 22]; // orange
      }
      
      pdf.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      pdf.roundedRect(overallBoxX, overallBoxY, overallBoxWidth, overallBoxHeight, 3, 3, 'F');

      // Overall score text
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      const scoreText = `${overallMatch}%`;
      const scoreTextWidth = pdf.getTextWidth(scoreText);
      pdf.text(scoreText, overallBoxX + (overallBoxWidth - scoreTextWidth) / 2, overallBoxY + 13);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      const labelText = 'OVERALL';
      const labelTextWidth = pdf.getTextWidth(labelText);
      pdf.text(labelText, overallBoxX + (overallBoxWidth - labelTextWidth) / 2, overallBoxY + 21);

      // Technical and Company Match (smaller, stacked on the right)
      const smallBoxWidth = 32;
      const smallBoxHeight = 11;
      const smallBoxX = pageWidth - margin - smallBoxWidth;
      const gap = 3;
      
      // Technical Match (top)
      pdf.setFillColor(248, 250, 252); // slate-50
      pdf.roundedRect(smallBoxX, overallBoxY, smallBoxWidth, smallBoxHeight, 2, 2, 'F');
      pdf.setDrawColor(203, 213, 225); // slate-300
      pdf.roundedRect(smallBoxX, overallBoxY, smallBoxWidth, smallBoxHeight, 2, 2, 'S');
      
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      const techLabel = 'TECH';
      pdf.text(techLabel, smallBoxX + (smallBoxWidth - pdf.getTextWidth(techLabel)) / 2, overallBoxY + 4);
      
      pdf.setTextColor(26, 31, 44);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      const techScore = `${technicalMatch}%`;
      pdf.text(techScore, smallBoxX + (smallBoxWidth - pdf.getTextWidth(techScore)) / 2, overallBoxY + 9);
      
      // Company Match (bottom)
      const companyBoxY = overallBoxY + smallBoxHeight + gap;
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(smallBoxX, companyBoxY, smallBoxWidth, smallBoxHeight, 2, 2, 'F');
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(smallBoxX, companyBoxY, smallBoxWidth, smallBoxHeight, 2, 2, 'S');
      
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      const compLabel = 'COMPANY';
      pdf.text(compLabel, smallBoxX + (smallBoxWidth - pdf.getTextWidth(compLabel)) / 2, companyBoxY + 4);
      
      pdf.setTextColor(26, 31, 44);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      const compScore = `${companyMatch}%`;
      pdf.text(compScore, smallBoxX + (smallBoxWidth - pdf.getTextWidth(compScore)) / 2, companyBoxY + 9);

      // --- CONTENT AREA ---
      currentY = 38; // Reduced from 45 to 38mm to save space

      // Left column: Content (Product name moved to header)
      const leftColX = margin;
      const leftColWidth = (contentWidth * 0.65) - 10;

      // Summary section with Technical and Company analysis
      pdf.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
      pdf.roundedRect(leftColX, currentY - 5, leftColWidth, 10, 2, 2, 'F');
      
      pdf.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Summary', leftColX + 3, currentY + 2);
      
      currentY += 11;
      
      // Technical considerations
      pdf.setTextColor(60, 60, 60);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Technical considerations:', leftColX + 3, currentY);
      currentY += 5;
      
      pdf.setFont('helvetica', 'normal');
      const normalizedTech = justification.sentence; // Will be normalized by splitTextManually
      console.log(`📝 Technical text for ${candidate.empresa}:`, normalizedTech);
      console.log(`   Length: ${normalizedTech.length}, Width available: ${leftColWidth - 6}mm`);
      
      const techLines = splitTextManually(pdf, normalizedTech, leftColWidth - 6);
      console.log(`   Split into ${techLines.length} lines (MANUAL):`, techLines);
      
      techLines.forEach((line: string, idx: number) => {
        if (currentY < pageHeight - margin - 5) {
          const lineWidth = pdf.getTextWidth(line);
          console.log(`   Line ${idx + 1} width: ${lineWidth}mm, max: ${leftColWidth - 6}mm, content: "${line.substring(0, 50)}..."`);
          console.log(`   Has special chars: ${/[^\x00-\x7F]/.test(line)}, chars: ${line.split('').filter(c => c.charCodeAt(0) > 127).join(',')}`);
          
          // Render with NO options at all - most basic rendering
          pdf.text(line, leftColX + 3, currentY);
          currentY += 4;
        }
      });
      currentY += 4;
      
      // Company analysis (if available)
      if (candidate.company_match_justification) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Company analysis:', leftColX + 3, currentY);
        currentY += 5;
        
        pdf.setFont('helvetica', 'normal');
        const normalizedCompany = candidate.company_match_justification; // Will be normalized by splitTextManually
        console.log(`🏢 Company text for ${candidate.empresa}:`, normalizedCompany);
        console.log(`   Length: ${normalizedCompany.length}, Width available: ${leftColWidth - 6}mm`);
        
        const companyLines = splitTextManually(pdf, normalizedCompany, leftColWidth - 6);
        console.log(`   Split into ${companyLines.length} lines (MANUAL):`, companyLines);
        
        companyLines.forEach((line: string, idx: number) => {
          if (currentY < pageHeight - margin - 5) {
            const lineWidth = pdf.getTextWidth(line);
            console.log(`   Line ${idx + 1} width: ${lineWidth}mm, max: ${leftColWidth - 6}mm, content: "${line.substring(0, 50)}..."`);
            
            // Render with NO options at all
            pdf.text(line, leftColX + 3, currentY);
            currentY += 4;
          }
        });
      }
      
      currentY += 5;

      // Two-column layout for Strengths and Considerations
      const col1X = leftColX;
      const col2X = leftColX + (leftColWidth / 2) + 5;
      const colWidth = (leftColWidth / 2) - 5;
      let col1Y = currentY;
      let col2Y = currentY;

      // Left column: Strengths section
      if (justification.pros && justification.pros.length > 0) {
        pdf.setFillColor(220, 252, 231); // green-50
        pdf.roundedRect(col1X, col1Y - 5, colWidth, 10, 2, 2, 'F');
        
        pdf.setTextColor(22, 101, 52); // green-800
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('+ STRENGTHS', col1X + 3, col1Y + 2);
        
        col1Y += 10;
        pdf.setTextColor(22, 101, 52);
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        
        justification.pros.forEach((pro: string, proIdx: number) => {
          if (col1Y < pageHeight - margin - 5) {
            const normalizedPro = `• ${pro}`; // Will be normalized by splitTextManually
            const proLines = splitTextManually(pdf, normalizedPro, colWidth - 8);
            
            if (proLines.some((line: string) => pdf.getTextWidth(line) > colWidth - 8)) {
              console.log(`⚠️ STRENGTH ${proIdx + 1} has wide line(s) for ${candidate.empresa}`);
              console.log(`   Original: "${pro}"`);
              proLines.forEach((line: string, lineIdx: number) => {
                const lineWidth = pdf.getTextWidth(line);
                if (lineWidth > colWidth - 8) {
                  console.log(`   Line ${lineIdx + 1}: width=${lineWidth.toFixed(2)}mm, max=${colWidth - 8}mm`);
                  console.log(`   Content: "${line}"`);
                }
              });
            }
            
            proLines.forEach((line: string) => {
              if (col1Y < pageHeight - margin - 5) {
                // Render with NO options at all
                pdf.text(line, col1X + 4, col1Y);
                col1Y += 4;
              }
            });
          }
        });
      }

      // Right column: Considerations section
      if (justification.cons && justification.cons.length > 0) {
        pdf.setFillColor(255, 237, 213); // orange-50
        pdf.roundedRect(col2X, col2Y - 5, colWidth, 10, 2, 2, 'F');
        
        pdf.setTextColor(154, 52, 18); // orange-800
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('! CONSIDERATIONS', col2X + 3, col2Y + 2);
        
        col2Y += 10;
        pdf.setTextColor(154, 52, 18);
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        
        justification.cons.forEach((con: string, conIdx: number) => {
          if (col2Y < pageHeight - margin - 5) {
            const normalizedCon = `• ${con}`; // Will be normalized by splitTextManually
            const conLines = splitTextManually(pdf, normalizedCon, colWidth - 8);
            
            if (conLines.some((line: string) => pdf.getTextWidth(line) > colWidth - 8)) {
              console.log(`⚠️ CONSIDERATION ${conIdx + 1} has wide line(s) for ${candidate.empresa}`);
              console.log(`   Original: "${con}"`);
              conLines.forEach((line: string, lineIdx: number) => {
                const lineWidth = pdf.getTextWidth(line);
                if (lineWidth > colWidth - 8) {
                  console.log(`   Line ${lineIdx + 1}: width=${lineWidth.toFixed(2)}mm, max=${colWidth - 8}mm`);
                  console.log(`   Content: "${line}"`);
                }
              });
            }
            
            conLines.forEach((line: string) => {
              if (col2Y < pageHeight - margin - 5) {
                // Render with NO options at all
                pdf.text(line, col2X + 4, col2Y);
                col2Y += 4;
              }
            });
          }
        });
      }
      
      // Update currentY to the maximum of both columns
      currentY = Math.max(col1Y, col2Y) + 3;

      // Right column: Product images and additional info
      const rightColX = margin + leftColWidth + 20;
      const rightColWidth = contentWidth * 0.35 - 10;
      let rightY = 38; // Reduced from 45 to 38mm to match left column

      // Product images (up to 2, in 45x45mm squares, centered in column)
      const productInfo = data.productData?.[candidate.id_product_revision];
      
      if (productInfo?.images && productInfo.images.length > 0) {
        const imageBoxSize = 45; // 45x45mm square
        const imageGap = 5;
        const loadedImages: HTMLImageElement[] = [];
        
        // Load up to 2 images via proxy
        for (let i = 0; i < Math.min(2, productInfo.images.length); i++) {
          try {
            const imageUrl = productInfo.images[i];
            const stripped = imageUrl.replace(/^https?:\/\//i, '');
            const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&output=png`;
            
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error('Failed to load'));
              image.src = proxiedUrl;
              setTimeout(() => reject(new Error('Timeout')), 5000);
            });
            
            loadedImages.push(img);
          } catch (error) {
            // Silently fail if image doesn't load
          }
        }
        
        // Display loaded images (centered in column)
        let imageY = rightY;
        for (let i = 0; i < loadedImages.length; i++) {
          const img = loadedImages[i];
          const naturalW = img.naturalWidth || 1;
          const naturalH = img.naturalHeight || 1;
          
          // Calculate size maintaining aspect ratio within 45x45mm square
          let imgW, imgH;
          if (naturalW > naturalH) {
            imgW = imageBoxSize;
            imgH = (naturalH / naturalW) * imageBoxSize;
          } else {
            imgH = imageBoxSize;
            imgW = (naturalW / naturalH) * imageBoxSize;
          }
          
          // Center box horizontally in column
          const boxX = rightColX + (rightColWidth - imageBoxSize) / 2;
          // Center image within the 45x45mm square
          const imgX = boxX + (imageBoxSize - imgW) / 2;
          const imgY = imageY + (imageBoxSize - imgH) / 2;
          
          // Draw border
          pdf.setDrawColor(230, 230, 230);
          pdf.rect(boxX, imageY, imageBoxSize, imageBoxSize);
          
          // Add image
          try {
            const canvas = document.createElement('canvas');
            canvas.width = naturalW;
            canvas.height = naturalH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              pdf.addImage(dataUrl, 'PNG', imgX, imgY, imgW, imgH);
            }
          } catch (e) {
            console.log(`   ⚠️ Failed to add product image to PDF`);
          }
          
          imageY += imageBoxSize + imageGap;
        }
        
        rightY = imageY;
      }

      // Product URL (if available, centered)
      if (productInfo?.product_url) {
        pdf.setTextColor(59, 130, 246); // blue-500
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const productUrlText = 'View Product Page';
        const urlTextWidth = pdf.getTextWidth(productUrlText);
        const urlX = rightColX + (rightColWidth - urlTextWidth) / 2;
        pdf.text(productUrlText, urlX, rightY);
        pdf.link(urlX, rightY - 3, urlTextWidth, 4, { url: productInfo.product_url });
        rightY += 10;
      }

      // Additional info
      if (candidate.website || candidate.country_hq || productInfo?.product_url) {
        pdf.setFillColor(241, 245, 249); // slate-100
        pdf.roundedRect(rightColX, rightY, rightColWidth, 45, 3, 3, 'F');
        
        pdf.setTextColor(71, 85, 105); // slate-600
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text('ADDITIONAL INFO', rightColX + 3, rightY + 7);
        
        rightY += 12;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        
        // Company website
        if (candidate.website) {
          pdf.setTextColor(59, 130, 246); // blue-500
          const websiteText = candidate.website.replace(/^https?:\/\//, '').substring(0, 30);
          pdf.text(`Company web: ${normalizeUnicodeForPdf(websiteText)}`, rightColX + 3, rightY);
          // Add clickable link
          pdf.link(rightColX + 3, rightY - 3, rightColWidth - 6, 4, { url: candidate.website });
          rightY += 7;
        }

        // Product website
        if (productInfo?.product_url) {
          pdf.setTextColor(59, 130, 246); // blue-500
          const productUrlText = productInfo.product_url.replace(/^https?:\/\//, '').substring(0, 30);
          pdf.text(`Product web: ${normalizeUnicodeForPdf(productUrlText)}`, rightColX + 3, rightY);
          // Add clickable link
          pdf.link(rightColX + 3, rightY - 3, rightColWidth - 6, 4, { url: productInfo.product_url });
          rightY += 7;
        }
        
        // Locations
        if (candidate.country_hq) {
          pdf.setTextColor(71, 85, 105);
          let locations = candidate.country_hq.split(',').map(loc => loc.trim());
          let locationText = '';
          
          if (locations.length <= 3) {
            locationText = locations.join(', ');
          } else {
            locationText = `${locations.slice(0, 3).join(', ')}, ${locations.length - 3} more`;
          }
          
          pdf.text(`Locations: ${normalizeUnicodeForPdf(locationText)}`, rightColX + 3, rightY);
        }
      }
    }

    // --- ADD FOOTER TO ALL PAGES ---
    const totalPages = (pdf as any).internal.pages.length - 1;
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // Footer line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      
      const footerY = pageHeight - 6;
      let currentX = margin;
      
      // Footer text
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      const linkText = 'Generated using FQ Source';
      const linkWidth = pdf.getTextWidth(linkText);
      
      // Add white background on first page (cover page) so logo and text are visible
      const footerStartX = currentX;
      if (i === 1 && logoImage) {
        pdf.setFillColor(255, 255, 255);
        const padding = 2;
        const logoSize = 4;
        const totalWidth = logoSize + 3 + linkWidth + padding * 2;
        pdf.roundedRect(footerStartX - padding, footerY - 4, totalWidth, 5, 1, 1, 'F');
      } else if (i === 1) {
        // No logo, just text
        pdf.setFillColor(255, 255, 255);
        const padding = 2;
        pdf.roundedRect(currentX - padding, footerY - 4, linkWidth + padding * 2, 5, 1, 1, 'F');
      }
      
      // Add FQ Source logo
      if (logoImage) {
        try {
          const logoSize = 4;
          const logoY = footerY - logoSize/2 - 0.5;
          pdf.addImage(logoImage, 'PNG', currentX, logoY, logoSize, logoSize);
          pdf.link(currentX, logoY, logoSize, logoSize, { url: 'https://fqsource.com/' });
          currentX += logoSize + 3;
        } catch (error) {
          console.warn('⚠️ Could not add logo to footer:', error);
        }
      }
      
      pdf.setTextColor(26, 31, 44);
      pdf.text(linkText, currentX, footerY);
      pdf.link(currentX, footerY - 2.5, linkWidth, 3, { url: 'https://fqsource.com/' });
      
      // Page numbers (right side)
      if (i > 1) { // Skip page number on cover page
        pdf.setTextColor(120, 120, 120);
        pdf.setFont('helvetica', 'normal');
        const pageText = `Page ${i - 1} of ${totalPages - 1}`;
        pdf.text(pageText, pageWidth - margin - pdf.getTextWidth(pageText), footerY);
      }
    }

    // Generate filename
    const sanitizedRfxName = data.rfxName
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50);
    const filename = `rfx_candidates_${sanitizedRfxName}_${new Date().getTime()}.pdf`;

    // Generate PDF blob and open in new window or return blob
    try {
      console.log('🔄 [PDF Generator] Generating PDF blob...');
      
      const pdfBlob = pdf.output('blob');
      console.log('✅ [PDF Generator] PDF blob created, size:', pdfBlob.size, 'bytes');
      if (returnBlob) {
        return pdfBlob;
      }

      const url = URL.createObjectURL(pdfBlob);
      console.log('✅ [PDF Generator] Download URL created:', url);
      
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>FQ Candidates Report - ${data.rfxName}</title>
              <style>
                body { 
                  margin: 0; 
                  padding: 0; 
                  background: #f5f5f5;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                iframe {
                  width: 100vw;
                  height: 100vh;
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <iframe src="${url}" title="FQ Candidates Report PDF"></iframe>
              
              <script>
                setTimeout(() => {
                  console.log('Cleaning up PDF URL...');
                  URL.revokeObjectURL('${url}');
                }, 600000);
                
                window.addEventListener('beforeunload', () => {
                  URL.revokeObjectURL('${url}');
                });
              </script>
            </body>
          </html>
        `);
        newWindow.document.close();
        console.log('✅ PDF opened in new window:', filename);
      } else {
        throw new Error('Popup was blocked by browser');
      }
      
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      throw error;
    }
  } catch (error) {
    console.error('❌ Error generating candidates report PDF:', error);
    throw new Error('Failed to generate candidates report PDF');
  }
};

