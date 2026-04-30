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

    // flash-lite en premier (moins cher, suffisant pour du texte)
    // flash en fallback seulement si lite échoue vraiment
    const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
    const TIMEOUT_MS = 30000;

    async function callGemini(prompt) {
      for (const modelName of MODELS) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const timeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
            );
            const result = await Promise.race([model.generateContent(prompt), timeout]);
            console.log(`[analyse] success: ${modelName} attempt ${attempt}`);
            return result.response.text().trim();
          } catch (e) {
            const isTransient =
              e.message.includes('503') ||
              e.message.includes('429') ||
              e.message.includes('timeout') ||
              e.message.includes('UNAVAILABLE');

            console.log(`[analyse] ${modelName} attempt ${attempt} failed (${isTransient ? 'transient' : 'fatal'}):`, e.message);

            if (isTransient && attempt < 3) {
              await new Promise(r => setTimeout(r, attempt * 1500)); // 1.5s puis 3s
              continue;
            }
            break; // erreur fatale ou tentatives épuisées → modèle suivant
          }
        }
      }
      throw new Error('Tous les modèles ont échoué');
    }

    const prompt = `Tu es un expert analyste. Analyse le sujet suivant de façon complète, structurée et professionnelle.

Sujet : "${text}"
${profile ? `Contexte utilisateur : ${profile}` : ''}

Génère une analyse approfondie en JSON uniquement.
Quand c'est pertinent, ajoute UN visuel par section (tableau, barres, camembert ou courbe).

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
      "visuel": {
        "type": "tableau",
        "titre": "Titre du visuel",
        "colonnes": ["Critère", "Option A", "Option B"],
        "lignes": [
          ["Prix", "999€", "799€"],
          ["Batterie", "20h", "25h"]
        ]
      }
    },
    {
      "titre": "Autre section",
      "points": [...],
      "visuel": {
        "type": "barres",
        "titre": "Titre du graphique",
        "labels": ["Apple", "Samsung", "Xiaomi"],
        "valeurs": [383, 200, 45],
        "unite": "Mrd USD"
      }
    },
    {
      "titre": "Répartition",
      "points": [...],
      "visuel": {
        "type": "camembert",
        "titre": "Parts de marché mondiales",
        "labels": ["Samsung", "Apple", "Xiaomi", "Autres"],
        "valeurs": [20, 17, 13, 50]
      }
    },
    {
      "titre": "Évolution",
      "points": [...],
      "visuel": {
        "type": "courbe",
        "titre": "Évolution du chiffre d'affaires",
        "labels": ["2020", "2021", "2022", "2023"],
        "valeurs": [274, 365, 394, 383],
        "unite": "Mrd USD"
      }
    }
  ]
}

Règles :
- 3 à 5 sections
- 2 à 4 points par section
- Ajoute un visuel UNIQUEMENT si les données s'y prêtent naturellement
- Maximum 2 visuels au total sur toute l'analyse
- Pour "barres" et "camembert" : 2 à 6 éléments max
- Pour "courbe" : 3 à 8 points temporels
- Pour "tableau" : 2 à 5 colonnes, 3 à 8 lignes
- Valeurs numériques uniquement pour barres/camembert/courbe (pas de symboles €, %, les mettre dans "unite")
- Tout en français, factuel et concret
- JSON uniquement, aucun texte autour`;

    const raw = await callGemini(prompt);
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch (e) {
      return res.status(200).json({ error: 'Erreur de parsing', raw });
    }

  } catch (err) {
    console.error('[analyse]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
