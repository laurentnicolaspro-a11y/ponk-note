const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question, mode } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // flash en premier (meilleure qualité pour vocal), flash-lite en fallback
    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    const TIMEOUT_MS = 10000;

    async function callGemini(prompt) {
      for (const modelName of MODELS) {
        // 1 retry sur erreur transitoire, délai court (500ms) pour ne pas casser le temps réel
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const timeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
            );
            const result = await Promise.race([model.generateContent(prompt), timeout]);
            console.log(`[assistant] success: ${modelName} attempt ${attempt}`);
            return result.response.text().trim();
          } catch (e) {
            const isTransient =
              e.message.includes('503') ||
              e.message.includes('429') ||
              e.message.includes('UNAVAILABLE');

            console.log(`[assistant] ${modelName} attempt ${attempt} failed (${isTransient ? 'transient' : 'fatal'}):`, e.message);

            if (isTransient && attempt < 2) {
              await new Promise(r => setTimeout(r, 500));
              continue;
            }
            break; // erreur fatale ou 2 tentatives épuisées → modèle suivant
          }
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

2. ACTION : Est-ce qu'il y a une action concrète et utile à créer ?
Types possibles : EMAIL, WHATSAPP, APPEL, CALENDRIER, MAPS, RESERVATION, COMMANDE, RECHERCHE, ANALYSE
Pose-toi la question : "Si je crée cette action, sera-t-elle vraiment utile à l'utilisateur ?"
- OUI si : intention claire explicite OU implicite ("j'ai besoin d'un taxi", "il faut appeler Xavier", "la réunion vendredi à 14h")
- OUI si : conditionnel réaliste ("on devrait réserver", "faudrait envoyer")
- NON si : constat passé ("j'ai envoyé", "on a appelé")
- NON si : information neutre sans suite ("il y a une réunion", "le temps est beau")
- NON si : trop vague pour être actionnable
- Maximum 1 action, la plus utile
- Si aucune action utile → null

Réponds UNIQUEMENT en JSON sans markdown :
{"answer":"réponse courte ou null","action":"TYPE ou null","texte":"résumé court de l'action ou null"}`;

      const raw = await callGemini(prompt);
      if (!raw) return res.status(200).json({ answer: null, action: null, texte: null });

      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        return res.status(200).json(parsed);
      } catch (e) {
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
      } catch (e) {
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
