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

    async function callGemini(prompt, timeoutMs = 15000) {
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

    const prompt = `Tu es un expert analyste. Analyse le sujet suivant de façon complète et structurée.

Sujet : "${text}"
${profile ? `Contexte utilisateur : ${profile}` : ''}

Génère une analyse professionnelle en JSON uniquement :
{
  "titre": "titre court de l'analyse (max 60 caractères)",
  "resume": "résumé en 2 phrases maximum",
  "sections": [
    {
      "emoji": "🎯",
      "titre": "Titre de la section",
      "points": [
        {
          "titre": "Point clé court",
          "detail": "Explication factuelle en 1-2 phrases concrètes avec chiffres si possible"
        }
      ]
    }
  ]
}

Règles :
- 3 à 5 sections selon la richesse du sujet
- 2 à 4 points par section
- Chaque point : titre court (5 mots max) + détail factuel et concret
- Exclusivement en français
- Pas de généralités, des faits et des chiffres
- JSON uniquement, aucun texte autour`;

    const raw = await callGemini(prompt, 15000);
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
