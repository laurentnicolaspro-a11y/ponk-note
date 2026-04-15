# MeetSync 🎙

Enregistreur de réunions avec synthèse IA (transcription + résumé + points d'action).

## Stack
- Frontend : HTML/CSS/JS pur
- Backend : Vercel Serverless (`api/analyze.js`)
- IA : Google Gemini 2.5 Flash (audio multimodal natif)

## Structure
```
/
├── index.html          → Frontend complet
├── api/
│   └── analyze.js      → Route serverless Vercel
├── vercel.json         → Config Vercel
├── package.json
└── .env.local          → Variables d'environnement (ne pas commiter)
```

## Déploiement Vercel

### 1. Variables d'environnement
Dans le dashboard Vercel → Settings → Environment Variables :
```
GEMINI_API_KEY=ta_clé_gemini_ici
```

### 2. Deploy
```bash
npm install
vercel deploy
```

## Dev local
```bash
vercel dev
# → http://localhost:3000
```

## Fonctionnement
1. L'utilisateur enregistre la réunion via le micro du navigateur
2. Le blob audio (WebM) est envoyé à `/api/analyze` via FormData
3. Gemini 2.5 Flash reçoit l'audio en base64 (multimodal natif)
4. Le modèle retourne un JSON structuré : transcription + résumé + actions
5. Le frontend affiche les 3 blocs séparément

## Limites à connaître
- Taille max audio : ~25 MB (environ 45 min en WebM)
- Gemini supporte nativement le WebM/Opus produit par MediaRecorder
- Ajouter un fallback `gemini-2.0-flash` en cas de quota dépassé
