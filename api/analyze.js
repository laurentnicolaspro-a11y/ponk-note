// api/analyze.js — Vercel Serverless Function
// Reçoit l'audio, transcrit + résume avec Gemini 2.5 Flash

import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '25mb',
  },
};

// Helper : parse multipart form-data sans lib externe
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) return reject(new Error('No boundary found'));

      const boundary = '--' + boundaryMatch[1];
      const parts = body.toString('binary').split(boundary);
      const result = { fields: {}, files: {} };

      for (const part of parts) {
        if (part === '--\r\n' || part.trim() === '--') continue;
        const [rawHeaders, ...bodyParts] = part.split('\r\n\r\n');
        if (!rawHeaders) continue;
        const bodyStr = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '');

        const nameMatch = rawHeaders.match(/name="([^"]+)"/);
        const filenameMatch = rawHeaders.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;

        const name = nameMatch[1];
        if (filenameMatch) {
          // C'est un fichier
          result.files[name] = {
            filename: filenameMatch[1],
            data: Buffer.from(bodyStr, 'binary'),
          };
        } else {
          result.fields[name] = bodyStr.trim();
        }
      }
      resolve(result);
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Parse les données du formulaire
    const { fields, files } = await parseFormData(req);
    const audioFile = files['audio'];
    const title = fields['title'] || 'Réunion';
    const duration = fields['duration'] || 'inconnue';

    if (!audioFile) {
      return res.status(400).json({ error: 'Aucun fichier audio reçu' });
    }

    // 2. Init Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });

    // 3. Convertir l'audio en base64
    const audioBase64 = audioFile.data.toString('base64');
    const mimeType = 'audio/webm'; // MediaRecorder produit du webm

    // 4. Prompt structuré pour obtenir JSON
    const prompt = `Tu es un assistant spécialisé dans la synthèse de réunions professionnelles.

Voici un enregistrement audio d'une réunion intitulée "${title}" (durée : ${duration}).

Analyse cet enregistrement et réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ou après.

Format attendu :
{
  "transcript": "transcription complète et fidèle de la réunion en français",
  "summary": "résumé structuré de la réunion en 3 à 6 paragraphes : contexte, sujets abordés, décisions prises, prochaines étapes",
  "actions": [
    "Action 1 : description claire et actionnable avec responsable si mentionné",
    "Action 2 : ...",
    "..."
  ]
}

Si l'audio est vide, inaudible ou trop court, mets des valeurs explicatives dans chaque champ.
Réponds UNIQUEMENT avec le JSON.`;

    // 5. Appel Gemini avec audio inline
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      },
      { text: prompt },
    ]);

    const rawText = result.response.text();

    // 6. Parse le JSON (enlève les éventuels backticks résiduels)
    const clean = rawText.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Fallback : renvoie le texte brut en cas d'échec du parsing
      parsed = {
        transcript: rawText,
        summary: 'Impossible de parser la réponse structurée. Voir la transcription brute.',
        actions: [],
      };
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('[analyze] Error:', err);

    // Fallback Gemini Flash-Lite si quota dépassé
    if (err.message?.includes('quota') || err.status === 429) {
      return res.status(429).json({ error: 'Quota API dépassé. Réessayez dans quelques instants.' });
    }

    return res.status(500).json({ error: err.message || 'Erreur interne serveur' });
  }
}
