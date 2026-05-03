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

    const MODELS_LITE_FIRST  = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
    const MODELS_FLASH_FIRST = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    async function callGemini(prompt, timeoutMs, models) {
      for (const modelName of models) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const timeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutMs)
            );
            const result = await Promise.race([model.generateContent(prompt), timeout]);
            console.log(`[calendrier] success: ${modelName} attempt ${attempt} action:${action}`);
            return result.response.text().trim();
          } catch (e) {
            const isTransient =
              e.message.includes('503') ||
              e.message.includes('429') ||
              e.message.includes('timeout') ||
              e.message.includes('UNAVAILABLE');
            console.log(`[calendrier] ${modelName} attempt ${attempt} failed (${isTransient ? 'transient' : 'fatal'}):`, e.message);
            if (isTransient && attempt < 3) {
              await new Promise(r => setTimeout(r, attempt * 1500));
              continue;
            }
            break;
          }
        }
      }
      throw new Error('Tous les modeles ont echoue');
    }

    function parseJSON(raw) {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    }

    // ── Deep analyze ──────────────────────────────────────────────────────────
    if (action === 'deepanalyze') {
      const prompt = `Tu es un expert analyste. Fais une analyse complete et structuree sur le sujet suivant :

"${text}"

Format de reponse en francais, structure avec des sections claires :
- Commence par un resume en 2-3 phrases
- Developpe en 3-5 points cles avec des titres en gras
- Termine par une conclusion ou recommandation
- Sois factuel, precis et utile
- Maximum 400 mots

Reponds directement sans introduction.`;

      const analysis = await callGemini(prompt, 10000, MODELS_LITE_FIRST);
      return res.status(200).json({ analysis });
    }

    // ── Parse ─────────────────────────────────────────────────────────────────
    if (action === 'parse') {
      const prompt = `Tu es un assistant expert en preparation de reunions et d'evenements.

Evenement : "${text}"
Date actuelle : ${datetime || 'non precisee'}

Analyse cet evenement. S'il s'agit d'une reunion (REUNION), pose exactement ces 5 questions dans cet ordre :
1. "Sur quoi doit-on aboutir concretement a la fin de cette reunion ?" (objectif decisionnel)
2. "Qui participe et quels sont leurs interets ou positions ?" (rapport de force)
3. "Y a-t-il un evenement recent, une tension ou un chiffre cle qui sera forcement sur la table ?" (contexte chaud)
4. "Quelle est ta position ou ton objectif personnel en entrant dans cette reunion ?" (posture)
5. "As-tu d'autres precisions a ajouter qui pourraient etre utiles pour la preparation ?" (informations complementaires)

Pour les autres types, genere 2 a 4 questions adaptees au contexte, et ajoute toujours en derniere position : "As-tu d'autres precisions a ajouter ?"

JSON uniquement :
{
  "titre": "titre court et precis",
  "type": "REUNION|RDVMEDICAL|ENTRETIEN|APPEL|ANNIVERSAIRE|VOYAGE|REPAS|SPORT|FORMATION|ADMINISTRATIF|AUTRE",
  "date": "date extraite ou null",
  "heure": "heure extraite ou null",
  "duree": "duree estimee ou null",
  "description": "description courte en 1 phrase",
  "participants": ["noms si mentionnes"],
  "questions": [
    {"id": 1, "question": "question ?"},
    {"id": 2, "question": "question ?"},
    {"id": 3, "question": "question ?"},
    {"id": 4, "question": "question ?"},
    {"id": 5, "question": "question ?"}
  ]
}

JSON uniquement, pas de texte autour.`;

      const raw = await callGemini(prompt, 10000, MODELS_LITE_FIRST);
      try {
        return res.status(200).json(parseJSON(raw));
      } catch (e) {
        return res.status(200).json({ raw: text });
      }
    }

    // ── Prepare : structure + enrichissement en UN SEUL appel ─────────────────
    if (action === 'prepare') {
      const answersText = (answers || []).map(a => `Q: ${a.question}\nR: ${a.answer}`).join('\n\n');
      const participants = (body.participants || []).join(', ') || 'non precises';
      const eventType = body.type || 'REUNION';
      const generatedAt = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

      const prepPrompt = `Tu es un expert en preparation de reunions institutionnelles et professionnelles.

Evenement : "${text}"
Type : ${eventType}
Date : ${body.date || 'non precisee'}
Date actuelle : ${datetime || 'non precisee'}
Participants : ${participants}

Reponses de l utilisateur :
${answersText}

Reponds en DEUX PARTIES separees par la ligne ---DOSSIER---

PARTIE 1 - JSON valide uniquement :
{
  "preparation": {
    "titre": "Titre du dossier",
    "sections": [
      { "emoji": "cible", "titre": "Objectif de seance", "items": ["item concret 1", "item 2"] },
      { "emoji": "groupe", "titre": "Participants et positionnement", "items": ["item 1"] },
      { "emoji": "liste", "titre": "Ordre du jour detaille", "items": ["item 1"] },
      { "emoji": "eclair", "titre": "Contexte et enjeux", "items": ["item 1"] },
      { "emoji": "micro", "titre": "Points cles a porter", "items": ["item 1"] },
      { "emoji": "alerte", "titre": "Points de vigilance", "items": ["item 1"] },
      { "emoji": "trombone", "titre": "Documents a preparer", "items": ["item 1"] }
    ]
  },
  "hasEmail": true,
  "email": {
    "sujet": "sujet email professionnel",
    "corps": "corps email complet avec ordre du jour",
    "destinataires": ["noms"]
  },
  "pdf": {
    "titre": "Titre du document PDF",
    "meta": {
      "date": "${body.date || 'A preciser'}",
      "participants": "${participants}",
      "lieu": "lieu si mentionne ou A preciser",
      "duree": "${body.duree || 'A preciser'}"
    }
  }
}

---DOSSIER---

PARTIE 2 - Dossier PDF enrichi. FORMAT STRICT (sans emoji, sans symbole special) :

SECTION: Titre section
POINT: Titre court (4 mots max)
DETAIL: Une phrase factuelle avec chiffre ou nom precis
IDEE: Premiere idee avec outil ou methode nommee
IDEE: Deuxieme idee differente
IDEE: Troisieme idee differente
IDEE: Quatrieme idee differente
IDEE: Cinquieme idee differente

Genere 3 a 5 SECTION avec 2 a 3 POINT chacune. Tout en francais. Commence directement par SECTION:.`;

      let prepRaw = '';
      try {
        prepRaw = await callGemini(prepPrompt, 30000, MODELS_FLASH_FIRST);
      } catch (e) {
        return res.status(500).json({ error: 'Preparation echouee : ' + e.message });
      }

      // Separer JSON et bloc DOSSIER
      const splitIdx = prepRaw.indexOf('---DOSSIER---');
      const jsonPart    = splitIdx !== -1 ? prepRaw.slice(0, splitIdx) : prepRaw;
      const enrichedRaw = splitIdx !== -1 ? prepRaw.slice(splitIdx + 13) : '';

      let prepData;
      try {
        prepData = parseJSON(jsonPart);
      } catch (e) {
        return res.status(200).json({ raw: text });
      }

      // Nettoyer emojis et symboles parasites
      const strip = (str) => str
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/[\u{200B}-\u{200F}]/gu, '')
        .replace(/%[^\w\s]/g, '')
        .replace(/[^\x00-\x7E\u00C0-\u024F\s]/g, '')
        .trim();

      // Parser le format SECTION/POINT/DETAIL/IDEE
      const parsedSections = [];
      let currentSection = null;
      let currentPoint = null;

      for (const line of enrichedRaw.split('\n')) {
        const trimmed = strip(line.trim());
        if (!trimmed) continue;
        if (trimmed.startsWith('SECTION:')) {
          if (currentSection) parsedSections.push(currentSection);
          currentSection = { titre: strip(trimmed.replace('SECTION:', '').trim()), points: [] };
          currentPoint = null;
        } else if (trimmed.startsWith('POINT:')) {
          currentPoint = { titre: strip(trimmed.replace('POINT:', '').trim()), detail: '', idees: [] };
          if (currentSection) currentSection.points.push(currentPoint);
        } else if (trimmed.startsWith('DETAIL:') && currentPoint) {
          currentPoint.detail = strip(trimmed.replace('DETAIL:', '').trim());
        } else if (trimmed.startsWith('IDEE:') && currentPoint) {
          currentPoint.idees.push(strip(trimmed.replace('IDEE:', '').trim()));
        }
      }
      if (currentSection) parsedSections.push(currentSection);

      prepData.pdf = {
        titre: prepData.pdf?.titre || `Dossier - ${text}`,
        meta: prepData.pdf?.meta || {
          date: body.date || 'A preciser',
          lieu: 'A preciser',
          duree: body.duree || 'A preciser',
          participants
        },
        sections: parsedSections,
        generatedAt
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
