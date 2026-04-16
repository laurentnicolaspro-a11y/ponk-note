const { google } = require('googleapis');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
        files[nameMatch[1]] = { data: Buffer.from(bodyStr, 'binary') };
      } else {
        fields[nameMatch[1]] = bodyStr.trim();
      }
    }

    const audioFile = files['audio'];
    if (!audioFile) return res.status(400).json({ error: 'Aucun fichier audio' });

    // Auth
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const profile = fields['profile'] || 'user';
    const title = (fields['title'] || 'enregistrement').replace(/\s+/g, '_');
    const fileName = `${profile}-${title}-${dateStr}.webm`;

    // Créer dans le Drive du compte de service (sans parent)
    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'audio/webm'
      },
      media: {
        mimeType: 'audio/webm',
        body: Readable.from(audioFile.data)
      },
      fields: 'id, name'
    });

    const fileId = created.data.id;

    // Partager avec l'owner du Drive
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: process.env.GOOGLE_OWNER_EMAIL
      },
      sendNotificationEmail: false
    });

    // Lien direct
    const link = `https://drive.google.com/file/d/${fileId}/view`;

    return res.status(200).json({ fileId, fileName, link });

  } catch (err) {
    console.error('[upload] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
