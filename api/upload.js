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

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const profile = fields['profile'] || 'user';
    const title = (fields['title'] || 'enregistrement').replace(/\s+/g, '_');
    const fileName = `${profile}/${dateStr}-${title}.webm`;

    // Upload vers Supabase Storage
    const uploadRes = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/audio/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'audio/webm',
          'x-upsert': 'true'
        },
        body: audioFile.data
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Supabase upload failed: ${err}`);
    }

    return res.status(200).json({
      fileName,
      path: `audio/${fileName}`
    });

  } catch (err) {
    console.error('[upload] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
