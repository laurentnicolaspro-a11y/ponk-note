// api/project.js — Gestion des projets Ponk Note
// Stockage : Supabase Storage bucket audio, fichiers JSON dans uid/projects/

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_PROJECTS = 3;

// ── Helpers Supabase Storage ─────────────────────────────────────────────────

async function supabaseGet(path) {
  const url = `${SUPABASE_URL}/storage/v1/object/audio/${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Supabase GET failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabasePut(path, data) {
  const url = `${SUPABASE_URL}/storage/v1/object/audio/${path}`;
  // Essayer PUT (upsert) — si 404 (objet inexistant), fallback POST (création)
  let res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'cache-control': 'no-cache'
    },
    body: JSON.stringify(data)
  });
  if (res.status === 404) {
    // Objet n'existe pas encore — créer avec POST
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'cache-control': 'no-cache'
      },
      body: JSON.stringify(data)
    });
  }
  if (!res.ok) throw new Error(`Supabase PUT failed ${res.status}: ${await res.text()}`);
  return true;
}

async function supabaseDelete(path) {
  const url = `${SUPABASE_URL}/storage/v1/object/audio`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [path] })
  });
  if (!res.ok && res.status !== 404) throw new Error(`Supabase DELETE failed ${res.status}`);
  return true;
}

async function supabaseList(prefix) {
  const url = `${SUPABASE_URL}/storage/v1/object/list/audio`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefix, limit: 100, offset: 0 })
  });
  if (!res.ok) throw new Error(`Supabase LIST failed ${res.status}`);
  return res.json();
}

// ── Générer un ID court ──────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Handler principal ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Parser le body pour POST
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', c => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
    }

    const action = req.query.action || body.action;
    const uid    = req.query.uid    || body.uid;

    if (!action) return res.status(400).json({ error: 'action requise' });
    if (!uid)    return res.status(400).json({ error: 'uid requis' });

    const projectsPrefix = `${uid}/projects/`;

    // ── LIST — lister tous les projets ──────────────────────────────────────
    if (action === 'list') {
      const files = await supabaseList(projectsPrefix);
      const projects = [];

      for (const f of (files || [])) {
        if (!f.name || !f.name.endsWith('.json')) continue;
        try {
          const proj = await supabaseGet(`${projectsPrefix}${f.name}`);
          if (proj) projects.push(proj);
        } catch {}
      }

      // Trier par date de création desc
      projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ projects });
    }

    // ── CREATE — créer un nouveau projet ────────────────────────────────────
    if (action === 'create') {
      const { nom, description, cadrage } = body;
      if (!nom) return res.status(400).json({ error: 'nom requis' });

      // Vérifier la limite
      const existing = await supabaseList(projectsPrefix);
      const count = (existing || []).filter(f => f.name && f.name.endsWith('.json')).length;
      if (count >= MAX_PROJECTS) {
        return res.status(400).json({ error: `Limite de ${MAX_PROJECTS} projets atteinte` });
      }

      const id = genId();
      const project = {
        id,
        nom,
        description: description || '',
        cadrage: cadrage || '',
        statut: 'en_cours',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reunions: []
      };

      await supabasePut(`${projectsPrefix}proj-${id}.json`, project);
      return res.status(200).json({ project });
    }

    // ── GET — lire un projet ─────────────────────────────────────────────────
    if (action === 'get') {
      const projectId = req.query.projectId || body.projectId;
      if (!projectId) return res.status(400).json({ error: 'projectId requis' });

      const project = await supabaseGet(`${projectsPrefix}proj-${projectId}.json`);
      if (!project) return res.status(404).json({ error: 'Projet introuvable' });
      return res.status(200).json({ project });
    }

    // ── ADD — ajouter une réunion à un projet ────────────────────────────────
    if (action === 'add') {
      const { projectId, reunion } = body;
      if (!projectId) return res.status(400).json({ error: 'projectId requis' });
      if (!reunion)   return res.status(400).json({ error: 'reunion requise' });

      const path = `${projectsPrefix}proj-${projectId}.json`;
      const project = await supabaseGet(path);
      if (!project) return res.status(404).json({ error: 'Projet introuvable' });

      // Éviter les doublons
      const exists = project.reunions.some(r => r.fileName === reunion.fileName);
      if (exists) return res.status(200).json({ project, alreadyAdded: true });

      project.reunions.push({
        fileName:  reunion.fileName,
        date:      reunion.date      || new Date().toISOString(),
        titre:     reunion.titre     || 'Réunion sans titre',
        resume:    reunion.resume    || '',
        decisions: reunion.decisions || [],
        actions:   (reunion.actions || []).map(a => ({ ...a, done: false }))
      });

      project.updatedAt = new Date().toISOString();
      await supabasePut(path, project);
      return res.status(200).json({ project });
    }

    // ── UPDATE — modifier le projet (statut, nom, cocher une action) ─────────
    if (action === 'update') {
      const { projectId, changes } = body;
      if (!projectId) return res.status(400).json({ error: 'projectId requis' });
      if (!changes)   return res.status(400).json({ error: 'changes requis' });

      const path = `${projectsPrefix}proj-${projectId}.json`;
      const project = await supabaseGet(path);
      if (!project) return res.status(404).json({ error: 'Projet introuvable' });

      // Champs racine modifiables
      const rootFields = ['nom', 'description', 'statut', 'cadrage', 'synthese', 'syntheseGeneratedAt'];
      for (const field of rootFields) {
        if (changes[field] !== undefined) project[field] = changes[field];
      }

      // Cocher/décocher une action dans une réunion
      // changes.actionToggle = { fileName, actionIndex }
      if (changes.actionToggle) {
        const { fileName, actionIndex } = changes.actionToggle;
        const reunion = project.reunions.find(r => r.fileName === fileName);
        if (reunion && reunion.actions[actionIndex] !== undefined) {
          reunion.actions[actionIndex].done = !reunion.actions[actionIndex].done;
        }
      }

      // Supprimer une réunion du projet
      if (changes.removeReunion) {
        project.reunions = project.reunions.filter(r => r.fileName !== changes.removeReunion);
      }

      project.updatedAt = new Date().toISOString();
      await supabasePut(path, project);
      return res.status(200).json({ project });
    }

    // ── SYNTHESE — générer et cacher la synthèse IA ──────────────────────────
    if (action === 'synthese') {
      const projectId = body.projectId;
      if (!projectId) return res.status(400).json({ error: 'projectId requis' });

      const path = `${projectsPrefix}proj-${projectId}.json`;
      const project = await supabaseGet(path);
      if (!project) return res.status(404).json({ error: 'Projet introuvable' });

      if (!project.reunions || project.reunions.length === 0) {
        return res.status(200).json({ synthese: '' });
      }

      const contexte = project.reunions.map((r, i) =>
        `Réunion ${i+1} (${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : ''}) — ${r.titre} :\n${r.resume}${r.decisions?.length ? '\nDécisions : ' + r.decisions.join(', ') : ''}`
      ).join('\n\n');

      const cadrageBlock = project.cadrage
        ? `\nContexte du projet (fourni par l'utilisateur) :\n${project.cadrage}\n`
        : '';

      const prompt = `Tu es un assistant de gestion de projet. Voici les informations sur le projet "${project.nom}" :\n${cadrageBlock}\nRésumés des réunions :\n\n${contexte}\n\nRédige une synthèse concise (3-5 phrases) de l'état d'avancement du projet : ce qui a été accompli, ce qui est en cours, et les points d'attention. Réponds en français, directement, sans titre.`;

      const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
      let synthese = '';

      for (const model of GEMINI_MODELS) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }
          );
          if (!geminiRes.ok) continue;
          const gData = await geminiRes.json();
          synthese = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (synthese) break;
        } catch {}
      }

      if (!synthese) return res.status(500).json({ error: 'Synthèse indisponible' });

      // Sauvegarder dans le projet
      project.synthese = synthese;
      project.syntheseGeneratedAt = new Date().toISOString();
      project.updatedAt = new Date().toISOString();
      await supabasePut(path, project);

      return res.status(200).json({ synthese });
    }

    // ── DELETE — supprimer un projet ─────────────────────────────────────────
    if (action === 'delete') {
      const projectId = req.query.projectId || body.projectId;
      if (!projectId) return res.status(400).json({ error: 'projectId requis' });

      await supabaseDelete(`${projectsPrefix}proj-${projectId}.json`);
      return res.status(200).json({ deleted: true });
    }

    return res.status(400).json({ error: `Action inconnue : ${action}` });

  } catch (err) {
    console.error('[project]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
