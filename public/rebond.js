// ── Rebond ──
let rebondContexte = {};
let rebondEnCours = false;
let rebondDepuisRebond = false;

function getVilleUtilisateur() {
  return localStorage.getItem('ponk_ville') || '';
}

async function declencherRebond(actionFaite, contexte, texteResume) {
  if (rebondEnCours) return;
  if (rebondDepuisRebond) { rebondDepuisRebond = false; return; }
  rebondEnCours = true;

  rebondContexte = { actionFaite, contexte };
  document.getElementById('rebondResumeText').textContent = texteResume;
  document.getElementById('rebondSuggestions').style.display = 'none';
  document.getElementById('rebondBtns').innerHTML = '';
  document.getElementById('rebondModal').classList.remove('hidden');

  try {
    const ville = getVilleUtilisateur();
    const contexteEnrichi = contexte + (ville ? ', ville utilisateur: ' + ville : '');
    const res = await fetch('/api/shopping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rebond', actionFaite, contexte: contexteEnrichi, text: actionFaite })
    });
    const data = await res.json();
    const rebonds = data.rebonds || [];

    if (rebonds.length === 0) return;

    document.getElementById('rebondModal').classList.remove('hidden');
    document.getElementById('rebondSuggestions').style.display = 'block';
    // Mapping SVG icons par type (même style que les bulles action)
    const REBOND_SVG = {
      'EMAIL':       `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>`,
      'APPEL':       `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.61 5.61l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
      'WHATSAPP':    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      'CALENDRIER':  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
      'MAPS':        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
      'RESERVATION': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/><path d="M12 12v5M9.5 14.5h5"/></svg>`,
      'COMMANDE':    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
      'RECHERCHE':   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
      'ANALYSE':     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      'RAPPEL':      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
      'FINANCE':     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>`,
    };

    document.getElementById('rebondBtns').innerHTML = rebonds.map((r, i) => `
      <button data-idx="${i}" style="
        display:flex; align-items:center; gap:14px;
        padding:14px 16px; border-radius:14px; width:100%;
        background:rgba(0,220,255,0.05);
        border:1px solid rgba(0,220,255,0.15);
        font-family:inherit; cursor:pointer; text-align:left;
        -webkit-tap-highlight-color:transparent;
        transition:background 0.15s, border-color 0.15s;">
        <span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:rgba(0,220,255,0.08);border:1px solid rgba(0,220,255,0.2);flex-shrink:0;filter:drop-shadow(0 0 5px rgba(0,220,255,0.4))">${REBOND_SVG[r.type] || r.icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:3px">${r.label}</div>
          <div style="font-size:11px;color:rgba(0,220,255,0.5)">${r.raison}</div>
        </div>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(0,220,255,0.5)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('');

    window._rebondsList = rebonds;
    document.querySelectorAll('#rebondBtns button').forEach(btn => {
      btn.addEventListener('mouseover', () => {
        btn.style.background = 'rgba(0,220,255,0.1)';
        btn.style.borderColor = 'rgba(0,220,255,0.35)';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background = 'rgba(0,220,255,0.05)';
        btn.style.borderColor = 'rgba(0,220,255,0.15)';
      });
      btn.addEventListener('click', () => {
        const r = window._rebondsList[parseInt(btn.dataset.idx)];
        lancerRebond(r.type, r.texte);
      });
    });

  } catch(e) {
    console.log('[rebond] erreur:', e.message);
  } finally {
    rebondEnCours = false;
  }
}

function lancerRebond(type, texte) {
  document.getElementById('rebondModal').classList.add('hidden');
  rebondEnCours = false;
  rebondDepuisRebond = true;
  if (type === 'CALENDRIER')       showCalendrierModal(texte);
  else if (type === 'RESERVATION') showReservationModal(texte);
  else if (type === 'MAPS')        showMapsModal(texte);
  else if (type === 'COMMANDE')    showCommandeModal(texte);
  else if (type === 'ANALYSE')     showAnalyseModal(texte);
  else if (type === 'WHATSAPP')    showWhatsAppModal('', texte);
  else if (type === 'RECHERCHE')   window.open('https://www.google.com/search?q=' + encodeURIComponent(texte), '_blank');
  else if (type === 'APPEL')       showCallModal('', texte);
  else if (type === 'EMAIL') {
    const sujet = encodeURIComponent(texte);
    const prefMail = localStorage.getItem('ponk_pref_mail') || 'gmail';
    const urls = {
      gmail:   `https://mail.google.com/mail/?view=cm&fs=1&su=${sujet}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?subject=${sujet}`,
      yahoo:   `https://compose.mail.yahoo.com/?subject=${sujet}`
    };
    window.open(urls[prefMail] || urls.gmail, '_blank');
  }
}

function fermerRebond() {
  document.getElementById('rebondModal').classList.add('hidden');
  rebondEnCours = false;
}
