const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question, mode } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const _models_a = [
      'gemini-2.5-flash',
    ];

    // Timeout unique pour réponse directe
    const timeouts = [5000];

    async function callGemini(prompt) {
      for (let i = 0; i < _models_a.length; i++) {
        try {
          const model = genAI.getGenerativeModel({ model: _models_a[i] });
          const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeouts[i]));
          const _r = await Promise.race([model.generateContent(prompt), _t]);
          console.log('[assistant] succès avec', _models_a[i]);
          return _r.response.text().trim();
        } catch(e) {
          console.log('[assistant fallback]', _models_a[i], 'failed:', e.message);
        }
      }
      return null;
    }

    // ── Mode fusionné : réponse + détection action en un seul appel ──
    if (!mode || mode === 'full') {
      const prompt = `Tu es un assistant vocal intégré dans une app d'enregistrement.
Phrase reçue : "${question}"

Fais les deux choses suivantes en même temps :

1. RÉPONSE : Si c'est une question ou une demande d'information, réponds en 1 phrase courte (max 20 mots). Si info privée ou pas une question → null.

2. ACTION : Détecte si l'utilisateur exprime une INTENTION CLAIRE de faire quelque chose.
Types possibles : EMAIL, WHATSAPP, APPEL, CALENDRIER, MAPS, RESERVATION, COMMANDE, RECHERCHE, ANALYSE
Règles STRICTES :
- Une intention = verbe d'action au présent ou futur ("envoie", "appelle", "réserve", "mets", "planifie", "commande", "cherche")
- Passé = pas une intention
- Informatif = pas une intention
- Conditionnel vague = pas une intention
- Si aucune intention claire → null

Réponds UNIQUEMENT en JSON sans markdown :
{"answer":"réponse courte ou null","action":"TYPE ou null","texte":"résumé court de l'action ou null"}`;

      const raw = await callGemini(prompt);
      if (!raw) return res.status(200).json({ answer: null, action: null, texte: null });

      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        return res.status(200).json(parsed);
      } catch(e) {
        return res.status(200).json({ answer: null, action: null, texte: null });
      }
    }

    // ── Mode detect seul (gardé pour compatibilité) ──
    if (mode === 'detect') {
      const detectPrompt = `Analyse cette phrase et détecte si l'utilisateur exprime une INTENTION CLAIRE de faire quelque chose.
Phrase : "${question}"
Types possibles : EMAIL, WHATSAPP, APPEL, CALENDRIER, MAPS, RESERVATION, COMMANDE, RECHERCHE, ANALYSE
Règles STRICTES :
- Une intention = verbe d'action au présent ou futur ("envoie", "appelle", "réserve", "mets", "planifie", "commande", "cherche")
- Passé = pas une intention ("j'ai envoyé", "on a appelé")
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
        return res.status(200).json(JSON.parse(raw.replace(/```json|```/g, '').trim()));
      } catch(e) {
        return res.status(200).json({ action: null });
      }
    }

    // ── Mode normal seul (gardé pour compatibilité) ──
    const prompt = `Assistant vocal. Réponds en 1 phrase courte et précise (max 20 mots). Si info privée → "IGNORE".
Question : "${question}"`;

    const answer = await callGemini(prompt);
    if (!answer) return res.status(200).json({ answer: 'IGNORE' });
    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
