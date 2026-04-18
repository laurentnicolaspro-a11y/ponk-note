const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET - load profile by email
  if (req.method === 'GET') {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Profil introuvable' });
    return res.status(200).json(data);
  }

  // POST - create or update profile
  if (req.method === 'POST') {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const { email, name, prefs, contacts } = body;
    if (!email || !name) return res.status(400).json({ error: 'Email et nom requis' });

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ email, name, prefs: prefs || {}, contacts: contacts || [], updated_at: new Date() })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
