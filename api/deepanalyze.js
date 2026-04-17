const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un expert analyste. Fais une analyse complète et structurée sur le sujet suivant :

"${query}"

Format de réponse en français, structuré avec des sections claires :
- Commence par un résumé en 2-3 phrases
- Développe en 3-5 points clés avec des titres en gras
- Termine par une conclusion ou recommandation
- Sois factuel, précis et utile
- Maximum 400 mots

Réponds directement sans introduction comme "Voici l'analyse" ou "Bien sûr".`;

    const result = await model.generateContent(prompt);
    const analysis = result.response.text().trim();

    return res.status(200).json({ analysis });

  } catch (err) {
    console.error('[deepanalyze] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
