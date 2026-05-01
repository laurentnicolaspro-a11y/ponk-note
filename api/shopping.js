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

    const { text, action } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']; // flash en premier — conseils shopping et rebonds nécessitent de la pertinence

    async function callGemini(prompt, timeoutMs) {
      for (const modelName of MODELS) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const timeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutMs)
            );
            const result = await Promise.race([model.generateContent(prompt), timeout]);
            console.log(`[shopping] success: ${modelName} attempt ${attempt} action:${action}`);
            return result.response.text().trim();
          } catch (e) {
            const isTransient =
              e.message.includes('503') ||
              e.message.includes('429') ||
              e.message.includes('timeout') ||
              e.message.includes('UNAVAILABLE');

            console.log(`[shopping] ${modelName} attempt ${attempt} failed (${isTransient ? 'transient' : 'fatal'}):`, e.message);

            if (isTransient && attempt < 3) {
              await new Promise(r => setTimeout(r, attempt * 1500));
              continue;
            }
            break;
          }
        }
      }
      throw new Error('Tous les modèles ont échoué');
    }

    // ── COMMANDE ─────────────────────────────────────────────────────────────
    if (action === 'commande') {
      const cleanText = text
        .replace(/^(commande|commander|achète|acheter|réserve|réserver|passe une commande|faire une commande|je veux|il faut|faut|on doit|on va)\s+/i, '')
        .replace(/^(un|une|des|le|la|les|du|de la)\s+/i, '')
        .trim();
      const query = encodeURIComponent(cleanText);

      const SITES_URLS = {
        'Google Shopping': `https://www.google.com/search?q=${query}&tbm=shop`,
        'Amazon':          `https://www.amazon.fr/s?k=${query}`,
        'Fnac':            `https://www.fnac.com/SearchResult/ResultSet.aspx?SCat=0&Search=${query}`,
        'Cdiscount':       `https://www.cdiscount.com/search/10/${query}.html`,
        'Leroy Merlin':    `https://www.leroymerlin.fr/recherche?q=${query}`,
        'Castorama':       `https://www.castorama.fr`,
        'Maisons du Monde':`https://www.maisonsdumonde.com`,
        'La Redoute':      `https://www.laredoute.fr/recherche.aspx?query=${query}`,
        'Zara':            `https://www.zara.com/fr/fr`,
        'H&M':             `https://www2.hm.com/fr_fr`,
        'IKEA':            `https://www.ikea.com/fr/fr/search/?q=${query}`,
        'Darty':           `https://www.darty.com/nav/extra/search?text=${query}`,
        'Boulanger':       `https://www.boulanger.com/recherche?keyword=${query}`,
        'Decathlon':       `https://www.decathlon.fr/search?Ntt=${query}`,
        'Booking':         `https://www.booking.com/searchresults.fr.html?ss=${query}`,
      };

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

      const raw = await callGemini(prompt, 15000);
      const clean = raw.replace(/```json|```/g, '').trim();

      try {
        const parsed = JSON.parse(clean);
        parsed.sites = (parsed.sites || []).map(nom => ({
          nom,
          icon: ICONS[nom] || '🔗',
          desc: DESCS[nom] || '',
          url: SITES_URLS[nom] || `https://www.google.com/search?q=${query}+${encodeURIComponent(nom)}`
        }));
        return res.status(200).json(parsed);
      } catch (e) {
        return res.status(200).json({ raw: text });
      }
    }

    // ── RESERVATION ───────────────────────────────────────────────────────────
    if (action === 'reservation') {
      const now = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const prompt = `Tu es un assistant expert en réservations de voyages et loisirs.

Texte : "${text}"
Date actuelle : ${now}

Analyse ce texte et extrait les informations de réservation.

JSON uniquement :
{
  "type": "HOTEL|TRAIN|VOL|RESTAURANT|SPECTACLE|VOITURE|AUTRE",
  "titre": "Titre court de la réservation",
  "resume": "Résumé en 1 phrase",
  "infos": {
    "destination": "ville ou lieu de destination",
    "origine": "ville de départ si mentionnée",
    "date_aller": "date aller extraite ou null",
    "date_retour": "date retour si mentionnée ou null",
    "personnes": "nombre de personnes si mentionné ou null",
    "budget": "budget si mentionné ou null",
    "details": "autres détails importants"
  }
}

JSON uniquement, pas de texte autour.`;

      const raw = await callGemini(prompt, 15000);
      const clean = raw.replace(/```json|```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (e) {
        parsed = { type: 'AUTRE', titre: text, resume: text, infos: {} };
      }

      const { type, infos } = parsed;
      const dest = encodeURIComponent(infos.destination || '');
      const ori  = encodeURIComponent(infos.origine || '');
      const pers = infos.personnes || '2';

      let plateformes = [];

      if (type === 'HOTEL') {
        plateformes = [
          { nom: 'Booking.com',   icon: '🏨', url: `https://www.booking.com/search.html?ss=${dest}&group_adults=${pers}`, desc: 'Meilleur prix garanti' },
          { nom: 'Airbnb',        icon: '🏠', url: `https://www.airbnb.fr/s/${dest}/homes?adults=${pers}`, desc: 'Logements chez l\'habitant' },
          { nom: 'Hotels.com',    icon: '🛎️', url: `https://fr.hotels.com/search.do?q-destination=${dest}&q-room-0-adults=${pers}`, desc: 'Large choix d\'hôtels' },
          { nom: 'Google Hotels', icon: '🔍', url: `https://www.google.com/travel/hotels?q=hotel+${dest}`, desc: 'Comparer tous les prix' },
        ];
      } else if (type === 'TRAIN') {
        plateformes = [
          { nom: 'SNCF Connect', icon: '🚄', url: `https://www.sncf-connect.com`, desc: infos.destination ? `Vers ${infos.destination}` : 'Billets officiels SNCF' },
          { nom: 'Trainline',    icon: '🚆', url: `https://www.thetrainline.com/fr`, desc: infos.destination ? `Vers ${infos.destination}` : 'Meilleurs prix trains' },
          { nom: 'Ouigo',        icon: '💚', url: `https://www.ouigo.com/`, desc: 'TGV low-cost' },
          { nom: 'Eurostar',     icon: '🌍', url: `https://www.eurostar.com/fr-fr/train`, desc: 'Trains internationaux' },
        ];
      } else if (type === 'VOL') {
        const flightsUrl = ori
          ? `https://www.google.com/flights?q=vols+${ori}+${dest}`
          : `https://www.google.com/flights?q=vols+${dest}`;
        const skyscannerUrl = ori
          ? `https://www.skyscanner.fr/transport/flights/${ori}/${dest}/`
          : `https://www.skyscanner.fr/transport/flights/fr/${dest}/`;
        const kayakUrl = ori
          ? `https://www.kayak.fr/flights/${ori}-${dest}`
          : `https://www.kayak.fr/flights/FR-${dest}`;
        plateformes = [
          { nom: 'Google Flights', icon: '✈️', url: flightsUrl, desc: 'Comparer tous les vols' },
          { nom: 'Skyscanner',     icon: '🔵', url: skyscannerUrl, desc: 'Meilleurs tarifs vols' },
          { nom: 'Kayak',          icon: '🛫', url: kayakUrl, desc: 'Comparateur de vols' },
          { nom: 'Transavia',      icon: '🟢', url: `https://www.transavia.com/fr-FR/accueil/`, desc: 'Vols low-cost' },
        ];
      } else if (type === 'RESTAURANT') {
        plateformes = [
          { nom: 'TheFork',       icon: '🍽️', url: `https://www.thefork.fr/recherche?q=${dest}`, desc: 'Réserver une table' },
          { nom: 'Google Restos', icon: '🔍', url: `https://www.google.com/search?q=restaurant+${dest}`, desc: 'Trouver un restaurant' },
          { nom: 'Tripadvisor',   icon: '🦉', url: `https://www.google.com/search?q=tripadvisor+restaurant+${dest}`, desc: 'Avis et réservations' },
        ];
      } else if (type === 'SPECTACLE') {
        plateformes = [
          { nom: 'Fnac Spectacles', icon: '🎭', url: `https://www.fnacspectacles.com/search/?q=${dest}`, desc: 'Billets spectacles' },
          { nom: 'Ticketmaster',    icon: '🎫', url: `https://www.ticketmaster.fr/fr/recherche?q=${dest}`, desc: 'Concerts & événements' },
          { nom: 'Billetreduc',     icon: '🎟️', url: `https://www.billetreduc.com/recherche/?q=${dest}`, desc: 'Billets à prix réduit' },
          { nom: 'SeeTickets',      icon: '🎪', url: `https://www.seetickets.com/fr/search?q=${dest}`, desc: 'Événements & festivals' },
        ];
      } else if (type === 'VOITURE') {
        plateformes = [
          { nom: 'Rentalcars', icon: '🚗', url: `https://www.rentalcars.com/fr/search/?pickup=${dest}`, desc: 'Comparer les locations' },
          { nom: 'Europcar',   icon: '🟢', url: `https://www.europcar.fr/`, desc: 'Location de voiture' },
          { nom: 'Enterprise', icon: '🚙', url: `https://www.enterprise.fr/fr/`, desc: 'Location longue durée' },
          { nom: 'Sixt',       icon: '🟠', url: `https://www.sixt.fr/`, desc: 'Voitures premium' },
        ];
      } else {
        plateformes = [
          { nom: 'Google',      icon: '🔍', url: `https://www.google.com/search?q=${encodeURIComponent(text)}`, desc: 'Recherche générale' },
          { nom: 'Booking.com', icon: '🏨', url: `https://www.booking.com/search.html?ss=${dest}`, desc: 'Hébergement' },
          { nom: 'Trainline',   icon: '🚆', url: `https://www.thetrainline.com/fr`, desc: 'Transports' },
        ];
      }

      return res.status(200).json({ ...parsed, plateformes });
    }

    // ── REBOND ────────────────────────────────────────────────────────────────
    if (action === 'rebond') {
      const { actionFaite, contexte } = body;

      const ACTIONS_DISPO = [
        { type: 'EMAIL',       label: 'Envoyer un email',         icon: '📧' },
        { type: 'WHATSAPP',    label: 'Envoyer un message',        icon: '💬' },
        { type: 'APPEL',       label: 'Passer un appel',           icon: '📞' },
        { type: 'CALENDRIER',  label: 'Ajouter au calendrier',     icon: '📅' },
        { type: 'RESERVATION', label: 'Faire une réservation',     icon: '🎫' },
        { type: 'MAPS',        label: 'Obtenir un itinéraire',     icon: '🗺️' },
        { type: 'COMMANDE',    label: 'Commander un produit',      icon: '🛒' },
        { type: 'RECHERCHE',   label: 'Faire une recherche',       icon: '🔍' },
        { type: 'ANALYSE',     label: 'Lancer une analyse',        icon: '🧠' },
      ];

      const prompt = `Tu es un assistant intelligent qui suggère des actions complémentaires.

L'utilisateur vient de faire : ${actionFaite}
Contexte : ${contexte || 'aucun contexte supplémentaire'}

Actions disponibles : ${ACTIONS_DISPO.map(a => a.type).join(', ')}

Propose 0, 1 ou 2 actions complémentaires qui auraient vraiment du sens dans ce contexte.
Sois créatif et humain — pense à ce qu'une personne ferait naturellement ensuite.
Si aucune action ne s'impose, retourne un tableau vide.

Exemples :
- "mail à ma femme je l'aime" → proposer COMMANDE (fleurs)
- "réunion à Lyon le 26 juin" → proposer RESERVATION (hôtel), MAPS (itinéraire)
- "commande tapis rouges" → proposer CALENDRIER (réception livraison)
- "analyse concurrence" → proposer RECHERCHE (approfondir)

JSON uniquement :
{
  "rebonds": [
    {
      "type": "TYPE_ACTION",
      "label": "Texte du bouton court et naturel (ex: Commander des fleurs)",
      "texte": "Texte pré-rempli pour cette action (ex: Commander un bouquet de fleurs)",
      "raison": "Pourquoi cette suggestion en 1 phrase courte"
    }
  ]
}

Maximum 2 rebonds. Si aucun rebond pertinent, retourne {"rebonds": []}.
JSON uniquement.`;

      let raw = null;
      try {
        raw = await callGemini(prompt, 10000);
      } catch (e) {
        return res.status(200).json({ rebonds: [] });
      }

      const clean = raw.replace(/```json|```/g, '').trim();
      try {
        const parsed = JSON.parse(clean);
        parsed.rebonds = (parsed.rebonds || []).map(r => {
          const act = ACTIONS_DISPO.find(a => a.type === r.type);
          return { ...r, icon: act?.icon || '✨' };
        });
        return res.status(200).json(parsed);
      } catch (e) {
        return res.status(200).json({ rebonds: [] });
      }
    }

    // ── RECHERCHE ─────────────────────────────────────────────────────────────
    if (action === 'recherche') {
      const prompt = `Tu es un expert en recherche web. Reformule cette demande en une requête de recherche courte et efficace, optimisée pour un moteur de recherche.

Demande : "${text}"

Règles :
- Maximum 6 mots
- Supprime les mots inutiles (je veux, je cherche, trouver, etc.)
- Garde les mots clés essentiels
- En français

Réponds UNIQUEMENT avec la requête reformulée, sans guillemets, sans ponctuation, sans explication.`;

      const query = await callGemini(prompt, 8000);
      return res.status(200).json({ query: query.trim() });
    }

    return res.status(400).json({ error: 'Action non reconnue' });

  } catch (err) {
    console.error('[shopping]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
