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

    const { text, profile } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

    async function callGemini(prompt, timeoutMs = 20000) {
      for (const mn of MODELS) {
        try {
          const model = genAI.getGenerativeModel({ model: mn });
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
          );
          const result = await Promise.race([model.generateContent(prompt), timeout]);
          return result.response.text().trim();
        } catch(e) {
          console.log('[analyse] fallback:', mn, e.message);
        }
      }
      throw new Error('Tous les modèles ont échoué');
    }

    const prompt = `Tu es un expert analyste. Analyse le sujet suivant de façon complète, structurée et professionnelle.

Sujet : "${text}"
${profile ? `Contexte utilisateur : ${profile}` : ''}

Génère une analyse approfondie en JSON uniquement.
Quand une comparaison ou des données chiffrées sont pertinentes, génère un tableau.

JSON :
{
  "titre": "titre court (max 60 caractères)",
  "resume": "résumé en 2-3 phrases percutantes",
  "sections": [
    {
      "titre": "Titre de la section",
      "points": [
        {
          "titre": "Point clé (5 mots max)",
          "detail": "Explication factuelle en 1-2 phrases avec chiffres si possible"
        }
      ],
      "tableau": {
        "colonnes": ["Critère", "Option A", "Option B"],
        "lignes": [
          ["Prix", "999€", "799€"],
          ["Batterie", "20h", "25h"]
        ]
      }
    }
  ]
}

Règles :
- 3 à 5 sections
- 2 à 4 points par section
- Ajoute un tableau UNIQUEMENT si le sujet s'y prête naturellement (comparaison, données chiffrées, classement)
- Si pas de tableau pertinent pour une section, omets le champ "tableau"
- Maximum 1 tableau par section, maximum 2 tableaux au total
- Colonnes : 2 à 5 maximum
- Lignes : 3 à 8 maximum
- Tout en français, factuel et concret
- JSON uniquement, aucun texte autour`;

    const raw = await callGemini(prompt, 20000);
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch(e) {
      return res.status(200).json({ error: 'Erreur de parsing', raw });
    }

  } catch(err) {
    console.error('[analyse]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
