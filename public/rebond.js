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
    document.getElementById('rebondBtns').innerHTML = rebonds.map((r, i) => `
      <button data-idx="${i}" style="
        display:flex; align-items:center; gap:14px;
        padding:14px 16px; border-radius:14px; width:100%;
        background:rgba(0,220,255,0.05);
        border:1px solid rgba(0,220,255,0.15);
        font-family:inherit; cursor:pointer; text-align:left;
        -webkit-tap-highlight-color:transparent;
        transition:background 0.15s, border-color 0.15s;">
        <span style="font-size:22px;filter:drop-shadow(0 0 5px rgba(0,220,255,0.5));flex-shrink:0">${r.icon}</span>
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
