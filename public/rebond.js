// ── Rebond ──
// Le rebond se déclenche UNIQUEMENT sur un vrai clic utilisateur
// Jamais automatiquement à l'ouverture d'une modal

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
    document.getElementById('rebondBtns').innerHTML = rebonds.map((r, i) => `
      <button data-idx="${i}"
        style="display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:12px;border:1.5px solid rgba(74,127,212,0.2);background:rgba(255,255,255,0.6);font-family:inherit;cursor:pointer;text-align:left;width:100%;-webkit-tap-highlight-color:transparent">
        <span style="font-size:24px">${r.icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${r.label}</div>
          <div style="font-size:11px;color:var(--muted)">${r.raison}</div>
        </div>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a7fd4" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('');

    window._rebondsList = rebonds;
    document.querySelectorAll('#rebondBtns button').forEach(btn => {
      btn.addEventListener('mouseover', () => btn.style.background = 'rgba(255,255,255,0.95)');
      btn.addEventListener('mouseout',  () => btn.style.background = 'rgba(255,255,255,0.6)');
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
