const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un traducteur universel.

Texte reçu : "${text}"

Tâche :
1. Détecte la langue de ce texte
2. Si c'est du FRANÇAIS → réponds UNIQUEMENT : FRANCAIS
3. Si c'est une AUTRE LANGUE → réponds UNIQUEMENT avec ce format JSON :
{"langue": "Anglais", "traduction": "texte traduit en français naturel"}

Réponds maintenant :`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();

    if (answer.toUpperCase().includes('FRANCAIS')) {
      return res.status(200).json({ translation: null, isFrench: true });
    }

    try {
      const clean = answer.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        translation: parsed.traduction,
        langue: parsed.langue,
        isFrench: false
      });
    } catch(e) {
      return res.status(200).json({ translation: answer, langue: 'Langue étrangère', isFrench: false });
    }

  } catch (err) {
    console.error('[translate] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
