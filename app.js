/* ═══════════════════════════════════════════════════════════
   DroneWeather — Application Logic
   Open-Meteo API (gratuit, sans clé)
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════════
//  PROFILS DRONES DJI
// ══════════════════════════════════════════════════════════
const DRONE_PROFILES = [
  { id: 'avata2',    name: 'DJI Avata 2',     maxWind: 10.8, maxGusts: 13.0, weight: 410,  icon: '🥽' },
  { id: 'mini4pro',  name: 'DJI Mini 4 Pro',  maxWind: 10.8, maxGusts: 12.0, weight: 249,  icon: '🪶' },
  { id: 'air3',      name: 'DJI Air 3',        maxWind: 12.0, maxGusts: 14.0, weight: 720,  icon: '✈️' },
  { id: 'mavic3pro', name: 'DJI Mavic 3 Pro',  maxWind: 12.0, maxGusts: 14.0, weight: 958,  icon: '📷' },
  { id: 'inspire3',  name: 'DJI Inspire 3',    maxWind: 12.0, maxGusts: 15.0, weight: 3995, icon: '🎬' },
];

let currentDroneProfile = DRONE_PROFILES[0]; // Avata 2 par défaut

// ── Israël : aéroports & bases (CAAI — règle uniforme : interdit < 2 km)
// Source : CAAI Regulation, drone-laws.com/drone-laws-in-israel (2025)
const ISRAEL_AIRPORTS = [
  { name: 'Ben Gurion (TLV)',        lat: 32.0004, lon: 34.8706 },
  { name: 'Haïfa (HFA)',             lat: 32.8094, lon: 35.0431 },
  { name: 'Eilat Ramon (ETM)',       lat: 29.7269, lon: 35.0060 },
  { name: 'Ovda (VDA)',              lat: 29.9403, lon: 34.9358 },
  { name: 'Tel Nof (base militaire)',lat: 31.8394, lon: 34.8228 },
  { name: 'Ramat David (base militaire)', lat: 32.6650, lon: 35.1795 },
  { name: 'Herzliya (IDC)',          lat: 32.1800, lon: 34.8340 },
  { name: 'Beer Sheva (Teyman)',     lat: 31.2870, lon: 34.7228 },
];

// ── Codes météo Open-Meteo → emoji + description
const WMO_CODES = {
  0:  { emoji: '☀️',  label: 'Ciel dégagé' },
  1:  { emoji: '🌤',  label: 'Principalement clair' },
  2:  { emoji: '⛅️', label: 'Partiellement nuageux' },
  3:  { emoji: '☁️',  label: 'Couvert' },
  45: { emoji: '🌫',  label: 'Brouillard' },
  48: { emoji: '🌫',  label: 'Brouillard givrant' },
  51: { emoji: '🌦',  label: 'Bruine légère' },
  53: { emoji: '🌦',  label: 'Bruine modérée' },
  55: { emoji: '🌧',  label: 'Bruine dense' },
  61: { emoji: '🌧',  label: 'Pluie légère' },
  63: { emoji: '🌧',  label: 'Pluie modérée' },
  65: { emoji: '🌧',  label: 'Pluie forte' },
  71: { emoji: '❄️',  label: 'Neige légère' },
  73: { emoji: '❄️',  label: 'Neige modérée' },
  75: { emoji: '❄️',  label: 'Neige forte' },
  77: { emoji: '🌨',  label: 'Grésil' },
  80: { emoji: '🌦',  label: 'Averses légères' },
  81: { emoji: '🌧',  label: 'Averses modérées' },
  82: { emoji: '⛈',  label: 'Averses violentes' },
  85: { emoji: '🌨',  label: 'Averses de neige' },
  86: { emoji: '🌨',  label: 'Averses de neige forte' },
  95: { emoji: '⛈',  label: 'Orage' },
  96: { emoji: '⛈',  label: 'Orage avec grêle' },
  99: { emoji: '⛈',  label: 'Orage avec grêle forte' },
};

// ── Beaufort scale
function beaufort(ms) {
  if (ms < 0.3)  return { n: 0, label: 'Calme' };
  if (ms < 1.6)  return { n: 1, label: 'Très légère brise' };
  if (ms < 3.4)  return { n: 2, label: 'Légère brise' };
  if (ms < 5.5)  return { n: 3, label: 'Petite brise' };
  if (ms < 8.0)  return { n: 4, label: 'Jolie brise' };
  if (ms < 10.8) return { n: 5, label: 'Brise fraîche' };
  if (ms < 13.9) return { n: 6, label: 'Vent frais' };
  if (ms < 17.2) return { n: 7, label: 'Grand vent' };
  return { n: 8, label: 'Coup de vent' };
}

// ── Direction vent (degrés → texte)
function windDirText(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ── Distance entre deux points GPS (km)
function geoDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Vérification zones aéroportuaires (CAAI 2025)
// Règle officielle : interdiction dans les 2 km de tout aérodrome
function checkAirspace(lat, lon) {
  let minDist = Infinity, nearest = null;
  for (const ap of ISRAEL_AIRPORTS) {
    const d = geoDistKm(lat, lon, ap.lat, ap.lon);
    if (d < minDist) { minDist = d; nearest = ap; }
  }
  if (!nearest) return { status: 'clear', text: 'Hors zones restreintes', note: 'Espace aérien libre' };

  if (minDist < 2) {
    return {
      status: 'danger',
      text: `${nearest.name} — ${minDist.toFixed(2)} km`,
      note: `⛔ Zone interdite CAAI — Moins de 2 km de l'aérodrome`,
      airport: nearest.name, dist: minDist
    };
  }
  if (minDist < 5) {
    return {
      status: 'warning',
      text: `${nearest.name} — ${minDist.toFixed(1)} km`,
      note: `⚠️ Proximité CTR — Contacter la tour de contrôle avant tout vol`,
      airport: nearest.name, dist: minDist
    };
  }
  if (minDist < 10) {
    return {
      status: 'caution',
      text: `${nearest.name} — ${minDist.toFixed(1)} km`,
      note: `ℹ️ Zone de vigilance — Surveiller le trafic aérien`,
      airport: nearest.name, dist: minDist
    };
  }
  return { status: 'clear', text: 'Hors zones restreintes', note: 'Espace aérien libre pour cette position' };
}

// ══════════════════════════════════════════════════════════
//  SOUS-SCORES (0-100, relatifs au profil drone)
// ══════════════════════════════════════════════════════════

function calcWindScore(w, w80, profile) {
  let s = 100;
  const max = profile.maxWind;
  if (w >= max * 1.15)      s -= 60;
  else if (w >= max)        s -= 40;
  else if (w >= max * 0.75) s -= 20;
  else if (w >= max * 0.5)  s -= 8;
  if (w80 >= max * 1.1)     s -= 15;
  else if (w80 >= max * 0.85) s -= 8;
  const shear = Math.abs(w80 - w);
  if (shear > 5) s -= 10;
  return Math.max(0, s);
}

function calcGustsScore(g, profile) {
  let s = 100;
  const max = profile.maxGusts;
  if (g >= max * 1.1)      s -= 55;
  else if (g >= max)       s -= 38;
  else if (g >= max * 0.8) s -= 18;
  else if (g >= max * 0.6) s -= 6;
  return Math.max(0, s);
}

function calcRainScore(precip, precipProb) {
  let s = 100;
  if (precip > 2)           s -= 80;
  else if (precip > 0)      s -= 50;
  else if (precipProb >= 60) s -= 30;
  else if (precipProb >= 30) s -= 12;
  return Math.max(0, s);
}

function calcVisibilityScore(vis) {
  let s = 100;
  if (vis < 1)      s -= 70;
  else if (vis < 3) s -= 40;
  else if (vis < 5) s -= 15;
  return Math.max(0, s);
}

function calcCapeScore(cape) {
  let s = 100;
  if (cape > 1500)     s -= 70;
  else if (cape > 800) s -= 45;
  else if (cape > 300) s -= 20;
  return Math.max(0, s);
}

function calcKpScore(kp) {
  if (kp < 2) return 100;
  if (kp < 3) return 85;
  if (kp < 4) return 65;
  if (kp < 5) return 35;
  if (kp < 6) return 10;
  return 0;
}

function calcTempScore(t) {
  let s = 100;
  if (t < -5)      s -= 40;
  else if (t < 5)  s -= 20;
  else if (t < 10) s -= 10;
  else if (t > 38) s -= 15;
  return Math.max(0, s);
}

// Score météo pur — sans pénalité nuit ni airspace (pour le scanner de fenêtres)
function calcMeteoScore(params, profile) {
  profile = profile || currentDroneProfile;
  return Math.round(
    calcWindScore(params.wind10, params.wind80, profile) * 0.30 +
    calcGustsScore(params.gusts, profile)                * 0.20 +
    calcRainScore(params.precip, params.precipProb)      * 0.20 +
    calcVisibilityScore(params.visibility)               * 0.15 +
    calcCapeScore(params.cape)                           * 0.10 +
    calcTempScore(params.temp)                           * 0.05
  );
}

// ══════════════════════════════════════════════════════════
//  SCORE DE VOL — retourne { score, breakdown, reasons }
// ══════════════════════════════════════════════════════════
function calcFlightScore(params, droneProfile) {
  const profile = droneProfile || currentDroneProfile;
  const reasons = [];

  // ── 7 sous-scores de base
  const windS  = calcWindScore(params.wind10, params.wind80, profile);
  const gustsS = calcGustsScore(params.gusts, profile);
  const rainS  = calcRainScore(params.precip, params.precipProb);
  const visS   = calcVisibilityScore(params.visibility);
  const capeS  = calcCapeScore(params.cape);
  const tempS  = calcTempScore(params.temp);
  const kpS    = calcKpScore(params.kp ?? 0);

  // ── Score global = moyenne pondérée des 7 facteurs
  let score = Math.round(
    windS  * 0.27 +
    gustsS * 0.18 +
    rainS  * 0.20 +
    visS   * 0.15 +
    capeS  * 0.10 +
    tempS  * 0.05 +
    kpS    * 0.05
  );

  // ── Breakdown complet (chips conditionnels ajoutés ci-dessous)
  const breakdown = { wind: windS, gusts: gustsS, rain: rainS, visibility: visS, cape: capeS, temp: tempS, kp: kpS };

  // ── Nuit — cap dur
  if (!params.isDaytime) {
    breakdown.night = 0;
    score = Math.min(score, 15);
    reasons.push({ type:'danger', text: `<strong>Vol de nuit :</strong> Interdit par la CAAI sans autorisation spéciale` });
  }

  // ── Airspace — cap dur selon statut
  if (params.airspace) {
    const as = params.airspace;
    if (as.status === 'danger') {
      breakdown.airspace = 0;
      score = Math.min(score, 10);
      reasons.push({ type:'danger', text: `<strong>Zone interdite :</strong> ${as.airport} à ${as.dist.toFixed(1)} km — Autorisation CAAI obligatoire` });
    } else if (as.status === 'warning') {
      breakdown.airspace = 30;
      score = Math.min(score, 40);
      reasons.push({ type:'danger', text: `<strong>CTR active :</strong> ${as.airport} à ${as.dist.toFixed(1)} km — Autorisation requise` });
    } else if (as.status === 'caution') {
      breakdown.airspace = 70;
      reasons.push({ type:'warning', text: `<strong>Proximité aéroport :</strong> ${as.airport} à ${as.dist.toFixed(1)} km` });
    }
  }

  // ── Reasons (texte détaillé pour le panneau recommandations)
  const w = params.wind10, max = profile.maxWind;
  if (windS < 40)       reasons.push({ type:'danger',  text: `<strong>Vent dangereux au sol :</strong> ${w.toFixed(1)} m/s — Au-delà des limites du ${profile.name} (${max} m/s)` });
  else if (windS < 70)  reasons.push({ type:'warning', text: `<strong>Vent fort au sol :</strong> ${w.toFixed(1)} m/s — Vol difficile, haute vigilance` });
  else if (windS < 92)  reasons.push({ type:'warning', text: `<strong>Vent modéré au sol :</strong> ${w.toFixed(1)} m/s — Vol possible avec précaution` });
  else                  reasons.push({ type:'ok',      text: `<strong>Vent au sol acceptable :</strong> ${w.toFixed(1)} m/s` });

  const w80 = params.wind80, shear = Math.abs(w80 - w);
  if (w80 >= max * 1.1)       reasons.push({ type:'danger',  text: `<strong>Vent à 80m dangereux :</strong> ${w80.toFixed(1)} m/s` });
  else if (w80 >= max * 0.85) reasons.push({ type:'warning', text: `<strong>Vent à 80m élevé :</strong> ${w80.toFixed(1)} m/s — Limiter l'altitude` });
  if (shear > 5)              reasons.push({ type:'warning', text: `<strong>Cisaillement de vent :</strong> ${shear.toFixed(1)} m/s entre sol et 80m — Turbulences possibles` });

  const g = params.gusts, maxG = profile.maxGusts;
  if (gustsS < 45)      reasons.push({ type:'danger',  text: `<strong>Rafales extrêmes :</strong> ${g.toFixed(1)} m/s — Vol interdit` });
  else if (gustsS < 82) reasons.push({ type:'warning', text: `<strong>Rafales fortes :</strong> ${g.toFixed(1)} m/s — Risque de déstabilisation` });

  const p = params.precip, pp = params.precipProb;
  if (rainS < 30)       reasons.push({ type:'danger',  text: `<strong>Précipitations actives :</strong> ${p.toFixed(1)} mm — Vol interdit` });
  else if (rainS < 60)  reasons.push({ type:'danger',  text: `<strong>Précipitations faibles :</strong> ${p.toFixed(1)} mm — Vol fortement déconseillé` });
  else if (rainS < 88)  reasons.push({ type:'warning', text: `<strong>Probabilité de pluie :</strong> ${pp}% — Rester vigilant` });
  else                  reasons.push({ type:'ok',      text: `<strong>Pas de précipitations</strong> prévues` });

  const vis = params.visibility;
  if (visS < 35)        reasons.push({ type:'danger',  text: `<strong>Visibilité très faible :</strong> ${vis.toFixed(1)} km — Vol VLOS impossible` });
  else if (visS < 65)   reasons.push({ type:'danger',  text: `<strong>Visibilité réduite :</strong> ${vis.toFixed(1)} km — Conditions VLOS dégradées` });
  else if (visS < 90)   reasons.push({ type:'warning', text: `<strong>Visibilité limitée :</strong> ${vis.toFixed(1)} km — Vigilance recommandée` });
  else                  reasons.push({ type:'ok',      text: `<strong>Bonne visibilité :</strong> ${vis.toFixed(1)} km` });

  if (params.cloudCover >= 90) reasons.push({ type:'warning', text: `<strong>Couverture nuageuse totale :</strong> ${params.cloudCover}%` });

  const cape = params.cape;
  if (capeS < 35)       reasons.push({ type:'danger',  text: `<strong>Risque orage extrême (CAPE : ${Math.round(cape)} J/kg)</strong> — Vol dangereux` });
  else if (capeS < 60)  reasons.push({ type:'danger',  text: `<strong>Risque orage élevé (CAPE : ${Math.round(cape)} J/kg)</strong> — Vol fortement déconseillé` });
  else if (capeS < 85)  reasons.push({ type:'warning', text: `<strong>Instabilité atmosphérique (CAPE : ${Math.round(cape)} J/kg)</strong> — Orages possibles` });
  else                  reasons.push({ type:'ok',      text: `<strong>Atmosphère stable</strong> — Aucun risque d'orage` });

  const t = params.temp;
  if (tempS < 65)       reasons.push({ type:'danger',  text: `<strong>Température hors limites :</strong> ${t.toFixed(1)}°C — Batterie défaillante possible` });
  else if (tempS < 82)  reasons.push({ type:'warning', text: `<strong>Température froide/chaude :</strong> ${t.toFixed(1)}°C — Capacité batterie réduite` });
  else if (tempS < 92)  reasons.push({ type:'warning', text: `<strong>Température fraîche :</strong> ${t.toFixed(1)}°C — Légère réduction de batterie` });
  else                  reasons.push({ type:'ok',      text: `<strong>Température optimale :</strong> ${t.toFixed(1)}°C` });

  // ── Kp (activité géomagnétique)
  const kp = params.kp ?? 0;
  if (kp >= 6)      { score -= 35; reasons.push({ type:'danger',  text: `<strong>Tempête géomagnétique majeure (Kp : ${kp.toFixed(1)})</strong> — Compas et GPS fortement perturbés. Vol interdit.` }); }
  else if (kp >= 5) { score -= 20; reasons.push({ type:'danger',  text: `<strong>Tempête géomagnétique (Kp : ${kp.toFixed(1)})</strong> — Perturbations GPS possibles. Vol déconseillé.` }); }
  else if (kp >= 4) { score -= 10; reasons.push({ type:'warning', text: `<strong>Activité géomagnétique élevée (Kp : ${kp.toFixed(1)})</strong> — Vérifier calibration compas avant décollage.` }); }
  else if (kp >= 3) {              reasons.push({ type:'warning', text: `<strong>Légère activité magnétique (Kp : ${kp.toFixed(1)})</strong> — Surveiller le compas en vol.` }); }

  if (profile.weight > 250) {
    reasons.push({ type:'info', text: `<strong>UTM obligatoire (CAAI nov. 2023) :</strong> Le ${profile.name} (${profile.weight}g) doit être connecté à un système UTM actif. Sans connexion UTM, le vol est illégal en Israël.` });
  }

  return { score: Math.max(0, Math.min(100, score)), breakdown, reasons };
}

// ── Verdict
function getVerdict(score) {
  if (score >= 80) return { label: 'Conditions excellentes',   icon: '✅', cls: 'excellent' };
  if (score >= 65) return { label: 'Conditions favorables',    icon: '🟢', cls: 'good' };
  if (score >= 45) return { label: 'Vol avec précautions',     icon: '⚠️', cls: 'caution' };
  if (score >= 25) return { label: 'Conditions difficiles',    icon: '🔶', cls: 'caution' };
  return               { label: 'Vol déconseillé / interdit', icon: '🔴', cls: 'danger' };
}

// ── Couleur barre/jauge selon valeur 0-100
function scoreColor(score) {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return '#65C466';
  if (score >= 35) return 'var(--orange)';
  return 'var(--red)';
}
function scoreClass(score) {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 35) return 'ok';
  return 'bad';
}

// ══════════════════════════════════════════════════════════
//  API CALLS
// ══════════════════════════════════════════════════════════

// Geocoding : ville → lat/lon (Nominatim OSM)
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=fr`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
  if (!resp.ok) throw new Error('Erreur géocodage');
  return resp.json();
}

// Indice Kp (activité géomagnétique) — NOAA, sans clé
async function fetchKpIndex() {
  try {
    const resp = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
    if (!resp.ok) return 0;
    const data = await resp.json();
    return data[data.length - 1].kp_index ?? 0;
  } catch {
    return 0;
  }
}

// Météo : Open-Meteo — modèle ICON (DWD, Allemagne) plus précis pour Israël/Méditerranée
// ICON couvre Israël à ~6.5 km de résolution vs GFS à 25 km
async function fetchWeather(lat, lon) {
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}&longitude=${lon}`,
    '&hourly=temperature_2m,relativehumidity_2m,precipitation_probability,precipitation,',
    'windspeed_10m,windspeed_80m,windspeed_120m,windspeed_180m,',
    'winddirection_10m,windgusts_10m,visibility,cloudcover,cape,weathercode,',
    'surface_pressure',
    '&daily=sunrise,sunset,precipitation_sum',
    '&current_weather=true',
    '&current_weather_units=unitsystem',
    '&timezone=auto',
    '&forecast_days=3',
    '&windspeed_unit=ms',
    '&models=icon_seamless'   // ICON : meilleur modèle pour la région Méditerranée/Moyen-Orient
  ].join('');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Erreur API météo');
  return resp.json();
}

// Reverse geocoding
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
  if (!resp.ok) return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const data = await resp.json();
  const a = data.address || {};
  return a.city || a.town || a.village || a.county || a.state || data.display_name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

// ══════════════════════════════════════════════════════════
//  CARTE LEAFLET
// ══════════════════════════════════════════════════════════

let map = null;
let mapMarker = null;
let mapSafetyCircle = null;

function initMap() {
  map = L.map('droneMap', {
    zoomControl: false,
    attributionControl: true
  }).setView([31.5, 35.0], 7);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Zones aéroportuaires depuis ISRAEL_AIRPORTS
  for (const ap of ISRAEL_AIRPORTS) {
    L.circle([ap.lat, ap.lon], {
      radius: 2000,
      color: '#FF3B30', fillColor: '#FF3B30', fillOpacity: 0.15, weight: 1.5
    }).addTo(map).bindTooltip(`⛔ ${ap.name} — Zone interdite 2 km`, { permanent: false, direction: 'top' });

    L.circle([ap.lat, ap.lon], {
      radius: 5000,
      color: '#FF9500', fillColor: '#FF9500', fillOpacity: 0.07, weight: 1, dashArray: '4 4'
    }).addTo(map).bindTooltip(`⚠️ ${ap.name} — CTR 5 km`, { permanent: false, direction: 'top' });
  }

  // Clic sur la carte → charger météo pour ce point
  map.on('click', async (e) => {
    await loadWeatherForLocation(e.latlng.lat, e.latlng.lng, null);
  });
}

function updateMap(lat, lon) {
  if (!map) return;

  const droneIcon = L.divIcon({
    html: '<div style="background:#0A84FF;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4)">🚁</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    className: ''
  });

  if (mapMarker)       map.removeLayer(mapMarker);
  if (mapSafetyCircle) map.removeLayer(mapSafetyCircle);

  mapMarker = L.marker([lat, lon], { icon: droneIcon })
    .addTo(map)
    .bindPopup('📍 Position sélectionnée');

  mapSafetyCircle = L.circle([lat, lon], {
    radius: 250,
    color: '#30D158', fillColor: '#30D158', fillOpacity: 0.15, weight: 2
  }).addTo(map).bindTooltip('Zone 250 m — Règle CAAI bâtiments/personnes');

  map.flyTo([lat, lon], 13, { duration: 1.2 });
}

// ══════════════════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════════════════

let currentTab = 'flight';
let currentWeatherData = null;
let currentLat = null, currentLon = null;
let currentKp = 0;

function findClosestHourIndex(times) {
  const now = new Date();
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]) - now);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(isoStr) {
  const d = new Date(isoStr);
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  return days[d.getDay()];
}

function isDaytime(isoStr, sunrise, sunset) {
  const t = new Date(isoStr).getTime();
  const sr = new Date(sunrise).getTime();
  const ss = new Date(sunset).getTime();
  return t >= sr && t <= ss;
}

function renderApp(data, locationName, lat, lon) {
  currentWeatherData = data;
  currentLat = lat; currentLon = lon;

  const h = data.hourly;
  const d = data.daily;
  const cw = data.current_weather;
  const nowIdx = findClosestHourIndex(h.time);

  // ── Soleil
  const todaySunrise = d.sunrise[0];
  const todaySunset  = d.sunset[0];
  document.getElementById('sunriseTime').textContent = formatTime(todaySunrise);
  document.getElementById('sunsetTime').textContent  = formatTime(todaySunset);

  // Durée du jour
  const srMs = new Date(todaySunrise).getTime();
  const ssMs = new Date(todaySunset).getTime();
  const dayMins = Math.round((ssMs - srMs) / 60000);
  const dayH = Math.floor(dayMins / 60), dayM = dayMins % 60;
  document.getElementById('dayDuration').textContent = `Durée du jour : ${dayH}h${dayM.toString().padStart(2,'0')}`;

  // Position soleil sur la barre
  const now = Date.now();
  const pct = Math.max(0, Math.min(100, ((now - srMs) / (ssMs - srMs)) * 100));
  document.getElementById('sunTrackFill').style.width = `${pct}%`;
  document.getElementById('sunDot').style.left = `${pct}%`;

  // ── Valeurs actuelles
  const wind10  = h.windspeed_10m[nowIdx]  || 0;
  const wind80  = h.windspeed_80m[nowIdx]  || 0;
  const wind120 = h.windspeed_120m[nowIdx] || 0;
  const wind180 = h.windspeed_180m[nowIdx] || 0;
  const windDir = h.winddirection_10m[nowIdx] || cw.winddirection || 0;
  const gusts   = h.windgusts_10m[nowIdx]  || 0;
  const temp    = h.temperature_2m[nowIdx] ?? cw.temperature;
  const precip  = h.precipitation[nowIdx]  || 0;
  const precipP = h.precipitation_probability[nowIdx] || 0;
  const visRaw  = h.visibility[nowIdx] || 10000; // metres
  const vis     = visRaw / 1000; // km
  const cc      = h.cloudcover[nowIdx]    || 0;
  const cape    = h.cape[nowIdx]          || 0;
  const humid   = h.relativehumidity_2m[nowIdx] || 0;
  const pres    = h.surface_pressure[nowIdx] || 1013;
  const wcode   = h.weathercode[nowIdx]   || cw.weathercode || 0;
  const isDay   = isDaytime(h.time[nowIdx], todaySunrise, todaySunset);

  // Airspace check
  const airspace = checkAirspace(lat, lon);

  // Visibilité : si nuit et données non significatives, exclure du score (valeur neutre 5km)
  const visForScore = (!isDay && visRaw >= 9000) ? 5 : vis;

  // Score
  const { score, breakdown, reasons } = calcFlightScore({
    wind10, wind80, wind120, gusts, temp, precip, precipProb: precipP,
    visibility: visForScore, cloudCover: cc, cape, isDaytime: isDay, airspace,
    kp: currentKp
  }, currentDroneProfile);
  const verdict = getVerdict(score);

  // ── Localisation & heure
  document.getElementById('locationName').textContent = locationName;
  document.getElementById('currentDateTime').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  const wmo = WMO_CODES[wcode] || WMO_CODES[0];
  document.getElementById('weatherDescription').textContent = `${wmo.emoji} ${wmo.label}`;

  // ── Source & horodatage
  const dataSourceEl = document.getElementById('dataSource');
  if (dataSourceEl) {
    const updatedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    dataSourceEl.innerHTML = `Données : <strong>Open-Meteo ICON</strong> · Mis à jour à ${updatedAt} · <a href="https://open-meteo.com" target="_blank" style="color:rgba(255,255,255,.6)">open-meteo.com</a>`;
  }

  // ── Verdict badge
  const badge = document.getElementById('verdictBadge');
  badge.className = `verdict-badge ${verdict.cls}`;
  document.getElementById('verdictIcon').textContent = verdict.icon;
  document.getElementById('verdictText').textContent = verdict.label;

  // ── Jauge score
  const circumference = 2 * Math.PI * 56;
  const fill = (score / 100) * circumference;
  const gaugeFill = document.getElementById('gaugeFill');
  gaugeFill.style.strokeDasharray = `${fill} ${circumference - fill}`;
  gaugeFill.style.stroke = scoreColor(score);
  document.getElementById('gaugeScore').textContent = score;

  // Helper barre
  function setBar(id, pct, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = Math.min(100, pct) + '%';
    el.style.background = color;
  }
  function setCardStatus(cardId, status) {
    const el = document.getElementById(cardId);
    if (!el) return;
    el.className = `cond-card status-${status}`;
  }

  // ── Vent 10m
  const b10 = beaufort(wind10);
  document.getElementById('wind10').textContent = wind10.toFixed(1);
  document.getElementById('wind10Beaufort').textContent = `Beaufort ${b10.n} — ${b10.label}`;
  setBar('wind10Bar', (wind10 / 15) * 100, wind10 > 10.8 ? 'var(--red)' : wind10 > 7 ? 'var(--orange)' : 'var(--green)');
  setCardStatus('card-wind10', wind10 > 10.8 ? 'danger' : wind10 > 7 ? 'warning' : 'good');

  // ── Vent 80m
  const b80 = beaufort(wind80);
  document.getElementById('wind80').textContent = wind80.toFixed(1);
  document.getElementById('wind80Beaufort').textContent = `Beaufort ${b80.n} — ${b80.label}`;
  setBar('wind80Bar', (wind80 / 15) * 100, wind80 > 12 ? 'var(--red)' : wind80 > 9 ? 'var(--orange)' : 'var(--blue)');
  setCardStatus('card-wind80', wind80 > 12 ? 'danger' : wind80 > 9 ? 'warning' : 'good');

  // ── Vent 120m
  const b120 = beaufort(wind120);
  document.getElementById('wind120').textContent = wind120.toFixed(1);
  document.getElementById('wind120Beaufort').textContent = `Beaufort ${b120.n} — ${b120.label}`;
  setBar('wind120Bar', (wind120 / 15) * 100, wind120 > 12 ? 'var(--red)' : wind120 > 9 ? 'var(--orange)' : 'var(--blue)');
  setCardStatus('card-wind120', wind120 > 12 ? 'danger' : wind120 > 9 ? 'warning' : 'good');

  // ── Direction vent
  document.getElementById('windDirection').textContent = `${Math.round(windDir)}°`;
  document.getElementById('windDirText').textContent = windDirText(windDir);
  document.getElementById('compassArrow').setAttribute('transform', `rotate(${windDir}, 30, 30)`);

  // ── Température
  document.getElementById('temperature').textContent = temp.toFixed(1);
  const battMsg = temp < 5 ? '⚠️ Batterie réduite' : temp < 10 ? 'Batterie légèrement réduite' : '✅ Température optimale';
  document.getElementById('tempBattery').textContent = battMsg;
  setCardStatus('card-temp', temp < 0 ? 'danger' : temp < 10 ? 'warning' : 'good');

  // ── Précipitations
  document.getElementById('precipitation').textContent = precip.toFixed(1);
  document.getElementById('precipProb').textContent = `Probabilité : ${precipP}%`;
  setBar('precipBar', precipP, precipP > 60 ? 'var(--red)' : precipP > 30 ? 'var(--orange)' : 'var(--blue)');
  setCardStatus('card-precip', precip > 0 ? 'danger' : precipP > 50 ? 'warning' : 'good');

  // ── Visibilité (neutre la nuit si données non significatives)
  const visNight = !isDay && visRaw >= 9000;
  if (visNight) {
    document.getElementById('visibility').textContent = '—';
    document.getElementById('visibilityLevel').textContent = 'Non évaluée (nuit)';
    setBar('visibilityBar', 0, 'var(--text-third)');
    setCardStatus('card-visibility', 'neutral');
  } else {
    document.getElementById('visibility').textContent = vis >= 10 ? '≥10' : vis.toFixed(1);
    const visLabel = vis < 1 ? '⛔ Très faible' : vis < 3 ? '⚠️ Faible' : vis < 5 ? '⚠️ Modérée' : '✅ Bonne';
    document.getElementById('visibilityLevel').textContent = visLabel;
    setBar('visibilityBar', Math.min(100, (vis / 10) * 100), vis < 3 ? 'var(--red)' : vis < 5 ? 'var(--orange)' : 'var(--green)');
    setCardStatus('card-visibility', vis < 3 ? 'danger' : vis < 5 ? 'warning' : 'good');
  }

  // ── Nuages
  document.getElementById('cloudCover').textContent = cc;
  setBar('cloudBar', cc, cc > 80 ? 'var(--text-second)' : cc > 50 ? 'var(--teal)' : 'var(--blue)');

  // ── CAPE
  document.getElementById('capeValue').textContent = Math.round(cape);
  const capeLabel = cape > 1500 ? '⛈ Orage imminent' : cape > 800 ? '⚡ Risque élevé' : cape > 300 ? '⚠️ Instable' : '✅ Stable';
  document.getElementById('capeLevel').textContent = capeLabel;
  setBar('capeBar', Math.min(100, (cape / 2000) * 100), cape > 1500 ? 'var(--red)' : cape > 800 ? 'var(--orange)' : cape > 300 ? '#FF9F0A' : 'var(--green)');
  setCardStatus('card-cape', cape > 800 ? 'danger' : cape > 300 ? 'warning' : 'good');

  // ── Indice Kp
  const kpEl = document.getElementById('kpValue');
  if (kpEl) {
    kpEl.textContent = currentKp.toFixed(1);
    const kpLabel = currentKp < 2 ? '✅ Calme — GPS optimal'
      : currentKp < 3 ? '✅ Légère activité'
      : currentKp < 4 ? '⚠️ Modérée — Surveiller le compas'
      : currentKp < 5 ? '⚠️ Perturbations — Limiter la portée'
      : currentKp < 6 ? '⛔ Tempête mineure — Vol déconseillé'
      : '⛔ Tempête majeure — Vol interdit';
    document.getElementById('kpLevel').textContent = kpLabel;
    const kpBarColor = currentKp >= 4 ? 'var(--red)' : currentKp >= 3 ? 'var(--orange)' : 'var(--green)';
    setBar('kpBar', Math.min(100, (currentKp / 9) * 100), kpBarColor);
    setCardStatus('card-kp', currentKp >= 4 ? 'danger' : currentKp >= 3 ? 'warning' : 'good');
  }

  // ── Humidité
  document.getElementById('humidity').textContent = humid;
  setBar('humidityBar', humid, humid > 85 ? 'var(--teal)' : 'var(--blue)');

  // ── Pression
  document.getElementById('pressure').textContent = Math.round(pres);
  const prevPres = nowIdx > 2 ? h.surface_pressure[nowIdx - 2] : pres;
  const prTrend = pres > prevPres + 1 ? '↑ En hausse' : pres < prevPres - 1 ? '↓ En baisse' : '→ Stable';
  document.getElementById('pressureTrend').textContent = prTrend;

  // ── Rafales
  document.getElementById('gusts').textContent = gusts.toFixed(1);
  const gustLabel = gusts > 12 ? '⛔ Extrêmes' : gusts > 9 ? '⚠️ Fortes' : gusts > 5 ? '⚠️ Modérées' : '✅ Faibles';
  document.getElementById('gustsLevel').textContent = gustLabel;
  setBar('gustsBar', (gusts / 15) * 100, gusts > 12 ? 'var(--red)' : gusts > 9 ? 'var(--orange)' : 'var(--green)');
  setCardStatus('card-gusts', gusts > 12 ? 'danger' : gusts > 9 ? 'warning' : 'good');

  // ── Prochain créneau favorable
  renderNextWindow(data, nowIdx, isDay, score);

  // ── Breakdown chips
  renderBreakdownChips(breakdown);

  // ── Profil altitude
  renderAltitudeProfile({ wind10, wind80, wind120, wind180 }, currentDroneProfile);

  // ── Réglementations
  const asEl = document.getElementById('regAirport');
  const asNote = document.getElementById('regAirportNote');
  asEl.textContent = airspace.text;
  asNote.textContent = airspace.note;

  const warning = document.getElementById('airportWarning');
  if (airspace.status === 'danger' || airspace.status === 'warning') {
    warning.classList.remove('hidden');
    document.getElementById('airportWarningText').textContent =
      `Zone aéroportuaire détectée : ${airspace.airport} à ${airspace.dist.toFixed(1)} km. Contactez la CAAI avant tout vol.`;
  } else {
    warning.classList.add('hidden');
  }

  // ── Forecast 72h
  renderForecast(data, currentTab);

  // ── Recommandations
  renderRecommendations(reasons);

  // ── Afficher le contenu
  document.getElementById('splashScreen').classList.add('hidden');
  document.getElementById('weatherContent').classList.remove('hidden');

  // ── Carte
  updateMap(lat, lon);
}

// ── Scanner les 18 prochaines heures pour trouver la 1ère fenêtre diurne favorable
function findNextWindow(data, nowIdx) {
  const h = data.hourly;
  const d = data.daily;
  let best = null;

  for (let offset = 1; offset <= 18; offset++) {
    const i = nowIdx + offset;
    if (i >= h.time.length) break;

    const dateStr = h.time[i].slice(0, 10);
    const dayIdx  = d.sunrise.findIndex(s => s.startsWith(dateStr));
    if (dayIdx < 0) continue;
    if (!isDaytime(h.time[i], d.sunrise[dayIdx], d.sunset[dayIdx])) continue;

    const ms = calcMeteoScore({
      wind10:     h.windspeed_10m[i]              || 0,
      wind80:     h.windspeed_80m[i]              || 0,
      gusts:      h.windgusts_10m[i]              || 0,
      precip:     h.precipitation[i]              || 0,
      precipProb: h.precipitation_probability[i]  || 0,
      visibility: (h.visibility[i] || 10000) / 1000,
      cloudCover: h.cloudcover[i]                 || 0,
      cape:       h.cape[i]                       || 0,
      temp:       h.temperature_2m[i]             || 20,
    });

    if (!best || ms > best.meteoScore) {
      best = { idx: i, time: h.time[i], meteoScore: ms,
               wind: h.windspeed_10m[i] || 0, wcode: h.weathercode[i] || 0 };
    }
    if (ms >= 70) break; // première fenêtre optimale trouvée
  }
  return best;
}

function renderNextWindow(data, nowIdx, isDay, score) {
  const shouldShow = !isDay || score < 45;

  // Créer le conteneur une seule fois, juste avant scoreBreakdown
  let container = document.getElementById('nextWindowBanner');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nextWindowBanner';
    const breakdown = document.getElementById('scoreBreakdown');
    breakdown.parentNode.insertBefore(container, breakdown);
  }

  if (!shouldShow) { container.innerHTML = ''; return; }

  const win = findNextWindow(data, nowIdx);
  if (!win) { container.innerHTML = ''; return; }

  const dt     = new Date(win.time);
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dt); target.setHours(0, 0, 0, 0);
  const diff   = target.getTime() - today.getTime();
  const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = diff === 0 ? "Aujourd'hui"
    : diff === 86400000 ? 'Demain'
    : dt.toLocaleDateString('fr-FR', { weekday: 'long' });

  const wmo      = WMO_CODES[win.wcode] || WMO_CODES[0];
  const optimal  = win.meteoScore >= 70;
  const scoreColor = optimal ? '#34C759' : '#FF9F0A';
  const meanNote = optimal ? '' : ' <span style="opacity:.6;font-size:11px">(conditions moyennes)</span>';

  container.innerHTML = `
    <div class="next-window-card">
      <div class="nw-title">☀️ Prochain vol recommandé</div>
      <div class="nw-main">
        <strong>${dayLabel} à ${timeStr}</strong>
        &nbsp;—&nbsp; Score météo :
        <strong style="color:${scoreColor}">${win.meteoScore}</strong>/100${meanNote}
      </div>
      <div class="nw-detail">
        ${wmo.emoji} ${wmo.label} &nbsp;·&nbsp; 💨 Vent ${win.wind.toFixed(1)} m/s
      </div>
    </div>`;
}

function renderBreakdownChips(breakdown) {
  const container = document.getElementById('scoreBreakdown');
  if (!container) return;

  // Chips toujours visibles
  const chips = [
    { key: 'wind',       label: '💨 Vent',       value: breakdown.wind },
    { key: 'gusts',      label: '💥 Rafales',     value: breakdown.gusts },
    { key: 'rain',       label: '🌧 Pluie',       value: breakdown.rain },
    { key: 'visibility', label: '👁 Visibilité',  value: breakdown.visibility },
  ];

  // Chips conditionnels
  if (breakdown.cape < 100) chips.push({ key: 'cape', label: '⚡ CAPE',  value: breakdown.cape });
  if (breakdown.temp < 100) chips.push({ key: 'temp', label: '🌡 Temp.', value: breakdown.temp });
  if (breakdown.kp   < 100) chips.push({ key: 'kp',   label: '🧲 Kp',    value: breakdown.kp   });
  if ('night'    in breakdown) chips.push({ key: 'night',    label: '🌙 Nuit', value: 0, forceClass: 'breakdown-bad' });
  // Airspace: couleur forcée selon statut (pas via scoreClass)
  if ('airspace' in breakdown) {
    const av = breakdown.airspace;
    const aClass = av === 0 ? 'breakdown-bad' : av <= 30 ? 'breakdown-bad' : 'breakdown-ok';
    chips.push({ key: 'airspace', label: '✈️ Zone', value: av, forceClass: aClass });
  }

  // Facteur limitant (sous-score le plus bas)
  const limiting = chips.reduce((a, b) => a.value <= b.value ? a : b);
  const limitingDesc = {
    wind:       'Vent sol trop fort',
    gusts:      'Rafales importantes',
    rain:       'Précipitations',
    visibility: 'Visibilité réduite',
    cape:       'Instabilité atmosphérique',
    temp:       'Température défavorable',
    kp:         'Activité géomagnétique',
    night:      'Vol de nuit interdit',
    airspace:   'Zone aérienne restreinte',
  };

  const chipsHtml = chips.map(c => {
    const cls = c.forceClass || `breakdown-${scoreClass(c.value)}`;
    return `<div class="breakdown-chip ${cls}">
      <span class="chip-label">${c.label}</span>
      <span class="chip-score">${c.value}</span>
    </div>`;
  }).join('');

  const limitingHtml = limiting.value < 100
    ? `<div class="limiting-factor">
        Facteur limitant : <strong>${limiting.label} — ${limitingDesc[limiting.key]}</strong>
        <span class="limiting-score">(${limiting.value}/100)</span>
       </div>`
    : '';

  container.innerHTML = chipsHtml + limitingHtml;
}

function renderAltitudeProfile({ wind10, wind80, wind120, wind180 }, profile) {
  profile = profile || currentDroneProfile;
  const max = profile.maxWind;
  const container = document.getElementById('altitudeProfile');
  const levels = [
    { label: '10 m',  val: wind10  },
    { label: '80 m',  val: wind80  },
    { label: '120 m', val: wind120 },
    { label: '180 m', val: wind180 },
  ];

  container.innerHTML = levels.map(lv => {
    const pct   = Math.min(100, (lv.val / (max * 1.5)) * 100);
    const color = lv.val > max ? 'var(--red)' : lv.val > max * 0.75 ? 'var(--orange)' : 'var(--green)';
    const stCls = lv.val > max ? 'danger' : lv.val > max * 0.75 ? 'caution' : 'ok';
    const stLbl = lv.val > max ? '⛔ Limite' : lv.val > max * 0.75 ? '⚠️ Prudence' : '✅ OK';
    return `
      <div class="alt-row">
        <div class="alt-label">${lv.label}</div>
        <div class="alt-bar-track">
          <div class="alt-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <div class="alt-value">${lv.val.toFixed(1)} m/s</div>
        <div class="alt-status ${stCls}">${stLbl}</div>
      </div>`;
  }).join('');

  container.innerHTML += `
    <div class="avata-limit">
      <svg viewBox="0 0 20 20" fill="none" width="16"><path d="M10 2L2 18h16L10 2z" stroke="var(--blue)" stroke-width="1.5"/><text x="10" y="14" text-anchor="middle" font-size="9" fill="var(--blue)" font-weight="bold">i</text></svg>
      ${profile.name} — Vent max : <strong>${max} m/s</strong> &nbsp;|&nbsp; Rafales max : <strong>${profile.maxGusts} m/s</strong> &nbsp;|&nbsp; CAAI : <strong>50 m AGL</strong>
    </div>`;
}

function renderForecast(data, tab) {
  currentTab = tab;
  const h      = data.hourly;
  const d      = data.daily;
  const nowMs  = Date.now();
  const nowIdx = findClosestHourIndex(h.time);
  const container = document.getElementById('forecastContainer');

  // ── Grouper par jour en filtrant les heures passées et la nuit profonde
  const days = {};
  for (let i = 0; i < h.time.length; i++) {
    const t    = new Date(h.time[i]);
    const tMs  = t.getTime();
    const hour = t.getHours();

    if (tMs < nowMs - 30 * 60000 && i !== nowIdx) continue; // passé (> 30 min)
    if (hour < 5  && i !== nowIdx) continue;                 // nuit profonde 00h-04h
    if (hour > 22) continue;                                  // fin de soirée 23h

    const dayKey = t.toISOString().slice(0, 10);
    if (!days[dayKey]) days[dayKey] = [];
    days[dayKey].push(i);
  }

  // Helper : extraire les params météo d'un index hourly
  function paramsAt(i) {
    return {
      wind10:     h.windspeed_10m[i]             || 0,
      wind80:     h.windspeed_80m[i]             || 0,
      wind120:    h.windspeed_120m[i]            || 0,
      gusts:      h.windgusts_10m[i]             || 0,
      temp:       h.temperature_2m[i]            || 20,
      precip:     h.precipitation[i]             || 0,
      precipProb: h.precipitation_probability[i] || 0,
      visibility: (h.visibility[i] || 10000) / 1000,
      cloudCover: h.cloudcover[i]                || 0,
      cape:       h.cape[i]                      || 0,
    };
  }

  let html = '<div class="forecast-inner">';
  let dayIdx = 0;

  for (const [dayKey, indices] of Object.entries(days)) {
    if (!indices.length) { dayIdx++; continue; }

    const sunrise = d.sunrise[dayIdx] || d.sunrise[0];
    const sunset  = d.sunset[dayIdx]  || d.sunset[0];

    // ── Label jour
    const dayDate = new Date(dayKey + 'T12:00:00');
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const diff    = dayDate.getTime() - today.getTime();
    const dayLabel = diff === 0 ? "Aujourd'hui"
      : diff === 86400000 ? 'Demain'
      : dayDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

    // ── Top 3 meilleurs créneaux diurnes (score météo >= 75) pour le highlight
    const daytimeScores = indices
      .filter(i => isDaytime(h.time[i], sunrise, sunset))
      .map(i => ({ i, ms: calcMeteoScore(paramsAt(i)) }))
      .filter(x => x.ms >= 75)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 3);
    const bestSet = new Set(daytimeScores.map(x => x.i));

    const borderStyle = dayIdx > 0 ? 'border-left:2px solid rgba(60,60,67,.1);padding-left:8px;margin-left:4px;' : '';

    html += `<div class="forecast-day-group" style="${borderStyle}">
      <div class="forecast-day-label" style="font-size:13px;font-weight:700;color:var(--text-primary);letter-spacing:-.2px;padding:0 4px 10px;text-transform:none;">${dayLabel}</div>
      <div class="forecast-hours">`;

    for (const i of indices) {
      const dt     = new Date(h.time[i]);
      const hour   = dt.getHours();
      const isDay  = isDaytime(h.time[i], sunrise, sunset);
      const isBest = isDay && bestSet.has(i);
      const p      = paramsAt(i);

      let cellScore = 0, mainVal = '';

      if (tab === 'flight') {
        if (!isDay) {
          // Score météo pur la nuit — pas de pénalité légale, montre les conditions
          const ms = calcMeteoScore(p);
          cellScore = ms;
          mainVal = `<div class="fc-score" style="color:rgba(255,255,255,.55);font-size:14px;font-weight:700">${ms}</div>
                     <div style="position:absolute;top:3px;right:4px;font-size:9px;opacity:.5">🌙</div>`;
        } else {
          const { score } = calcFlightScore({ ...p, isDaytime: true, airspace: null }, currentDroneProfile);
          cellScore = score;
          mainVal = `<div class="fc-score ${scoreClass(score)}">${score}</div>`;
        }
      } else if (tab === 'wind') {
        const wv = p.wind10;
        const wColor = wv > currentDroneProfile.maxWind ? 'var(--red)'
          : wv > currentDroneProfile.maxWind * 0.75 ? 'var(--orange)' : 'var(--green)';
        mainVal = `<div class="fc-wind" style="font-size:13px;font-weight:700;color:${wColor}">${wv.toFixed(1)}</div><div class="fc-wind">m/s</div>`;
        cellScore = 100 - Math.min(100, (wv / 15) * 100);
      } else {
        const pp = p.precipProb;
        const pColor = pp > 60 ? 'var(--red)' : pp > 30 ? 'var(--orange)' : 'var(--green)';
        mainVal = `<div class="fc-wind" style="font-size:13px;font-weight:700;color:${pColor}">${pp}%</div>`;
        cellScore = 100 - pp;
      }

      const wmo = WMO_CODES[h.weathercode[i]] || WMO_CODES[0];

      // Best-slot: border verte inline (pas de nouvelle classe CSS)
      const bestStyle = isBest
        ? 'box-shadow:inset 0 0 0 1.5px rgba(52,199,89,.45);background:rgba(52,199,89,.07);'
        : '';

      const cls = ['forecast-cell', !isDay ? 'night' : '', `score-${scoreClass(cellScore)}`]
        .filter(Boolean).join(' ');

      html += `
        <div class="${cls}" style="${bestStyle}">
          <div class="fc-time">${hour.toString().padStart(2, '0')}h</div>
          <div class="fc-icon">${wmo.emoji}</div>
          ${mainVal}
          <div class="fc-wind">${p.wind10.toFixed(1)}</div>
          ${isBest ? '<div style="font-size:9px;text-align:center;margin-top:2px">⭐</div>' : ''}
        </div>`;
    }

    html += '</div></div>';
    dayIdx++;
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderRecommendations(reasons) {
  const list = document.getElementById('recommendationsList');
  list.innerHTML = reasons.map(r => `
    <div class="rec-item ${r.type}">
      <div class="rec-dot"></div>
      <div class="rec-text">${r.text}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════
//  SEARCH & GEOLOCATION
// ══════════════════════════════════════════════════════════

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

function showError(msg) {
  const toast = document.getElementById('errorToast');
  document.getElementById('errorText').textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

async function loadWeatherForLocation(lat, lon, name) {
  showLoading(true);
  try {
    const [data, kp] = await Promise.all([fetchWeather(lat, lon), fetchKpIndex()]);
    currentKp = kp;
    const locName = name || await reverseGeocode(lat, lon);
    renderApp(data, locName, lat, lon);
    // Sauvegarder la position
    localStorage.setItem('dw_last', JSON.stringify({ lat, lon, name: locName }));
  } catch (e) {
    console.error(e);
    showError('Impossible de charger les données météo. Vérifiez votre connexion.');
  } finally {
    showLoading(false);
  }
}

// Debounce
let searchTimeout;
function debounce(fn, delay) {
  return (...args) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fn(...args), delay);
  };
}

const searchInput = document.getElementById('searchInput');
const suggestions = document.getElementById('searchSuggestions');

const doSearch = debounce(async (query) => {
  if (query.length < 3) { suggestions.classList.add('hidden'); return; }
  try {
    const results = await geocode(query);
    if (results.length === 0) { suggestions.classList.add('hidden'); return; }
    suggestions.innerHTML = results.slice(0, 5).map(r => `
      <div class="search-suggestion-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.display_name.split(',').slice(0,2).join(', ')}">
        ${r.display_name.split(',').slice(0,3).join(', ')}
      </div>`).join('');
    suggestions.classList.remove('hidden');
  } catch { suggestions.classList.add('hidden'); }
}, 400);

searchInput.addEventListener('input', (e) => doSearch(e.target.value));

suggestions.addEventListener('click', (e) => {
  const item = e.target.closest('.search-suggestion-item');
  if (!item) return;
  const lat = parseFloat(item.dataset.lat);
  const lon = parseFloat(item.dataset.lon);
  const name = item.dataset.name;
  searchInput.value = name;
  suggestions.classList.add('hidden');
  loadWeatherForLocation(lat, lon, name);
});

// Fermer suggestions si clic extérieur
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) suggestions.classList.add('hidden');
});

// Géolocalisation
function geolocate() {
  if (!navigator.geolocation) {
    showError('Géolocalisation non supportée par votre navigateur.');
    return;
  }
  showLoading(true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      await loadWeatherForLocation(lat, lon, null);
    },
    (err) => {
      showLoading(false);
      showError('Impossible d\'obtenir votre position. Vérifiez les permissions.');
    },
    { timeout: 10000 }
  );
}

document.getElementById('geoBtn').addEventListener('click', geolocate);
document.getElementById('splashGeoBtn').addEventListener('click', geolocate);

// Onglets forecast
document.querySelectorAll('.forecast-tabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.forecast-tabs .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentWeatherData) renderForecast(currentWeatherData, btn.dataset.tab);
  });
});

// ── Horloge en temps réel
function updateClock() {
  if (!document.getElementById('locationName').textContent || document.getElementById('locationName').textContent === '—') return;
  document.getElementById('currentDateTime').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  // Mise à jour position soleil
  if (currentWeatherData) {
    const d = currentWeatherData.daily;
    const srMs = new Date(d.sunrise[0]).getTime();
    const ssMs = new Date(d.sunset[0]).getTime();
    const pct = Math.max(0, Math.min(100, ((Date.now() - srMs) / (ssMs - srMs)) * 100));
    document.getElementById('sunTrackFill').style.width = `${pct}%`;
    document.getElementById('sunDot').style.left = `${pct}%`;
  }
}
setInterval(updateClock, 60000);

// ── Auto-refresh toutes les 10 minutes
setInterval(() => {
  if (currentLat !== null && currentLon !== null) {
    loadWeatherForLocation(currentLat, currentLon, document.getElementById('locationName').textContent);
  }
}, 600000);

// ══════════════════════════════════════════════════════════
//  SÉLECTEUR DE DRONE
// ══════════════════════════════════════════════════════════
function renderDroneSelector() {
  const container = document.getElementById('droneSelector');
  if (!container) return;
  container.innerHTML = DRONE_PROFILES.map(p => `
    <button class="drone-chip ${p.id === currentDroneProfile.id ? 'active' : ''}"
            data-drone-id="${p.id}">
      <span class="drone-chip-icon">${p.icon}</span>
      <span class="drone-chip-name">${p.name}</span>
      <span class="drone-chip-wind">${p.maxWind} m/s</span>
    </button>`).join('');
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.drone-chip');
  if (!chip) return;
  const profile = DRONE_PROFILES.find(p => p.id === chip.dataset.droneId);
  if (!profile || profile.id === currentDroneProfile.id) return;
  currentDroneProfile = profile;
  renderDroneSelector();
  // Re-calculer sans rappel API (données déjà chargées)
  if (currentWeatherData) {
    renderApp(currentWeatherData, document.getElementById('locationName').textContent, currentLat, currentLon);
  }
});

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
(function init() {
  initMap();
  renderDroneSelector();
  // Charger la dernière position sauvegardée
  const last = localStorage.getItem('dw_last');
  if (last) {
    try {
      const { lat, lon, name } = JSON.parse(last);
      searchInput.value = name;
      loadWeatherForLocation(lat, lon, name);
      return;
    } catch {}
  }
  // Sinon, tenter géolocalisation automatique
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await loadWeatherForLocation(pos.coords.latitude, pos.coords.longitude, null);
      },
      () => { /* Silencieux — laisser le splash */ }
    );
  }
})();
