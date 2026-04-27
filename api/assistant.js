const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { question, mode } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const _models_a = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    async function callGemini(prompt) {
      let _res_a;
      for (const _mn of _models_a) {
        try {
          const model = genAI.getGenerativeModel({ model: _mn });
          const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
          _res_a = await Promise.race([model.generateContent(prompt), _t]);
          break;
        } catch(e) { console.log('[assistant fallback]', _mn, 'failed'); }
      }
      if (!_res_a) return null;
      return _res_a.response.text().trim();
    }

    // ── Mode détection d'action IA en temps réel ──
    if (mode === 'detect') {
      const detectPrompt = `Analyse cette phrase et détecte si l'utilisateur exprime une INTENTION CLAIRE de faire quelque chose.

Phrase : "${question}"

Types possibles : EMAIL, WHATSAPP, APPEL, CALENDRIER, MAPS, RESERVATION, COMMANDE, RECHERCHE, ANALYSE

Règles STRICTES :
- Une intention = verbe d'action au présent ou futur ("envoie", "appelle", "réserve", "mets", "planifie", "commande", "cherche")
- Passé = pas une intention ("j'ai envoyé", "on a appelé", "il a réservé")
- Informatif = pas une intention ("il y a une réunion", "on a reçu un mail")
- Conditionnel vague = pas une intention ("on pourrait peut-être...")
- Maximum 1 action par phrase
- Si aucune intention claire → action null

Réponds UNIQUEMENT en JSON sans markdown :
{"action":"EMAIL","texte":"Résumé court de l'action"}
ou
{"action":null}`;

      const raw = await callGemini(detectPrompt);
      if (!raw) return res.status(200).json({ action: null });
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        return res.status(200).json(parsed);
      } catch(e) {
        return res.status(200).json({ action: null });
      }
    }

    // ── Mode normal : réponse à une question ──
    const prompt = `Tu es un assistant intelligent intégré dans une app d'enregistrement.
Question : "${question}"
Réponds en UNE phrase courte et précise (maximum 25 mots).
Réponds TOUJOURS sauf si la question demande des informations PRIVÉES que tu ne peux pas connaître (numéro de téléphone d'une personne, adresse personnelle, mot de passe...) → dans ce cas réponds uniquement : IGNORE
Réponds maintenant :`;

    const answer = await callGemini(prompt);
    if (!answer) return res.status(200).json({ answer: 'IGNORE' });
    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
