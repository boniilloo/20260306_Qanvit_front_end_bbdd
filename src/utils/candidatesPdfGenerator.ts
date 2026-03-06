import jsPDF from 'jspdf';
import type { Propuesta } from '@/types/chat';

interface CandidatesPDFData {
  projectName: string;
  propuestas: Propuesta[];
}

export const generateCandidatesPDF = async (data: CandidatesPDFData): Promise<void> => {
  const { projectName, propuestas } = data;

  const sortedPropuestas = [...propuestas].sort((a, b) => {
    const aScore = (a as any).overall_match ?? a.match;
    const bScore = (b as any).overall_match ?? b.match;
    return bScore - aScore;
  });

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15; // tighter, presentation-friendly margins
    const contentWidth = pageWidth - 2 * margin;

    // Layout helpers
    let currentY = margin;

    const ensureSpace = (needed: number) => {
      if (currentY + needed > pageHeight - margin) {
        pdf.addPage();
        currentY = margin;
        drawHeaderFooter();
      }
    };

    const drawHeaderFooter = () => {
      // Top header bar
      pdf.setDrawColor(230, 232, 236);
      pdf.line(margin, 12, pageWidth - margin, 12);
      // Footer will be drawn at the end for all pages (numbers), but add a subtle baseline now
      pdf.setDrawColor(230, 232, 236);
      pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    };

    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10, lineGap = 4) => {
      pdf.setFontSize(fontSize);
      const lines = pdf.splitTextToSize(text, maxWidth);
      lines.forEach((line: string) => {
        ensureSpace(fontSize + 1);
        pdf.text(line, x, y);
        y += fontSize * 0.45 + lineGap * 0.2;
      });
      return y;
    };

    const sectionTitle = (title: string) => {
      ensureSpace(10);
      pdf.setFillColor(26, 31, 44);
      pdf.roundedRect(margin, currentY, contentWidth, 8, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11.5);
      pdf.text(title, margin + 3, currentY + 5.7);
      pdf.setTextColor(26, 31, 44);
      pdf.setFont('helvetica', 'normal');
      currentY += 12;
    };

    const infoRow = (label: string, value: string) => {
      if (!value) return;
      ensureSpace(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(label, margin, currentY);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 60, 60);
      currentY = addWrappedText(value, margin + 28, currentY, contentWidth - 28, 10, 2) + 2;
      pdf.setTextColor(26, 31, 44);
    };

    const scoresRow = (scores: Array<{ label: string; value: number }>) => {
      const boxW = 28;
      const boxH = 16;
      let x = margin;
      ensureSpace(boxH + 10);
      scores.forEach((s) => {
        pdf.setFillColor(245, 247, 250);
        pdf.roundedRect(x, currentY, boxW, boxH, 2, 2, 'F');
        pdf.setDrawColor(220, 223, 228);
        pdf.roundedRect(x, currentY, boxW, boxH, 2, 2);
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 100, 110);
        pdf.text(s.label, x + 2.5, currentY + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 31, 44);
        pdf.setFontSize(12);
        pdf.text(String(Math.round(s.value)), x + 2.5, currentY + 12);
        pdf.setFont('helvetica', 'normal');
        x += boxW + 4;
      });
      currentY += boxH + 6;
    };

    const bullets = (items: string[]) => {
      items.forEach((i) => {
        ensureSpace(7);
        pdf.setFontSize(9.5);
        pdf.text('•', margin, currentY);
        currentY = addWrappedText(i, margin + 4, currentY, contentWidth - 4, 9.5, 2) + 1.5;
      });
    };

    // Cover
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(26, 31, 44);
    pdf.setFontSize(20);
    pdf.text('RFX Candidates Report', margin, currentY);
    currentY += 10;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90, 92, 96);
    pdf.setFontSize(13);
    currentY = addWrappedText(projectName, margin, currentY, contentWidth, 13, 3) + 2;
    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 85);
    pdf.text(
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      margin,
      currentY
    );
    currentY += 8;
    pdf.setTextColor(26, 31, 44);
    pdf.text(`Total Candidates: ${sortedPropuestas.length}`, margin, currentY);
    currentY += 12;

    drawHeaderFooter();

    // Candidates
    sortedPropuestas.forEach((p, idx) => {
      ensureSpace(18);
      // Candidate header banner
      pdf.setFillColor(59, 130, 246);
      pdf.roundedRect(margin, currentY, contentWidth, 9, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11.5);
      const title = `Candidate #${idx + 1}: ${p.empresa}`;
      pdf.text(title, margin + 3, currentY + 6.2);
      currentY += 13;
      pdf.setTextColor(26, 31, 44);
      pdf.setFont('helvetica', 'normal');

      // Info grid
      infoRow('Company', p.empresa || '');
      infoRow('Website', p.website || '');
      infoRow('Product', p.producto || '');
      infoRow('Product URL', p.product_website || '');
      infoRow('HQ', p.country_hq || '');

      // Scores
      sectionTitle('Match Scores');
      const overall = (p as any).overall_match ?? p.match ?? 0;
      const tech = (p as any).technical_match;
      const comp = p.company_match;
      const scoreItems: Array<{ label: string; value: number }> = [{ label: 'Overall', value: overall }];
      if (typeof tech === 'number') scoreItems.push({ label: 'Technical', value: tech });
      if (typeof comp === 'number') scoreItems.push({ label: 'Company', value: comp });
      scoresRow(scoreItems);

      // Summary
      const summary = p.justification_sentence || p.justification?.sentence;
      if (summary) {
        sectionTitle('Summary');
        currentY = addWrappedText(summary, margin, currentY, contentWidth, 10.5, 3) + 2;
      }

      // Strengths / Areas
      const pros = p.justification_pros || p.justification?.pros || [];
      if (pros.length) {
        sectionTitle('Strengths');
        bullets(pros);
      }
      const cons = p.justification_cons || p.justification?.cons || [];
      if (cons.length) {
        sectionTitle('Areas for Improvement');
        bullets(cons);
      }

      if (p.company_match_justification) {
        sectionTitle('Company Match Justification');
        currentY = addWrappedText(p.company_match_justification, margin, currentY, contentWidth, 10, 3) + 2;
      }

      // Spacer between candidates
      currentY += 6;
    });

    // Footer for all pages (page numbers + link)
    const totalPages = (pdf as any).internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      const y = pageHeight - 8;
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 24, y);
      pdf.setTextColor(26, 31, 44);
      const linkText = 'Generated with FQ Source';
      const w = pdf.getTextWidth(linkText);
      pdf.text(linkText, margin, y);
      pdf.link(margin, y - 3, w, 4, { url: 'https://fqsource.com/' });
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><title>RFX Candidates - ${projectName}</title><style>body{margin:0;background:#f5f5f5}iframe{width:100vw;height:100vh;border:0}</style></head><body><iframe src="${url}" title="RFX Candidates PDF"></iframe></body></html>`);
      win.document.close();
      win.addEventListener('beforeunload', () => URL.revokeObjectURL(url));
      setTimeout(() => URL.revokeObjectURL(url), 600000);
    }
  } catch (error) {
    console.error('Error generating candidates PDF', error);
    throw new Error('Failed to generate candidates PDF');
  }
};
