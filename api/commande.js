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

    const { text } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un expert shopping. Analyse cette demande d'achat : "${text}"

Génère un brief d'achat intelligent en JSON uniquement :
{
  "produit": "nom court du produit",
  "fourchette_prix": "ex: 15€ — 45€",
  "fourchette_note": "ex: prix normal pour ce produit",
  "verifier": ["point 1 à vérifier", "point 2", "point 3"],
  "attention": ["point d'attention 1", "point 2"],
  "sites": [
    {"nom": "Google Shopping", "icon": "🔍", "desc": "Comparer tous les prix", "url": "https://www.google.com/search?q=QUERY&tbm=shop"},
    {"nom": "Amazon.fr", "icon": "📦", "desc": "Livraison rapide", "url": "https://www.amazon.fr/s?k=QUERY"},
    {"nom": "Nom site pertinent", "icon": "🏪", "desc": "raison", "url": "https://..."},
    {"nom": "Nom site pertinent", "icon": "🛋️", "desc": "raison", "url": "https://..."},
    {"nom": "Nom site pertinent", "icon": "💰", "desc": "raison", "url": "https://..."}
  ]
}

Règles :
- Choisis les 3 derniers sites selon le TYPE de produit (bricolage→Leroy Merlin, mode→Zara, électro→Fnac, etc.)
- Remplace QUERY dans les URLs par le terme de recherche optimisé encodé
- Tout en français
- JSON uniquement, sans markdown`;

    const _models = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let result;
    for (const _mn of _models) {
      try {
        model = genAI.getGenerativeModel({ model: _mn });
        const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
        result = await Promise.race([model.generateContent(prompt), _t]);
        break;
      } catch(e) { console.log('[commande fallback]', _mn, 'failed'); }
    }
    if (!result) return res.status(200).json({ error: 'Service indisponible', raw: text });

    const answer = result.response.text().trim();
    const clean = answer.replace(/```json|```/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch(e) {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error('[commande] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
