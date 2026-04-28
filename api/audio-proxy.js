module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path requis' });
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/audio/${path}`;
  return res.redirect(302, url);
};
