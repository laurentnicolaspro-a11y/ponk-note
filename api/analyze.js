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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    } catch {
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }
    const audioBase64 = audioFile.data.toString('base64');

    // ── APPEL 1 : Transcription brute ──
    let transcriptResult;
    try {
      transcriptResult = await model.generateContent([
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      { text: `Transcris cet audio mot par mot en français. 
Sois fidèle à ce qui est dit, garde les hésitations naturelles.
Si l'audio est dans une autre langue, traduis en français.
Réponds UNIQUEMENT avec le texte transcrit, sans commentaire, sans introduction.` }
    ]);

    } catch {
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      transcriptResult = await model.generateContent([
        { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
        { text: 'Transcris cet audio mot par mot en français. Réponds UNIQUEMENT avec le texte transcrit.' }
      ]);
    }
    const transcript = transcriptResult.response.text().trim();

    // ── APPEL 2 : Analyse structurée ──
    const analysisPrompt = `Tu es un assistant intelligent qui analyse des retranscriptions audio et en extrait les informations utiles.
IMPORTANT : Réponds OBLIGATOIREMENT en FRANÇAIS.

Contexte : ${title ? 'Titre : ' + title + '.' : ''} ${duration ? 'Durée : ' + duration + '.' : ''} ${datetime ? 'Date : ' + datetime + '.' : ''}

Voici la transcription :
"""
${transcript}
"""

Détecte automatiquement quels types de contenu sont présents parmi :
REUNION, COURSES, CHANTIER, IDEES, DEPLACEMENT, FINANCE, APPEL, MEDICAL, COURS, MEMO

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks.

{
  "modes": ["MODE1", "MODE2"],
  "summary": "Résumé général en 2-3 phrases en français",
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

Règles :
- Ne mets que les sections correspondant aux modes détectés
- Tout en français
- Réponds UNIQUEMENT avec le JSON`;

    let analysisResult;
    try {
      analysisResult = await model.generateContent(analysisPrompt);
    } catch {
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      analysisResult = await model.generateContent(analysisPrompt);
    }
    const rawText = analysisResult.response.text();
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { modes: ['MEMO'], summary: clean, memo: { notes: clean } };
    }

    // Ajoute la transcription au résultat
    parsed.transcript = transcript;

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('[analyze] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
