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

    const groups = {};
    const singles = [];

    for (const f of (files || [])) {
      if (!f.name || f.name === '.emptyFolderPlaceholder' || !f.name.endsWith('.webm')) continue;

      const segMatch = f.name.match(/^(.+)-seg(\d{3})\.webm$/);
      if (segMatch) {
        const prefix = segMatch[1];
        const idx    = parseInt(segMatch[2]);
        if (!groups[prefix]) {
          groups[prefix] = { representative: null, segments: [], totalSize: 0 };
        }
        groups[prefix].segments.push({ ...f, segIndex: idx });
        groups[prefix].totalSize += f.metadata?.size || 0;
        if (idx === 0) groups[prefix].representative = f;
      } else {
        singles.push(f);
      }
    }

    const merged = [];

    for (const prefix of Object.keys(groups)) {
      const g = groups[prefix];
      g.segments.sort((a, b) => a.segIndex - b.segIndex);
      const rep = g.representative || g.segments[0];
      if (!rep) continue;

      merged.push({
        ...rep,
        name: rep.name.replace(/-seg\d{3}\.webm$/, '.webm'),
        metadata: { ...(rep.metadata || {}), size: g.totalSize },
        _segmented: true,
        _segmentFiles: g.segments.map(s => `${uid}/${s.name}`),
        _segmentCount: g.segments.length
      });
    }

    const allFiles = [...singles, ...merged].sort((a, b) => {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return res.status(200).json({ files: allFiles });

  } catch (err) {
    console.error('[list] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
