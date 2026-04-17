const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `Tu es un assistant discret intégré dans une app d'enregistrement de réunions.

Question détectée : "${question}"

Règles :
- Si c'est une question à laquelle tu PEUX répondre factuellement (géographie, calcul, définition, acronyme, sigle, terme technique, date, science, conversion, traduction, droit, médecine, économie...) → réponds en UNE SEULE phrase courte et précise, maximum 20 mots.
- Les acronymes et sigles (CLSPD, RGPD, TVA, PME...) → explique toujours ce que c'est.
- Si c'est une question PERSONNELLE liée à des personnes ou situations spécifiques que tu ne peux pas connaître → réponds UNIQUEMENT par le mot : IGNORE

Exemples → répondre :
"C'est quoi la capitale de l'Espagne ?" → "Madrid est la capitale de l'Espagne."
"Que veut dire CLSPD ?" → "CLSPD : Conseil Local de Sécurité et de Prévention de la Délinquance."
"C'est quoi le RGPD ?" → "RGPD : Règlement Général sur la Protection des Données, loi européenne de 2018."
"Combien fait 15% de 3500 ?" → "15% de 3500 = 525."

Exemples → IGNORE :
"Tu penses quoi de mon idée ?"
"Est-ce que Marc a envoyé le document ?"
"On se retrouve à quelle heure ?"

Réponds maintenant :`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();

    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
