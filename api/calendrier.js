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

Analyse cet événement. S'il s'agit d'une réunion (REUNION), pose exactement ces 4 questions dans cet ordre :
1. "Sur quoi doit-on aboutir concrètement à la fin de cette réunion ?" (objectif décisionnel)
2. "Qui participe et quels sont leurs intérêts ou positions ?" (rapport de force)
3. "Y a-t-il un événement récent, une tension ou un chiffre clé qui sera forcément sur la table ?" (contexte chaud)
4. "Quelle est ta position ou ton objectif personnel en entrant dans cette réunion ?" (posture)

Pour les autres types, génère 2 à 4 questions adaptées au contexte.

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
    {"id": 4, "question": "question ?"}
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

      // ── Enrich : deuxième passe pour développer le contenu PDF ───────────────
      const pdfSections = prepData.pdf?.sections || [];
      const sectionsText = pdfSections.map(s =>
        `### ${s.titre}\n${(s.items || []).map(i => `- ${i}`).join('\n')}`
      ).join('\n\n');

      const enrichPrompt = `Tu es un expert qui enrichit des dossiers de réunion avec des informations factuelles précises.

Contexte de la réunion :
- Événement : "${text}"
- Participants : ${participants}
- Date : ${body.date || 'non précisée'}
- Réponses utilisateur : ${answersText}

Voici la structure du dossier à enrichir :
${sectionsText}

Pour CHAQUE point listé, développe-le avec :
- Des informations factuelles concrètes que tu connais sur le sujet
- Des chiffres, statistiques ou données de référence si pertinents
- Des éléments de contexte utiles pour la réunion
- Des questions ou sous-points à creuser

IMPORTANT :
- Si tu n'es pas certain d'une information locale précise, indique-le avec "(à vérifier localement)"
- Reste factuel et professionnel
- Développe chaque point en 2 à 4 lignes substantielles

Retourne le dossier enrichi en markdown structuré, avec ce format exact :

## [Titre section]
### [Sous-titre point]
[Développement factuel et enrichi]

---

Markdown uniquement, pas de JSON, pas d'introduction.`;

      let enrichedContent = '';
      try {
        enrichedContent = await callGemini(enrichPrompt, 20000);
      } catch(e) {
        console.log('[calendrier] enrich failed, using basic content');
        // Fallback : construire un markdown basique depuis la structure
        enrichedContent = pdfSections.map(s =>
          `## ${s.titre}\n${(s.items || []).map(i => `- ${i}`).join('\n')}`
        ).join('\n\n');
      }

      // Construire le PDF final avec métadonnées + contenu enrichi
      const meta = prepData.pdf?.meta || {};
      const pdfContenu = `Date : ${meta.date || 'À préciser'}
Lieu : ${meta.lieu || 'À préciser'}
Durée prévue : ${meta.duree || 'À préciser'}
Participants : ${meta.participants || participants}

---

${enrichedContent}

---

Document généré par Ponk Note le ${new Date().toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'})}`;

      // Injecter le contenu enrichi dans la réponse finale
      prepData.pdf = {
        titre: prepData.pdf?.titre || `Dossier de séance — ${text}`,
        contenu: pdfContenu
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
