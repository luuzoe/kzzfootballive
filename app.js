/* KZZ Football Live — client-side app.
   Live data: ESPN public scoreboard/standings API (scores only, no video streams).
   Predictions: local predictions.json (edit the file, re-upload to update). */

const LEAGUES = [
  { id: 'eng.1',          name: 'Premier League',   mm: 'အင်္ဂလန် ပရီးမီးယားလိဂ်', icon: '🇬🇧' },
  { id: 'esp.1',          name: 'La Liga',          mm: 'စပိန် လာလီဂါ',           icon: '🇪🇸' },
  { id: 'ita.1',          name: 'Serie A',          mm: 'အီတလီ စီးရီးအေ',          icon: '🇮🇹' },
  { id: 'ger.1',          name: 'Bundesliga',       mm: 'ဂျာမန် ဘွန်ဒက်စ်လီဂါ',    icon: '🇩🇪' },
  { id: 'fra.1',          name: 'Ligue 1',          mm: 'ပြင်သစ် လီဂူး ၁',         icon: '🇫🇷' },
  { id: 'ned.1',          name: 'Eredivisie',       mm: 'နယ်သာလန် အရီဒီဗီစီ',      icon: '🇳🇱' },
  { id: 'por.1',          name: 'Primeira Liga',    mm: 'ပေါ်တူဂီ ပရိုင်းရာလီဂါ',   icon: '🇵🇹' },
  { id: 'uefa.champions', name: 'Champions League', mm: 'ချန်ပီယံလိဂ်',            icon: '⭐' },
  { id: 'uefa.europa',   name: 'Europa League',    mm: 'ယူရိုပါလိဂ်',             icon: '🟠' },
];

const APP_VERSION = 25; // bump on every deploy

const TABS = {
  live:        '🔴 တိုက်ရိုက်',
  fixtures:    '📅 ပွဲစဉ်',
  results:     '✅ ရလဒ်',
  standings:   '📊 အဆင့်',
  predictions: '🔮 ခန့်မှန်းချက်',
  news:        '📰 သတင်း',
};

let state = { league: 'all', tab: 'live', timer: null, standView: 'table' };
let TEAMS_MM = {};                       // ESPN team id -> {en, abbr, mm}
let SQUADS = {};                           // ESPN team id -> {updated, team, players:[{n,pos,name,nat}]}
let TEAM_INFO = {};                        // ESPN team id -> {founded, stadium, city, trophies:[{t,c}]}
let TEAM_MM_BY_NAME = {};                // lowercase English name -> mm
const FAV_KEY = 'kzz_fav_team';
let favTeamId = null;
try { favTeamId = localStorage.getItem(FAV_KEY) || null; } catch (e) {}

function teamMm(t) {
  // t: {id, abbr, name, full}
  const rec = t && t.id && TEAMS_MM[t.id];
  if (rec && rec.mm) return `<span class="nm-mm">${esc(rec.mm)}</span> <span class="nm-en">${esc(rec.abbr || t.abbr || '')}</span>`;
  return `<span class="nm-en-only">${esc((t && (t.name || t.full)) || '')}</span>`;
}
function isFavMatch(m) {
  return favTeamId && m && (String(m.home.id) === String(favTeamId) || String(m.away.id) === String(favTeamId));
}
function sortFavFirst(matches) {
  return matches.slice().sort((a, b) => (isFavMatch(b) ? 1 : 0) - (isFavMatch(a) ? 1 : 0));
}
function favDisplayName() {
  const rec = favTeamId && TEAMS_MM[favTeamId];
  if (rec && rec.mm) return rec.mm;
  const sel = $('#favSelect');
  if (sel && sel.selectedIndex > 0) return sel.options[sel.selectedIndex].text;
  return '';
}
function favSectionHtml(favMs, cardsHtml, emptyMsg) {
  if (!favTeamId) return '';
  const fn = favDisplayName() || 'မင်းအသင်း';
  if (favMs.length) return `<div class="date-group">⭐ ${esc(fn)} ရဲ့ပွဲများ</div>${cardsHtml}`;
  return `<div class="fav-empty">⭐ ${esc(fn)} — ${emptyMsg}</div>`;
}

const $ = (sel) => document.querySelector(sel);
const content = $('#content');

/* ---------- helpers ---------- */

function yangonParts(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return p; // {year, month, day}
}
function yyyymmdd(d) {
  const p = yangonParts(d);
  return `${p.year}${p.month}${p.day}`;
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
function fmtDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function parseMatch(e) {
  const c = (e.competitions && e.competitions[0]) || {};
  const comps = c.competitors || [];
  const home = comps.find((x) => x.homeAway === 'home') || {};
  const away = comps.find((x) => x.homeAway === 'away') || {};
  const t = (x) => ({
    id: (x.team && x.team.id) || '',
    abbr: (x.team && x.team.abbreviation) || '',
    name: (x.team && (x.team.shortDisplayName || x.team.displayName)) || '',
    full: (x.team && x.team.displayName) || '',
    logo: (x.team && (x.team.logo || (x.team.logos && x.team.logos[0] && x.team.logos[0].href))) || '',
  });
  const st = e.status || {};
  const homeT = t(home), awayT = t(away);
  const goals = (c.details || [])
    .filter((dd) => dd && dd.scoringPlay)
    .map((dd) => {
      const tid = (dd.team && dd.team.id) || '';
      const ath = (dd.athletesInvolved && dd.athletesInvolved[0]) || {};
      const athTid = (ath.team && ath.team.id) || '';
      const isOG = !!dd.ownGoal;
      let side = tid === homeT.id ? 'home' : (tid === awayT.id ? 'away' : '');
      if (isOG) {
        // own goal: credit the opposing side of the player who scored it
        const conceder = athTid === homeT.id ? 'home' : (athTid === awayT.id ? 'away' : '');
        side = conceder === 'home' ? 'away' : (conceder === 'away' ? 'home' : side);
      }
      return {
        minute: (dd.clock && dd.clock.displayValue) || '',
        scorer: ath.displayName || '',
        homeAway: side,
        ownGoal: isOG,
        penalty: !!dd.penaltyKick,
      };
    });
  return {
    id: e.id,
    date: e.date,
    home: homeT, away: awayT,
    homeScore: home.score != null ? home.score : null,
    awayScore: away.score != null ? away.score : null,
    state: st.type ? st.type.state : 'pre',           // pre | in | post
    clock: st.displayClock || '',
    clockSec: (typeof st.clock === 'number' ? st.clock : 0),
    period: (typeof st.period === 'number' ? st.period : 0),
    statusName: (st.type && st.type.name) || '',
    detail: (st.type && st.type.shortDetail) || '',
    venue: (c.venue && c.venue.fullName) || '',
    goals: goals,
  };
}

function goalsHtml(m) {
  const hg = (m.goals || []).filter((g) => g.homeAway === 'home');
  const ag = (m.goals || []).filter((g) => g.homeAway === 'away');
  if (!hg.length && !ag.length) return '';
  const col = (gs, cls) => {
    const rows = gs.map((g) => {
      const tag = g.ownGoal ? ' (OG)' : (g.penalty ? ' (P)' : '');
      return `<div class="goal-row"><span class="goal-min">${esc(g.minute)}</span><span class="goal-name">⚽ ${esc(g.scorer)}${tag}</span></div>`;
    }).join('');
    return `<div class="goal-col ${cls}">${rows}</div>`;
  };
  return `<div class="goals"><div class="goals-title">ဂိုးသွင်းသူများ</div><div class="goals-split">${col(hg, 'left')}${col(ag, 'right')}</div></div>`;
}

function fmtClock(totalSec, period) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(totalSec / 60);
  // Added time: 1st half beyond 45', 2nd half beyond 90'
  if (period === 1 && mins > 45) return `45+${mins - 45}'`;
  if (period === 2 && mins > 90) return `90+${mins - 90}'`;
  return `${mins}' ${String(totalSec % 60).padStart(2, '0')}"`;
}
function clockMode(m) {
  if (m.state !== 'in') return 'none';
  if (/HALFTIME/i.test(m.statusName || '') || (m.clock || '').toUpperCase() === 'HT') return 'static';
  return 'tick';
}
function tickClocks() {
  document.querySelectorAll('.match-clock[data-sec]').forEach((el) => {
    const base = parseFloat(el.dataset.sec) || 0;
    const t0 = parseFloat(el.dataset.t0) || Date.now();
    el.textContent = '⏱ ' + fmtClock(base + (Date.now() - t0) / 1000, parseInt(el.dataset.period || '0', 10) || 0);
  });
}
// Persistent per-match clock anchors: ESPN's clock is minute-precision, so
// re-anchoring on every render made the seconds restart from :00 each minute
// and on every tab re-entry. Keep the anchor in page memory and preserve the
// running seconds phase when ESPN's minute advances.
const clockAnchors = {};
const CLOCK_LS_KEY = 'kzzClockAnchors';
function saveAnchors() {
  try {
    const now = Date.now();
    Object.keys(clockAnchors).forEach((k) => { if (now - (clockAnchors[k].t0 || 0) > 12 * 3600 * 1000) delete clockAnchors[k]; });
    localStorage.setItem(CLOCK_LS_KEY, JSON.stringify(clockAnchors));
  } catch (e) {}
}
function koPhase(m) {
  // ESPN reports whole minutes only; estimate the seconds phase from kickoff.
  const ko = Date.parse(m.date || '');
  if (isNaN(ko)) return 0;
  const el = (Date.now() - ko) / 1000;
  return el > 0 ? Math.floor(el % 60) : 0;
}
function anchorClock(m) {
  const now = Date.now();
  const espn = (typeof m.clockSec === 'number' ? m.clockSec : 0);
  const period = m.period || 0;
  let a = clockAnchors[m.id];
  if (!a) {
    try {
      const stored = (JSON.parse(localStorage.getItem(CLOCK_LS_KEY) || '{}') || {})[m.id];
      if (stored && typeof stored.base === 'number') a = clockAnchors[m.id] = stored;
    } catch (e) {}
  }
  if (!a || a.period !== period) {
    const phase = (espn % 60 === 0) ? koPhase(m) : 0;
    a = clockAnchors[m.id] = { base: espn + phase, t0: now, period: period, lastEspn: espn };
    saveAnchors();
    return a;
  }
  const shown = a.base + (now - a.t0) / 1000;
  if (espn > a.lastEspn) {
    const phase = ((shown % 60) + 60) % 60;
    a.base = (espn % 60 === 0) ? espn + phase : espn;
    a.t0 = now;
    a.lastEspn = espn;
    saveAnchors();
  } else if (shown - espn > 180) {
    a.base = espn; a.t0 = now; a.lastEspn = espn;
    saveAnchors();
  }
  return a;
}
let clockTimer = null;
function armClockTicker(on) {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  if (on) { tickClocks(); clockTimer = setInterval(tickClocks, 1000); }
}

function matchCard(m) {
  const isLive = m.state === 'in';
  const isPost = m.state === 'post';
  const badge = isLive
    ? `<span class="badge-live">🔴 တိုက်ရိုက်</span>`
    : isPost
      ? `<span class="badge-ft">${esc(m.detail || 'FT')}</span>`
      : `<span class="badge-pre">${esc(fmtDateTime(m.date))}</span>`;
  const score = (m.homeScore != null && m.awayScore != null)
    ? `<div class="match-score">${esc(m.homeScore)} <span class="vs">-</span> ${esc(m.awayScore)}</div>`
    : `<div class="match-score"><span class="vs">VS</span></div>`;
  const logo = (tm) => tm.logo ? `<img src="${esc(tm.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const favBadge = (tm) => (favTeamId && String(tm.id) === String(favTeamId)) ? ' <span class="fav-star">⭐</span>' : '';
  let liveClock = '';
  if (isLive) {
    const mode = clockMode(m);
    if (mode === 'static') liveClock = `<div class="match-clock">⏸ ပထမပိုင်း နားချိန် (HT${m.clock ? ' ' + esc(m.clock) : ''})</div>`;
    else if (mode === 'tick') { const a = anchorClock(m); liveClock = `<div class="match-clock" data-sec="${a.base}" data-period="${m.period || 0}" data-t0="${a.t0}">⏱ ${fmtClock(a.base + (Date.now() - a.t0) / 1000, m.period)}</div>`; }
  }
  return `
  <div class="match-card${isLive ? ' live-now' : ''}${isFavMatch(m) ? ' fav-match' : ''}" onclick="openMatchDetail('${esc(m.id)}')" style="cursor:pointer" title="အသေးစိတ်ကြည့်ရန် နှိပ်ပါ">
    <div class="match-top">${badge}<span>${esc(fmtDate(m.date))}</span>${!isLive && !isPost ? `<button class="remind-btn" onclick="event.stopPropagation();toggleReminder('${esc(m.id)}','${esc(teamMm(m.home))} vs ${esc(teamMm(m.away))}','${esc(m.date)}')" title="သတိပေးချက်">🔔</button>` : ''}</div>
    <div class="match-teams">
      <div class="team home">${logo(m.home)}<span>${teamMm(m.home)}${favBadge(m.home)}</span></div>
      ${score}
      <div class="team away"><span>${teamMm(m.away)}${favBadge(m.away)}</span>${logo(m.away)}</div>
    </div>
    ${liveClock}
    ${m.venue ? `<div class="match-venue">🏟 ${esc(m.venue)}</div>` : ''}
    ${goalsHtml(m)}
    <div class="tap-hint">👆 နှိပ်၍ အသေးစိတ် (lineup • stats) ကြည့်ရန်</div>
  </div>`;
}

function showLoading(msg) {
  content.innerHTML = `<div class="loading">${esc(msg || 'ဒေတာဆွဲနေသည်…')}</div>`;
}
function showError(msg) {
  content.innerHTML = `<div class="error">${esc(msg || 'ဒေတာဆွဲမရသေးပါ။')}<br><button onclick="loadTab()">🔄 ပြန်ကြိုးစားမယ်</button></div>`;
}

// Fetch scoreboard: if state.league is 'all', fetch all leagues and merge events
async function fetchScoreboard(dates) {
  if (state.league !== 'all') {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/scoreboard` + (dates ? `?dates=${dates}` : '');
    return getJSON(url);
  }
  const results = await Promise.all(LEAGUES.map(l =>
    getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l.id}/scoreboard` + (dates ? `?dates=${dates}` : '')).catch(() => null)
  ));
  const events = [];
  results.forEach(r => { if (r && r.events) events.push(...r.events); });
  return { events };
}
function leagueName() {
  if (state.league === 'all') return '🌍 အားလုံး';
  const l = LEAGUES.find((x) => x.id === state.league);
  return l ? `${l.icon} ${l.mm}` : '';
}
function stamp() {
  $('#updatedAt').textContent = 'နောက်ဆုံးအပ်ဒိတ်: ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) + ' (မြန်မာစံတော်ချိန်)';
}

/* ---------- tabs ---------- */

async function renderLive() {
  const data = await fetchScoreboard();
  const matches = sortFavFirst((data.events || []).map(parseMatch).filter((m) => m.state === 'in'));
  checkFavGoals(matches);
  if (!matches.length) {
    content.innerHTML = `
      <h2 class="section-title">${leagueName()}</h2>
      <div class="empty">ယခု တိုက်ရိုက်ကစားနေတဲ့ပွဲ မရှိသေးပါ။<br>ပွဲစဉ် tab မှာ လာမယ့်ပွဲတွေ ကြည့်နိုင်ပါတယ်။</div>
      <div class="refresh-line">စက္ကန့် ၆၀ တိုင်း အလိုအလျောက် ပြန်ဆွဲမယ်<button onclick="loadTab()">🔄 ယခုပြန်ဆွဲမယ်</button></div>`;
  } else {
    content.innerHTML = `
      <h2 class="section-title">${leagueName()} — တိုက်ရိုက် (${matches.length} ပွဲ)</h2>
      <div class="refresh-line">စက္ကန့် ၆၀ တိုင်း အလိုအလျောက် ပြန်ဆွဲမယ်<button onclick="loadTab()">🔄 ယခုပြန်ဆွဲမယ်</button></div>
      ${matches.map(matchCard).join('')}`;
  }
  stamp();
}

async function renderFixtures() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 86400000);
    days.push(yyyymmdd(d));
  }
  const boards = await Promise.all(days.map((ds) =>
    fetchScoreboard(ds).catch(() => null)
  ));
  const seen = new Set();
  const matches = [];
  boards.forEach((b) => (b && b.events || []).forEach((e) => {
    const m = parseMatch(e);
    if (m.state === 'pre' && !seen.has(m.id)) { seen.add(m.id); matches.push(m); }
  }));
  matches.sort((a, b) => new Date(a.date) - new Date(b.date));
  const favMs = matches.filter(isFavMatch);
  if (!matches.length) {
    content.innerHTML = `<h2 class="section-title">${leagueName()}</h2><div class="empty">နောက် ၇ ရက်အတွင်း ပွဲစဉ် မရှိပါ။</div>`;
  } else {
    let html = `<h2 class="section-title">${leagueName()} — လာမယ့်ပွဲစဉ်များ</h2>`;
    html += favSectionHtml(favMs, favMs.map(matchCard).join(''), 'နောက် ၇ ရက်အတွင်း ပွဲစဉ် မရှိပါ');
    let lastDay = '';
    matches.forEach((m) => {
      const day = fmtDate(m.date);
      if (day !== lastDay) { html += `<div class="date-group">📅 ${esc(day)}</div>`; lastDay = day; }
      html += matchCard(m);
    });
    content.innerHTML = html;
  }
  stamp();
}

async function renderResults() {
  const days = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(yyyymmdd(d));
  }
  const boards = await Promise.all(days.map((ds) =>
    fetchScoreboard(ds).catch(() => null)
  ));
  const seen = new Set();
  const matches = [];
  boards.forEach((b) => (b && b.events || []).forEach((e) => {
    const m = parseMatch(e);
    if (m.state === 'post' && !seen.has(m.id)) { seen.add(m.id); matches.push(m); }
  }));
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  const favMs = matches.filter(isFavMatch);
  if (!matches.length) {
    content.innerHTML = `<h2 class="section-title">${leagueName()}</h2><div class="empty">ပြီးခဲ့တဲ့ရလဒ် မရှိပါ။</div>`;
  } else {
    let html = `<h2 class="section-title">${leagueName()} — ပြီးခဲ့တဲ့ရလဒ်များ</h2>`;
    html += favSectionHtml(favMs, favMs.map(matchCard).join(''), 'ပြီးခဲ့တဲ့ရက်ပိုင်းမှာ ပွဲမရှိပါ');
    let lastDay = '';
    matches.slice(0, 30).forEach((m) => {
      const day = fmtDate(m.date);
      if (day !== lastDay) { html += `<div class="date-group">📅 ${esc(day)}</div>`; lastDay = day; }
      html += matchCard(m);
    });
    content.innerHTML = html;
  }
  stamp();
}

async function renderLineups() {
  const now = Date.now();
  const days = [yyyymmdd(new Date(now)), yyyymmdd(new Date(now + 86400000))];
  const boards = await Promise.all(days.map((ds) => fetchScoreboard(ds).catch(() => null)));
  const seen = new Set();
  const matches = [];
  boards.forEach((b) => (b && b.events || []).forEach((e) => {
    const m = parseMatch(e);
    if (seen.has(m.id)) return;
    const kick = new Date(m.date).getTime();
    if ((m.state === 'pre' && kick - now <= 6 * 3600 * 1000 && kick >= now - 3600 * 1000) || m.state === 'in') {
      seen.add(m.id); matches.push(m);
    }
  }));
  matches.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!matches.length) {
    content.innerHTML = `<h2 class="section-title">${leagueName()} — 👥 လူစာရင်း</h2>
      <div class="empty">နောက် ၆ နာရီအတွင်း ပွဲမရှိပါ။<br>လူစာရင်းများကို ပွဲမစမီ ၁ နာရီအလိုတွင် ထုတ်ပြန်ပါသည်။</div>`;
    stamp();
    return;
  }
  const limited = matches.slice(0, 12);
  content.innerHTML = `<h2 class="section-title">${leagueName()} — 👥 ပွဲထွက်လူစာရင်း</h2>
    <div class="empty">လူစာရင်းများကို ပွဲမစမီ ၁ နာရီအလိုတွင် ထုတ်ပြန်ပါသည်။</div>
    ${limited.map((m) => `<div class="lineup-match" id="lu-${esc(m.id)}">
      <div class="lineup-match-head"><b>${esc(teamMm(m.home))} vs ${esc(teamMm(m.away))}</b><span>${esc(fmtDateTime(m.date))}</span></div>
      <div class="loading">လူစာရင်း ဆွဲနေသည်…</div>
    </div>`).join('')}`;
  stamp();
  await Promise.all(limited.map(async (m) => {
    const el = document.getElementById('lu-' + m.id);
    if (!el) return;
    try {
      const d = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${encodeURIComponent(m.id)}`);
      const rosters = d.rosters || [];
      if (!rosters.length) {
        el.querySelector('.loading').outerHTML = '<div class="empty">လူစာရင်း မထွက်သေးပါ။</div>';
        return;
      }
      const cols = rosters.map((r) => {
        const t = r.team || {};
        const rec = t.id && TEAMS_MM[t.id];
        const tnm = rec && rec.mm ? rec.mm : (t.shortDisplayName || t.displayName || '');
        const starters = (r.roster || []).filter((p) => p.starter);
        const subs = (r.roster || []).filter((p) => !p.starter);
        const pRow = (p) => {
          const a = p.athlete || {};
          const pos = p.position ? ` <span class="pos">${esc(p.position.abbreviation || '')}</span>` : '';
          return `<div class="lu-row"><span class="lu-j">${esc(p.jersey != null ? p.jersey : '')}</span><span>${esc(a.displayName || a.shortName || '')}</span>${pos}</div>`;
        };
        return `<div class="lu-team"><div class="lu-title">${esc(tnm)}${r.formation ? ` <span class="form">(${esc(r.formation)})</span>` : ''}</div>
          <div class="lu-sec">ပွဲထွက်လူစာရင်း</div>${starters.map(pRow).join('') || '<div class="empty">—</div>'}
          ${subs.length ? `<div class="lu-sec">အရံခုံ</div>${subs.map(pRow).join('')}` : ''}</div>`;
      }).join('');
      el.querySelector('.loading').outerHTML = `<div class="lu-cols">${cols}</div>`;
    } catch (e) {
      const ld = el.querySelector('.loading');
      if (ld) ld.outerHTML = '<div class="empty">လူစာရင်း ဆွဲမရပါ။</div>';
    }
  }));
}

async function renderStandings() {
  const sub = `
    <div class="sub-tabs">
      <button class="sub-tab${state.standView === 'table' ? ' active' : ''}" onclick="setStandView('table')">📊 အဆင့်ဇယား</button>
      <button class="sub-tab${state.standView === 'scorers' ? ' active' : ''}" onclick="setStandView('scorers')">🎯 ဂိုးသွင်းအများဆုံး</button>
      <button class="sub-tab${state.standView === 'assists' ? ' active' : ''}" onclick="setStandView('assists')">🅰️ Assist အများဆုံး</button>
    </div>`;
  if (state.standView === 'scorers') { await renderScorers(sub); return; }
  if (state.standView === 'assists') { await renderAssists(sub); return; }
  if (state.league === 'all') {
    const majors = LEAGUES.filter(l => ['eng.1','esp.1','ita.1','ger.1','fra.1'].includes(l.id));
    const allData = await Promise.all(majors.map(async (l) => {
      try {
        const d = await getJSON(`https://site.web.api.espn.com/apis/v2/sports/soccer/${l.id}/standings`);
        const ch = d.children && d.children[0];
        return { league: l, entries: (ch && ch.standings && ch.standings.entries) || [] };
      } catch (e) { return { league: l, entries: [] }; }
    }));
    let html = `<h2 class="section-title">🌍 အားလုံး — အဆင့်ဇယား (ထိပ်ဆုံး ၅ သင်း)</h2>${sub}`;
    allData.forEach(({ league, entries }) => {
      if (!entries.length) return;
      html += `<h3 style="margin:20px 0 8px;">${league.icon} ${esc(league.name)}</h3><table style="width:100%;border-collapse:collapse;">`;
      html += `<tr style="background:#f0f0f0;"><th style="padding:6px;text-align:left;">#</th><th style="padding:6px;text-align:left;">အသင်း</th><th style="padding:6px;">ပွဲ</th><th style="padding:6px;">နိုင်</th><th style="padding:6px;">သရေ</th><th style="padding:6px;">ရှုံး</th><th style="padding:6px;">ရမှတ်</th></tr>`;
      const stat = (en, n) => { const s = (en.stats || []).find(x => x.name === n); return s ? s.displayValue : '–'; };
      entries.slice(0, 5).forEach(en => {
        const tm = en.team || {};
        const mm = tm.id && TEAMS_MM[tm.id] && TEAMS_MM[tm.id].en ? esc(TEAMS_MM[tm.id].en) : esc(tm.shortDisplayName || tm.displayName || '');
        html += `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px;">${esc(stat(en,'rank'))}</td><td style="padding:6px;">${mm}</td><td style="padding:6px;text-align:center;">${esc(stat(en,'gamesPlayed'))}</td><td style="padding:6px;text-align:center;">${esc(stat(en,'wins'))}</td><td style="padding:6px;text-align:center;">${esc(stat(en,'ties'))}</td><td style="padding:6px;text-align:center;">${esc(stat(en,'losses'))}</td><td style="padding:6px;text-align:center;font-weight:bold;">${esc(stat(en,'points'))}</td></tr>`;
      });
      html += `</table>`;
    });
    content.innerHTML = html;
    stamp();
    return;
  }
  const data = await getJSON(`https://site.web.api.espn.com/apis/v2/sports/soccer/${state.league}/standings`);
  const child = data.children && data.children[0];
  const entries = (child && child.standings && child.standings.entries) || [];
  if (!entries.length) {
    content.innerHTML = `<h2 class="section-title">${leagueName()}</h2>${sub}<div class="empty">အဆင့်ဇယား မရသေးပါ။</div>`;
    return;
  }
  const stat = (en, n) => {
    const s = (en.stats || []).find((x) => x.name === n);
    return s ? s.displayValue : '–';
  };
  const rows = entries.map((en) => {
    const tm = en.team || {};
    const logo = tm.logos && tm.logos[0] ? `<img src="${esc(tm.logos[0].href)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    const tid = tm.id || '';
    const mm = tid && TEAMS_MM[tid] && TEAMS_MM[tid].mm ? esc(TEAMS_MM[tid].mm) : esc(tm.shortDisplayName || tm.displayName || '');
    return `<tr class="${Number(stat(en, 'rank')) <= 4 ? 'top4' : ''}${tid ? ' clickable-row' : ''}"${tid ? ` onclick="openTeamDetail('${esc(tid)}')"` : ''}>
      <td>${esc(stat(en, 'rank'))}</td>
      <td class="team-cell">${logo}<span>${mm}</span></td>
      <td>${esc(stat(en, 'gamesPlayed'))}</td><td>${esc(stat(en, 'wins'))}</td>
      <td>${esc(stat(en, 'ties'))}</td><td>${esc(stat(en, 'losses'))}</td>
      <td>${esc(stat(en, 'pointDifferential'))}</td><td class="pts">${esc(stat(en, 'points'))}</td>
    </tr>`;
  }).join('');
  content.innerHTML = `
    <h2 class="section-title">${leagueName()} — အဆင့်</h2>${sub}
    <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th style="text-align:left">အသင်း</th><th>ပွဲ</th><th>နိုင်</th><th>သရေ</th><th>ရှုံး</th><th>ဂိုးကွာ</th><th>ရမှတ်</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  stamp();
}
function setStandView(v) { state.standView = v; loadTab(); }

async function renderAssists(sub) {
  showLoading('Assist စာရင်း ဆွဲနေသည်…');
  try {
    const data = await getJSON('scorers.json');
    const leaders = ((data.assists || {})[state.league]) || [];
    const rows = leaders.slice(0, 10).map((l, i) => {
      const a = (l.assists != null && l.assists !== '–') ? l.assists : '–';
      const nm = l.pid ? `<button class="player-link" onclick="openPlayerDetail('${esc(l.pid)}')">${esc(l.player || '–')}</button>` : esc(l.player || '–');
      return `<tr><td>${i + 1}</td><td style="text-align:left">${nm}</td><td style="text-align:left">${esc(l.team || '–')}</td><td class="pts">🅰️ ${esc(a)}</td></tr>`;
    });
    content.innerHTML = `
      <h2 class="section-title">${leagueName()} — Assist အများဆုံး</h2>${sub}
      ${rows.length ? `<div class="table-wrap"><table class="standings">
        <thead><tr><th>#</th><th style="text-align:left">ကစားသမား</th><th style="text-align:left">အသင်း</th><th>Assist</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>`
        : `<div class="empty">Assist စာရင်း မရသေးပါ။</div>`}`;
  } catch (e) {
    content.innerHTML = `<h2 class="section-title">${leagueName()}</h2>${sub}<div class="empty">Assist စာရင်း ဆွဲမရသေးပါ။</div>`;
  }
  stamp();
}

async function renderScorers(sub) {
  showLoading('ဂိုးသွင်းစာရင်း ဆွဲနေသည်…');
  try {
    const data = await getJSON('scorers.json'); // pre-built VM-side daily (no browser API issues)
    const leaders = ((data.leagues || {})[state.league]) || [];
    const rows = leaders.slice(0, 10).map((l, i) => {
      const goals = (l.goals != null && l.goals !== '–') ? l.goals : '–';
      const nm = l.pid ? `<button class="player-link" onclick="openPlayerDetail('${esc(l.pid)}')">${esc(l.player || '–')}</button>` : esc(l.player || '–');
      return `<tr><td>${i + 1}</td><td style="text-align:left">${nm}</td><td style="text-align:left">${esc(l.team || '–')}</td><td class="pts">⚽ ${esc(goals)}</td></tr>`;
    });
    content.innerHTML = `
      <h2 class="section-title">${leagueName()} — ဂိုးသွင်းအများဆုံး</h2>${sub}
      ${rows.length ? `<div class="table-wrap"><table class="standings">
        <thead><tr><th>#</th><th style="text-align:left">ကစားသမား</th><th style="text-align:left">အသင်း</th><th>ဂိုး</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>`
        : `<div class="empty">ဂိုးသွင်းစာရင်း မရသေးပါ။</div>`}`;
  } catch (e) {
    content.innerHTML = `<h2 class="section-title">${leagueName()}</h2>${sub}<div class="empty">ဂိုးသွင်းစာရင်း ဆွဲမရသေးပါ။</div>`;
  }
  stamp();
}



const SB_URL = 'https://kdoxinvdysheifvaazfb.supabase.co';
const SB_KEY = 'sb_publishable_3ONYUvbOWGsKIAqiz5ROWQ_4eNPLCWM';
const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json'
};
async function sbGet(path) {
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + path, {headers: sbHeaders});
    return await r.json();
  } catch(e) { return null; }
}
async function sbPost(path, data) {
  try {
    await fetch(SB_URL + '/rest/v1/' + path, {method: 'POST', headers: sbHeaders, body: JSON.stringify(data)});
  } catch(e) {}
}
async function sbPatch(path, data) {
  try {
    await fetch(SB_URL + '/rest/v1/' + path, {method: 'PATCH', headers: sbHeaders, body: JSON.stringify(data)});
  } catch(e) {}
}

function parseFB() {
  if (window.FB) { try { FB.XFBML.parse(); } catch(e){} }
  else { setTimeout(parseFB, 1000); }
}

function filterPreds() {
  const q = (document.getElementById('pred-search').value || '').toLowerCase().trim();
  document.querySelectorAll('.pred-card').forEach(card => {
    const text = card.getAttribute('data-search') || '';
    card.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
async function renderPredictions() {
  let data = null;
  try { data = await getJSON('predictions.json'); } catch (e) { data = null; }
  const preds = (data && data.predictions) || [];
  const confLabel = { high: 'ယုံကြည်မှုမြင့်', medium: 'အလယ်အလတ်', low: 'သတိထား' };
  const confClass = { high: 'conf-high', medium: 'conf-med', low: 'conf-low' };
  let html = `<h2 class="section-title">🔮 ပွဲကြို ခန့်မှန်း သုံးသပ်ချက် — KZZ Football Analysis</h2>`;
  if (data && data.updated) {
    let upd = data.updated;
    try { upd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.updated)); } catch (e) {}
    html += `<div class="refresh-line">နောက်ဆုံးခန့်မှန်းချက်: ${esc(upd)}</div>`;
  html += `<input type="search" id="pred-search" placeholder="🔍 ခန့်မှန်းချက် ရှာပါ..." oninput="filterPreds()" style="width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:8px;font-size:15px;">`;
  }
  if (!preds.length) {
    html += `<div class="empty">ခန့်မှန်းချက်တွေ မကြာမီ လာမယ်။<br>KZZ Facebook page မှာ တင်ထားတဲ့ ပွဲကြိုခန့်မှန်းချက်တွေ ဒီမှာ ပေါ်လာမယ်။</div>`;
  } else {
    html += preds.map((p) => {
      let probHtml = '';
      if (p.prob_home != null && p.prob_draw != null && p.prob_away != null) {
        probHtml = `<div class="pred-prob">
          <div class="prob-bar">
            <div class="prob-home" style="width:${p.prob_home}%"></div><div class="prob-draw" style="width:${p.prob_draw}%"></div><div class="prob-away" style="width:${p.prob_away}%"></div>
          </div>
          <div class="prob-labels"><span>🏠 ${p.prob_home}%</span><span>🤝 ${p.prob_draw}%</span><span>✈️ ${p.prob_away}%</span></div>
        </div>`;
      }
      const searchText = ((p.home || "") + " " + (p.away || "") + " " + (p.league || "") + " " + (p.reason_mm || "")).toLowerCase();
      return `
      <div class="pred-card" data-search="${esc(searchText)}">
        <div class="pred-match">${esc(p.home)} vs ${esc(p.away)}</div>
        <div class="pred-meta">${esc(p.league || '')} ${p.date ? '• ' + esc(fmtDateTime(p.date)) : ''}</div>
        <div class="pred-pick">👉 ${esc(p.pick || '')} <span class="${confClass[p.confidence] || ''}">(${esc(confLabel[p.confidence] || '')})</span></div>
        ${probHtml}
        ${p.reason_mm ? `<div class="pred-reason">${esc(p.reason_mm)}</div>` : ''}
        ${socialButtons(p.home + '-' + p.away + '-' + (p.date || ''), p.home + ' vs ' + p.away)}
      </div>`;
    }).join('');
  }
  html += `<div class="refresh-line">⚠️ ခန့်မှန်းချက်များသည် အကြံပြုချက်သာဖြစ်ပြီး အာမခံချက် မဟုတ်ပါ။</div>`;
  content.innerHTML = html;
  stamp();
  parseFB();
  loadAllSocial();
}

/* ---------- news ---------- */


function socialButtons(id, title) {
  const safeId = String(id).replace(/[^a-zA-Z0-9-]/g, '-');
  const liked = localStorage.getItem('kzz-like-' + safeId) ? 'liked' : '';
  return `<div class="social-row">
    <button class="share-btn like-btn ${liked}" onclick="event.stopPropagation();toggleLike(this,'${safeId}')">👍 Like <span id="like-${safeId}">0</span></button>
    <button class="share-btn" onclick="event.stopPropagation();toggleCommentBox('${safeId}')">💬 Comment (<span id="ccount-${safeId}">0</span>)</button>
    <button class="share-btn" onclick="event.stopPropagation();sharePost('${safeId}')">🔗 Share (<span id="share-${safeId}">0</span>)</button>
  </div>
  <div class="comment-box" id="cbox-${safeId}" style="display:none">
    <div class="comment-list" id="clist-${safeId}"><div style="color:#888;font-size:12px">Loading...</div></div>
    <div class="comment-form-row">
      <textarea id="ctext-${safeId}" placeholder="Comment ရေးပါ..." rows="1" maxlength="500"></textarea>
      <button class="share-btn" onclick="event.stopPropagation();postComment('${safeId}')">ပို့မယ်</button>
    </div>
  </div>`;
}
async function loadSocial(safeId) {
  // Load like count
  const likes = await sbGet('likes?id=eq.' + encodeURIComponent(safeId));
  const likeCount = (likes && likes[0]) ? likes[0].count : 0;
  const likeEl = document.getElementById('like-' + safeId);
  if (likeEl) likeEl.textContent = likeCount;
  // Load share count
  const shares = await sbGet('shares?id=eq.' + encodeURIComponent(safeId));
  const shareCount = (shares && shares[0]) ? shares[0].count : 0;
  const shareEl = document.getElementById('share-' + safeId);
  if (shareEl) shareEl.textContent = shareCount;
  // Load comments
  const comments = await sbGet('comments?post_id=eq.' + encodeURIComponent(safeId) + '&order=created_at');
  const listEl = document.getElementById('clist-' + safeId);
  const countEl = document.getElementById('ccount-' + safeId);
  if (comments && listEl) {
    if (!comments.length) {
      listEl.innerHTML = '<div style="color:#888;font-size:12px">Comment မရှိသေးပါ</div>';
    } else {
      listEl.innerHTML = comments.map(c => {
        const d = new Date(c.created_at);
        const t = d.toLocaleString('en-GB', {timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
        return `<div class="comment-item"><b>${esc(c.name || 'Anonymous')}</b>: ${esc(c.text)}<br><small>${esc(t)}</small></div>`;
      }).join('');
    }
    if (countEl) countEl.textContent = comments.length;
  }
}
function loadAllSocial() {
  document.querySelectorAll('[id^="like-"]').forEach(el => {
    const safeId = el.id.replace('like-', '');
    loadSocial(safeId);
  });
}
function toggleLike(btn, safeId) {
  const key = 'kzz-like-' + safeId;
  const span = btn.querySelector('span');
  const alreadyLiked = localStorage.getItem(key);
  sbGet('likes?id=eq.' + encodeURIComponent(safeId)).then(likes => {
    let count = (likes && likes[0]) ? likes[0].count : 0;
    const exists = likes && likes[0];
    if (alreadyLiked) {
      localStorage.removeItem(key);
      count = Math.max(0, count - 1);
      btn.classList.remove('liked');
    } else {
      localStorage.setItem(key, '1');
      count++;
      btn.classList.add('liked');
    }
    span.textContent = count;
    if (exists) sbPatch('likes?id=eq.' + encodeURIComponent(safeId), {count: count});
    else sbPost('likes', {id: safeId, count: count});
  });
}
function toggleCommentBox(safeId) {
  const box = document.getElementById('cbox-' + safeId);
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}
function postComment(safeId) {
  const textEl = document.getElementById('ctext-' + safeId);
  const text = textEl.value.trim().slice(0, 500);
  if (!text) { alert('Comment ရေးပါ'); return; }
  sbPost('comments', {post_id: safeId, name: 'Anonymous', text: text}).then(() => {
    textEl.value = '';
    loadSocial(safeId);
  });
}
function sharePost(safeId) {
  const url = 'https://luuzoe.github.io/kzzfootballive/';
  // Increment global share count
  sbGet('shares?id=eq.' + encodeURIComponent(safeId)).then(rows => {
    const c = (rows && rows[0]) ? rows[0].count + 1 : 1;
    if (rows && rows[0]) sbPatch('shares?id=eq.' + encodeURIComponent(safeId), {count: c});
    else sbPost('shares', {id: safeId, count: 1});
    const el = document.getElementById('share-' + safeId);
    if (el) el.textContent = c;
  });
  // Show subtle toast instead of alert popup
  const showToast = (msg) => {
    let toast = document.getElementById('share-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'share-toast';
      toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:9999;opacity:0;transition:opacity 0.3s;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  };
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => showToast('Link ကူးပြီးပြီ! 📋')).catch(() => showToast('Link: ' + url));
    } else { showToast('Link: ' + url); }
  };
  // Try native share first (mobile + modern desktop browsers)
  try {
    if (navigator.share) {
      navigator.share({title: 'KZZ Football Live', text: 'KZZ Football Live — ဘောလုံးတိုက်ရိုက်', url: url}).catch((err) => {
        // User cancelled = do nothing. Other error = silent copy.
        if (err && err.name !== 'AbortError') doCopy();
      });
    } else { doCopy(); }
  } catch (e) { doCopy(); }
}
async function renderNews() {
  let data = null;
  try { data = await getJSON('news.json'); } catch (e) { data = null; }
  const items = (data && data.news) || [];
  let html = `<h2 class="section-title">📰 ဘောလုံးသတင်းများ</h2>
  <div class="search-row"><input type="text" id="news-search" placeholder="🔍 သတင်း ရှာမယ်..." oninput="filterNews(this.value)"></div>`;
  if (data && data.updated) {
    let upd = data.updated;
    try { upd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.updated)); } catch (e) {}
    html += `<div class="refresh-line">နောက်ဆုံးအပ်ဒိတ်: ${esc(upd)}</div>`;
  }
  if (!items.length) {
    html += `<div class="empty">သတင်းတွေ မကြာမီ လာမယ်။</div>`;
  } else {
    html += items.map((n) => {
      const body = esc(n.body_mm || '').replace(/\n/g, '<br>');
      const when = n.published ? esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(n.published))) : '';
      return `
      <article class="news-card" data-search="${esc((n.title_mm || '') + ' ' + (n.body_mm || '')).toLowerCase()}">
        ${n.image ? `<img class="news-img" src="${esc(n.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="news-body">
          <h3 class="news-title">${esc(n.title_mm || '')}</h3>
          <div class="news-text">${body}</div>
          <div class="news-meta">📰 ${esc(n.source || '')}${when ? ' • ' + when : ''}${n.fb_url ? ` • <a href="${esc(n.fb_url)}" target="_blank" rel="noopener">Facebook မှာ ကြည့်ရန်</a>` : ''}</div>
          ${socialButtons(n.id || '', n.title_mm || '')}
        </div>
      </article>`;
    }).join('');
  }
  content.innerHTML = html;
  stamp();
  parseFB();
  loadAllSocial();
}

/* ---------- theme ---------- */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? '' : 'light';
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('kzz-theme', next || 'dark');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = next === 'light' ? '☀️' : '🌙';
}
(function initTheme() {
  const saved = localStorage.getItem('kzz-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('themeBtn');
      if (btn) btn.textContent = '☀️';
    });
  }
})();

/* ---------- news search ---------- */
function filterNews(q) {
  q = (q || '').toLowerCase().trim();
  document.querySelectorAll('.news-card').forEach(card => {
    const text = card.getAttribute('data-search') || '';
    card.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

/* ---------- match detail ---------- */

function filterAnalyses() {
  const q = (document.getElementById('analysis-search').value || '').toLowerCase().trim();
  document.querySelectorAll('.analysis-card').forEach(card => {
    const text = card.getAttribute('data-search') || '';
    card.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
async function renderScorersTab() {
  let data = null;
  try { data = await getJSON('scorers.json'); } catch (e) { data = null; }
  const leagues = (data && data.leagues) || {};
  const names = { 'eng.1': '🇬🇧 ပရီးမီးယားလိဂ်', 'esp.1': '🇪🇸 လာလီဂါ', 'ita.1': '🇮🇹 စီးရီးအေ', 'ger.1': '🇩🇪 ဘွန်ဒက်စ်လီဂါ', 'fra.1': '🇫🇷 လီဂူး ၁' };
  let html = `<h2 class="section-title">🥇 ဂိုးသွင်းအများဆုံး</h2>`;
  if (data && data.updated) html += `<div class="refresh-line">နောက်ဆုံးအပ်ဒိတ်: ${esc(data.updated)}</div>`;
  for (const [key, name] of Object.entries(names)) {
    const players = leagues[key] || [];
    if (!players.length) continue;
    html += `<h3 style="margin:20px 0 10px;">${name}</h3><table style="width:100%;border-collapse:collapse;">`;
    html += `<tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">ကစားသမား</th><th style="padding:8px;text-align:left;">အသင်း</th><th style="padding:8px;text-align:right;">ဂိုး</th></tr>`;
    players.slice(0, 10).forEach(p => {
      html += `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">${p.rank}</td><td style="padding:8px;">${esc(p.player)}</td><td style="padding:8px;">${esc(p.team)}</td><td style="padding:8px;text-align:right;font-weight:bold;">${p.goals}</td></tr>`;
    });
    html += `</table>`;
  }
  content.innerHTML = html;
  stamp();
  parseFB();
}
async function renderHighlights() {
  let html = `<h2 class="section-title">🎬 ဟိုက်လိုက် ဗီဒီယိုများ <span style="font-size:13px;font-weight:400;opacity:.75">(ဗီဒီယိုများ ကြည့်မရပါက VPN ခံ ကြည့်ပါ)</span></h2>`;
  html += `<div class="highlights-grid">`;
  const videos = [
    { id: "_pYxYapNPKM", title: "PSG vs Barcelona | Key Moments | UEFA Champions League 2026", channel: "Sony LIV", date: "Oct 21, 2026" },
    { id: "6HOwK8MliqM", title: "CRAZY MATCH!! Napoli vs FK Bodø/Glimt (4-3) FULL HIGHLIGHTS | UEFA Champions League 2026/27", channel: "Halotub", date: "Oct 21, 2026" },
    { id: "SRzLacf10p8", title: "Liverpool vs Villarreal | Key Moments | UEFA Champions League 2026", channel: "Sony LIV", date: "Oct 22, 2026" },
    { id: "eldQMooolQc", title: "Como vs Manchester United | Key Moments | UEFA Champions League 2026", channel: "Sony Sports Network", date: "Oct 22, 2026" },
    { id: "8UlWeAhk2fY", title: "HIGHLIGHTS - Sabah vs B. Dortmund | UEFA Champions League - Matchday 3 League Phase 2026-27", channel: "TUDN USA", date: "Oct 20, 2026" },
    { id: "RMzcmGNA-_g", title: "Stuttgart 1-1 Atlético Madrid | Highlights | UCL 26/27", channel: "On Sports", date: "Oct 21, 2026" },
    { id: "r92uvxmxKqs", title: "Spurs 3-1 Coventry City | Premier League Extended Highlights", channel: "Tottenham Hotspur", date: "Oct 20, 2026" },
    { id: "LaJkUmgUpb0", title: "VfB Stuttgart 1-1 Atlético de Madrid | Julián Alvarez | HIGHLIGHTS, UCL - MD3", channel: "Atlético de Madrid", date: "Oct 20, 2026" },
    { id: "jM_bVGPowhA", title: "Thrilling draw in a top-class clash | FC Bayern vs Arsenal FC | Champions League Highlights", channel: "FC Bayern München", date: "Oct 21, 2026" },
    { id: "RKdtcQYFBxE", title: "HIGHLIGHTS | Man City 5-1 AEK Athens | Foden hat-trick and Cherki magic in Champions League rout!", channel: "Man City", date: "Oct 21, 2026" },
    { id: "SbGF1xglHh4", title: "HIGHLIGHTS | Real Madrid 4-1 RB Leipzig | Champions League", channel: "Real Madrid", date: "Oct 21, 2026" },
    { id: "b0J7UcbgU2s", title: "Highlights: Liverpool 4-3 Villarreal", channel: "Liverpool FC", date: "Oct 20, 2026" },
    { id: "_r1w1KfIoTc", title: "MCTOMINAY LA ROMPIÓ Y NAPOLI SE QUEDÓ CON UN TRIUNFAZO ANTE BODO | Napoli 4-3 Bodo/Glimt | RESUMEN", channel: "ESPN Fans", date: "Oct 23, 2026" },
    { id: "SSF2Z4-gUH8", title: "FODEN HAT-TRICK FOR CITY! | Man City 5-1 AEK Athens | Champions League", channel: "Man City", date: "Oct 20, 2026" },
    { id: "Sr6rEVLZ2nM", title: "HIGHLIGHTS - Bournemouth vs AC Milan | UEFA Europa League - Jornada 3 Fase de Liga 2026-27", channel: "TUDN USA", date: "Oct 22, 2026" },
    { id: "wghF06oU--M", title: "Highlights Europa League | Bournemouth 3-0 Milan | Serata amara per il Diavolo", channel: "AC Milan", date: "Oct 22, 2026" },
    { id: "js-UOjc28Gk", title: "TOTAL ROUT! ⚡ Como 4-1 Man Utd Highlights | Nico Paz Double & Zirkzee Goal | UEFA Champions League", channel: "Halotub", date: "Oct 22, 2026" },
    { id: "HDsiMIz2aHY", title: "Juventus vs Rennes 2-2 Highlights UEFA Europa League 2026/27", channel: "Footballia", date: "Oct 22, 2026" },
    { id: "dx7x6C5-diY", title: "EZE AND RICE GOALS IN CRAZY GAME 🤯 | Bayern Munich vs Arsenal (2-2) | Champions League", channel: "Arsenal", date: "Oct 21, 2026" },
    { id: "zOPyh46UFZQ", title: "COMO vs Manchester United (4-1) NICO PAZ 2 GOALS | FULL Highlights UEFA Champions League 26/27", channel: "Antonionne Football", date: "Oct 21, 2026" },
    { id: "7siqpHSvBpA", title: "2–0 win at OFI Crete | Highlights | Hofmann's brace secures 3rd win in Europa League", channel: "Bayer 04 Leverkusen", date: "Oct 22, 2026" },
    { id: "erUcubqphYM", title: "WOLTEMADE: GOAL & ASSIST! 💥 | JUVENTUS 2-2 RENNAIS | HIGHLIGHTS EUROPA LEAGUE", channel: "Juventus", date: "Oct 22, 2026" },
    { id: "HY_GX12ojek", title: "HIGHLIGHTS | LIVERPOOL 4-3 VILLARREAL | CHAMPIONS LEAGUE", channel: "Villarreal CF", date: "Oct 21, 2026" },
    { id: "Kdwfh-fVWls", title: "SUPER EXTENDED HIGHLIGHTS - Napoli vs Bodo/Glimt | UEFA Champions League - J3 Fase de Liga 2026-27", channel: "TUDN USA", date: "Oct 20, 2026" },
    { id: "NI6YNO-ibBI", title: "CARLOS SECURES OUR FIRST EUROPEAN WIN 🖤💙 | INTER 1-0 SHAKHTAR DONETSK | UEFA CHAMPIONS LEAGUE", channel: "Inter", date: "Oct 22, 2026" },
    { id: "WWeH9Hfr1b8", title: "Bayern Munich vs Arsenal 2-2 HIGHLIGHTS - Harry Kane, Eze & Declan Rice Goals! Champions League 2026", channel: "Dollar VFX", date: "Oct 22, 2026" },
    { id: "LRlY31UlP3U", title: "Barcelona Vs PSG Extended Highlights | UEFA Champions League 2026", channel: "FOOTBALL MANIA", date: "Oct 21, 2026" },
    { id: "_LpzkLDdR6U", title: "HIGHLIGHTS | PSG 4 vs 2 FC BARCELONA | UEFA CHAMPIONS LEAGUE 26/27", channel: "FC Barcelona", date: "Oct 21, 2026" },


    { id: "lfEnsErFD8o", title: "Best of: Mo Salah 2019/20 | Premier League Champion", channel: "Liverpool FC", date: "Classic" },
    { id: "STsFQj4aZM0", title: "Mo Salah's 100 Liverpool goals | Chelsea screamer, Man Utd celebration & penalty in Madrid", channel: "Liverpool FC", date: "Classic" },
    { id: "cGJBKbManZE", title: "Mo Salah's 100 Liverpool Premier League goals", channel: "Liverpool FC", date: "Classic" },
    { id: "o3L8DGeNqHg", title: "Thierry Henry: Top Premier League goals", channel: "Arsenal", date: "Classic" },
    { id: "VMqeFyAqNBo", title: "Cristiano Ronaldo Top 100 Goals | Best Goals of All Time", channel: "Richard Mattos", date: "Classic" },
    { id: "TrPCZvEixlA", title: "Cristiano Ronaldo: TOP 20 GOALS!", channel: "Manchester United", date: "Classic" },
    { id: "jRtJ9F0xaT0", title: "EVERY Thierry Henry Goal For Arsenal In The Premier League", channel: "Arsenal", date: "Classic" },
    { id: "LbZMKeGD4yw", title: "TOP 10: WAYNE ROONEY GOALS", channel: "Everton Football Club", date: "Classic" },
    { id: "Pq_i5yzIZa0", title: "SERGIO AGUERO | RAINING GOALS | EVERY PREMIER LEAGUE GOAL SCORED | MAN CITY", channel: "Man City", date: "Classic" },
    { id: "DlceSLFU7co", title: "Every Steven Gerrard Goal | Cup Final screamers, Istanbul", channel: "Liverpool FC", date: "Classic" },
    { id: "i1p5PAgNvR0", title: "All 200 Mo Salah Goals For Liverpool", channel: "Liverpool FC", date: "Classic" },
    { id: "t5PtlOA0Ksc", title: "ALL 57 Mo Salah Goals and Assist from 2024/25", channel: "Liverpool FC", date: "Classic" },];
  html += videos.map(v => `
    <div class="highlight-card" onclick="openHighlight('${v.id}', '${esc(v.title).replace(/'/g, "&#39;")}')">
      <div class="hl-thumb">
        <img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" loading="lazy" alt="${esc(v.title)}">
        <div class="hl-play">▶</div>
      </div>
      <h3 class="hl-title">${esc(v.title)}</h3>
      <p class="hl-meta">📺 ${esc(v.channel)}${v.date ? " • " + esc(v.date) : ""}</p>
    </div>
  `).join('');
  html += `</div>`;
  window.openHighlight = function(id, title) {
    let modal = document.getElementById('highlight-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'highlight-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.onclick = function(e) { if (e.target === modal) closeHighlight(); };
      document.body.appendChild(modal);
    }
    modal.innerHTML = '<div style="width:100%;max-width:900px;background:#111;border-radius:12px;padding:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;font-size:15px;color:#fff;">' + title + '</h3>' +
      '<button onclick="closeHighlight()" style="background:#fff;border:0;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;flex-shrink:0;margin-left:10px;">✕</button></div>' +
      '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;">' +
      '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div></div>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  window.closeHighlight = function() {
    const m = document.getElementById('highlight-modal');
    if (m) { m.style.display = 'none'; m.innerHTML = ''; }
    document.body.style.overflow = '';
  };
  html += `</div>`;
  html += `<p style="color:#888;font-size:12px;margin-top:15px;">⚠️ ဗီဒီယိုများသည် တရားဝင် YouTube ချန်နယ်များမှ ဖြစ်ပါသည်။</p>`;
  content.innerHTML = html;
  stamp();
  parseFB();
}
async function renderAnalyses() {
  let data = null;
  try { data = await getJSON('analyses.json'); } catch (e) { data = null; }
  const items = (data && data.analyses) || [];
  let html = `<h2 class="section-title">📝 ပွဲပြီး သုံးသပ်ချက်များ</h2>`;
  if (data && data.updated) {
    let upd = data.updated;
    try { upd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.updated)); } catch (e) {}
    html += `<div class="refresh-line">နောက်ဆုံးအပ်ဒိတ်: ${esc(upd)}</div>`;
  }
  html += `<input type="search" id="analysis-search" placeholder="🔍 သုံးသပ်ချက် ရှာပါ..." oninput="filterAnalyses()" style="width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:8px;font-size:15px;">`;
  if (!items.length) {
    html += `<div class="empty">သုံးသပ်ချက်တွေ မကြာမီ လာမယ်။</div>`;
  } else {
    html += items.map((a) => {
      const body = esc(a.body_mm || '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      const score = (a.home_score != null && a.away_score != null) ? `${a.home_score} - ${a.away_score}` : '';
      const searchText = ((a.title_mm || "") + " " + (a.home_mm || a.home || "") + " " + (a.away_mm || a.away || "") + " " + (a.league_mm || a.league || "") + " " + (a.body_mm || "")).toLowerCase();
      return `
      <article class="analysis-card" data-search="${esc(searchText)}">
        <h3 class="analysis-title">${esc(a.title_mm || '')}</h3>
        <div class="analysis-score">${esc(a.home_mm || a.home || '')} <b>${esc(score)}</b> ${esc(a.away_mm || a.away || '')}</div>
        <div class="analysis-meta">🏆 ${esc(a.league_mm || a.league || '')}${a.date ? ' • ' + esc(a.date) : ''}</div>
        <div class="analysis-text"><p>${body}</p></div>
        ${socialButtons(a.id || '', a.title_mm || '')}
      </article>`;
    }).join('');
  }
  content.innerHTML = html;
  stamp();
  parseFB();
  loadAllSocial();
}

function mmTeamName(en) {
  if (!en) return '';
  return TEAM_MM_BY_NAME[String(en).toLowerCase()] || en;
}

/* Translate ESPN key-event text into Burmese (fallback: original English). */
function mmEvent(k) {
  const txt = k.text || '';
  const parts = k.participants || [];
  const pidFor = (name) => {
    const p = parts.find((x) => x.athlete && x.athlete.displayName && x.athlete.displayName.toLowerCase() === name.toLowerCase());
    return p && p.athlete.id ? p.athlete.id : null;
  };
  const linkName = (name) => {
    const pid = pidFor(name);
    return pid ? `<button class="player-link" onclick="event.stopPropagation();openPlayerDetail('${esc(pid)}')">${esc(name)}</button>` : `<b>${esc(name)}</b>`;
  };
  let m;
  // Substitution: "Substitution, FC Porto. Oskar Pietuszewski replaces Pepê."
  m = txt.match(/^Substitution,\s*([^.]+)\.\s*(.+?)\s+replaces\s+(.+?)\.?$/);
  if (m) {
    return `<span class="ev-ic">🔄</span><span class="ev-txt">လူစားလဲခြင်း • ${esc(mmTeamName(m[1].trim()))}: <b>${esc(m[3].trim())}</b> အစား ${linkName(m[2].trim())} ဝင်လာသည်</span>`;
  }
  // Goal: "Goal! Arsenal 0, Leeds United 1. James Justin (Leeds United) right footed shot ..."
  m = txt.match(/^Goal!\s*[^.]+\.\s*(.+?)\s+\(([^)]+)\)(.*)$/);
  if (m || k.scoringPlay) {
    const scorer = m ? m[1].trim() : txt;
    const team = m ? m[2].trim() : '';
    let method = '';
    if (/own goal/i.test(txt)) method = ' · ကိုယ့်ဂိုးကိုယ်သွင်း (OG)';
    else if (/penalty/i.test(txt)) method = ' · ပင်နယ်တီ';
    else if (/header/i.test(txt)) method = ' · ခေါင်းတိုက်';
    return `<span class="ev-ic">⚽</span><span class="ev-txt">ဂိုး — ${linkName(scorer)}${team ? ` (${esc(mmTeamName(team))})` : ''}${method}</span>`;
  }
  // Cards: "Bruno Fernandes (Manchester United) is shown the yellow card ..."
  m = txt.match(/^(.+?)\s+\(([^)]+)\)\s+is shown the (second yellow|yellow|red) card/i);
  if (m) {
    const red = /red|second yellow/i.test(m[3]);
    return `<span class="ev-ic">${red ? '🟥' : '🟨'}</span><span class="ev-txt">${red ? 'အနီကတ်' : 'အဝါကတ်'} — ${linkName(m[1].trim())} (${esc(mmTeamName(m[2].trim()))})</span>`;
  }
  if (/^First Half begins\.?$/i.test(txt)) return `<span class="ev-ic">🏁</span><span class="ev-txt">ပထမပိုင်း စတင်ပါပြီ</span>`;
  if (/^Second Half begins\.?$/i.test(txt)) return `<span class="ev-ic">🏁</span><span class="ev-txt">ဒုတိယပိုင်း စတင်ပါပြီ</span>`;
  m = txt.match(/^(?:Second Half|Match) ends,?\s*(.*)$/i);
  if (m) return `<span class="ev-ic">🏁</span><span class="ev-txt">ပွဲပြီးဆုံးပါပြီ${m[1] ? ' — ' + esc(m[1]) : ''}</span>`;
  m = txt.match(/^Delay in match(?:\s*\(([^)]+)\))?/i);
  if (m) return `<span class="ev-ic">⏱</span><span class="ev-txt">ပွဲခဏ ရပ်နား${m[1] ? ' (' + esc(mmTeamName(m[1].trim())) + ')' : ''}</span>`;
  if (/^Delay over\./i.test(txt)) return `<span class="ev-ic">▶</span><span class="ev-txt">ပွဲ ပြန်စပါပြီ</span>`;
  const typeIcon = k.scoringPlay ? '⚽' : '•';
  return `<span class="ev-ic">${typeIcon}</span><span class="ev-txt">${esc(txt)}</span>`;
}

function openMatchDetail(eventId) {
  const bd = $('#modalBackdrop'), box = $('#modalBox');
  box.innerHTML = `<div class="loading">အသေးစိတ်ဆွဲနေသည်…</div>`;
  bd.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/summary?event=${encodeURIComponent(eventId)}`)
    .then((d) => { box.innerHTML = detailHtml(d); })
    .catch(() => { box.innerHTML = `<div class="error">အသေးစိတ် ဆွဲမရသေးပါ။<br><button onclick="closeModal()">ပိတ်မယ်</button></div>`; });
}
function closeModal() {
  $('#modalBackdrop').style.display = 'none';
  document.body.style.overflow = '';
}

/* ---------- team detail modal ---------- */
const POS_MM = { GK: 'ဂိုးသမား', DF: 'နောက်တန်း', MF: 'ကွင်းလယ်', FW: 'တိုက်စစ်' };
const TROPHY_MM = {
  'Premier League': 'ပရီးမီးယားလိဂ်', 'La Liga': 'လာလီဂါ', 'Serie A': 'စီးရီးအေ',
  'Bundesliga': 'ဘွန်ဒက်စ်လီဂါ', 'Ligue 1': 'လီဂူး ၁', 'Eredivisie': 'အီရက်ဒီဗီစီ',
  'Primeira Liga': 'ပေါ်တူဂီလိဂ်', 'Champions League': 'ချန်ပီယံလိဂ်',
  'Europa League': 'ယူရိုပါလိဂ်', 'FA Cup': 'FA ဖလား', 'Copa del Rey': 'ကိုပါဒယ်ရေး',
  'Coppa Italia': 'ကိုပါအီတာလီယာ', 'DFB-Pokal': 'ဂျာမနီဖလား', 'Coupe de France': 'ပြင်သစ်ဖလား',
  'KNVB Cup': 'နယ်သာလန်ဖလား', 'Taca de Portugal': 'ပေါ်တူဂီဖလား',
};
function openTeamDetail(tid) {
  const box = $('#modalBox');
  box.innerHTML = '<div class="loading">အသင်းအချက်အလက် ဆွဲနေသည်…</div>';
  $('#modalBackdrop').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const mm = (TEAMS_MM[tid] && TEAMS_MM[tid].mm) || '';
  const en = (TEAMS_MM[tid] && TEAMS_MM[tid].en) || '';
  // team news (ESPN) — best effort
  getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/news?team=${encodeURIComponent(tid)}&limit=5`)
    .catch(() => null)
    .then((news) => {
      box.innerHTML = teamDetailHtml(tid, mm, en, (news && news.articles) || []);
    });
}
function teamDetailHtml(tid, mm, en, articles) {
  const info = TEAM_INFO[tid] || null;
  const squad = (SQUADS[tid] && SQUADS[tid].players) || [];
  let infoHtml = '';
  if (info) {
    infoHtml = `<div class="team-info-grid">
      ${info.founded ? `<div><span>📅 တည်ထောင်နှစ်</span><b>${esc(info.founded)}</b></div>` : ''}
      ${info.stadium ? `<div><span>🏟 ကွင်း</span><b>${esc(info.stadium)}</b></div>` : ''}
      ${info.city ? `<div><span>📍 မြို့</span><b>${esc(info.city)}</b></div>` : ''}
    </div>`;
    if (info.trophies && info.trophies.length) {
      const nonZero = info.trophies.filter((t) => Number(t.c) > 0);
      if (nonZero.length) {
        infoHtml += `<h4>🏆 ဖလားများ</h4><div class="trophy-list">` +
          nonZero.map((t) => `<div class="trophy"><span>${esc(TROPHY_MM[t.t] || t.t)}</span><b>${esc(t.c)}</b></div>`).join('') +
          `</div>`;
      }
    }
  }
  let squadHtml = '';
  if (squad.length) {
    const groups = { GK: [], DF: [], MF: [], FW: [] };
    squad.forEach((p) => { (groups[p.pos] || groups.MF).push(p); });
    squadHtml = '<h4>👥 လူစာရင်း</h4>' + Object.keys(groups).map((pos) => {
      if (!groups[pos].length) return '';
      const rows = groups[pos].map((p) =>
        `<div class="squad-row"><span class="squad-num">${esc(p.n || '–')}</span><span class="squad-name">${esc(p.name)}</span><span class="squad-nat">${esc(p.nat || '')}</span></div>`
      ).join('');
      return `<div class="squad-group"><div class="squad-pos">${POS_MM[pos] || pos}</div>${rows}</div>`;
    }).join('');
  } else {
    squadHtml = '<h4>👥 လူစာရင်း</h4><div class="empty">လူစာရင်း မရသေးပါ။</div>';
  }
  let newsHtml = '';
  if (articles.length) {
    newsHtml = '<h4>📰 အသင်းသတင်းများ</h4>' + articles.slice(0, 5).map((a) => {
      const u = (a.links && a.links.web && a.links.web.href) || '#';
      const img = (a.images && a.images[0] && a.images[0].url) || '';
      return `<a class="team-news" href="${esc(u)}" target="_blank" rel="noopener">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
        <div><b>${esc(a.headline || '')}</b><span>${esc(a.description || '').slice(0, 120)}</span></div>
      </a>`;
    }).join('');
  }
  return `
    <div class="team-head">
      <div class="team-head-name">${esc(mm || en || '')}</div>
    </div>
    ${infoHtml}${squadHtml}${newsHtml}
    <button class="modal-close" onclick="closeModal()">✕ ပိတ်မယ်</button>`;
}
window.openTeamDetail = openTeamDetail;
function detailHtml(d) {
  const h = d.header || {};
  const comps = (h.competitions && h.competitions[0] && h.competitions[0].competitors) || [];
  const side = (ha) => comps.find((x) => x.homeAway === ha) || {};
  const nm = (x) => { const t = x.team || {}; const rec = t.id && TEAMS_MM[t.id]; return rec && rec.mm ? rec.mm : (t.shortDisplayName || t.displayName || ''); };
  const sc = (x) => (x.score != null ? x.score : '–');
  const hm = side('home'), aw = side('away');
  const st = (h.competitions && h.competitions[0] && h.competitions[0].status) || {};
  const when = h.competitions && h.competitions[0] ? fmtDateTime(h.competitions[0].date) : '';
  const gi = d.gameInfo || {};
  const venue = gi.venue ? `${gi.venue.fullName || ''}${gi.venue.address && gi.venue.address.city ? ' • ' + gi.venue.address.city : ''}` : '';

  // key events
  const seenEv = new Set();
  const kev = (d.keyEvents || []).filter((k) => {
    const txt = (k.text || '').trim();
    const ty = (k.type && k.type.type) || '';
    if (!txt && ty !== 'halftime') return false;
    const key = ((k.clock && k.clock.displayValue) || '') + '|' + ty + '|' + txt;
    if (seenEv.has(key)) return false;
    seenEv.add(key);
    return true;
  }).slice().reverse();
  const evHtml = kev.length ? kev.map((k) => {
    const clk = (k.clock && k.clock.displayValue) || '';
    const ty = (k.type && k.type.type) || '';
    if (ty === 'halftime' && !(k.text || '').trim()) return `<div class="ev-row"><span class="ev-min">${esc(clk)}</span><span class="ev-ic">⏸</span><span class="ev-txt">ပထမပိုင်း နားချိန် (HT)</span></div>`;
    return `<div class="ev-row"><span class="ev-min">${esc(clk)}</span>${mmEvent(k)}</div>`;
  }).join('') : '<div class="empty">အဖြစ်အပျက်မှတ်တမ်း မရှိသေးပါ။</div>';

  // stats comparison
  const bt = d.boxscore && d.boxscore.teams ? d.boxscore.teams : [];
  const bh = bt.find((x) => x.homeAway === 'home') || {};
  const ba = bt.find((x) => x.homeAway === 'away') || {};
  const statVal = (t, n) => { const s = (t.statistics || []).find((x) => x.name === n); return s ? s.displayValue : null; };
  const STAT_DEFS = [
    ['possessionPct', 'ဘောလုံးပိုင်ဆိုင်မှု %'], ['totalShots', 'စုစုပေါင်းကန်ချက်'],
    ['shotsOnTarget', 'ဂိုးပေါက်တည့်ကန်ချက်'], ['wonCorners', 'ကော်နာ'],
    ['foulsCommitted', 'ပြစ်ဒဏ်'], ['offsides', 'အော့ဖ်ဆိုဒ်'],
    ['saves', 'ဂိုးသမားကာကွယ်မှု'], ['yellowCards', 'အဝါကတ်'],
  ];
  let statsHtml = '';
  STAT_DEFS.forEach(([key, label]) => {
    const hv = statVal(bh, key), av = statVal(ba, key);
    if (hv == null && av == null) return;
    statsHtml += `<div class="stat-row"><span class="stat-v">${esc(hv == null ? '–' : hv)}</span><span class="stat-l">${esc(label)}</span><span class="stat-v">${esc(av == null ? '–' : av)}</span></div>`;
  });
  if (!statsHtml) statsHtml = '<div class="empty">စာရင်းအင်း မရှိသေးပါ။</div>';

  // lineups
  const rosters = d.rosters || [];
  const lineupHtml = rosters.map((r) => {
    const t = r.team || {};
    const rec = t.id && TEAMS_MM[t.id];
    const tnm = rec && rec.mm ? rec.mm : (t.shortDisplayName || t.displayName || '');
    const starters = (r.roster || []).filter((p) => p.starter);
    const subs = (r.roster || []).filter((p) => !p.starter);
    const pRow = (p) => {
      const a = p.athlete || {};
      const pos = p.position ? ` <span class="pos">${esc(p.position.abbreviation || '')}</span>` : '';
      const pid = a.id || '';
      const nm = esc(a.displayName || a.shortName || '');
      const nmHtml = pid ? `<button class="player-link" onclick="event.stopPropagation();openPlayerDetail('${esc(pid)}')">${nm}</button>` : `<span>${nm}</span>`;
      return `<div class="lu-row"><span class="lu-j">${esc(p.jersey != null ? p.jersey : '')}</span>${nmHtml}${pos}</div>`;
    };
    return `<div class="lu-team"><div class="lu-title">${esc(tnm)}${r.formation ? ` <span class="form">(${esc(r.formation)})</span>` : ''}</div>
      <div class="lu-sec">ပွဲထွက်လူစာရင်း</div>${starters.map(pRow).join('') || '<div class="empty">—</div>'}
      ${subs.length ? `<div class="lu-sec">အရံခုံ</div>${subs.map(pRow).join('')}` : ''}</div>`;
  }).join('');
  const lineups = lineupHtml ? `<div class="lu-cols">${lineupHtml}</div>` : '<div class="empty">လူစာရင်း မရှိသေးပါ။</div>';

  // head-to-head from lastFiveGames
  let h2hHtml = '';
  const lfg = d.lastFiveGames || [];
  if (lfg.length >= 2) {
    const tA = lfg[0].team || {}, tB = lfg[1].team || {};
    const idA = tA.id, idB = tB.id;
    const h2hGames = [];
    for (const tg of lfg) {
      for (const ev of (tg.events || [])) {
        const opp = ev.opponent || {};
        const myId = tg.team && tg.team.id;
        const oppId = opp.id;
        if ((myId === idA && oppId === idB) || (myId === idB && oppId === idA)) {
          if (!h2hGames.find((g) => g.id === ev.id)) {
            h2hGames.push({
              id: ev.id,
              date: (ev.gameDate || '').slice(0, 10),
              score: ev.score || '',
              comp: ev.competitionName || '',
              homeId: ev.homeTeamId, awayId: ev.awayTeamId,
              homeScore: ev.homeTeamScore, awayScore: ev.awayTeamScore,
            });
          }
        }
      }
    }
    h2hGames.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const recent = h2hGames.slice(0, 5);
    if (recent.length) {
      let wA = 0, wB = 0, dr = 0;
      const rows = recent.map((g) => {
        const hs = parseInt(g.homeScore, 10), as = parseInt(g.awayScore, 10);
        let res = '';
        if (!isNaN(hs) && !isNaN(as)) {
          if (hs === as) { dr++; res = '🤝'; }
          else if ((g.homeId === idA && hs > as) || (g.awayId === idA && as > hs)) { wA++; res = '✅'; }
          else { wB++; res = '❌'; }
        }
        const hn = g.homeId === idA ? nm(hm) : (g.homeId === idB ? nm(aw) : '');
        const an = g.awayId === idA ? nm(hm) : (g.awayId === idB ? nm(aw) : '');
        return `<div class="h2h-row"><span class="h2h-date">${esc(g.date)}</span><span class="h2h-match">${esc(hn)} ${esc(g.homeScore || '?')} - ${esc(g.awayScore || '?')} ${esc(an)}</span><span>${res}</span></div>`;
      }).join('');
      const nmA = nm(hm), nmB = nm(aw);
      h2hHtml = `<div class="modal-sec-title">🆚 ထိပ်တိုက်တွေ့ဆုံမှု (နောက်ဆုံး ${recent.length} ပွဲ)</div>
      <div class="h2h-summary">${esc(nmA)} ${wA} နိုင်ပွဲ • သရေ ${dr} • ${esc(nmB)} ${wB} နိုင်ပွဲ</div>
      <div class="h2h-list">${rows}</div>`;
    } else {
      h2hHtml = `<div class="modal-sec-title">🆚 ထိပ်တိုက်တွေ့ဆုံမှု</div><div class="empty">နောက်ဆုံး ၅ ပွဲမှာ ထိပ်တိုက်မတွေ့ခဲ့ပါ။</div>`;
    }
  }

  const matchDate = h.competitions && h.competitions[0] && h.competitions[0].date;
  const modalWhen = matchDate ? fmtDateTime(matchDate) : ((st.type && st.type.shortDetail) || when || 'VS');
  return `
    <div class="modal-head">
      <div class="modal-teams">
        <div class="modal-team"><span>${esc(nm(hm))}</span><b>${esc(sc(hm))}</b></div>
        <div class="modal-vs">${esc(modalWhen)}</div>
        <div class="modal-team"><b>${esc(sc(aw))}</b><span>${esc(nm(aw))}</span></div>
      </div>
      ${venue ? `<div class="modal-venue">🏟 ${esc(venue)}${gi.attendance ? ' • 👥 ' + Number(gi.attendance).toLocaleString() : ''}</div>` : ''}
      <button class="modal-close" onclick="closeModal()">✕ ပိတ်မယ်</button>
    </div>
    <div class="modal-sec-title">📝 အဖြစ်အပျက်များ</div>
    <div class="ev-list">${evHtml}</div>
    <div class="modal-sec-title">📊 စာရင်းအနှိုင်း</div>
    <div class="stat-list">${statsHtml}</div>
    <div class="modal-sec-title">👥 လူစာရင်း</div>
    ${lineups}
    ${h2hHtml}`;
}

/* ---------- goal alerts for favorite team ---------- */
let prevScores = {};
function checkFavGoals(matches) {
  if (!favTeamId) return;
  for (const m of matches) {
    const isFav = String(m.home.id) === String(favTeamId) || String(m.away.id) === String(favTeamId);
    if (!isFav) continue;
    const key = m.id;
    const cur = `${m.home.score}-${m.away.score}`;
    const prev = prevScores[key];
    if (prev && prev !== cur) {
      const favIsHome = String(m.home.id) === String(favTeamId);
      const favScored = favIsHome ? (m.home.score > parseInt(prev.split('-')[0] || 0)) : (m.away.score > parseInt(prev.split('-')[1] || 0));
      if (favScored) showGoalAlert(m);
    }
    prevScores[key] = cur;
  }
}
function showGoalAlert(m) {
  const favName = (TEAMS_MM[favTeamId] && TEAMS_MM[favTeamId].en) || '';
  const banner = document.createElement('div');
  banner.className = 'goal-alert';
  banner.innerHTML = `⚽ <b>ဂိုးးးး!</b> ${esc(favName)} ဂိုးသွင်းပြီ! (${esc(m.home.score)} - ${esc(m.away.score)})`;
  document.body.appendChild(banner);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
      o.start(ctx.currentTime + i * 0.15); o.stop(ctx.currentTime + i * 0.15 + 0.45);
    });
  } catch (e) {}
  setTimeout(() => banner.remove(), 8000);
  banner.onclick = () => banner.remove();
}

/* ---------- player detail ---------- */
const POS_MM_FULL = {
  'Goalkeeper': 'ဂိုးသမား', 'Defender': 'နောက်တန်း',
  'Left Back': 'ဘယ်နောက်တန်း', 'Right Back': 'ညာနောက်တန်း',
  'Centre Back': 'နောက်တန်း', 'Center Back': 'နောက်တန်း',
  'Midfielder': 'ကွင်းလယ်', 'Defensive Midfielder': 'ကွင်းလယ်ခံစစ်',
  'Central Midfielder': 'ကွင်းလယ်', 'Attacking Midfielder': 'ကွင်းလယ်',
  'Left Midfielder': 'ဘယ်တောင်ပံ', 'Right Midfielder': 'ညာတောင်ပံ',
  'Left Wing': 'ဘယ်တောင်ပံ', 'Right Wing': 'ညာတောင်ပံ',
  'Left Winger': 'ဘယ်တောင်ပံ', 'Right Winger': 'ညာတောင်ပံ',
  'Forward': 'တိုက်စစ်မှူး', 'Striker': 'တိုက်စစ်မှူး',
  'Centre Forward': 'တိုက်စစ်မှူး', 'Center Forward': 'တိုက်စစ်မှူး',
  'Second Striker': 'တိုက်စစ်မှူး',
};
async function openPlayerDetail(pid) {
  const bd = $('#modalBackdrop'), box = $('#modalBox');
  box.innerHTML = `<div class="loading">ကစားသမားအချက်အလက် ဆွဲနေသည်…</div>`;
  bd.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  try {
    const d = await getJSON(`https://sports.core.api.espn.com/v2/sports/soccer/athletes/${encodeURIComponent(pid)}?lang=en`);
    let posName = '–';
    const posRef = d.position && d.position.$ref;
    if (posRef) {
      try {
        const pd = await getJSON(posRef.replace('http:', 'https:'));
        const en = pd.displayName || pd.name || '';
        posName = en || '–';
      } catch (e) {}
    }
    let photoUrl = '';
    const wikiName = (d.displayName || d.fullName || '').replace(/ /g, '_');
    if (wikiName) {
      try {
        const wd = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`);
        photoUrl = (wd.originalimage && wd.originalimage.source) || (wd.thumbnail && wd.thumbnail.source) || '';
      } catch (e) {}
    }
    box.innerHTML = playerDetailHtml(d, posName, photoUrl);
  } catch (e) {
    box.innerHTML = `<div class="error">အချက်အလက် ဆွဲမရသေးပါ။<br><button onclick="closeModal()">ပိတ်မယ်</button></div>`;
  }
}
function playerDetailHtml(d, posName, photoUrl) {
  const nm = d.displayName || d.fullName || '–';
  const jersey = d.jersey || '–';
  const age = d.age || '–';
  const dob = d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : '–';
  const height = d.displayHeight || '–';
  const weight = d.displayWeight || '–';
  const nation = d.citizenship || '–';
  const flagImg = d.flag && d.flag.href ? `<img src="${esc(d.flag.href)}" alt="" class="player-flag" onerror="this.style.display='none'">` : '';
  const photoHtml = photoUrl ? `<img src="${esc(photoUrl)}" alt="${esc(nm)}" class="player-photo" onerror="this.style.display='none'">` : `<div class="player-jersey">${esc(String(jersey))}</div>`;
  return `
    <div class="modal-head">
      <div class="player-head">
        ${photoHtml}
        <div>
          <div class="player-name">${esc(nm)}</div>
          <div class="player-nation">${flagImg}<span>${esc(nation)}</span></div>
          <div class="player-pos">${esc(posName || '–')}</div>
        </div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕ ပိတ်မယ်</button>
    </div>
    <div class="player-grid">
      <div><span>⚽ ကစားတဲ့နေရာ</span><b>${esc(posName || '–')}</b></div>
      <div><span>🎂 အသက်</span><b>${esc(String(age))}</b></div>
      <div><span>📅 မွေးနေ့</span><b>${esc(dob)}</b></div>
      <div><span>📏 အရပ်</span><b>${esc(height)}</b></div>
      <div><span>⚖️ ကိုယ်အလေးချိန်</span><b>${esc(weight)}</b></div>
      <div><span>👕 နံပါတ်</span><b>${esc(String(jersey))}</b></div>
      <div><span>🌍 နိုင်ငံ</span><b>${esc(nation)}</b></div>
    </div>`;
}
window.openPlayerDetail = openPlayerDetail;

/* ---------- favorites ---------- */

async function populateFavSelect() {
  const sel = $('#favSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">⏳ အသင်းစာရင်း ဆွဲနေသည်…</option>`;
  let teams = [];
  // NOTE: state.league can be 'all' — not a valid ESPN slug, so ESPN team fetches are skipped in that mode (the local fallback below covers it).
  if (state.league !== 'all') {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/teams`;
    for (let attempt = 1; attempt <= 3 && !teams.length; attempt++) {
      try {
        const data = await getJSON(url);
        const raw = ((data.sports || [])[0] && (data.sports[0].leagues || [])[0] && data.sports[0].leagues[0].teams) || [];
        teams = raw.map((w) => w.team).filter(Boolean);
      } catch (e) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!teams.length) {
      // Fallback: team list from the standings API (different host)
      try {
        const data = await getJSON(`https://site.web.api.espn.com/apis/v2/sports/soccer/${state.league}/standings`);
        const entries = ((data.children || [])[0] && data.children[0].standings && data.children[0].standings.entries) || [];
        teams = entries.map((en) => en.team).filter(Boolean);
      } catch (e) {}
    }
  }
  if (!teams.length) {
    // Local fallback: teams_mm.json (loaded at init) lists every covered team — works in 'all' mode and whenever ESPN is unreachable.
    teams = Object.entries(TEAMS_MM)
      .map(([id, r]) => ({ id, displayName: (r && r.en) || '', abbreviation: (r && r.abbr) || '' }))
      .filter((t) => t.displayName);
  }
  if (!teams.length) {
    sel.innerHTML = `<option value="">— ရွေးပါ —</option><option value="__retry">⚠️ ဆွဲမရပါ — ပြန်ကြိုးစားရန် နှိပ်ပါ</option>`;
  } else {
    const opts = teams
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
      .map((t) => {
        const rec = TEAMS_MM[t.id];
        const label = rec && rec.mm ? `${rec.mm} (${t.abbreviation || ''})` : (t.displayName || '');
        return `<option value="${esc(t.id)}"${String(t.id) === String(favTeamId) ? ' selected' : ''}>${esc(label)}</option>`;
      }).join('');
    sel.innerHTML = `<option value="">— ရွေးပါ —</option>` + opts;
  }
  $('#favClear').style.display = favTeamId ? '' : 'none';
}
function bindFav() {
  const sel = $('#favSelect');
  if (!sel || sel.dataset.bound) return;
  sel.dataset.bound = '1';
  sel.addEventListener('change', () => {
    if (sel.value === '__retry') { populateFavSelect(); return; }
    favTeamId = sel.value || null;
    try {
      if (favTeamId) localStorage.setItem(FAV_KEY, favTeamId);
      else localStorage.removeItem(FAV_KEY);
    } catch (e) {}
    $('#favClear').style.display = favTeamId ? '' : 'none';
    loadTab();
  });
  $('#favClear').addEventListener('click', () => {
    favTeamId = null;
    try { localStorage.removeItem(FAV_KEY); } catch (e) {}
    sel.value = '';
    $('#favClear').style.display = 'none';
    loadTab();
  });
}

/* ---------- navigation ---------- */

function buildLeagues() {
  const allBtn = `<button class="league-chip${state.league === 'all' ? ' active' : ''}" data-league="all">🌍 အားလုံး</button>`;
  $('#leagueBar').innerHTML = allBtn + LEAGUES.map((l) =>
    `<button class="league-chip${l.id === state.league ? ' active' : ''}" data-league="${l.id}">${l.icon} ${esc(l.mm)}</button>`
  ).join('');
  document.querySelectorAll('.league-chip').forEach((b) => b.addEventListener('click', () => {
    state.league = b.dataset.league;
    state.standView = 'table';
    buildLeagues();
    populateFavSelect();
    loadTab();
  }));
}

function buildTabs() {
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
    b.onclick = () => { state.tab = b.dataset.tab; try { location.hash = state.tab; } catch (e) {} buildTabs(); loadTab(); };
  });
}

function armAutoRefresh() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.chatTimer) { clearInterval(state.chatTimer); state.chatTimer = null; }
  armClockTicker(false);
  if (state.tab === 'live') {
    armClockTicker(true);
    state.timer = setInterval(() => { if (state.tab === 'live') loadTab(true); }, 60000);
  }
}

/* ---------- reminders ---------- */
function toggleReminder(matchId, title, dateStr) {
  if (!('Notification' in window)) { alert('ဒီ browser က notification မရဘူး'); return; }
  const key = 'kzz-remind-' + matchId;
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    alert('သတိပေးချက် ပိတ်လိုက်ပြီ');
    return;
  }
  const go = () => {
    localStorage.setItem(key, JSON.stringify({title: title, date: dateStr}));
    alert('🔔 ပွဲစခါနီး ၁၅ မိနစ် သတိပေးမယ်!');
    scheduleReminders();
  };
  if (Notification.permission === 'granted') go();
  else Notification.requestPermission().then(p => { if (p === 'granted') go(); else alert('Notification ခွင့်မပြုလို့ သတိပေးလို့မရဘူး'); });
}
function scheduleReminders() {
  // Check every minute for upcoming matches
  setInterval(() => {
    if (Notification.permission !== 'granted') return;
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('kzz-remind-')) continue;
      try {
        const r = JSON.parse(localStorage.getItem(k));
        const matchTime = new Date(r.date).getTime();
        const diff = matchTime - now;
        // 15 min before AND not yet notified
        if (diff > 0 && diff < 15 * 60 * 1000 && !r.notified) {
          new Notification('⚽ ပွဲ စတော့မယ်!', {body: r.title + ' — ၁၅ မိနစ် အလို'});
          r.notified = true;
          localStorage.setItem(k, JSON.stringify(r));
        }
        // Clean up old reminders (2h after match)
        if (diff < -2 * 60 * 60 * 1000) localStorage.removeItem(k);
      } catch (e) {}
    }
  }, 60000);
}
window.toggleReminder = toggleReminder;
// Start reminder checker on load
setTimeout(scheduleReminders, 5000);

/* ---------- poll ---------- */
async function renderPoll() {
  const content = document.getElementById('content');
  // Get active poll (latest)
  const polls = await sbGet('polls?order=created_at.desc&limit=1');
  const poll = (polls && polls[0]) || null;
  if (!poll) {
    content.innerHTML = `<h2 class="section-title">🏆 မဲ</h2><div class="empty">မဲ မရှိသေးပါ။</div>`;
    return;
  }
  const votes = await sbGet('poll_votes?poll_id=eq.' + poll.id);
  const counts = {};
  (votes || []).forEach(v => { counts[v.option] = (counts[v.option] || 0) + 1; });
  const total = (votes || []).length;
  const myVote = localStorage.getItem('kzz-poll-' + poll.id);
  const options = poll.options || [];
  const emojis = ['🔴', '🔵', '🟢', '🟡', '🟠', '🟣'];
  let html = `<h2 class="section-title">🏆 ${esc(poll.question)}</h2>`;
  html += `<div class="poll-cards">`;
  options.forEach((opt, i) => {
    const c = counts[i] || 0;
    const pct = total ? Math.round(c / total * 100) : 0;
    const voted = myVote == String(i);
    html += `<div class="poll-card${voted ? ' voted' : ''}" onclick="votePoll('${poll.id}',${i})">
      <div class="poll-card-emoji">${emojis[i % emojis.length]}</div>
      <div class="poll-card-name">${esc(opt)}</div>
      ${total ? `<div class="poll-card-pct">${pct}%</div><div class="poll-card-votes">${c} မဲ</div>` : `<div class="poll-card-vote-btn">မဲပေး</div>`}
      ${voted ? `<div class="poll-card-check">✅</div>` : ''}
    </div>`;
  });
  html += `</div><div class="poll-total">စုစုပေါင်း မဲ: ${total}</div>`;
  content.innerHTML = html;
}
async function votePoll(pollId, option) {
  if (localStorage.getItem('kzz-poll-' + pollId)) { alert('မဲ ပေးပြီးသားပါ!'); return; }
  await sbPost('poll_votes', {poll_id: pollId, option: option});
  localStorage.setItem('kzz-poll-' + pollId, String(option));
  renderPoll();
}
window.votePoll = votePoll;

/* ---------- head-to-head ---------- */
async function renderH2H() {
  const content = document.getElementById('content');
  // Get teams from standings
  let teams = [];
  try {
    const data = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/standings`);
    const entries = data?.children?.[0]?.standings?.entries || [];
    teams = entries.map(e => ({id: e.team.id, name: e.team.displayName})).sort((a,b) => a.name.localeCompare(b.name));
  } catch (e) {}
  let html = `<h2 class="section-title">⚔️ Head-to-Head ယှဉ်ပြ</h2>
  <div class="h2h-box">
    <div class="h2h-select">
      <select id="h2hTeam1"><option value="">အသင်း ၁ ရွေး</option>${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <select id="h2hTeam2"><option value="">အသင်း ၂ ရွေး</option>${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <button class="share-btn" onclick="loadH2H()">ယှဉ်မယ်</button>
    </div>
    <div class="h2h-result" id="h2hResult"><div style="color:#888">အသင်း ၂ သင်း ရွေးပြီး "ယှဉ်မယ်" နှိပ်ပါ</div></div>
  </div>`;
  content.innerHTML = html;
}
async function loadH2H() {
  const t1 = document.getElementById('h2hTeam1').value;
  const t2 = document.getElementById('h2hTeam2').value;
  const resEl = document.getElementById('h2hResult');
  if (!t1 || !t2) { resEl.innerHTML = `<div style="color:#f66">အသင်း ၂ သင်း လုံး ရွေးပါ</div>`; return; }
  if (t1 === t2) { resEl.innerHTML = `<div style="color:#f66">မတူတဲ့ အသင်း ၂ သင်း ရွေးပါ</div>`; return; }
  resEl.innerHTML = `<div style="color:#888">ရှာနေတယ်...</div>`;
  try {
    // Get recent matches for both teams and find head-to-head
    const [d1, d2] = await Promise.all([
      getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/teams/${t1}/schedule`).catch(() => null),
      getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${state.league}/teams/${t2}/schedule`).catch(() => null)
    ]);
    const name1 = document.getElementById('h2hTeam1').selectedOptions[0].text;
    const name2 = document.getElementById('h2hTeam2').selectedOptions[0].text;
    // Find matches between these two teams from team 1's schedule
    const h2h = [];
    (d1?.events || []).forEach(e => {
      const comp = e.competitions?.[0];
      if (!comp) return;
      const teams = comp.competitors || [];
      const ids = teams.map(t => t.id);
      if (ids.includes(t1) && ids.includes(t2) && comp.status?.type?.completed) {
        const home = teams.find(t => t.homeAway === 'home');
        const away = teams.find(t => t.homeAway === 'away');
        h2h.push({
          date: e.date,
          home: home?.team?.displayName || '?',
          away: away?.team?.displayName || '?',
          hs: home?.score ?? '?',
          as: away?.score ?? '?'
        });
      }
    });
    h2h.sort((a,b) => new Date(b.date) - new Date(a.date));
    if (!h2h.length) {
      resEl.innerHTML = `<div style="color:#888">${esc(name1)} vs ${esc(name2)} — တွေ့ဆုံမှု မရှိပါ (ဒီရာသီ)</div>`;
    } else {
      let w1 = 0, w2 = 0, d = 0;
      h2h.forEach(m => {
        const t1IsHome = m.home === name1;
        const s1 = t1IsHome ? parseInt(m.hs) : parseInt(m.as);
        const s2 = t1IsHome ? parseInt(m.as) : parseInt(m.hs);
        if (s1 > s2) w1++; else if (s2 > s1) w2++; else d++;
      });
      resEl.innerHTML = `
        <div style="text-align:center;margin-bottom:12px;font-size:16px">
          <b>${esc(name1)}</b> ${w1} - ${d} - ${w2} <b>${esc(name2)}</b><br>
          <small style="color:var(--muted)">နိုင် - သရေ - နိုင်</small>
        </div>
        ${h2h.slice(0, 10).map(m => {
          const dt = new Date(m.date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
          return `<div class="h2h-match"><span>${esc(m.home)} vs ${esc(m.away)}</span><span class="h2h-score">${m.hs} - ${m.as}</span><small>${dt}</small></div>`;
        }).join('')}`;
    }
  } catch (e) {
    resEl.innerHTML = `<div style="color:#f66">ဒေတာ ဆွဲမရဘူး</div>`;
  }
}
window.loadH2H = loadH2H;

/* ---------- chat ---------- */
async function renderChat() {
  const content = document.getElementById('content');
  const msgs = await sbGet('chat_messages?order=created_at.desc&limit=50');
  const list = (msgs || []).reverse();
  let html = `<h2 class="section-title">💬 စကားဝိုင်း</h2>
  <div class="chat-box"><div class="chat-list" id="chatList">`;
  if (!list.length) html += `<div style="color:#888">စကား မရှိသေးပါ — ပထမဆုံး ပြောလိုက်ပါ!</div>`;
  else html += list.map(m => {
    const d = new Date(m.created_at);
    const t = d.toLocaleString('en-GB', {timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit'});
    return `<div class="chat-msg"><b>${esc(m.name || 'Anonymous')}</b> <small>${t}</small><br>${esc(m.text)}</div>`;
  }).join('');
  html += `</div><div class="chat-form">
    <input type="text" id="chatName" placeholder="နာမည်" maxlength="30" style="width:100px">
    <input type="text" id="chatText" placeholder="စကားပြောမယ်..." maxlength="300">
    <button class="share-btn" onclick="sendChat()">ပို့မယ်</button>
  </div></div>`;
  content.innerHTML = html;
  const cl = document.getElementById('chatList');
  if (cl) cl.scrollTop = cl.scrollHeight;
  // Auto-refresh chat every 10s
  if (state.chatTimer) clearInterval(state.chatTimer);
  state.chatTimer = setInterval(() => { if (state.tab === 'chat') renderChat(); }, 10000);
}
async function sendChat() {
  const nameEl = document.getElementById('chatName');
  const textEl = document.getElementById('chatText');
  const text = (textEl.value || '').trim();
  if (!text) return;
  const name = (nameEl.value || '').trim() || 'Anonymous';
  localStorage.setItem('kzz-chat-name', name);
  await sbPost('chat_messages', {name: name, text: text});
  textEl.value = '';
  renderChat();
}
window.sendChat = sendChat;

async function loadTab(quiet) {
  if (!quiet) showLoading();
  const keepY = quiet ? window.scrollY : 0;
  armAutoRefresh();
  try {
    if (state.tab === 'live') await renderLive();
    else if (state.tab === 'fixtures') await renderFixtures();
    else if (state.tab === 'results') await renderResults();
    else if (state.tab === 'lineups') await renderLineups();
    else if (state.tab === 'standings') await renderStandings();
    else if (state.tab === 'predictions') await renderPredictions();
    else if (state.tab === 'news') await renderNews();
    else if (state.tab === 'analyses') await renderAnalyses();
    else if (state.tab === 'highlights') await renderHighlights();
    else if (state.tab === 'scorers') await renderScorersTab();
  } catch (e) {
    if (!quiet) showError();
  }
  if (quiet && keepY) window.scrollTo(0, keepY);
}

try { const h = (location.hash || '').replace('#', ''); if (['live','fixtures','results','standings','predictions','news','analyses'].includes(h)) state.tab = h; } catch (e) {}
window.addEventListener('hashchange', () => {
  try {
    const h = (location.hash || '').replace('#', '');
    if (['live','fixtures','results','standings','predictions','news','analyses'].includes(h) && h !== state.tab) {
      state.tab = h; buildTabs(); loadTab();
    }
  } catch (e) {}
});
buildLeagues();
buildTabs();
window.loadTab = loadTab;
window.openMatchDetail = openMatchDetail;
window.closeModal = closeModal;
window.setStandView = setStandView;
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });

function showUpdateBanner() {
  if ($('#updateBanner')) return;
  const b = document.createElement('div');
  b.id = 'updateBanner';
  b.innerHTML = `✨ version အသစ် ထွက်ပြီ! <button onclick="location.reload()">အပ်ဒိတ်လုပ်မယ်</button>`;
  document.body.prepend(b);
}

(async function init() {
  try {
    const d = await getJSON('teams_mm.json');
    if (d && d.teams) {
      TEAMS_MM = d.teams;
      Object.values(TEAMS_MM).forEach((r) => {
        if (r.en && r.mm) TEAM_MM_BY_NAME[r.en.toLowerCase()] = r.mm;
      });
    }
  } catch (e) { /* Burmese names optional — English fallback */ }
  try { const s = await getJSON('squads.json'); if (s) SQUADS = s; } catch (e) {}
  try { const ti = await getJSON('team_info.json'); if (ti) TEAM_INFO = ti; } catch (e) {}
  bindFav();
  populateFavSelect();
  loadTab();
  try {
    const av = $('#appVer');
    if (av) av.textContent = 'v' + APP_VERSION;
  } catch (e) {}
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const checkUpdate = () => { try { reg.update(); } catch (e) {} };
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
      setInterval(checkUpdate, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
    }).catch(() => {});
  }
})();

