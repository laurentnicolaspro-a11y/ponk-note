const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Parse body manually
    let body = req.body;
    if (!body || typeof body === 'string') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
      });
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
    const { type, text, profile, contacts = [] } = body;

    // Find contact by name match
    function findContact(text) {
      if (!contacts.length) return null;
      const lower = text.toLowerCase();
      return contacts.find(c => c.name && lower.includes(c.name.toLowerCase().split(' ')[0].toLowerCase()));
    }
    const contact = findContact(text);
    if (!type || !text) return res.status(400).json({ error: 'Type et texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    let prompt = '';

    switch(type) {
      case 'EMAIL':
        prompt = `Rédige un email en français. Description: "${text}". Utilisateur: "${profile||'moi'}". ${contact ? `Destinataire: ${contact.name}${contact.email ? ', email: '+contact.email : ''}.` : 'Extrait le prénom du destinataire si mentionné.'} JSON uniquement: {"sujet":"...","corps":"...","destinataire":"${contact?.email || contact?.name || ''}"}`;
        break;
      case 'WHATSAPP':
        prompt = `Rédige un message WhatsApp court en français. Description: "${text}". ${contact ? `Destinataire: ${contact.name}.` : ''} JSON uniquement: {"message":"...","phone":"${contact?.phone || ''}"}`;
        break;
      case 'CALENDRIER':
        prompt = `Crée un événement calendrier. Description: "${text}". JSON uniquement: {"titre":"...","description":"..."}`;
        break;
      case 'RAPPEL':
        prompt = `Crée un rappel concis en français. Description: "${text}". JSON uniquement: {"texte":"..."}`;
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
