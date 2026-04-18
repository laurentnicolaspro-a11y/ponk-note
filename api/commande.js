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

    const { text } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    // Encode search query
    const query = encodeURIComponent(text.replace(/['"]/g, '').trim());

    const SITES_URLS = {
      'Google Shopping': `https://www.google.com/search?q=${query}&tbm=shop`,
      'Amazon': `https://www.amazon.fr/s?k=${query}`,
      'Fnac': `https://www.fnac.com/SearchResult/ResultSet.aspx?SCat=0&Search=${query}`,
      'Cdiscount': `https://www.cdiscount.com/search/10/${query}.html`,
      'Leroy Merlin': `https://www.leroymerlin.fr/recherche?q=${query}`,
      'Castorama': `https://www.castorama.fr/search?q=${query}`,
      'Maisons du Monde': `https://www.maisonsdumonde.com/FR/fr/search-result?q=${query}`,
      'La Redoute': `https://www.laredoute.fr/pplp/100/cat-0.aspx?search=${query}`,
      'Zara': `https://www.zara.com/fr/fr/search?searchTerm=${query}`,
      'H&M': `https://www2.hm.com/fr_fr/recherche-resultats.html?q=${query}`,
      'IKEA': `https://www.ikea.com/fr/fr/search/?q=${query}`,
      'Darty': `https://www.darty.com/nav/extra/search?text=${query}`,
      'Boulanger': `https://www.boulanger.com/recherche?keyword=${query}`,
      'Decathlon': `https://www.decathlon.fr/search?Ntt=${query}`,
      'Booking': `https://www.booking.com/searchresults.fr.html?ss=${query}`,
    };

    const prompt = `Tu es un expert shopping. Analyse cette demande d'achat : "${text}"

Génère un brief d'achat en JSON uniquement :
{
  "produit": "nom court du produit",
  "fourchette_prix": "ex: 15€ — 45€",
  "fourchette_note": "ex: prix normal pour ce produit",
  "verifier": ["point 1", "point 2", "point 3"],
  "attention": ["point 1", "point 2"],
  "sites": ["Google Shopping", "Amazon", "SITE3", "SITE4", "SITE5"]
}

Pour les sites, choisis UNIQUEMENT parmi cette liste exacte selon le type de produit :
Google Shopping, Amazon, Fnac, Cdiscount, Leroy Merlin, Castorama, Maisons du Monde, La Redoute, Zara, H&M, IKEA, Darty, Boulanger, Decathlon, Booking

Exemples : bricolage→[Leroy Merlin, Castorama], mode→[Zara, H&M, La Redoute], électro→[Fnac, Darty, Boulanger], sport→[Decathlon], déco→[IKEA, Maisons du Monde]
Toujours inclure Google Shopping et Amazon en premier.
JSON uniquement, sans markdown.`;

    const _models = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let result;
    for (const _mn of _models) {
      try {
        model = genAI.getGenerativeModel({ model: _mn });
        const _t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
        result = await Promise.race([model.generateContent(prompt), _t]);
        break;
      } catch(e) { console.log('[commande fallback]', _mn, 'failed'); }
    }
    if (!result) return res.status(200).json({ error: 'Service indisponible', raw: text });

    const answer = result.response.text().trim();
    const clean = answer.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      // Build proper URLs from site names
      const ICONS = {
        'Google Shopping':'🔍','Amazon':'📦','Fnac':'📺','Cdiscount':'💰',
        'Leroy Merlin':'🏗️','Castorama':'🔨','Maisons du Monde':'🛋️',
        'La Redoute':'👗','Zara':'👔','H&M':'🧥','IKEA':'🪑',
        'Darty':'📱','Boulanger':'💻','Decathlon':'⚽','Booking':'🏨'
      };
      const DESCS = {
        'Google Shopping':'Comparer tous les prix','Amazon':'Livraison rapide',
        'Fnac':'High-tech & culture','Cdiscount':'Prix bas garantis',
        'Leroy Merlin':'Bricolage & jardinage','Castorama':'Matériaux & outillage',
        'Maisons du Monde':'Déco & mobilier','La Redoute':'Mode & maison',
        'Zara':'Mode tendance','H&M':'Mode accessible','IKEA':'Mobilier & déco',
        'Darty':'Électroménager','Boulanger':'High-tech','Decathlon':'Sport & outdoor',
        'Booking':'Hébergement'
      };
      parsed.sites = (parsed.sites || []).map(nom => ({
        nom,
        icon: ICONS[nom] || '🔗',
        desc: DESCS[nom] || '',
        url: SITES_URLS[nom] || `https://www.google.com/search?q=${query}+${encodeURIComponent(nom)}`
      }));
      return res.status(200).json(parsed);
    } catch(e) {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error('[commande] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
