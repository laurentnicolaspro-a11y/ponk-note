// ── pdf.js — Ponk Note ──

const PDF_C = {
  accent:      [30, 30, 30],
  accentDark:  [0, 0, 0],
  accentLight: [210, 210, 210],
  dark:        [20, 20, 20],
  muted:       [100, 100, 100],
  light:       [245, 245, 245],
  white:       [255, 255, 255],
  sectionBg:   [230, 230, 230],
  sectionBdr:  [160, 160, 160],
  blockBg:     [252, 252, 252],
  blockBdr:    [190, 190, 190],
  detail:      [90, 90, 90],
  ideeline:    [180, 180, 180],
  ideelabel:   [40, 40, 40],
  ideetext:    [50, 50, 50],
  ideetick:    [120, 120, 120],
  footerbg:    [240, 240, 240],
};


// ── Audiowide font (OFL licence) ──
const AUDIOWIDE_B64 =  + b64 + ;

function loadAudiowide(doc) {
  doc.addFileToVFS('Audiowide-Regular.ttf', AUDIOWIDE_B64);
  doc.addFont('Audiowide-Regular.ttf', 'Audiowide', 'normal');
}

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
  loadAudiowide(doc);

  // Barre noire
  const barH = 24;
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageW, barH, 'F');

  // "PONK NOTE" en Audiowide blanc, ancré en bas de la barre
  doc.setFont('Audiowide', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('PONK NOTE', M, barH - 5);

  // Ligne de séparation fine sous la barre
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(0, barH, pageW, barH);

  // Titre du document en Inter (helvetica) sous la barre
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  const tl = doc.splitTextToSize(titre, pageW - M * 2);
  doc.text(tl, M, barH + 9);
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
  doc.setFillColor(200, 200, 200); doc.roundedRect(M + 0.6, bY + 0.6, maxW, totH, 2.5, 2.5, 'F');
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
  y = 38;

  const meta = pdf.meta || {};
  const metaItems = [
    { label: 'Date',         val: meta.date        || '-' },
    { label: 'Lieu',         val: meta.lieu        || '-' },
    { label: 'Duree',        val: meta.duree       || '-' },
    { label: 'Participants', val: meta.participants || '-' },
  ];
  doc.setFillColor(200, 200, 200); doc.roundedRect(M + 0.8, y + 0.8, maxW, 30, 3, 3, 'F');
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
  y = 38;
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
          doc.setFillColor(210, 210, 210); doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.2);
          doc.rect(M + ci * cW, y, cW, cellH, 'FD');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(20, 20, 20);
          doc.text(doc.splitTextToSize(String(col), cW - 3)[0], M + ci * cW + 2, y + 4.5);
        });
        y += cellH;
        v.lignes.forEach((row, ri) => {
          checkPage(cellH + 2);
          row.forEach((cell, ci) => {
            doc.setFillColor(ri % 2 === 0 ? 252 : 242, ri % 2 === 0 ? 252 : 242, ri % 2 === 0 ? 252 : 242);
            doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.2);
            doc.rect(M + ci * cW, y, cW, cellH, 'FD');
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(20, 20, 20);
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
          doc.setFillColor(220, 220, 220); doc.roundedRect(M + lW + 2, y + 1, bW, barH - 2, 1, 1, 'F');
          doc.setFillColor(...C.accent); doc.roundedRect(M + lW + 2, y + 1, Math.max(2, bW * ratio), barH - 2, 1, 1, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.accent);
          doc.text(String(v.valeurs[i]) + (v.unite ? ' ' + v.unite : ''), M + lW + bW + 5, y + 5);
          y += barH + 2;
        });
        y += 4;
      } else if (v.type === 'camembert' && v.labels && v.valeurs) {
        const colors = [[30,30,30],[90,90,90],[150,150,150],[50,50,50],[120,120,120],[180,180,180]];
        const total = v.valeurs.reduce((a, b) => a + b, 0);
        const iW = maxW / 2;
        v.labels.forEach((label, i) => {
          if (i % 2 === 0) checkPage(10);
          const px = M + (i % 2) * iW, py = y + Math.floor(i / 2) * 9;
          doc.setFillColor(...colors[i % colors.length]); doc.circle(px + 3, py + 3, 2.5, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.dark);
          doc.text(label, px + 8, py + 4.5);
          doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.muted);
          doc.text(Math.round((v.valeurs[i] / total) * 100) + '%', px + iW - 12, py + 4.5);
        });
        y += Math.ceil(v.labels.length / 2) * 9 + 4;
      } else if (v.type === 'courbe' && v.labels && v.valeurs) {
        const cH = 30, n = v.valeurs.length;
        const max = Math.max(...v.valeurs), min = Math.min(...v.valeurs), range = max - min || 1;
        checkPage(cH + 20);
        doc.setFillColor(242, 242, 242); doc.setDrawColor(...C.blockBdr); doc.setLineWidth(0.2);
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

async function exportPDF() {
  const jsPDF = await loadJsPDF();
  const C = PDF_C;

  // Cases cochées
  const checked = {};
  document.querySelectorAll('.export-cb:checked').forEach(cb => {
    checked[cb.dataset.exportLabel] = decodeURIComponent(cb.dataset.exportContent || '');
  });

  let data = JSON.parse(localStorage.getItem('ponk_result')||'{}');
  const meta = JSON.parse(localStorage.getItem('ponk_meta')||'{}');
  let s = (typeof data.summary === 'object') ? data.summary : null;

  // Gemini relit avant export
  const pdfBtn = document.querySelector('.btn-pdf');
  if (pdfBtn) { pdfBtn.textContent = '⏳ Gemini relit…'; pdfBtn.disabled = true; }
  console.log('[PDF] Envoi à Gemini pour relecture...');
  console.log('[PDF] checked keys:', Object.keys(checked));
  console.log('[PDF] prochaine:', checked['prochaine']);
  console.log('[PDF] s.prochaine_etape:', s?.prochaine_etape);

  try {
    // Construire uniquement les éléments cochés pour Gemini
    const summaryToSend = {};
    if (checked['contexte']) summaryToSend.contexte = s.contexte;
    if (checked['resume']) summaryToSend.resume = s.resume;
    const checkedPoints = (s.points_discutes||[]).filter((p,i) => checked['point:'+i] !== undefined);
    if (checkedPoints.length) summaryToSend.points_discutes = checkedPoints;
    const checkedDecisions = (s.decisions||[]).filter((d,i) => checked['decision:'+i] !== undefined);
    if (checkedDecisions.length) summaryToSend.decisions = checkedDecisions;
    if (checked['prochaine'] && s.prochaine_etape) summaryToSend.prochaine_etape = s.prochaine_etape;

    // Actions IA cochées — nettoyer les descriptions
    const actionsIACochees = Object.entries(checked)
      .filter(([k]) => k.startsWith('action_ia:') || k.startsWith('action_ia_done:'))
      .map(([, v]) => decodeURIComponent(v));
    if (actionsIACochees.length) summaryToSend.actions_ia = actionsIACochees;

    // Mémo coché
    const memoNotesCochees = checked['memo_notes'] ? decodeURIComponent(checked['memo_notes']) : '';
    if (memoNotesCochees) summaryToSend.memo = memoNotesCochees;

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rewrite: true,
        summary: summaryToSend,
        transcript: data.transcript || ''
      })
    });

    if (res.ok) {
      const result = await res.json();
      console.log('[PDF rewrite] Résultat Gemini:', JSON.stringify(result).substring(0, 500));
      if (result && s) {
        // Appliquer uniquement les champs cochés, sans inventer
        if (result.contexte && checked['contexte']) s.contexte = result.contexte;
        if (result.resume && checked['resume']) s.resume = result.resume;
        if (result.points_discutes?.length && checkedPoints.length) {
          // Remplacer seulement les points cochés, garder les non cochés
          let pi = 0;
          s.points_discutes = (s.points_discutes||[]).map((p,i) =>
            checked['point:'+i] !== undefined ? (result.points_discutes[pi++] || p) : p
          );
        }
        if (result.decisions?.length && checkedDecisions.length) {
          let di = 0;
          s.decisions = (s.decisions||[]).map((d,i) =>
            checked['decision:'+i] !== undefined ? (result.decisions[di++] || d) : d
          );
        }
        if (result.prochaine_etape && checked['prochaine']) s.prochaine_etape = result.prochaine_etape;

        // Appliquer corrections actions IA
        if (result.actions_ia?.length) {
          const cards = document.querySelectorAll('.action-ia-info .action-ia-desc');
          const checkboxes = document.querySelectorAll('.export-cb[data-export-label^="action_ia"]');
          result.actions_ia.forEach((corrected, i) => {
            if (cards[i]) cards[i].textContent = corrected.replace(/^[^—]+— /, '');
            if (checkboxes[i]) checkboxes[i].dataset.exportContent = encodeURIComponent(corrected);
          });
        }

        // Appliquer correction mémo
        if (result.memo) {
          const memoArea = document.getElementById('memoNotesArea');
          const memoCb = document.getElementById('ecb_memo_notes');
          if (memoArea) memoArea.value = result.memo;
          if (memoCb) memoCb.dataset.exportContent = encodeURIComponent(result.memo);
        }

        saveSummary(s);
        renderSummary(s);
      }
    }
  } catch(e) { 
    console.warn('Gemini relit échoué, export sans relecture:', e);
  } finally {
    if (pdfBtn) { pdfBtn.textContent = '↓ Exporter en PDF'; pdfBtn.disabled = false; }
  }

  // Reconstruire checked après relecture pour avoir les valeurs corrigées
  document.querySelectorAll('.export-cb:checked').forEach(cb => {
    checked[cb.dataset.exportLabel] = decodeURIComponent(cb.dataset.exportContent || '');
  });
  // Lire le mémo directement depuis le textarea
  const memoAreaFinal = document.getElementById('memoNotesArea');
  if (memoAreaFinal && memoAreaFinal.value) {
    checked['memo_notes'] = memoAreaFinal.value;
  }

  data = JSON.parse(localStorage.getItem('ponk_result')||'{}');
  s = (typeof data.summary === 'object') ? data.summary : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16, maxW = pageW - M * 2;
  let y = M;
  const checkPage = (n = 10) => { if (y + n > pageH - 14) { doc.addPage(); y = M; } };

  // Titre du bandeau
  const titre = meta.title || 'Compte-rendu';
  pdfBandeau(doc, titre, pageW, M, C);
  y = 38;

  // Sous-titre date + durée
  if (meta.datetime || meta.duration) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted);
    doc.text((meta.datetime||'') + (meta.duration ? ' · ' + meta.duration : ''), M, y);
    y += 8;
  }

  // ── CONTEXTE ──
  if (s && checked['contexte'] && s.contexte) {
    checkPage(16);
    doc.setFillColor(...C.sectionBg); doc.setDrawColor(...C.sectionBdr); doc.setLineWidth(0.2);
    doc.roundedRect(M, y, maxW, 12, 2.5, 2.5, 'FD');
    doc.setFillColor(...C.accent); doc.roundedRect(M, y, 3.5, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.accentDark);
    const ctxL = doc.splitTextToSize(s.contexte, maxW - 10);
    doc.text(ctxL, M + 7, y + 7.5);
    y += 18;
  }

  // ── RÉSUMÉ ──
  if (s && checked['resume'] && s.resume) {
    checkPage(20);
    pdfSectionHeader(doc, 'Résumé', null, y, M, maxW, C);
    y += 13;
    const resumeL = doc.splitTextToSize(s.resume, maxW - 12);
    const resumeH = resumeL.length * 5.2 + 8;
    pdfBlock(doc, resumeL, [], y, M, maxW, resumeH, C);
    y += resumeH + 6;
  }

  // ── POINTS DISCUTÉS ──
  const points = s ? (s.points_discutes||[]).filter((p,i) => checked['point:'+i] !== undefined) : [];
  if (points.length) {
    checkPage(22);
    pdfSectionHeader(doc, 'Points discutés', null, y, M, maxW, C);
    y += 13;
    for (const p of points) {
      checkPage(12);
      const pL = doc.splitTextToSize('— ' + p, maxW - 12);
      const pH = pL.length * 5.2 + 6;
      pdfBlock(doc, pL, [], y, M, maxW, pH, C);
      y += pH + 4;
    }
    y += 4;
  }

  // ── DÉCISIONS ──
  const decisions = s ? (s.decisions||[]).filter((d,i) => checked['decision:'+i] !== undefined) : [];
  if (decisions.length) {
    checkPage(22);
    pdfSectionHeader(doc, 'Décisions', null, y, M, maxW, C);
    y += 13;
    for (const d of decisions) {
      checkPage(12);
      const dL = doc.splitTextToSize('✓ ' + d, maxW - 12);
      const dH = dL.length * 5.2 + 6;
      doc.setFillColor(230, 230, 230); doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
      doc.roundedRect(M, y, maxW, dH, 2.5, 2.5, 'FD');
      doc.setFillColor(60, 60, 60); doc.roundedRect(M, y, 3.5, dH, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      const dLclean = dL.map(l => l.replace(/^✓ /, '+ '));
      doc.text(dLclean, M + 7, y + 6);
      y += dH + 4;
    }
    y += 4;
  }

  // ── ACTIONS ──
  const actions = s ? (s.actions||[]).filter(a => checked['action:'+(a.qui||'?')+':'+(a.quoi||'')]) : [];
  if (actions.length) {
    checkPage(22);
    pdfSectionHeader(doc, 'Actions', null, y, M, maxW, C);
    y += 13;
    const colQui = 40, colQuand = 32, colQuoi = maxW - colQui - colQuand;
    doc.setFillColor(30, 30, 30); doc.rect(M, y, maxW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.white);
    doc.text('QUI', M + 3, y + 4.8);
    doc.text('QUOI', M + colQui + 3, y + 4.8);
    doc.text('QUAND', M + colQui + colQuoi + 3, y + 4.8);
    y += 7;
    actions.forEach((a, i) => {
      checkPage(10);
      const rowH = 9;
      doc.setFillColor(i%2===0 ? 252 : 242, i%2===0 ? 252 : 242, i%2===0 ? 252 : 242);
      doc.setDrawColor(...C.blockBdr); doc.setLineWidth(0.15);
      doc.rect(M, y, maxW, rowH, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.accent);
      doc.text(doc.splitTextToSize(a.qui || 'À définir', colQui - 4)[0], M + 3, y + 5.8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.dark);
      doc.text(doc.splitTextToSize(a.quoi || '', colQuoi - 4)[0], M + colQui + 3, y + 5.8);
      doc.setFont('helvetica', 'italic'); doc.setTextColor(...C.muted);
      doc.text(doc.splitTextToSize(a.quand || '', colQuand - 4)[0], M + colQui + colQuoi + 3, y + 5.8);
      y += rowH;
    });
    y += 8;
  }

  // ── PROCHAINE ÉTAPE ──
  if (s && checked['prochaine'] && s.prochaine_etape) {
    checkPage(18);
    pdfSectionHeader(doc, 'Prochaine étape', null, y, M, maxW, C);
    y += 13;
    const pL = doc.splitTextToSize(s.prochaine_etape, maxW - 12);
    const pH = pL.length * 5.2 + 8;
    doc.setFillColor(238, 238, 238); doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.2);
    doc.roundedRect(M, y, maxW, pH, 2.5, 2.5, 'FD');
    doc.setFillColor(80, 80, 80); doc.roundedRect(M, y, 3.5, pH, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
    doc.text(pL, M + 7, y + 6);
    y += pH + 8;
  }

  // ── MÉMO ──
  const memoRappels = Object.entries(checked).filter(([k]) => k === 'memo_rappel');
  const memoNotes = checked['memo_notes'] || '';
  if (memoRappels.length || memoNotes) {
    checkPage(22);
    pdfSectionHeader(doc, 'Mémo', null, y, M, maxW, C);
    y += 13;
    for (const [, v] of memoRappels) {
      checkPage(12);
      const rL = doc.splitTextToSize('• ' + v, maxW - 12);
      const rH = rL.length * 5.2 + 6;
      pdfBlock(doc, rL, [], y, M, maxW, rH, C);
      y += rH + 4;
    }
    if (memoNotes) {
      checkPage(16);
      const nL = doc.splitTextToSize(memoNotes, maxW - 12);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.muted);
      nL.forEach(line => { doc.text(line, M + 4, y); y += 5; });
      y += 4;
    }
    y += 4;
  }

  // ── ACTIONS IA ──
  const actionsIA = Object.entries(checked).filter(([k]) => k.startsWith('action_ia:') && !k.startsWith('action_ia_done:'));
  const actionsIADone = Object.entries(checked).filter(([k]) => k.startsWith('action_ia_done:'));
  const allActionsIA = [...actionsIA, ...actionsIADone];

  if (allActionsIA.length) {
    checkPage(22);
    pdfSectionHeader(doc, 'Actions IA', null, y, M, maxW, C);
    y += 13;
    for (const [k, v] of allActionsIA) {
      checkPage(12);
      const isDone = k.startsWith('action_ia_done:');
      const aL = doc.splitTextToSize(v, maxW - 12);
      const aH = aL.length * 5.2 + 6;
      if (isDone) {
        doc.setFillColor(225, 225, 225); doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
        doc.roundedRect(M, y, maxW, aH, 2.5, 2.5, 'FD');
        doc.setFillColor(60, 60, 60); doc.roundedRect(M, y, 3.5, aH, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
        doc.text(aL, M + 7, y + 6);
      } else {
        pdfBlock(doc, aL, [], y, M, maxW, aH, C);
      }
      y += aH + 4;
    }
    y += 4;
  }

  // ── TRANSCRIPTION ──
  if (checked['transcript']) {
    checkPage(22);
    pdfSectionHeader(doc, 'Transcription', null, y, M, maxW, C);
    y += 13;
    const tL = doc.splitTextToSize(checked['transcript'], maxW - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted);
    for (const line of tL) {
      checkPage(6);
      doc.text(line, M + 4, y);
      y += 5;
    }
  }

  pdfFooter(doc, pageW, pageH, M, C, 'Généré par Ponk Note · ' + new Date().toLocaleDateString('fr-FR'));
  doc.save((meta.title||'ponk-note').replace(/[^a-z0-9\s]/gi,'').trim().replace(/\s+/g,'_') + '-' + new Date().toISOString().slice(0,10) + '.pdf');
}
