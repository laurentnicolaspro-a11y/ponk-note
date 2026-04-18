const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un assistant intelligent intégré dans une app d'enregistrement.

Question : "${question}"

Réponds en UNE phrase courte et précise (maximum 25 mots).
Réponds TOUJOURS sauf si la question demande des informations PRIVÉES que tu ne peux pas connaître (numéro de téléphone d'une personne, adresse personnelle, mot de passe...) → dans ce cas réponds uniquement : IGNORE

Réponds maintenant :`;

    const _models_a = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let _res_a;
    for (const _mn of _models_a) {
      try {
        model = genAI.getGenerativeModel({ model: _mn });
        const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
        _res_a = await Promise.race([model.generateContent(prompt), _t]);
        break;
      } catch(e) { console.log('[assistant fallback]', _mn, 'failed'); }
    }
    if (!_res_a) return res.status(200).json({ answer: 'IGNORE' });
    const answer = _res_a.response.text().trim();

    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
