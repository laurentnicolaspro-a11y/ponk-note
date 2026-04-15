const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'No boundary' });

    const boundary = '--' + boundaryMatch[1];
    const parts = body.toString('binary').split(boundary);
    const fields = {};
    const files = {};

    for (const part of parts) {
      if (part === '--\r\n' || part.trim() === '--') continue;
      const [rawHeaders, ...bodyParts] = part.split('\r\n\r\n');
      if (!rawHeaders) continue;
      const bodyStr = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '');
      const nameMatch = rawHeaders.match(/name="([^"]+)"/);
      const filenameMatch = rawHeaders.match(/filename="([^"]+)"/);
      if (!nameMatch) continue;
      if (filenameMatch) {
        files[nameMatch[1]] = { filename: filenameMatch[1], data: Buffer.from(bodyStr, 'binary') };
      } else {
        fields[nameMatch[1]] = bodyStr.trim();
      }
    }

    const audioFile = files['audio'];
    if (!audioFile) return res.status(400).json({ error: 'Aucun fichier audio reçu' });

    const title = fields['title'] || 'Réunion';
    const duration = fields['duration'] || 'inconnue';

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });

    const audioBase64 = audioFile.data.toString('base64');

    const prompt = `Tu es un assistant spécialisé dans la synthèse de réunions professionnelles.

Voici un enregistrement audio d'une réunion intitulée "${title}" (durée : ${duration}).

Analyse cet enregistrement et réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ou après.

Format attendu :
{
  "transcript": "transcription complète et fidèle en français",
  "summary": "résumé structuré en 3 à 6 paragraphes",
  "actions": ["Action 1", "Action 2"]
}

Réponds UNIQUEMENT avec le JSON.`;

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      { text: prompt }
    ]);

    const rawText = result.response.text();
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { transcript: rawText, summary: 'Erreur de parsing.', actions: [] };
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('[analyze] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
