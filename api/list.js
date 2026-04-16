module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'uid requis' });

    const response = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/list/audio`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prefix: `${uid}/`,
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        })
      }
    );

    if (!response.ok) throw new Error('Erreur Supabase list');
    const files = await response.json();

    return res.status(200).json({ files: files || [] });

  } catch (err) {
    console.error('[list] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
