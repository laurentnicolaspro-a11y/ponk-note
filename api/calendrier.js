const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
      });
      body = JSON.parse(Buffer.concat(chunks).toString());
    }

    const { text, datetime, action, answers } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    let prompt = '';

    if (action === 'deepanalyze') {
      // Deep analysis inline (from results.html)
      prompt = `Tu es un expert analyste. Fais une analyse complète et structurée sur le sujet suivant :

"${text}"

Format de réponse en français, structuré avec des sections claires :
- Commence par un résumé en 2-3 phrases
- Développe en 3-5 points clés avec des titres en gras
- Termine par une conclusion ou recommandation
- Sois factuel, précis et utile
- Maximum 400 mots

Réponds directement sans introduction.`;

      const _models_da = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
      let _result_da;
      for (const _mn of _models_da) {
        try {
          model = genAI.getGenerativeModel({ model: _mn });
          const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
          _result_da = await Promise.race([model.generateContent(prompt), _t]);
          break;
        } catch(e) {}
      }
      if (!_result_da) return res.status(500).json({ error: 'Service indisponible' });
      const analysis = _result_da.response.text().trim();
      return res.status(200).json({ analysis });
    }

    if (action === 'parse') {
      // Step 1 - Parse event and generate questions
      prompt = `Tu es un assistant qui organise des événements de calendrier.

Événement : "${text}"
Date actuelle : ${datetime || 'non précisée'}

Analyse cet événement et génère des questions pour mieux le préparer.
JSON uniquement :
{
  "titre": "titre court",
  "type": "REUNION|RDVMEDICAL|ENTRETIEN|APPEL|ANNIVERSAIRE|VOYAGE|REPAS|SPORT|FORMATION|ADMINISTRATIF|AUTRE",
  "date": "date extraite",
  "heure": "heure extraite",
  "duree": "durée estimée",
  "description": "description courte",
  "participants": ["noms si mentionnés"],
  "questions": [
    {"id": 1, "question": "question courte et précise ?"},
    {"id": 2, "question": "deuxième question ?"},
    {"id": 3, "question": "troisième question ?"}
  ]
}

Règles :
- 2 à 4 questions maximum, adaptées au type
- Questions courtes et naturelles
- Exemples : réunion→"Sur quoi porte cette réunion ?", médecin→"Quels symptômes avez-vous ?", anniversaire→"Quel âge fête-t-il/elle ?"
- JSON uniquement`;

    } else if (action === 'prepare') {
      // Step 2 - Generate full preparation based on answers
      const answersText = (answers || []).map(a => `Q: ${a.question}\nR: ${a.answer}`).join('\n\n');

      prompt = `Tu es un assistant qui prépare des événements de calendrier de façon complète.

Événement : "${text}"
Type : ${body.type || 'AUTRE'}
Date : ${body.date || 'non précisée'}
Date actuelle : ${datetime || 'non précisée'}
Participants : ${(body.participants || []).join(', ') || 'aucun mentionné'}

Réponses de l'utilisateur :
${answersText}

Génère une préparation COMPLÈTE et DETAILLEE adaptée au type et aux réponses.
JSON uniquement :
{
  "preparation": {
    "titre": "Titre de la préparation",
    "sections": [
      {
        "emoji": "🎯",
        "titre": "Titre section",
        "items": ["item détaillé 1", "item détaillé 2", "item détaillé 3"]
      }
    ]
  },
  "hasEmail": true,
  "email": {
    "sujet": "sujet email",
    "corps": "corps email complet et professionnel",
    "destinataires": ["noms des participants"]
  },
  "pdf": {
    "titre": "Titre du document",
    "contenu": "contenu complet du PDF en markdown avec ## titres et - listes"
  }
}

Règles :
- 3 à 6 sections selon la richesse du contexte
- hasEmail = true si des participants sont mentionnés
- Contenu PDF complet et détaillé
- Tout en français
- JSON uniquement`;
    }

    const _models = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let result;
    for (const _mn of _models) {
      try {
        model = genAI.getGenerativeModel({ model: _mn });
        const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
        result = await Promise.race([model.generateContent(prompt), _t]);
        break;
      } catch(e) { console.log('[calendrier fallback]', _mn, 'failed'); }
    }
    if (!result) return res.status(200).json({ raw: text });

    const answer = result.response.text().trim();
    const clean = answer.replace(/```json|```/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch(e) {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error('[calendrier] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
