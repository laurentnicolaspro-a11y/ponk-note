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

    const { text, datetime, action, answers } = body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

    async function callGemini(prompt, timeoutMs = 15000) {
      for (const mn of MODELS) {
        try {
          const model = genAI.getGenerativeModel({ model: mn });
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
          );
          const result = await Promise.race([model.generateContent(prompt), timeout]);
          return result.response.text().trim();
        } catch(e) {
          console.log('[calendrier] fallback from', mn, ':', e.message);
        }
      }
      throw new Error('Tous les modèles ont échoué');
    }

    function parseJSON(raw) {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    }

    // ── Deep analyze (from results.html) ─────────────────────────────────────
    if (action === 'deepanalyze') {
      const prompt = `Tu es un expert analyste. Fais une analyse complète et structurée sur le sujet suivant :

"${text}"

Format de réponse en français, structuré avec des sections claires :
- Commence par un résumé en 2-3 phrases
- Développe en 3-5 points clés avec des titres en gras
- Termine par une conclusion ou recommandation
- Sois factuel, précis et utile
- Maximum 400 mots

Réponds directement sans introduction.`;

      const analysis = await callGemini(prompt, 8000);
      return res.status(200).json({ analysis });
    }

    // ── Parse : détection type + questions ciblées ────────────────────────────
    if (action === 'parse') {
      const prompt = `Tu es un assistant expert en préparation de réunions et d'événements.

Événement : "${text}"
Date actuelle : ${datetime || 'non précisée'}

Analyse cet événement. S'il s'agit d'une réunion (REUNION), pose exactement ces 5 questions dans cet ordre :
1. "Sur quoi doit-on aboutir concrètement à la fin de cette réunion ?" (objectif décisionnel)
2. "Qui participe et quels sont leurs intérêts ou positions ?" (rapport de force)
3. "Y a-t-il un événement récent, une tension ou un chiffre clé qui sera forcément sur la table ?" (contexte chaud)
4. "Quelle est ta position ou ton objectif personnel en entrant dans cette réunion ?" (posture)
5. "As-tu d'autres précisions à ajouter qui pourraient être utiles pour la préparation ?" (informations complémentaires)

Pour les autres types, génère 2 à 4 questions adaptées au contexte, et ajoute toujours en dernière position : "As-tu d'autres précisions à ajouter ?"

JSON uniquement :
{
  "titre": "titre court et précis",
  "type": "REUNION|RDVMEDICAL|ENTRETIEN|APPEL|ANNIVERSAIRE|VOYAGE|REPAS|SPORT|FORMATION|ADMINISTRATIF|AUTRE",
  "date": "date extraite ou null",
  "heure": "heure extraite ou null",
  "duree": "durée estimée ou null",
  "description": "description courte en 1 phrase",
  "participants": ["noms si mentionnés"],
  "questions": [
    {"id": 1, "question": "question ?"},
    {"id": 2, "question": "question ?"},
    {"id": 3, "question": "question ?"},
    {"id": 4, "question": "question ?"},
    {"id": 5, "question": "question ?"}
  ]
}

JSON uniquement, pas de texte autour.`;

      const raw = await callGemini(prompt, 10000);
      try {
        return res.status(200).json(parseJSON(raw));
      } catch(e) {
        return res.status(200).json({ raw: text });
      }
    }

    // ── Prepare : structure du dossier ────────────────────────────────────────
    if (action === 'prepare') {
      const answersText = (answers || []).map(a => `Q: ${a.question}\nR: ${a.answer}`).join('\n\n');
      const participants = (body.participants || []).join(', ') || 'non précisés';
      const eventType = body.type || 'REUNION';

      const prepPrompt = `Tu es un expert en préparation de réunions institutionnelles et professionnelles.

Événement : "${text}"
Type : ${eventType}
Date : ${body.date || 'non précisée'}
Date actuelle : ${datetime || 'non précisée'}
Participants : ${participants}

Réponses de l'utilisateur :
${answersText}

Génère un dossier de préparation COMPLET et PROFESSIONNEL.
Pour une REUNION, inclus obligatoirement ces sections dans cet ordre :
1. 🎯 Objectif de séance (ce qui doit être décidé/validé)
2. 👥 Participants et positionnement (intérêts et postures de chacun)
3. 📋 Ordre du jour détaillé (points à traiter avec timing suggéré)
4. ⚡ Contexte et enjeux (situation actuelle, tensions, éléments chauds)
5. 🎤 Points clés à porter (arguments, positions à défendre)
6. ⚠️ Points de vigilance (risques, sujets sensibles à anticiper)
7. 📎 Documents à préparer (ce qu'il faut avoir avec soi)

JSON uniquement :
{
  "preparation": {
    "titre": "Titre du dossier",
    "sections": [
      {
        "emoji": "🎯",
        "titre": "Titre section",
        "items": ["item 1", "item 2", "item 3"]
      }
    ]
  },
  "hasEmail": true,
  "email": {
    "sujet": "sujet email professionnel",
    "corps": "corps email complet avec ordre du jour et informations pratiques",
    "destinataires": ["noms"]
  },
  "pdf": {
    "titre": "Titre du document PDF",
    "sections": [
      {
        "titre": "Titre section",
        "items": ["item à enrichir 1", "item à enrichir 2"]
      }
    ],
    "meta": {
      "date": "${body.date || ''}",
      "participants": "${participants}",
      "lieu": "lieu si mentionné ou À préciser",
      "duree": "${body.duree || 'À préciser'}"
    }
  }
}

Règles :
- Items concrets et actionnables, pas de généralités
- Tout en français
- JSON uniquement`;

      const prepRaw = await callGemini(prepPrompt, 15000);
      let prepData;
      try {
        prepData = parseJSON(prepRaw);
      } catch(e) {
        return res.status(200).json({ raw: text });
      }

      // ── Enrich : deuxième passe — format scannable ───────────────────────────
      const pdfSections = prepData.pdf?.sections || [];
      const sectionsText = pdfSections.map(s =>
        `SECTION: ${s.titre}\n${(s.items || []).map(i => `- ${i}`).join('\n')}`
      ).join('\n\n');

      const enrichPrompt = `Tu es un expert qui prepare des dossiers de reunion ultra-lisibles.

Contexte :
- Evenement : "${text}"
- Participants : ${participants}
- Date : ${body.date || 'non precisee'}
- Reponses : ${answersText}

Structure a enrichir :
${sectionsText}

REGLES ABSOLUES — toute violation invalide le document :
1. ZERO emoji, ZERO symbole special, ZERO esperluette, ZERO pourcent, ZERO arobase
2. Uniquement : lettres a-z, chiffres 0-9, tiret, point, virgule, apostrophe, parentheses
3. Titre du point : 4 mots maximum
4. DETAIL : 1 phrase factuelle avec chiffre ou nom precis. Si incertain : "(a verifier)"
5. IDEE : outil concret nomme, service reel, methode avec un nom. PAS une reformulation du detail.
6. Exactement 5 IDEE par point, ni plus ni moins
7. Exclusivement en francais

FORMAT EXACT a respecter a la lettre :

SECTION: Titre section
POINT: Titre point court
DETAIL: Une phrase factuelle
IDEE: Premiere idee avec outil ou methode nommee
IDEE: Deuxieme idee differente
IDEE: Troisieme idee differente
IDEE: Quatrieme idee differente
IDEE: Cinquieme idee differente
POINT: Titre suivant
DETAIL: Phrase factuelle
IDEE: Idee 1
IDEE: Idee 2
IDEE: Idee 3
IDEE: Idee 4
IDEE: Idee 5

SECTION: Section suivante
...

Commence directement par SECTION:, rien avant, rien apres.`;

      let enrichedRaw = '';
      try {
        enrichedRaw = await callGemini(enrichPrompt, 20000);
      } catch(e) {
        console.log('[calendrier] enrich failed, using basic content');
        enrichedRaw = pdfSections.map(s =>
          `SECTION: ${s.titre.toUpperCase()}\n` +
          (s.items || []).map(i => `POINT: ${i}\nDETAIL: À compléter`).join('\n')
        ).join('\n\n');
      }

      // Nettoyer emojis, symboles et artefacts d'encodage que Gemini glisse
      const stripEmojis = (str) => str
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/[\u{200B}-\u{200F}]/gu, '')
        .replace(/%[^\w\s]/g, '')
        .replace(/[^\x00-\x7E\u00C0-\u024F\s]/g, '')
        .trim();

      // Parser le format SECTION/POINT/DETAIL/IDEE en structure JSON propre
      const parsedSections = [];
      let currentSection = null;
      let currentPoint = null;

      for (const line of enrichedRaw.split('\n')) {
        const trimmed = stripEmojis(line.trim());
        if (!trimmed) continue;

        if (trimmed.startsWith('SECTION:')) {
          if (currentSection) parsedSections.push(currentSection);
          currentSection = { titre: stripEmojis(trimmed.replace('SECTION:', '').trim()), points: [] };
          currentPoint = null;
        } else if (trimmed.startsWith('POINT:')) {
          currentPoint = { titre: stripEmojis(trimmed.replace('POINT:', '').trim()), detail: '', idees: [] };
          if (currentSection) currentSection.points.push(currentPoint);
        } else if (trimmed.startsWith('DETAIL:') && currentPoint) {
          currentPoint.detail = stripEmojis(trimmed.replace('DETAIL:', '').trim());
        } else if (trimmed.startsWith('IDEE:') && currentPoint) {
          currentPoint.idees.push(stripEmojis(trimmed.replace('IDEE:', '').trim()));
        }
      }
      if (currentSection) parsedSections.push(currentSection);

      // Construire le contenu PDF enrichi
      const meta = prepData.pdf?.meta || {};
      prepData.pdf = {
        titre: prepData.pdf?.titre || `Dossier — ${text}`,
        meta: {
          date: meta.date || body.date || 'À préciser',
          lieu: meta.lieu || 'À préciser',
          duree: meta.duree || body.duree || 'À préciser',
          participants: meta.participants || participants
        },
        sections: parsedSections,
        generatedAt: new Date().toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'})
      };

      return res.status(200).json(prepData);
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    return res.status(400).json({ error: 'Action non reconnue' });

  } catch (err) {
    console.error('[calendrier] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
