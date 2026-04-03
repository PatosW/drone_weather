/* ═══════════════════════════════════════════════════════════
   DroneWeather — Application Logic
   Open-Meteo API (gratuit, sans clé)
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── Israël : aéroports principaux (CAAI)
const ISRAEL_AIRPORTS = [
  { name: 'Ben Gurion (TLV)', lat: 32.0004, lon: 34.8706, ctr_km: 8,  danger_km: 3  },
  { name: 'Haïfa (HFA)',      lat: 32.8094, lon: 35.0431, ctr_km: 5,  danger_km: 2  },
  { name: 'Eilat Ramon (ETM)',lat: 29.7269, lon: 35.0060, ctr_km: 5,  danger_km: 2  },
  { name: 'Ovda (VDA)',       lat: 29.9403, lon: 34.9358, ctr_km: 5,  danger_km: 2  },
  { name: 'Tel Nof (Air Base)',lat:31.8394, lon: 34.8228, ctr_km: 6,  danger_km: 3  },
  { name: 'Ramat David (Air Base)', lat: 32.6650, lon: 35.1795, ctr_km: 5, danger_km: 2 },
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

// ── Vérification zones aéroportuaires
function checkAirspace(lat, lon) {
  let minDist = Infinity, nearest = null;
  for (const ap of ISRAEL_AIRPORTS) {
    const d = geoDistKm(lat, lon, ap.lat, ap.lon);
    if (d < minDist) { minDist = d; nearest = ap; }
  }
  if (!nearest) return { status: 'clear', text: 'Hors zones restreintes', note: '' };

  if (minDist < nearest.danger_km) {
    return {
      status: 'danger',
      text: `${nearest.name} — ${minDist.toFixed(1)} km`,
      note: `⛔ Zone de danger — Vol interdit sans autorisation CAAI`,
      airport: nearest.name, dist: minDist
    };
  }
  if (minDist < nearest.ctr_km) {
    return {
      status: 'warning',
      text: `${nearest.name} — ${minDist.toFixed(1)} km`,
      note: `⚠️ CTR — Autorisation CAAI obligatoire avant tout vol`,
      airport: nearest.name, dist: minDist
    };
  }
  if (minDist < 15) {
    return {
      status: 'caution',
      text: `${nearest.name} — ${minDist.toFixed(1)} km`,
      note: `ℹ️ Proximité aéroport — Vigilance recommandée`,
      airport: nearest.name, dist: minDist
    };
  }
  return { status: 'clear', text: 'Hors zones restreintes', note: 'Espace aérien libre pour cette position' };
}

// ══════════════════════════════════════════════════════════
//  SCORE DE VOL
// ══════════════════════════════════════════════════════════
function calcFlightScore(params) {
  let score = 100;
  const reasons = [];

  // Vent au sol (10m) — Avata 2 : max 10.8 m/s
  const w = params.wind10;
  if (w >= 12)      { score -= 40; reasons.push({ type:'danger',  text: `<strong>Vent dangereux au sol :</strong> ${w.toFixed(1)} m/s — Au-delà des limites de l'Avata 2 (10.8 m/s)` }); }
  else if (w >= 10.8){ score -= 30; reasons.push({ type:'danger',  text: `<strong>Vent critique au sol :</strong> ${w.toFixed(1)} m/s — Limite maximale Avata 2` }); }
  else if (w >= 8)  { score -= 18; reasons.push({ type:'warning', text: `<strong>Vent fort au sol :</strong> ${w.toFixed(1)} m/s — Vol difficile, haute vigilance` }); }
  else if (w >= 5)  { score -= 8;  reasons.push({ type:'warning', text: `<strong>Vent modéré au sol :</strong> ${w.toFixed(1)} m/s — Vol possible avec précaution` }); }
  else              {               reasons.push({ type:'ok',      text: `<strong>Vent au sol acceptable :</strong> ${w.toFixed(1)} m/s` }); }

  // Rafales
  const g = params.gusts;
  if (g > 0) {
    if (g >= 12)    { score -= 20; reasons.push({ type:'danger',  text: `<strong>Rafales extrêmes :</strong> ${g.toFixed(1)} m/s — Vol interdit` }); }
    else if (g >= 9){ score -= 12; reasons.push({ type:'warning', text: `<strong>Rafales fortes :</strong> ${g.toFixed(1)} m/s — Risque de déstabilisation` }); }
  }

  // Vent à 80m
  const w80 = params.wind80;
  if (w80 >= 12)    { score -= 15; reasons.push({ type:'danger',  text: `<strong>Vent à 80m dangereux :</strong> ${w80.toFixed(1)} m/s` }); }
  else if (w80 >= 9){ score -= 8;  reasons.push({ type:'warning', text: `<strong>Vent à 80m élevé :</strong> ${w80.toFixed(1)} m/s — Limiter l'altitude` }); }

  // Cisaillement (différence sol/altitude)
  const shear = Math.abs(w80 - w);
  if (shear > 5)    { score -= 10; reasons.push({ type:'warning', text: `<strong>Cisaillement de vent :</strong> ${shear.toFixed(1)} m/s entre sol et 80m — Turbulences possibles` }); }

  // Précipitations
  const p = params.precip;
  const pp = params.precipProb;
  if (p > 2)        { score -= 40; reasons.push({ type:'danger',  text: `<strong>Précipitations actives :</strong> ${p.toFixed(1)} mm — Vol interdit` }); }
  else if (p > 0)   { score -= 25; reasons.push({ type:'danger',  text: `<strong>Précipitations faibles :</strong> ${p.toFixed(1)} mm — Vol fortement déconseillé` }); }
  else if (pp >= 60){ score -= 15; reasons.push({ type:'warning', text: `<strong>Probabilité de pluie élevée :</strong> ${pp}% — Risque significatif` }); }
  else if (pp >= 30){ score -= 6;  reasons.push({ type:'warning', text: `<strong>Probabilité de pluie :</strong> ${pp}% — Rester vigilant` }); }
  else              {               reasons.push({ type:'ok',      text: `<strong>Pas de précipitations</strong> prévues` }); }

  // Visibilité
  const vis = params.visibility; // km
  if (vis < 1)      { score -= 35; reasons.push({ type:'danger',  text: `<strong>Visibilité très faible :</strong> ${vis.toFixed(1)} km — Vol en VLOS impossible` }); }
  else if (vis < 3) { score -= 20; reasons.push({ type:'danger',  text: `<strong>Visibilité réduite :</strong> ${vis.toFixed(1)} km — Conditions VLOS dégradées` }); }
  else if (vis < 5) { score -= 8;  reasons.push({ type:'warning', text: `<strong>Visibilité limitée :</strong> ${vis.toFixed(1)} km — Vigilance recommandée` }); }
  else              {               reasons.push({ type:'ok',      text: `<strong>Bonne visibilité :</strong> ${vis.toFixed(1)} km` }); }

  // Couverture nuageuse
  const cc = params.cloudCover;
  if (cc >= 90)     { score -= 5;  reasons.push({ type:'warning', text: `<strong>Couverture nuageuse totale :</strong> ${cc}%` }); }

  // CAPE (orages)
  const cape = params.cape;
  if (cape > 1500)  { score -= 35; reasons.push({ type:'danger',  text: `<strong>Risque orage extrême (CAPE : ${Math.round(cape)} J/kg)</strong> — Vol dangereux` }); }
  else if (cape > 800){ score -= 20; reasons.push({ type:'danger', text: `<strong>Risque orage élevé (CAPE : ${Math.round(cape)} J/kg)</strong> — Vol fortement déconseillé` }); }
  else if (cape > 300){ score -= 10; reasons.push({ type:'warning',text: `<strong>Instabilité atmosphérique (CAPE : ${Math.round(cape)} J/kg)</strong> — Orages possibles` }); }
  else              {               reasons.push({ type:'ok',      text: `<strong>Atmosphère stable</strong> — Aucun risque d'orage` }); }

  // Température (batterie Avata 2 : -10°C à 40°C, optimal > 10°C)
  const t = params.temp;
  if (t < -5)       { score -= 20; reasons.push({ type:'danger',  text: `<strong>Température hors limites :</strong> ${t.toFixed(1)}°C — Batterie défaillante possible` }); }
  else if (t < 5)   { score -= 10; reasons.push({ type:'warning', text: `<strong>Température froide :</strong> ${t.toFixed(1)}°C — Capacité batterie réduite (~30%)` }); }
  else if (t < 10)  { score -= 5;  reasons.push({ type:'warning', text: `<strong>Température fraîche :</strong> ${t.toFixed(1)}°C — Légère réduction de batterie` }); }
  else if (t > 38)  { score -= 8;  reasons.push({ type:'warning', text: `<strong>Température élevée :</strong> ${t.toFixed(1)}°C — Risque de surchauffe` }); }
  else              {               reasons.push({ type:'ok',      text: `<strong>Température optimale :</strong> ${t.toFixed(1)}°C` }); }

  // Nuit
  if (!params.isDaytime) {
    score -= 50;
    reasons.push({ type:'danger', text: `<strong>Vol de nuit :</strong> Interdit par la CAAI sans autorisation spéciale` });
  }

  // Airspace
  if (params.airspace) {
    const as = params.airspace;
    if (as.status === 'danger')  { score -= 50; reasons.push({ type:'danger',  text: `<strong>Zone interdite :</strong> ${as.airport} à ${as.dist.toFixed(1)} km — Autorisation CAAI obligatoire` }); }
    if (as.status === 'warning') { score -= 25; reasons.push({ type:'danger',  text: `<strong>CTR active :</strong> ${as.airport} à ${as.dist.toFixed(1)} km — Autorisation requise` }); }
    if (as.status === 'caution') { score -= 5;  reasons.push({ type:'warning', text: `<strong>Proximité aéroport :</strong> ${as.airport} à ${as.dist.toFixed(1)} km` }); }
  }

  score = Math.max(0, Math.min(100, score));
  return { score: Math.round(score), reasons };
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

// Météo : Open-Meteo
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
    '&timezone=auto',
    '&forecast_days=3',
    '&windspeed_unit=ms'
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
//  RENDERING
// ══════════════════════════════════════════════════════════

let currentTab = 'flight';
let currentWeatherData = null;
let currentLat = null, currentLon = null;

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

  // Score
  const { score, reasons } = calcFlightScore({
    wind10, wind80, wind120, gusts, temp, precip, precipProb: precipP,
    visibility: vis, cloudCover: cc, cape, isDaytime: isDay, airspace
  });
  const verdict = getVerdict(score);

  // ── Localisation & heure
  document.getElementById('locationName').textContent = locationName;
  document.getElementById('currentDateTime').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  const wmo = WMO_CODES[wcode] || WMO_CODES[0];
  document.getElementById('weatherDescription').textContent = `${wmo.emoji} ${wmo.label}`;

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

  // ── Visibilité
  document.getElementById('visibility').textContent = vis >= 10 ? '≥10' : vis.toFixed(1);
  const visLabel = vis < 1 ? '⛔ Très faible' : vis < 3 ? '⚠️ Faible' : vis < 5 ? '⚠️ Modérée' : '✅ Bonne';
  document.getElementById('visibilityLevel').textContent = visLabel;
  setBar('visibilityBar', Math.min(100, (vis / 10) * 100), vis < 3 ? 'var(--red)' : vis < 5 ? 'var(--orange)' : 'var(--green)');
  setCardStatus('card-visibility', vis < 3 ? 'danger' : vis < 5 ? 'warning' : 'good');

  // ── Nuages
  document.getElementById('cloudCover').textContent = cc;
  setBar('cloudBar', cc, cc > 80 ? 'var(--text-second)' : cc > 50 ? 'var(--teal)' : 'var(--blue)');

  // ── CAPE
  document.getElementById('capeValue').textContent = Math.round(cape);
  const capeLabel = cape > 1500 ? '⛈ Orage imminent' : cape > 800 ? '⚡ Risque élevé' : cape > 300 ? '⚠️ Instable' : '✅ Stable';
  document.getElementById('capeLevel').textContent = capeLabel;
  setBar('capeBar', Math.min(100, (cape / 2000) * 100), cape > 1500 ? 'var(--red)' : cape > 800 ? 'var(--orange)' : cape > 300 ? '#FF9F0A' : 'var(--green)');
  setCardStatus('card-cape', cape > 800 ? 'danger' : cape > 300 ? 'warning' : 'good');

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

  // ── Profil altitude
  renderAltitudeProfile({ wind10, wind80, wind120, wind180 });

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
}

function renderAltitudeProfile({ wind10, wind80, wind120, wind180 }) {
  const container = document.getElementById('altitudeProfile');
  const levels = [
    { label: '10 m',  val: wind10,  limit: 10.8 },
    { label: '80 m',  val: wind80,  limit: 10.8 },
    { label: '120 m', val: wind120, limit: 10.8 },
    { label: '180 m', val: wind180, limit: 10.8 },
  ];

  container.innerHTML = levels.map(lv => {
    const pct = Math.min(100, (lv.val / 16) * 100);
    const color = lv.val > 10.8 ? 'var(--red)' : lv.val > 8 ? 'var(--orange)' : 'var(--green)';
    const stClass = lv.val > 10.8 ? 'danger' : lv.val > 8 ? 'caution' : 'ok';
    const stLabel = lv.val > 10.8 ? '⛔ Limite' : lv.val > 8 ? '⚠️ Prudence' : '✅ OK';
    return `
      <div class="alt-row">
        <div class="alt-label">${lv.label}</div>
        <div class="alt-bar-track">
          <div class="alt-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <div class="alt-value">${lv.val.toFixed(1)} m/s</div>
        <div class="alt-status ${stClass}">${stLabel}</div>
      </div>`;
  }).join('');

  container.innerHTML += `
    <div class="avata-limit">
      <svg viewBox="0 0 20 20" fill="none" width="16"><path d="M10 2L2 18h16L10 2z" stroke="var(--blue)" stroke-width="1.5"/><text x="10" y="14" text-anchor="middle" font-size="9" fill="var(--blue)" font-weight="bold">i</text></svg>
      DJI Avata 2 — Résistance max : <strong>10.8 m/s</strong> &nbsp;|&nbsp; Altitude légale CAAI : <strong>50 m AGL</strong>
    </div>`;
}

function renderForecast(data, tab) {
  currentTab = tab;
  const h = data.hourly;
  const d = data.daily;
  const container = document.getElementById('forecastContainer');

  // Grouper par jour
  const days = {};
  for (let i = 0; i < h.time.length; i++) {
    const dt = new Date(h.time[i]);
    const dayKey = dt.toISOString().slice(0, 10);
    if (!days[dayKey]) days[dayKey] = [];
    // Prendre toutes les heures (0-23)
    days[dayKey].push(i);
  }

  let html = '<div class="forecast-inner">';
  let dayIdx = 0;

  for (const [dayKey, indices] of Object.entries(days)) {
    const dayDate = new Date(dayKey + 'T12:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const dayLabel = dayDate.toDateString() === today.toDateString() ? "Aujourd'hui"
      : dayDate.toDateString() === new Date(today.getTime() + 86400000).toDateString() ? 'Demain'
      : formatDateShort(dayKey);

    html += `<div class="forecast-day-group">
      <div class="forecast-day-label">${dayLabel}</div>
      <div class="forecast-hours">`;

    for (const i of indices) {
      const dt = new Date(h.time[i]);
      const sunrise = d.sunrise[dayIdx] || d.sunrise[0];
      const sunset  = d.sunset[dayIdx]  || d.sunset[0];
      const isDay   = isDaytime(h.time[i], sunrise, sunset);

      let cellScore = 0, mainVal = '', sub = '';

      if (tab === 'flight') {
        const { score } = calcFlightScore({
          wind10:     h.windspeed_10m[i]  || 0,
          wind80:     h.windspeed_80m[i]  || 0,
          wind120:    h.windspeed_120m[i] || 0,
          gusts:      h.windgusts_10m[i]  || 0,
          temp:       h.temperature_2m[i] || 20,
          precip:     h.precipitation[i] || 0,
          precipProb: h.precipitation_probability[i] || 0,
          visibility: (h.visibility[i] || 10000) / 1000,
          cloudCover: h.cloudcover[i]    || 0,
          cape:       h.cape[i]          || 0,
          isDaytime:  isDay,
          airspace:   null
        });
        cellScore = score;
        mainVal = `<div class="fc-score ${scoreClass(score)}">${score}</div>`;
        sub = '';
      } else if (tab === 'wind') {
        const w = (h.windspeed_10m[i] || 0).toFixed(1);
        const wColor = h.windspeed_10m[i] > 10.8 ? 'var(--red)' : h.windspeed_10m[i] > 7 ? 'var(--orange)' : 'var(--green)';
        mainVal = `<div class="fc-wind" style="font-size:13px;font-weight:700;color:${wColor}">${w}</div><div class="fc-wind">m/s</div>`;
        cellScore = 100 - Math.min(100, (h.windspeed_10m[i] / 15) * 100);
      } else {
        const pp = h.precipitation_probability[i] || 0;
        const pColor = pp > 60 ? 'var(--red)' : pp > 30 ? 'var(--orange)' : 'var(--green)';
        mainVal = `<div class="fc-wind" style="font-size:13px;font-weight:700;color:${pColor}">${pp}%</div>`;
        cellScore = 100 - pp;
      }

      const wmo = WMO_CODES[h.weathercode[i]] || WMO_CODES[0];
      const cls = [
        'forecast-cell',
        !isDay ? 'night' : '',
        tab === 'flight' && cellScore >= 75 ? 'optimal' : '',
        `score-${scoreClass(cellScore)}`
      ].filter(Boolean).join(' ');

      html += `
        <div class="${cls}">
          <div class="fc-time">${dt.getHours().toString().padStart(2,'0')}h</div>
          <div class="fc-icon">${wmo.emoji}</div>
          ${mainVal}
          <div class="fc-wind">${(h.windspeed_10m[i]||0).toFixed(1)}</div>
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
    const data = await fetchWeather(lat, lon);
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
//  INIT
// ══════════════════════════════════════════════════════════
(function init() {
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
