const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'Audio requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Écoute cet extrait audio de quelques secondes.

Tâche :
1. Transcris TOUT ce qui est dit, même partiellement
2. Détecte la langue
3. Si c'est principalement du FRANÇAIS → réponds uniquement : FRANCAIS
4. Si c'est une AUTRE LANGUE (même mélangée avec du français) → réponds UNIQUEMENT avec ce JSON sans markdown :
{"langue": "Anglais", "original": "texte original transcrit", "translation": "traduction complète en français"}
5. Si l'audio est totalement silencieux → réponds : SILENCE

Important : si tu entends des mots dans une langue étrangère, même quelques mots, génère le JSON de traduction.

Réponds maintenant :`;

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      { text: prompt }
    ]);

    const answer = result.response.text().trim();

    console.log('[translatelive] answer:', answer);
    if (answer === 'FRANCAIS' || answer === 'SILENCE') {
      return res.status(200).json({ translation: null });
    }

    try {
      const clean = answer.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        langue: parsed.langue,
        original: parsed.original,
        translation: parsed.translation
      });
    } catch(e) {
      return res.status(200).json({ translation: null });
    }

  } catch (err) {
    console.error('[translatelive] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
