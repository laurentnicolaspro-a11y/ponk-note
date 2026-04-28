const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
    if (!type || !text) return res.status(400).json({ error: 'Type et texte requis' });

    function findContact(t) {
      if (!contacts.length) return null;
      const lower = t.toLowerCase();
      // 1. Cherche sur les alias en premier (plus précis)
      const byAlias = contacts.find(c =>
        c.aliases && c.aliases.some(a => lower.includes(a.toLowerCase()))
      );
      if (byAlias) return byAlias;
      // 2. Fallback sur le prénom (premier mot du nom)
      return contacts.find(c =>
        c.name && lower.includes(c.name.toLowerCase().split(' ')[0].toLowerCase())
      );
    }

    const contact = findContact(text);

    if (type === 'APPEL') {
      return res.status(200).json({ phone: contact?.phone || '', name: contact?.name || '' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const MODELS = [
      'gemini-2.5-flash',
    ];

    // Timeout généreux car tâche complexe (rédaction email, message...)
    const TIMEOUTS = [8000];

    let prompt = '';
    switch(type) {
      case 'EMAIL': {
        const dest = contact ? (contact.email || contact.name) : '';
        const destInfo = contact
          ? `Destinataire: ${contact.name}${contact.email ? ', email: ' + contact.email : ''}.`
          : 'Extrait le prenom du destinataire si mentionne.';
        prompt = `Tu rediges un email naturel en francais. Description: "${text}". Expediteur: "${profile || 'moi'}". ${destInfo} Genere un vrai email bien redige. JSON uniquement: {"sujet":"sujet court","corps":"corps email naturel","destinataire":"${dest}"}`;
        break;
      }
      case 'WHATSAPP': {
        const phone = contact?.phone || '';
        const destInfo = contact ? `Destinataire: ${contact.name}.` : '';
        prompt = `Tu rediges un message WhatsApp naturel en francais. Description: "${text}". ${destInfo} Redige un message court et naturel, pas une repetition. JSON uniquement: {"message":"message bien redige","phone":"${phone}"}`;
        break;
      }
      case 'CALENDRIER':
        prompt = `Cree un evenement calendrier. Description: "${text}". JSON uniquement: {"titre":"titre court","description":"description utile"}`;
        break;
      case 'RAPPEL':
        prompt = `Cree un rappel clair en francais. Description: "${text}". JSON uniquement: {"texte":"rappel clair"}`;
        break;
      default:
        return res.status(200).json({ raw: text });
    }

    let result = null;
    for (let i = 0; i < MODELS.length; i++) {
      try {
        const model = genAI.getGenerativeModel({ model: MODELS[i] });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUTS[i]));
        result = await Promise.race([model.generateContent(prompt), timeout]);
        console.log('[generateaction] succès avec', MODELS[i]);
        break;
      } catch(e) {
        console.log('[generateaction]', MODELS[i], 'failed:', e.message);
      }
    }

    if (!result) {
      console.log('[generateaction] tous les modèles ont échoué');
      return res.status(200).json({ raw: text });
    }

    const answer = result.response.text().trim();
    const clean = answer.replace(/```json|```/g, '').trim();
    try {
      return res.status(200).json(JSON.parse(clean));
    } catch(e) {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error('[generateaction] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
