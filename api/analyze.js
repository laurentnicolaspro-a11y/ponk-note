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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const audioBase64 = audioFile.data.toString('base64');

    const prompt = `Tu es un assistant intelligent qui analyse des enregistrements audio et en extrait les informations utiles.

IMPORTANT : Réponds OBLIGATOIREMENT en FRANÇAIS, quelle que soit la langue de l'audio.

Contexte : ${title ? 'Titre : ' + title + '.' : ''} ${duration ? 'Durée : ' + duration + '.' : ''} ${datetime ? 'Date : ' + datetime + '.' : ''}

Analyse cet audio et détecte automatiquement quels types de contenu sont présents parmi cette liste :
- REUNION : réunion professionnelle ou personnelle avec plusieurs personnes
- COURSES : liste de courses ou d'achats à faire
- CHANTIER : travaux, construction, rénovation, matériaux
- IDEES : brainstorming, idées, réflexions personnelles
- DEPLACEMENT : lieux, adresses, rendez-vous, déplacements
- FINANCE : montants, devis, dépenses, budget
- APPEL : compte-rendu d'appel téléphonique
- MEDICAL : santé, médicaments, symptômes, rendez-vous médical
- COURS : notes de cours, formation, apprentissage
- MEMO : note personnelle, rappel, mémo divers

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks.

Structure JSON :
{
  "modes": ["MODE1", "MODE2"],
  "summary": "Résumé général en 2-3 phrases en français",
  "reunion": {
    "participants": ["Nom 1", "Nom 2"],
    "decisions": ["Décision 1"],
    "actions": ["Action 1 — Responsable si mentionné"],
    "prochaine": "Date ou info sur la prochaine réunion si mentionnée"
  },
  "courses": {
    "items": [{"nom": "Article", "quantite": "2", "fait": false}]
  },
  "chantier": {
    "lieu": "Adresse ou description du lieu",
    "materiaux": [{"nom": "Matériau", "quantite": "10m²"}],
    "artisans": ["Nom — métier"],
    "budget": "Montant si mentionné",
    "planning": ["Étape 1", "Étape 2"]
  },
  "idees": {
    "liste": ["Idée 1", "Idée 2"],
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
    "sujet": "Sujet de l'appel",
    "suite": ["Action à faire suite à l'appel"]
  },
  "medical": {
    "medicaments": [{"nom": "Médicament", "dosage": "Dosage"}],
    "symptomes": ["Symptôme"],
    "rdv": "Date/lieu du rdv si mentionné"
  },
  "cours": {
    "matiere": "Matière ou sujet",
    "pointsCles": ["Point clé 1"],
    "aRetenir": ["Définition ou formule importante"],
    "questions": ["Question à poser"]
  },
  "memo": {
    "rappels": ["Rappel 1"],
    "notes": "Note libre"
  }
}

Règles :
- Ne mets que les sections correspondant aux modes détectés
- Les sections non pertinentes peuvent être omises ou avoir des tableaux vides
- Toujours remplir "modes" et "summary"
- Tout en français
- Réponds UNIQUEMENT avec le JSON`;

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      { text: prompt }
    ]);

    const rawText = result.response.text();
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { modes: ['MEMO'], summary: rawText, memo: { notes: rawText } };
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('[analyze] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
