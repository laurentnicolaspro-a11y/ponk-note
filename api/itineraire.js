module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
      });
      body = JSON.parse(Buffer.concat(chunks).toString());
    }

    const { action, lat, lon, destLat, destLon, mode } = body;

    // ── Météo ─────────────────────────────────────────────────────────────────
    if (action === 'weather') {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) return res.status(200).json({ error: 'Clé météo manquante' });

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=fr`;
      const r = await fetch(url);
      const data = await r.json();

      if (data.cod != 200) return res.status(200).json({ error: 'Météo indisponible', detail: data.message });

      const iconCode = data.weather[0].icon;
      const iconMap = {
        '01d':'☀️','01n':'🌙','02d':'⛅','02n':'⛅',
        '03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️',
        '09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌦️',
        '11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️',
        '50d':'🌫️','50n':'🌫️'
      };

      return res.status(200).json({
        temp:        Math.round(data.main.temp),
        feels_like:  Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon:        iconMap[iconCode] || '🌤️',
        wind:        Math.round(data.wind.speed * 3.6), // m/s -> km/h
        humidity:    data.main.humidity,
        city:        data.name
      });
    }

    // ── POI à proximité (OpenStreetMap Overpass) ──────────────────────────────
    if (action === 'poi') {
      const radius = 500;

      const query = `[out:json][timeout:6];(node["amenity"~"cafe|bakery|restaurant|fast_food|bar"](around:${radius},${lat},${lon});node["shop"="bakery"](around:${radius},${lat},${lon}););out body 15;`;

      // Essayer plusieurs mirrors Overpass
      const mirrors = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.openstreetmap.fr/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      let data = null;
      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const r = await fetch(mirror + '?data=' + encodeURIComponent(query), {
            signal: controller.signal,
            headers: { 'User-Agent': 'PonkNote/1.0', 'Accept': 'application/json' }
          });
          clearTimeout(timer);
          if (r.ok) { data = await r.json(); break; }
        } catch(e) {
          console.log('[poi] mirror failed:', mirror, e.message);
        }
      }

      if (!data) return res.status(200).json({ pois: [], error: 'POI indisponible' });

      const getEmoji = (tags) => {
        if (tags.amenity === 'cafe')       return '☕';
        if (tags.amenity === 'bakery' || tags.shop === 'bakery') return '🥐';
        if (tags.amenity === 'restaurant') return '🍽️';
        if (tags.amenity === 'fast_food')  return '🍔';
        if (tags.amenity === 'bar')        return '🍺';
        return '📍';
      };

      // Calculer distance à vol d'oiseau
      const distKm = (la1, lo1, la2, lo2) => {
        const R = 6371;
        const dLat = (la2 - la1) * Math.PI / 180;
        const dLon = (lo2 - lo1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180) * Math.cos(la2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      const pois = (data.elements || [])
        .filter(e => e.tags && e.tags.name)
        .map(e => ({
          name:     e.tags.name,
          emoji:    getEmoji(e.tags),
          distance: Math.round(distKm(lat, lon, e.lat, e.lon) * 1000),
          address:  e.tags['addr:street'] ? `${e.tags['addr:housenumber'] || ''} ${e.tags['addr:street']}`.trim() : null,
          opening:  e.tags.opening_hours || null,
          lat: e.lat, lon: e.lon
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);

      return res.status(200).json({ pois });
    }

    // ── Estimation durée trajet ───────────────────────────────────────────────
    if (action === 'duration') {
      // Distance à vol d'oiseau puis coefficient selon mode
      const R = 6371;
      const dLat = (destLat - lat) * Math.PI / 180;
      const dLon = (destLon - lon) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180) * Math.cos(destLat*Math.PI/180) * Math.sin(dLon/2)**2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      // Coefficients : route réelle ≈ 1.4x vol d'oiseau en ville
      const roadDist = distKm * 1.4;

      // Vitesses moyennes selon mode
      const speeds = { car: 40, walk: 5, transit: 25, bike: 15 };
      const speed  = speeds[mode] || 40;
      const mins   = Math.round((roadDist / speed) * 60);

      return res.status(200).json({
        distance_km: Math.round(roadDist * 10) / 10,
        duration_min: mins,
        mode: mode || 'car'
      });
    }

    return res.status(400).json({ error: 'Action non reconnue' });

  } catch(err) {
    console.error('[itineraire]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
