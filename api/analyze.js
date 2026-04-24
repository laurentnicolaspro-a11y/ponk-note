const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'No boundary' });

    const boundary = '--' + boundaryMatch[1];
    const parts = body.toString('binary').split(boundary);
    const fields = {};
    const files = {};

    for (const part of parts) {
      if (part === '--\r\n' || part.trim() === '--') continue;
      const [rawHeaders, ...bodyParts] = part.split('\r\n\r\n');
      if (!rawHeaders) continue;
      const bodyStr = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '');
      const nameMatch = rawHeaders.match(/name="([^"]+)"/);
      const filenameMatch = rawHeaders.match(/filename="([^"]+)"/);
      if (!nameMatch) continue;
      if (filenameMatch) {
        files[nameMatch[1]] = { filename: filenameMatch[1], data: Buffer.from(bodyStr, 'binary') };
      } else {
        fields[nameMatch[1]] = bodyStr.trim();
      }
    }

    const audioFile = files['audio'];
    if (!audioFile) return res.status(400).json({ error: 'Aucun fichier audio reçu' });

    const title    = fields['title']    || '';
    const duration = fields['duration'] || '';
    const datetime = fields['datetime'] || '';
    const bubbles  = JSON.parse(fields['bubbles'] || '[]');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const audioSizeMB = audioFile.data.length / (1024 * 1024);
    const timeoutMs = Math.max(30000, Math.min(120000, audioSizeMB * 10000));
    console.log('[analyze] audio size:', audioSizeMB.toFixed(1), 'MB, timeout:', timeoutMs/1000, 's');

    async function tryGenerate(content_arg) {
      const _models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
      for (const _mn of _models) {
        try {
          const _m = genAI.getGenerativeModel({ model: _mn });
          const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
          const _r = await Promise.race([_m.generateContent(content_arg), _t]);
          return _r;
        } catch(e) { console.log('[analyze fallback]', _mn, 'failed:', e.message); }
      }
      throw new Error('All models failed');
    }

    // ── APPEL 1 : Transcription brute ──
    let transcriptResult;
    try {
      transcriptResult = await tryGenerate([
        { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
        { text: `Transcris cet audio mot par mot en français. Sois fidèle à ce qui est dit. Réponds UNIQUEMENT avec le texte transcrit, sans commentaire.` }
      ]);
    } catch(e) { throw e; }
    const audioBase64 = audioFile.data.toString('base64');
    const transcript = transcriptResult.response.text().trim();

    // ── APPEL 2 : Analyse structurée ──
    const analysisPrompt = `Tu es un assistant intelligent qui analyse des retranscriptions audio et en extrait les informations utiles.
IMPORTANT : Réponds OBLIGATOIREMENT en FRANÇAIS.

Contexte : ${title ? 'Titre : ' + title + '.' : ''} ${duration ? 'Durée : ' + duration + '.' : ''} ${datetime ? 'Date : ' + datetime + '.' : ''}
${bubbles.length > 0 ? `
Actions identifiées par l'utilisateur pendant l'enregistrement :
${bubbles.map(b => `- ${b.type} : "${b.text}"`).join('\n')}
` : ''}

Voici la transcription :
"""
${transcript}
"""

Détecte automatiquement quels types de contenu sont présents parmi :
REUNION, COURSES, CHANTIER, IDEES, DEPLACEMENT, FINANCE, APPEL, MEDICAL, COURS, MEMO

REUNION s'applique dès que : plusieurs personnes sont mentionnées OU un sujet professionnel/collectif est discuté OU des décisions/actions sont attribuées à des personnes.

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks.

{
  "modes": ["MODE1", "MODE2"],

  "summary": {
    "contexte": "Une phrase : qui, sujet, durée si connue. Ex: Réunion budget Q3 avec Jean et Marie, 45 minutes.",
    "points_discutes": ["Point 1", "Point 2"],
    "decisions": ["Décision 1", "Décision 2"],
    "actions": [
      { "qui": "Prénom si prononcé dans l'audio, sinon chaîne vide", "quoi": "Action claire et concrète", "quand": "Délai si mentionné, sinon chaîne vide" }
    ],
    "prochaine_etape": "Prochaine réunion ou deadline si mentionnée, sinon chaîne vide"
  },

  "reunion": {
    "participants": ["Nom 1"],
    "decisions": ["Décision 1"],
    "actions": ["Action 1 — Responsable si mentionné"],
    "prochaine": "Info prochaine réunion si mentionnée"
  },
  "courses": {
    "items": [{"nom": "Article", "quantite": "2", "fait": false}]
  },
  "chantier": {
    "lieu": "Adresse ou description",
    "materiaux": [{"nom": "Matériau", "quantite": "10m²"}],
    "artisans": ["Nom — métier"],
    "budget": "Montant si mentionné",
    "planning": ["Étape 1"]
  },
  "idees": {
    "liste": ["Idée 1"],
    "aApprofondir": ["Sujet à creuser"]
  },
  "deplacement": {
    "lieux": [{"nom": "Nom du lieu", "adresse": "Adresse complète si possible"}],
    "horaires": ["Info horaire"],
    "personnes": ["Personne à rencontrer"]
  },
  "finance": {
    "montants": [{"description": "Quoi", "montant": "Combien"}],
    "total": "Total si calculable"
  },
  "appel": {
    "interlocuteur": "Nom",
    "sujet": "Sujet",
    "suite": ["Action à faire"]
  },
  "medical": {
    "medicaments": [{"nom": "Médicament", "dosage": "Dosage"}],
    "symptomes": ["Symptôme"],
    "rdv": "Date/lieu si mentionné"
  },
  "cours": {
    "matiere": "Matière ou sujet",
    "pointsCles": ["Point clé 1"],
    "aRetenir": ["Définition importante"],
    "questions": ["Question à poser"]
  },
  "memo": {
    "rappels": ["Rappel 1"],
    "notes": "Note libre"
  }
}

Règles pour summary :
- "contexte" : toujours rempli, même pour un mémo solo ("Note personnelle de [prénom si connu], durée X")
- "points_discutes" : les sujets abordés, 1 à 6 éléments maximum
- "decisions" : uniquement ce qui a été acté/décidé. Si rien → tableau vide []
- "actions.qui" : UNIQUEMENT si un prénom est explicitement prononcé dans l'audio. Sinon "". Ne devine jamais.
- "actions.quand" : UNIQUEMENT si un délai est explicitement mentionné. Sinon "".
- "prochaine_etape" : si rien mentionné → ""

Règles générales :
- Ne mets que les sections correspondant aux modes détectés
- Tout en français
- Réponds UNIQUEMENT avec le JSON

Détecte aussi les ACTIONS IA dans la transcription et ajoute-les dans "actions_ia" :
Types possibles : EMAIL, WHATSAPP, CALENDRIER, MAPS, RAPPEL, RECHERCHE, COMMANDE

"actions_ia": [
  {
    "type": "EMAIL",
    "icone": "📧",
    "titre": "Mail à Xavier",
    "description": "Commander 5 tapis rouges",
    "destinataire": "Xavier",
    "sujet": "Commander 5 tapis rouges",
    "corps": "Bonjour Xavier,\\n\\nSuite à notre réunion, pourrais-tu commander 5 tapis rouges ?\\n\\nMerci,\\n[Votre nom]"
  },
  {
    "type": "WHATSAPP",
    "icone": "💬",
    "titre": "WhatsApp à Paul",
    "description": "On est en retard de 10 minutes",
    "message": "Bonjour Paul, on est en retard d'environ 10 minutes."
  },
  {
    "type": "CALENDRIER",
    "icone": "📅",
    "titre": "Réunion vendredi",
    "description": "Réunion équipe à 14h",
    "evenement": "Réunion équipe",
    "date": "vendredi",
    "heure": "14:00",
    "duree": "1h"
  },
  {
    "type": "MAPS",
    "icone": "🗺️",
    "titre": "Aller chez le fournisseur",
    "description": "Rue de la Paix, Paris",
    "adresse": "Rue de la Paix, Paris"
  },
  {
    "type": "RAPPEL",
    "icone": "🔔",
    "titre": "Vérifier la facture EDF",
    "description": "Ne pas oublier avant vendredi",
    "texte": "Vérifier la facture EDF avant vendredi"
  },
  {
    "type": "RECHERCHE",
    "icone": "🔍",
    "titre": "Prix carreaux 60x60",
    "description": "Trouver le meilleur prix",
    "query": "prix carreaux 60x60 pas cher"
  },
  {
    "type": "COMMANDE",
    "icone": "🛒",
    "titre": "Commander 5 tapis rouges",
    "description": "Trouver sur Amazon ou Google Shopping",
    "query": "5 tapis rouges 60x60"
  }
]

Règles STRICTES pour les actions_ia :
- Ne détecte une action que si quelqu'un exprime clairement une INTENTION de faire quelque chose
- Une QUESTION n'est PAS une action
- Une information mentionnée en passant n'est PAS une action
- Si tu génères une action ANALYSE sur un sujet, ne génère PAS de RECHERCHE sur le même sujet
- Maximum 3 actions par transcription
- Si aucune action claire n'est détectée, mets "actions_ia": []`;

    const analysisResult = await tryGenerate(analysisPrompt);
    const rawText = analysisResult.response.text();
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        modes: ['MEMO'],
        summary: {
          contexte: '',
          points_discutes: [],
          decisions: [],
          actions: [],
          prochaine_etape: ''
        },
        memo: { notes: clean }
      };
    }

    parsed.transcript = transcript;
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('[analyze] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
