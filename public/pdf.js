// ── pdf.js — Ponk Note ──

const PDF_C = {
  accent:      [74, 127, 212],
  accentDark:  [50, 95, 170],
  accentLight: [210, 225, 248],
  dark:        [25, 30, 50],
  muted:       [110, 118, 140],
  light:       [243, 246, 253],
  white:       [255, 255, 255],
  sectionBg:   [232, 240, 255],
  sectionBdr:  [190, 210, 245],
  blockBg:     [251, 253, 255],
  blockBdr:    [215, 228, 248],
  detail:      [85, 95, 118],
  ideeline:    [195, 225, 195],
  ideelabel:   [45, 120, 70],
  ideetext:    [55, 115, 75],
  ideetick:    [120, 190, 130],
  footerbg:    [244, 247, 253],
};

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

function pdfBandeau(doc, titre, pageW, M, C) {
  doc.setFillColor(...C.accentDark); doc.rect(0, 0, pageW, 32, 'F');
  doc.setFillColor(...C.accent);     doc.rect(0, 8, pageW, 24, 'F');
  doc.setFillColor(...C.accentLight);doc.rect(0, 30, pageW, 1.2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...C.white);
  const tl = doc.splitTextToSize(titre, pageW - 40);
  doc.text(tl, M, tl.length > 1 ? 11 : 14);
  doc.setFillColor(...C.accentDark);
  doc.roundedRect(pageW - M - 22, 4, 22, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.accentLight);
  doc.text('PONK NOTE', pageW - M - 11, 9, { align: 'center' });
}

function pdfFooter(doc, pageW, pageH, M, C, label) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.footerbg); doc.rect(0, pageH - 11, pageW, 11, 'F');
    doc.setDrawColor(...C.sectionBdr); doc.setLineWidth(0.2);
    doc.line(0, pageH - 11, pageW, pageH - 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text(label || 'Ponk Note', M, pageH - 4);
    doc.setFillColor(...C.accent);
    doc.roundedRect(pageW - M - 14, pageH - 9, 14, 6, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.white);
    doc.text(i + ' / ' + total, pageW - M - 7, pageH - 4.8, { align: 'center' });
  }
}

function pdfSectionHeader(doc, titre, idx, y, M, maxW, C) {
  doc.setFillColor(...C.sectionBg); doc.setDrawColor(...C.sectionBdr); doc.setLineWidth(0.25);
  doc.roundedRect(M, y, maxW, 10, 2.5, 2.5, 'FD');
  doc.setFillColor(...C.accent); doc.roundedRect(M, y, 3.5, 10, 1.5, 1.5, 'F');
  if (idx !== null) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.white);
    doc.text(String(idx), M + 1.75, y + 6.5, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...C.accentDark);
  doc.text(titre.toUpperCase(), M + 7, y + 6.5);
}

function pdfBlock(doc, tL, dL, bY, M, maxW, totH, C) {
  doc.setFillColor(225, 232, 248); doc.roundedRect(M + 0.6, bY + 0.6, maxW, totH, 2.5, 2.5, 'F');
  doc.setFillColor(...C.blockBg); doc.setDrawColor(...C.blockBdr); doc.setLineWidth(0.2);
  doc.roundedRect(M, bY, maxW, totH, 2.5, 2.5, 'FD');
  doc.setFillColor(...C.accentLight); doc.roundedRect(M, bY, 3, totH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.dark);
  doc.text(tL, M + 6, bY + 6);
  if (dL && dL.length > 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...C.detail);
    doc.text(dL, M + 8, bY + 6 + tL.length * 5.8 + 3);
  }
}

async function downloadCalendrierPDF() {
  const pdf = window._calendrierPDF;
  if (!pdf) return;
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const C = PDF_C;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16, maxW = pageW - M * 2;
  let y = M;
  const checkPage = (n = 10) => { if (y + n > pageH - 14) { doc.addPage(); y = M; } };

  pdfBandeau(doc, pdf.titre, pageW, M, C);
  y = 40;

  const meta = pdf.meta || {};
  const metaItems = [
    { label: 'Date',         val: meta.date        || '-' },
    { label: 'Lieu',         val: meta.lieu        || '-' },
    { label: 'Duree',        val: meta.duree       || '-' },
    { label: 'Participants', val: meta.participants || '-' },
  ];
  doc.setFillColor(225, 230, 245); doc.roundedRect(M + 0.8, y + 0.8, maxW, 30, 3, 3, 'F');
  doc.setFillColor(...C.light); doc.setDrawColor(...C.sectionBdr); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, maxW, 30, 3, 3, 'FD');
  doc.setFillColor(...C.accent); doc.roundedRect(M, y, 3, 30, 1.5, 1.5, 'F');
  const colW = maxW / 2;
  metaItems.forEach((item, i) => {
    const cx = M + (i % 2) * colW + 6, cy = y + 9 + Math.floor(i / 2) * 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
    doc.text(item.label.toUpperCase(), cx, cy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...C.accent);
    doc.text(doc.splitTextToSize(item.val, colW - 12)[0], cx, cy + 5);
  });
  y += 38;

  for (const section of (pdf.sections || [])) {
    checkPage(22);
    pdfSectionHeader(doc, section.titre, pdf.sections.indexOf(section) + 1, y, M, maxW, C);
    y += 13;
    for (const point of (section.points || [])) {
      const tL = doc.splitTextToSize(point.titre, maxW - 12);
      const dL = point.detail ? doc.splitTextToSize(point.detail, maxW - 14) : [];
      const iL = (point.idees || []).map(id => doc.splitTextToSize(id, maxW - 22));
      const tH = tL.length * 5.8 + 4;
      const dH = dL.length > 0 ? dL.length * 4.8 + 4 : 0;
      const iSH = iL.length > 0 ? 9 : 0;
      const iH = iL.reduce((a, l) => a + l.length * 4.8 + 2, 0);
      const totH = tH + dH + iSH + iH + 5;
      checkPage(totH + 5);
      const bY = y;
      pdfBlock(doc, tL, dL, bY, M, maxW, totH, C);
      y = bY + (dL.length > 0 ? tL.length * 5.8 + dL.length * 4.8 + 10 : tL.length * 5.8 + 7);
      if (iL.length > 0) {
        const iZH = iSH + iH + 2;
        doc.setFillColor(245, 252, 246); doc.setDrawColor(...C.ideeline); doc.setLineWidth(0.15);
        doc.roundedRect(M + 4, y, maxW - 4, iZH, 1.5, 1.5, 'FD');
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...C.ideelabel);
        doc.text('SUGGESTIONS', M + 7, y);
        y += 5;
        for (const lines of iL) {
          doc.setFillColor(...C.ideetick); doc.circle(M + 9, y - 1.2, 0.9, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.ideetext);
          doc.text(lines, M + 12, y);
          y += lines.length * 4.8 + 2;
        }
      }
      y = bY + totH + 4;
    }
    y += 5;
  }

  pdfFooter(doc, pageW, pageH, M, C, 'Genere par Ponk Note' + (pdf.generatedAt ? ' — ' + pdf.generatedAt : ''));
  doc.save(pdf.titre.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') + '.pdf');
}

async function downloadAnalysePDF() {
  const data = analyseData;
  if (!data.sections) return;
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const C = PDF_C;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16, maxW = pageW - M * 2;
  let y = M;
  const checkPage = (n = 10) => { if (y + n > pageH - 14) { doc.addPage(); y = M; } };

  pdfBandeau(doc, 'Analyse : ' + data.titre, pageW, M, C);
  y = 40;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), M, y);
  y += 10;

  for (const section of (data.sections || [])) {
    checkPage(22);
    pdfSectionHeader(doc, section.titre, null, y, M, maxW, C);
    y += 13;
    for (const point of (section.points || [])) {
      const tL = doc.splitTextToSize(point.titre, maxW - 12);
      const dL = doc.splitTextToSize(point.detail, maxW - 14);
      const totH = tL.length * 5.8 + dL.length * 4.8 + 12;
      checkPage(totH + 5);
      const bY = y;
      pdfBlock(doc, tL, dL, bY, M, maxW, totH, C);
      y = bY + totH + 4;
    }
    const v = section.visuel;
    if (v && v.type) {
      checkPage(30);
      if (v.titre) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.accentDark);
        doc.text(v.titre, M, y); y += 6;
      }
      if (v.type === 'tableau' && v.colonnes && v.lignes) {
        const cW = maxW / v.colonnes.length, cellH = 7;
        v.colonnes.forEach((col, ci) => {
          doc.setFillColor(232, 240, 255); doc.setDrawColor(190, 210, 245); doc.setLineWidth(0.2);
          doc.rect(M + ci * cW, y, cW, cellH, 'FD');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(50, 95, 170);
          doc.text(doc.splitTextToSize(String(col), cW - 3)[0], M + ci * cW + 2, y + 4.5);
        });
        y += cellH;
        v.lignes.forEach((row, ri) => {
          checkPage(cellH + 2);
          row.forEach((cell, ci) => {
            doc.setFillColor(ri % 2 === 0 ? 251 : 244, ri % 2 === 0 ? 253 : 247, 255);
            doc.setDrawColor(215, 228, 248); doc.setLineWidth(0.2);
            doc.rect(M + ci * cW, y, cW, cellH, 'FD');
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(25, 30, 50);
            doc.text(doc.splitTextToSize(String(cell), cW - 3)[0], M + ci * cW + 2, y + 4.5);
          });
          y += cellH;
        });
        y += 6;
      } else if (v.type === 'barres' && v.labels && v.valeurs) {
        const max = Math.max(...v.valeurs);
        const lW = 35, vW = 25, bW = maxW - lW - vW - 4, barH = 7;
        v.labels.forEach((label, i) => {
          checkPage(barH + 3);
          const ratio = max > 0 ? v.valeurs[i] / max : 0;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
          doc.text(doc.splitTextToSize(label, lW)[0], M, y + 5);
          doc.setFillColor(232, 240, 255); doc.roundedRect(M + lW + 2, y + 1, bW, barH - 2, 1, 1, 'F');
          doc.setFillColor(...C.accent); doc.roundedRect(M + lW + 2, y + 1, Math.max(2, bW * ratio), barH - 2, 1, 1, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.accent);
          doc.text(String(v.valeurs[i]) + (v.unite ? ' ' + v.unite : ''), M + lW + bW + 5, y + 5);
          y += barH + 2;
        });
        y += 4;
      } else if (v.type === 'camembert' && v.labels && v.valeurs) {
        const colors = [[74,127,212],[61,184,122],[224,122,48],[138,85,212],[224,85,85],[48,168,212]];
        const total = v.valeurs.reduce((a, b) => a + b, 0);
        const iW = maxW / 2;
        v.labels.forEach((label, i) => {
          if (i % 2 === 0) checkPage(10);
          const px = M + (i % 2) * iW, py = y + Math.floor(i / 2) * 9;
          doc.setFillColor(...colors[i % colors.length]); doc.circle(px + 3, py + 3, 2.5, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.dark);
          doc.text(label, px + 8, py + 4.5);
          doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors[i % colors.length]);
          doc.text(Math.round((v.valeurs[i] / total) * 100) + '%', px + iW - 12, py + 4.5);
        });
        y += Math.ceil(v.labels.length / 2) * 9 + 4;
      } else if (v.type === 'courbe' && v.labels && v.valeurs) {
        const cH = 30, n = v.valeurs.length;
        const max = Math.max(...v.valeurs), min = Math.min(...v.valeurs), range = max - min || 1;
        checkPage(cH + 20);
        doc.setFillColor(243, 246, 253); doc.setDrawColor(...C.blockBdr); doc.setLineWidth(0.2);
        doc.rect(M, y, maxW, cH, 'FD');
        const pts = v.valeurs.map((val, i) => ({
          x: M + (i / (n - 1)) * maxW,
          y: y + cH - ((val - min) / range) * (cH - 4) - 2
        }));
        doc.setDrawColor(...C.accent); doc.setLineWidth(1);
        for (let i = 0; i < pts.length - 1; i++) doc.line(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
        pts.forEach(pt => { doc.setFillColor(...C.accent); doc.circle(pt.x, pt.y, 1.2, 'F'); });
        y += cH + 3;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted);
        v.labels.forEach((label, i) => {
          doc.text(label, M + (i / (n - 1)) * maxW, y + 4, { align: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center' });
        });
        y += 8;
      }
    }
    y += 5;
  }

  pdfFooter(doc, pageW, pageH, M, C);
  doc.save(data.titre.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') + '.pdf');
}
