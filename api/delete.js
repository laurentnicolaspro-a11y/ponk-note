module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'path requis' });

    const response = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/audio`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [path] })
      }
    );

    if (!response.ok) throw new Error('Erreur suppression');
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[delete] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
