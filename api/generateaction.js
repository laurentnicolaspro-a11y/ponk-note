const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, text, profile } = req.body;
    if (!type || !text) return res.status(400).json({ error: 'Type et texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    let prompt = '';

    switch(type) {
      case 'EMAIL':
        prompt = `Tu es un assistant qui rédige des emails professionnels et naturels en français.
        
Description de l'utilisateur : "${text}"
Nom de l'utilisateur : "${profile || 'moi'}"

Génère un email avec un sujet et un corps naturel. Réponds UNIQUEMENT avec ce JSON :
{"sujet": "sujet court et clair", "corps": "corps de l'email naturel et bien rédigé"}`;
        break;

      case 'WHATSAPP':
        prompt = `Tu es un assistant qui rédige des messages WhatsApp naturels en français.

Description : "${text}"

Génère un message court et naturel. Réponds UNIQUEMENT avec ce JSON :
{"message": "message WhatsApp naturel et concis"}`;
        break;

      case 'CALENDRIER':
        prompt = `Tu es un assistant qui crée des événements de calendrier.

Description : "${text}"

Génère un titre d'événement et une description. Réponds UNIQUEMENT avec ce JSON :
{"titre": "titre court de l'événement", "description": "description de l'événement"}`;
        break;

      case 'RAPPEL':
        prompt = `Tu es un assistant qui crée des rappels clairs.

Description : "${text}"

Génère un rappel concis. Réponds UNIQUEMENT avec ce JSON :
{"texte": "texte du rappel clair et actionnable"}`;
        break;

      default:
        return res.status(200).json({ raw: text });
    }

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();
    const clean = answer.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);
    } catch(e) {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error('[generateaction] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
