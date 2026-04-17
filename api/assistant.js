const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un assistant intelligent intégré dans une app d'enregistrement.

Question : "${question}"

Réponds en UNE phrase courte et précise (maximum 25 mots).
Réponds TOUJOURS sauf si la question demande des informations PRIVÉES que tu ne peux pas connaître (numéro de téléphone d'une personne, adresse personnelle, mot de passe...) → dans ce cas réponds uniquement : IGNORE

Réponds maintenant :`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();

    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
