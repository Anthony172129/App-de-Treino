'use strict';

/* =========================================================
   Pulso — app de treino com Contas (Gmail + senha) e Nuvem (Firebase)
   ========================================================= */

const ACCOUNTS_KEY = 'pulso-accounts-v1';
const SESSION_KEY = 'pulso-session-v1';
const FB_CONFIG_KEY = 'pulso-firebase-config-v1';
const LEGACY_KEY = 'pulso-app-v1';

// Configuração oficial do Firebase (pulso-61be3) para sincronizar em qualquer celular:
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCqT3-iDCx0vd4jijZCivUpufiwk21fzb4",
  authDomain: "pulso-61be3.firebaseapp.com",
  projectId: "pulso-61be3",
  storageBucket: "pulso-61be3.firebasestorage.app",
  messagingSenderId: "828082362073",
  appId: "1:828082362073:web:6469e1da7e30724f0350c8",
};

const DEFAULT_STATE = {
  profile: {
    nome: '',
    email: '',
    nascimento: { dia: 1, mes: 1, ano: 2000 },
    sexo: 'm',
    idade: 25,
    altura: 175,     // guardada em cm internamente para a fórmula Mifflin-St Jeor
    altura_m: 1.75,  // altura em metros exibida ao usuário
    peso: 75,
    atividade: 1.55,
    objetivo: 'manter',
    configurado: false,
  },
  trainingDays: [1, 2, 3, 4, 5, 6], // 0 = domingo
  bestStreak: 0,
  workouts: [
    { id: 'a', nome: 'Treino A', foco: 'Peito e tríceps', exercicios: [
      { nome: 'Supino reto', series: 4, reps: '10', carga: '40kg' },
      { nome: 'Supino inclinado halteres', series: 3, reps: '12', carga: '14kg' },
      { nome: 'Crucifixo', series: 3, reps: '12', carga: '10kg' },
      { nome: 'Tríceps corda', series: 4, reps: '12', carga: '20kg' },
    ] },
    { id: 'b', nome: 'Treino B', foco: 'Costas e bíceps', exercicios: [
      { nome: 'Puxada frontal', series: 4, reps: '10', carga: '45kg' },
      { nome: 'Remada curvada', series: 4, reps: '10', carga: '30kg' },
      { nome: 'Rosca direta', series: 3, reps: '12', carga: '12kg' },
      { nome: 'Rosca martelo', series: 3, reps: '12', carga: '10kg' },
    ] },
    { id: 'c', nome: 'Treino C', foco: 'Pernas e ombros', exercicios: [
      { nome: 'Agachamento livre', series: 4, reps: '10', carga: '50kg' },
      { nome: 'Leg press', series: 4, reps: '12', carga: '120kg' },
      { nome: 'Cadeira extensora', series: 3, reps: '15', carga: '35kg' },
      { nome: 'Desenvolvimento', series: 4, reps: '10', carga: '12kg' },
    ] },
  ],
  measures: [],
  log: {}, // { 'AAAA-MM-DD': { water: [], meals: [], sessions: [] } }
};

const ACTIVITIES = {
  musculacao: { nome: 'Musculação', met: 5 },
  corrida: { nome: 'Corrida', met: 9.8 },
  caminhada: { nome: 'Caminhada', met: 3.8 },
  bike: { nome: 'Bicicleta', met: 7.5 },
  hiit: { nome: 'HIIT / Funcional', met: 8 },
  natacao: { nome: 'Natação', met: 7 },
  outro: { nome: 'Outro', met: 4.5 },
};

const FOODS = [
  ['Arroz branco (100g)', 130, 2.5], ['Arroz integral (100g)', 124, 2.6], ['Feijão (100g)', 76, 4.8],
  ['Frango grelhado (100g)', 165, 31], ['Carne bovina magra (100g)', 220, 26], ['Ovo cozido (1 un)', 78, 6.3],
  ['Pão francês (1 un)', 135, 4.5], ['Banana (1 un)', 89, 1.1], ['Maçã (1 un)', 72, 0.4],
  ['Aveia (30g)', 117, 4.2], ['Whey protein (30g)', 120, 24], ['Batata-doce (100g)', 86, 1.6],
  ['Leite integral (200ml)', 124, 6.4], ['Iogurte natural (170g)', 105, 6], ['Queijo branco (30g)', 80, 5.3],
  ['Salada verde (1 prato)', 25, 1.5], ['Tapioca (1 un)', 140, 0], ['Café com açúcar (1 xíc.)', 40, 0],
];

const MEAL_TYPES = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia'];
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TITLES = { inicio: 'Metas do dia', treinos: 'Meus treinos', calorias: 'Calorias', agua: 'Água', medidas: 'Medidas do corpo' };
const POINTS = { treino: 40, agua: 30, alim: 30 };

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => Math.random().toString(36).slice(2, 10);
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const fmt = n => Math.round(n).toLocaleString('pt-BR');
const clamp01 = n => Math.max(0, Math.min(1, n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeNow = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const EMPTY_DAY = () => ({ water: [], meals: [], sessions: [] });

/* ---------- Cálculo de Idade por Dia, Mês e Ano ---------- */
function calcAgeFromDOB(dia, mes, ano) {
  const d = Number(dia), m = Number(mes), y = Number(ano);
  if (!d || !m || !y || y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const mDiff = (now.getMonth() + 1) - m;
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d)) age--;
  return age >= 5 && age <= 115 ? age : null;
}

function normalizeMeters(val) {
  let num = Number(String(val).replace(',', '.'));
  if (!num || isNaN(num)) return null;
  // Se digitarem 175 por engano em vez de 1.75, converte para 1.75m
  if (num >= 100 && num <= 250) num = +(num / 100).toFixed(2);
  if (num < 1.0 || num > 2.5) return null;
  return +num.toFixed(2);
}

const isGmail = email => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(String(email || '').trim());

/* ---------- Estado e Contas ---------- */
let currentUserEmail = null;
let S = structuredClone(DEFAULT_STATE);
let cloud = { enabled: false, auth: null, db: null, fbModules: null };

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveAccounts(accs) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accs));
}

function userStorageKey(email) {
  return `pulso-user-data-${email.toLowerCase().trim()}`;
}

function hydrateState(saved) {
  const base = structuredClone(DEFAULT_STATE);
  if (!saved) return base;
  const merged = {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile || {}) },
  };
  if (merged.profile.nascimento) {
    const calc = calcAgeFromDOB(merged.profile.nascimento.dia, merged.profile.nascimento.mes, merged.profile.nascimento.ano);
    if (calc != null) merged.profile.idade = calc;
  }
  if (!merged.profile.altura_m && merged.profile.altura) {
    merged.profile.altura_m = +(merged.profile.altura / 100).toFixed(2);
  }
  return merged;
}

function loadUserState(email) {
  try {
    const raw = localStorage.getItem(userStorageKey(email));
    if (raw) return hydrateState(JSON.parse(raw));
  } catch (e) { /* ignora erro */ }
  return structuredClone(DEFAULT_STATE);
}

function save() {
  if (!currentUserEmail) return;
  S.bestStreak = Math.max(S.bestStreak || 0, streak());
  if (S.profile.nascimento) {
    const calc = calcAgeFromDOB(S.profile.nascimento.dia, S.profile.nascimento.mes, S.profile.nascimento.ano);
    if (calc != null) S.profile.idade = calc;
  }
  localStorage.setItem(userStorageKey(currentUserEmail), JSON.stringify(S));
  syncToCloud();
}

/* ---------- Nuvem (Firebase Auth + Firestore) ---------- */
function getFirebaseConfig() {
  if (DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey) return DEFAULT_FIREBASE_CONFIG;
  try {
    const saved = JSON.parse(localStorage.getItem(FB_CONFIG_KEY));
    if (saved && saved.apiKey && saved.projectId) return saved;
  } catch (e) { /* ignora */ }
  return null;
}

function parseFirebaseConfigInput(rawText) {
  const txt = String(rawText || '').trim();
  if (!txt) return null;
  try {
    const parsed = JSON.parse(txt);
    if (parsed.apiKey && parsed.projectId) return parsed;
  } catch (e) { /* tenta extrair de código JS colado do console do Firebase */ }
  const extract = key => {
    const m = txt.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`));
    return m ? m[1] : undefined;
  };
  const cfg = {
    apiKey: extract('apiKey'),
    authDomain: extract('authDomain'),
    projectId: extract('projectId'),
    storageBucket: extract('storageBucket'),
    messagingSenderId: extract('messagingSenderId'),
    appId: extract('appId'),
  };
  return cfg.apiKey && cfg.projectId ? cfg : null;
}

async function initCloud() {
  const cfg = getFirebaseConfig();
  const badge = $('#cloud-status-badge');
  if (!cfg) {
    cloud = { enabled: false, auth: null, db: null, fbModules: null };
    if (badge) { badge.textContent = 'Modo local'; badge.classList.remove('online'); }
    return false;
  }
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    cloud = { enabled: true, auth, db, fbModules: { authMod, fsMod } };
    if (badge) { badge.textContent = '☁️ Nuvem ativa'; badge.classList.add('online'); }
    return true;
  } catch (err) {
    console.warn('Falha ao iniciar Firebase, usando modo local:', err);
    cloud = { enabled: false, auth: null, db: null, fbModules: null };
    if (badge) { badge.textContent = 'Modo local'; badge.classList.remove('online'); }
    return false;
  }
}

async function syncToCloud() {
  if (!cloud.enabled || !cloud.db || !currentUserEmail) return;
  try {
    const { doc, setDoc } = cloud.fbModules.fsMod;
    const id = currentUserEmail.toLowerCase().trim();
    await setDoc(doc(cloud.db, 'usuarios_pulso', id), {
      email: id,
      updatedAt: Date.now(),
      state: JSON.parse(JSON.stringify(S)),
    }, { merge: true });
  } catch (e) {
    console.warn('Não foi possível sincronizar na nuvem agora:', e);
  }
}

async function pullFromCloud(email) {
  if (!cloud.enabled || !cloud.db) return null;
  try {
    const { doc, getDoc } = cloud.fbModules.fsMod;
    const snap = await getDoc(doc(cloud.db, 'usuarios_pulso', email.toLowerCase().trim()));
    if (snap.exists() && snap.data()?.state) {
      return hydrateState(snap.data().state);
    }
  } catch (e) {
    console.warn('Erro ao buscar dados da nuvem:', e);
  }
  return null;
}

const peek = (k = dkey()) => S.log[k] || EMPTY_DAY();
const today = () => (S.log[dkey()] ||= EMPTY_DAY());

const ICON = {
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24"><path d="M2 10h2V8h2v8H4v-2H2zm4-4h3v12H6zm9 0h3v12h-3zm3 2h2v2h2v4h-2v2h-2zM9 11h6v2H9z"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 2s7 7.5 7 13a7 7 0 0 1-14 0c0-5.5 7-13 7-13z"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3 7h18v10H3zm3 0v4m3-4v2m3-2v4m3-4v2m3-2v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/></svg>',
};

/* ---------- Cálculos ---------- */
const P = () => S.profile;
function bmr() {
  const p = P();
  return Math.round(10 * p.peso + 6.25 * p.altura - 5 * p.idade + (p.sexo === 'f' ? -161 : 5));
}
const tdee = () => Math.round(bmr() * Number(P().atividade));
function kcalGoal() {
  const adj = { perder: -500, manter: 0, ganhar: 300 }[P().objetivo] || 0;
  return Math.max(P().sexo === 'f' ? 1200 : 1500, tdee() + adj);
}
const proteinGoal = () => Math.round(P().peso * (P().objetivo === 'manter' ? 1.6 : 2));
const waterGoal = (k = dkey()) => Math.round((P().peso * 35) / 50) * 50 + (peek(k).sessions.length ? 500 : 0);
const waterOf = k => sum(peek(k).water, x => x.ml);
const kcalIn = k => sum(peek(k).meals, x => x.kcal);
const protIn = k => sum(peek(k).meals, x => x.prot);
const kcalOut = k => sum(peek(k).sessions, x => x.kcal);
const trained = k => peek(k).sessions.length > 0;
const isTrainingDay = d => S.trainingDays.includes(d.getDay());
const sessionKcal = (tipo, min) => Math.round(ACTIVITIES[tipo].met * P().peso * (min / 60));

function streak() {
  let d = new Date(), n = 0;
  if (trained(dkey(d))) n++;
  d = addDays(d, -1);
  for (let i = 0; i < 1000; i++) {
    const k = dkey(d);
    if (trained(k)) n++;
    else if (isTrainingDay(d)) break;
    d = addDays(d, -1);
  }
  return n;
}

function score(k = dkey()) {
  const date = parseKey(k);
  const rest = !isTrainingDay(date);
  const tr = trained(k) ? 1 : rest ? 1 : 0;
  const w = clamp01(waterOf(k) / waterGoal(k));
  const ci = kcalIn(k), g = kcalGoal();
  let f = 0;
  if (ci > 0) {
    const r = ci / g;
    f = r < 0.9 ? r / 0.9 : r <= 1.1 ? 1 : clamp01(1 - (r - 1.1) / 0.4);
  }
  const pts = { treino: Math.round(tr * POINTS.treino), agua: Math.round(w * POINTS.agua), alim: Math.round(f * POINTS.alim) };
  return { ...pts, total: pts.treino + pts.agua + pts.alim, tr, w, f, rest, ratio: ci / g };
}

function totalPoints() {
  return Object.keys(S.log).filter(k => {
    const d = S.log[k];
    return d.water.length || d.meals.length || d.sessions.length;
  }).reduce((s, k) => s + score(k).total, 0);
}

function bmi() { const h = P().altura / 100; return P().peso / (h * h); }
function bmiClass(v) {
  if (v < 18.5) return ['Abaixo do peso', 'c-water'];
  if (v < 25) return ['Peso normal', 'c-lime'];
  if (v < 30) return ['Sobrepeso', 'c-body'];
  return ['Obesidade', 'c-food'];
}

/* ---------- Componentes ---------- */
function ring(pct, size, stroke, color) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, h = size / 2;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle class="ring-track" cx="${h}" cy="${h}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-bar" cx="${h}" cy="${h}" r="${r}" stroke-width="${stroke}" stroke="${color}"
      style="--c:${c}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp01(pct))}" transform="rotate(-90 ${h} ${h})"/>
  </svg>`;
}
const bar = (pct, color) => `<div class="bar"><i style="width:${clamp01(pct) * 100}%;background:${color}"></i></div>`;
const stat = (k, v, unit = '') => `<div class="stat"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`;
const del = (action, id) => `<button class="icon-btn" data-action="${action}" data-id="${id}" aria-label="Remover">${ICON.trash}</button>`;
const setupBanner = () => P().configurado ? '' : `
  <div class="card setup">
    <div><h2>Configure seu perfil</h2><p class="sub" style="margin:0">Informe altura, peso, data de nascimento e sexo para calcular suas metas.</p></div>
    <a class="btn body" href="#medidas" id="setup-go">Preencher medidas</a>
  </div>`;

/* ---------- Tela: Metas (início) ---------- */
function renderInicio() {
  const k = dkey(), sc = score(k), st = streak();
  const total = totalPoints(), level = Math.floor(total / 500) + 1, inLevel = total % 500;

  const goals = [
    { icon: ICON.dumbbell, cls: 'lime', color: 'var(--lime)', title: 'Treino',
      desc: trained(k) ? `Concluído · ${peek(k).sessions.map(s => esc(s.nome)).join(', ')}` : sc.rest ? 'Dia de descanso — pontos garantidos' : 'Registre seu treino de hoje',
      pct: sc.tr, pts: sc.treino, max: POINTS.treino },
    { icon: ICON.drop, cls: 'water', color: 'var(--water)', title: 'Água',
      desc: `${fmt(waterOf(k))} de ${fmt(waterGoal(k))} ml`, pct: sc.w, pts: sc.agua, max: POINTS.agua },
    { icon: ICON.fire, cls: 'food', color: 'var(--food)', title: 'Alimentação',
      desc: kcalIn(k) ? `${fmt(kcalIn(k))} de ${fmt(kcalGoal())} kcal${sc.ratio > 1.1 ? ' · acima da meta' : ''}` : 'Nenhuma refeição registrada',
      pct: sc.f, pts: sc.alim, max: POINTS.alim },
  ];

  let week = '';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i), kk = dkey(d), has = !!S.log[kk];
    const t = has ? score(kk).total : 0;
    week += `<div class="week-col"><b>${has ? t : ''}</b>
      <div class="week-bar ${has && t ? 'has' : ''} ${i === 0 ? 'today' : ''}" style="height:${Math.max(4, t)}%"></div>
      <span>${DAYS_SHORT[d.getDay()]}</span></div>`;
  }

  return `${setupBanner()}
  <div class="card hero">
    <div class="ring-wrap">${ring(sc.total / 100, 200, 16, 'var(--lime)')}
      <div class="ring-center"><div class="big">${sc.total}%</div><div class="lbl">meta do dia</div></div>
    </div>
    <div class="goals">
      ${goals.map(g => `<div class="goal">
        <div class="goal-icon bg-${g.cls} c-${g.cls}">${g.icon}</div>
        <div><div class="goal-title">${g.title}</div><div class="goal-desc">${g.desc}</div>${bar(g.pct, g.color)}</div>
        <div class="goal-pts">${g.pts}<small>de ${g.max} pts</small></div>
      </div>`).join('')}
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <h2>Pontuação acumulada</h2><p class="sub">Cada dia vale até 100 pontos. A cada 500 pontos você sobe de nível.</p>
      <div class="grid-3">${stat('Nível', level)}${stat('Pontos', fmt(total))}${stat('Sequência', st, st === 1 ? 'dia' : 'dias')}</div>
      <div class="level-bar"><i style="width:${(inLevel / 500) * 100}%"></i></div>
      <p class="note" style="margin:0">${500 - inLevel} pontos para o nível ${level + 1}</p>
    </div>
    <div class="card">
      <h2>Últimos 7 dias</h2><p class="sub">Pontuação diária</p>
      <div class="week">${week}</div>
    </div>
  </div>`;
}

/* ---------- Tela: Treinos ---------- */
function renderTreinos() {
  const k = dkey(), st = streak(), sessions = peek(k).sessions;
  const now = new Date();

  const start = addDays(now, -now.getDay() - 28);
  const firstUse = Object.keys(S.log).sort()[0] || k;
  let heat = DAYS_SHORT.map(d => `<div class="heat-h">${d[0]}</div>`).join('');
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i), kk = dkey(d);
    const future = d > now && kk !== k;
    let cls = future ? 'future' : trained(kk) ? 'done' : !isTrainingDay(d) ? 'rest' : kk === k || kk < firstUse ? '' : 'miss';
    heat += `<div class="heat-d ${cls} ${kk === k ? 'today' : ''}" title="${d.toLocaleDateString('pt-BR')}">${d.getDate()}</div>`;
  }

  const opts = S.workouts.map(w => `<option value="${w.id}">${esc(w.nome)} — ${esc(w.foco)}</option>`).join('');
  const acts = Object.entries(ACTIVITIES).map(([id, a]) => `<option value="${id}">${a.nome}</option>`).join('');

  return `
  <div class="grid-2">
    <div class="card">
      <div class="streak">
        <div class="flame ${st ? 'on' : ''}">${ICON.fire}</div>
        <div><div class="num">${st} ${st === 1 ? 'dia' : 'dias'}</div>
          <div class="txt">de treino seguidos sem falta · recorde: ${Math.max(S.bestStreak || 0, st)}</div></div>
      </div>
      <div class="heat">${heat}</div>
      <div class="legend"><span><i style="background:var(--lime)"></i>Treinou</span><span><i style="background:hsl(356 80% 64% / .3)"></i>Faltou</span><span><i style="box-shadow:inset 0 0 0 1px var(--line)"></i>Descanso</span></div>
    </div>
    <div class="card">
      <h2>Registrar treino de hoje</h2><p class="sub">${trained(k) ? 'Treino de hoje concluído. Pode registrar mais atividades.' : 'Marque o treino para manter sua sequência.'}</p>
      <form class="form" data-form="session" id="session-form">
        <label class="field"><span>Treino</span><select name="workout" id="session-workout">${opts}<option value="">Atividade avulsa</option></select></label>
        <div class="row">
          <label class="field"><span>Atividade</span><select name="tipo" id="session-tipo">${acts}</select></label>
          <label class="field"><span>Duração (min)</span><input name="min" id="session-min" type="number" min="5" max="600" value="60" required /></label>
        </div>
        <button class="btn primary" id="session-save">Concluir treino</button>
      </form>
      ${sessions.length ? `<div class="group-title"><span>Hoje</span><span>${fmt(kcalOut(k))} kcal gastas</span></div>
      <ul class="list">${sessions.map(s => `<li class="item"><div><div class="t">${esc(s.nome)}</div><div class="m">${ACTIVITIES[s.tipo]?.nome} · ${s.min} min · ${s.hora}</div></div><div class="val">${fmt(s.kcal)} kcal</div>${del('del-session', s.id)}</li>`).join('')}</ul>` : ''}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div><h2>Meus treinos</h2><p class="sub">Sua ficha de treino. Toque para ver os exercícios.</p></div>
      <button class="btn ghost small" data-action="new-workout" id="new-workout">+ Novo treino</button>
    </div>
    ${S.workouts.length ? S.workouts.map(w => `
      <div class="plan" id="plan-${w.id}">
        <div class="plan-head" data-action="toggle-plan" data-id="${w.id}">
          <div><div class="plan-name">${esc(w.nome)}</div><div class="plan-focus">${esc(w.foco)} · ${w.exercicios.length} exercícios</div></div>
          <span class="chev">${ICON.chev}</span>
        </div>
        <div class="plan-body">
          <ul class="ex-list">${w.exercicios.map(e => `<li>${esc(e.nome)}<span>${esc(e.series)}×${esc(e.reps)}${e.carga ? ` · ${esc(e.carga)}` : ''}</span></li>`).join('') || '<li>Nenhum exercício</li>'}</ul>
          <div class="plan-actions">
            <button class="btn primary small" data-action="quick-session" data-id="${w.id}">Concluir hoje</button>
            <button class="btn ghost small" data-action="edit-workout" data-id="${w.id}">Editar</button>
            <button class="btn danger small" data-action="del-workout" data-id="${w.id}">Excluir</button>
          </div>
        </div>
      </div>`).join('') : '<p class="empty">Nenhum treino cadastrado.</p>'}
  </div>

  <div class="card">
    <h2>Dias de treino na semana</h2><p class="sub">Os dias desmarcados são descanso: não quebram sua sequência e garantem os pontos de treino.</p>
    <div class="chips">${DAYS_SHORT.map((d, i) => `<button class="chip ${S.trainingDays.includes(i) ? 'on' : ''}" data-action="toggle-day" data-id="${i}" id="day-${i}">${d}</button>`).join('')}</div>
  </div>`;
}

/* ---------- Tela: Calorias ---------- */
function renderCalorias() {
  const k = dkey(), meals = peek(k).meals, goal = kcalGoal(), eaten = kcalIn(k), left = goal - eaten;
  const prot = protIn(k), pg = proteinGoal();
  const objetivo = { perder: 'perder peso (−500 kcal)', manter: 'manter o peso', ganhar: 'ganhar massa (+300 kcal)' }[P().objetivo];

  const grouped = MEAL_TYPES.map(t => {
    const items = meals.filter(m => m.tipo === t);
    if (!items.length) return '';
    return `<div class="group-title"><span>${t}</span><span>${fmt(sum(items, x => x.kcal))} kcal</span></div>
      <ul class="list">${items.map(m => `<li class="item"><div><div class="t">${esc(m.nome)}</div><div class="m">${m.prot ? `${fmt(m.prot)} g proteína · ` : ''}${m.hora}</div></div><div class="val">${fmt(m.kcal)} kcal</div>${del('del-meal', m.id)}</li>`).join('')}</ul>`;
  }).join('');

  return `${setupBanner()}
  <div class="grid-2">
    <div class="card hero" style="grid-template-columns:auto 1fr">
      <div class="ring-wrap">${ring(eaten / goal, 170, 14, eaten > goal * 1.1 ? 'var(--danger)' : 'var(--food)')}
        <div class="ring-center"><div class="big" style="font-size:2rem">${fmt(Math.abs(left))}</div><div class="lbl">${left >= 0 ? 'kcal restantes' : 'kcal acima'}</div></div>
      </div>
      <div class="goals" style="display:grid;gap:10px">
        ${stat('Consumido', fmt(eaten), 'kcal')}
        ${stat('Meta diária', fmt(goal), 'kcal')}
        <div class="stat"><div class="k">Proteína</div><div class="v">${fmt(prot)}<small>/ ${pg} g</small></div>${bar(prot / pg, 'var(--food)')}</div>
      </div>
    </div>
    <div class="card">
      <h2>Adicionar alimento</h2><p class="sub">Digite ou escolha um alimento da lista.</p>
      <form class="form" data-form="meal" id="meal-form">
        <label class="field"><span>Refeição</span><select name="tipo" id="meal-tipo">${MEAL_TYPES.map(t => `<option ${t === defaultMeal() ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Alimento</span><input name="nome" id="meal-nome" list="foods" required placeholder="Ex.: Frango grelhado (100g)" autocomplete="off" /></label>
        <datalist id="foods">${FOODS.map(f => `<option value="${f[0]}">`).join('')}</datalist>
        <div class="row">
          <label class="field"><span>Calorias (kcal)</span><input name="kcal" id="meal-kcal" type="number" min="0" max="5000" required /></label>
          <label class="field"><span>Proteína (g)</span><input name="prot" id="meal-prot" type="number" min="0" max="500" step="0.1" /></label>
        </div>
        <button class="btn food" id="meal-save">Adicionar</button>
      </form>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Refeições de hoje</h2>
      ${grouped || '<p class="empty">Nenhuma refeição registrada hoje.</p>'}
    </div>
    <div class="card">
      <h2>Como sua meta é calculada</h2><p class="sub">Fórmula Mifflin-St Jeor com base nas suas medidas.</p>
      <div class="grid-3" style="grid-template-columns:1fr 1fr">
        ${stat('Metabolismo basal', fmt(bmr()), 'kcal')}
        ${stat('Gasto diário', fmt(tdee()), 'kcal')}
        ${stat('Gasto em treinos hoje', fmt(kcalOut(k)), 'kcal')}
        ${stat('Saldo do dia', (eaten - tdee() - kcalOut(k) > 0 ? '+' : '') + fmt(eaten - tdee() - kcalOut(k)), 'kcal')}
      </div>
      <p class="note">Objetivo atual: ${objetivo}. Para ganhar os 30 pontos de alimentação, fique entre 90% e 110% da meta. Altere o objetivo na aba Medidas.</p>
    </div>
  </div>`;
}
function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'Café da manhã' : h < 15 ? 'Almoço' : h < 19 ? 'Lanche' : h < 22 ? 'Jantar' : 'Ceia';
}

/* ---------- Tela: Água ---------- */
function renderAgua() {
  const k = dkey(), drank = waterOf(k), goal = waterGoal(k), pct = drank / goal, water = peek(k).water;

  let week = '';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i), kk = dkey(d), v = waterOf(kk), g = waterGoal(kk);
    week += `<div class="week-col"><b>${v ? (v / 1000).toFixed(1) + 'L' : ''}</b>
      <div class="week-bar ${i === 0 ? 'today' : ''}" style="height:${Math.max(4, clamp01(v / g) * 100)}%;${v ? 'background:linear-gradient(180deg,var(--water),hsl(206 85% 40%))' : ''}"></div>
      <span>${DAYS_SHORT[d.getDay()]}</span></div>`;
  }

  return `${setupBanner()}
  <div class="card water-hero">
    <div class="glass"><div class="glass-fill" style="height:${clamp01(pct) * 100}%"></div><div class="glass-label">${Math.round(pct * 100)}%</div></div>
    <div>
      <p class="eyebrow">Bebido hoje</p>
      <div class="water-num">${fmt(drank)} <small>/ ${fmt(goal)} ml</small></div>
      <p class="note">${drank >= goal ? 'Meta de água batida! 30 pontos garantidos.' : `Faltam ${fmt(goal - drank)} ml · cerca de ${Math.ceil((goal - drank) / 250)} copos de 250 ml.`}</p>
      <div class="quick">
        ${[200, 250, 350, 500].map(ml => `<button class="btn" data-action="add-water" data-id="${ml}" id="water-${ml}">+${ml} ml<small>${ml === 200 ? 'copo pequeno' : ml === 250 ? 'copo' : ml === 350 ? 'lata' : 'garrafa'}</small></button>`).join('')}
      </div>
      <form class="form" data-form="water" id="water-form" style="grid-template-columns:1fr auto;margin-top:10px">
        <input name="ml" id="water-custom" type="number" min="10" max="3000" placeholder="Outra quantidade (ml)" required />
        <button class="btn water" id="water-save">Adicionar</button>
      </form>
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <h2>Registros de hoje</h2>
      ${water.length ? `<ul class="list" style="margin-top:12px">${[...water].reverse().map(w => `<li class="item"><div><div class="t">Água</div><div class="m">${w.hora}</div></div><div class="val c-water">${fmt(w.ml)} ml</div>${del('del-water', w.id)}</li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda. Comece com um copo!</p>'}
    </div>
    <div class="card">
      <h2>Últimos 7 dias</h2><p class="sub">Meta: 35 ml por kg (${fmt(P().peso)} kg) + 500 ml em dias de treino</p>
      <div class="week">${week}</div>
    </div>
  </div>`;
}

/* ---------- Tela: Medidas ---------- */
function renderMedidas() {
  const p = P(), v = bmi(), [cls, color] = bmiClass(v);
  const pinPos = clamp01((v - 15) / (40 - 15)) * 100;
  const ms = [...S.measures].sort((a, b) => b.data.localeCompare(a.data));
  const last = ms[0] || {};
  const rcq = last.cintura && last.quadril ? (last.cintura / last.quadril).toFixed(2).replace('.', ',') : '—';
  const dob = p.nascimento || { dia: 1, mes: 1, ano: 2000 };
  const alturaM = (p.altura_m || +(p.altura / 100).toFixed(2)).toFixed(2);

  const fields = [['peso', 'Peso', 'kg'], ['cintura', 'Cintura', 'cm'], ['quadril', 'Quadril', 'cm'], ['peito', 'Peito', 'cm'], ['braco', 'Braço', 'cm'], ['coxa', 'Coxa', 'cm'], ['gordura', '% Gordura', '%']];
  const cell = (m, i, f) => {
    if (m[f] == null || m[f] === '') return '<td>—</td>';
    const prev = ms.slice(i + 1).find(x => x[f] != null && x[f] !== '');
    let diff = '';
    if (prev) {
      const dlt = +(m[f] - prev[f]).toFixed(1);
      if (dlt) diff = `<span class="${dlt < 0 ? 'diff-down' : 'diff-up'}">${dlt > 0 ? '+' : ''}${dlt}</span>`;
    }
    return `<td>${m[f]}${diff}</td>`;
  };

  const pts = [...S.measures].filter(m => m.peso).sort((a, b) => a.data.localeCompare(b.data)).slice(-12);
  let spark = '<p class="empty">Registre o peso em pelo menos 2 datas para ver o gráfico de evolução.</p>';
  if (pts.length > 1) {
    const ws = pts.map(m => +m.peso), mn = Math.min(...ws) - 1, mx = Math.max(...ws) + 1;
    const xy = ws.map((w, i) => [(i / (ws.length - 1)) * 300, 80 - ((w - mn) / (mx - mn)) * 70]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    spark = `<svg class="spark" viewBox="-6 0 312 90" preserveAspectRatio="none">
      <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="hsl(42 92% 62%)" stop-opacity=".35"/><stop offset="1" stop-color="hsl(42 92% 62%)" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L300,90 L0,90 Z" fill="url(#sg)"/>
      <path d="${line}" fill="none" stroke="var(--body)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg><p class="note">${pts[0].peso} kg → ${pts[pts.length - 1].peso} kg nos últimos ${pts.length} registros</p>`;
  }

  return `
  <div class="grid-2">
    <div class="card">
      <h2>Meu perfil (${esc(p.nome || currentUserEmail)})</h2>
      <p class="sub">Idade calculada automaticamente: <b>${p.idade} anos</b> · Conta: ${esc(currentUserEmail)}</p>
      <form class="form" data-form="profile" id="profile-form">
        <label class="field"><span>Nome completo</span><input name="nome" id="pf-nome" type="text" value="${esc(p.nome || '')}" required /></label>
        <div class="field">
          <span>Data de nascimento (Dia / Mês / Ano) — ${p.idade} anos</span>
          <div class="dob-row">
            <input name="dia" id="pf-dia" type="number" min="1" max="31" value="${dob.dia}" required aria-label="Dia" />
            <select name="mes" id="pf-mes" required aria-label="Mês">
              ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
                .map((m, idx) => `<option value="${idx + 1}" ${+dob.mes === idx + 1 ? 'selected' : ''}>${pad(idx + 1)} · ${m}</option>`).join('')}
            </select>
            <input name="ano" id="pf-ano" type="number" min="1920" max="2020" value="${dob.ano}" required aria-label="Ano" />
          </div>
        </div>
        <div class="row">
          <label class="field"><span>Sexo</span><select name="sexo" id="pf-sexo"><option value="m" ${p.sexo === 'm' ? 'selected' : ''}>Masculino</option><option value="f" ${p.sexo === 'f' ? 'selected' : ''}>Feminino</option></select></label>
          <label class="field"><span>Altura (m)</span><input name="altura_m" id="pf-altura" type="number" step="0.01" min="1.00" max="2.50" value="${alturaM}" required /></label>
          <label class="field"><span>Peso (kg)</span><input name="peso" id="pf-peso" type="number" min="25" max="300" step="0.1" value="${p.peso}" required /></label>
        </div>
        <label class="field"><span>Nível de atividade</span><select name="atividade" id="pf-atividade">
          ${[[1.2, 'Sedentário (pouco ou nenhum exercício)'], [1.375, 'Leve (1–3 treinos por semana)'], [1.55, 'Moderado (3–5 treinos por semana)'], [1.725, 'Intenso (6–7 treinos por semana)'], [1.9, 'Atleta (treino 2× ao dia)']]
            .map(([val, t]) => `<option value="${val}" ${+p.atividade === val ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label class="field"><span>Objetivo</span><select name="objetivo" id="pf-objetivo">
          <option value="perder" ${p.objetivo === 'perder' ? 'selected' : ''}>Perder peso</option>
          <option value="manter" ${p.objetivo === 'manter' ? 'selected' : ''}>Manter o peso</option>
          <option value="ganhar" ${p.objetivo === 'ganhar' ? 'selected' : ''}>Ganhar massa</option>
        </select></label>
        <button class="btn body" id="profile-save">Salvar perfil</button>
      </form>
    </div>
    <div style="display:grid;gap:20px;align-content:start">
      <div class="card">
        <h2>IMC</h2>
        <div class="card-head" style="align-items:baseline;margin-top:6px"><div class="water-num" style="font-size:2.4rem">${v.toFixed(1).replace('.', ',')}</div><b class="${color}">${cls}</b></div>
        <div class="bmi-scale">
          <span style="flex:3.5;background:var(--water)"></span><span style="flex:6.5;background:var(--lime)"></span><span style="flex:5;background:var(--body)"></span><span style="flex:10;background:var(--food)"></span>
          <i class="bmi-pin" style="left:${pinPos}%"></i>
        </div>
        <div class="bmi-legend"><span>15</span><span>18,5</span><span>25</span><span>30</span><span>40</span></div>
      </div>
      <div class="card">
        <h2>Suas metas</h2><p class="sub">Calculadas automaticamente (${alturaM.replace('.', ',')} m · ${p.peso} kg · ${p.idade} anos)</p>
        <div class="grid-3" style="grid-template-columns:1fr 1fr">
          ${stat('Calorias/dia', fmt(kcalGoal()), 'kcal')}${stat('Água/dia', (waterGoal() / 1000).toFixed(2).replace('.', ','), 'L')}
          ${stat('Proteína/dia', proteinGoal(), 'g')}${stat('Cintura/quadril', rcq)}
        </div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Registrar medidas</h2><p class="sub">Meça sempre no mesmo horário, de preferência em jejum.</p>
      <form class="form" data-form="measure" id="measure-form">
        <label class="field"><span>Data</span><input name="data" id="ms-data" type="date" value="${dkey()}" max="${dkey()}" required /></label>
        <div class="row">${fields.map(([f, l, u]) => `<label class="field"><span>${l} (${u})</span><input name="${f}" id="ms-${f}" type="number" step="0.1" min="0" max="400" ${f === 'peso' ? `value="${p.peso}"` : ''} /></label>`).join('')}</div>
        <button class="btn body" id="measure-save">Salvar medidas</button>
      </form>
    </div>
    <div class="card">
      <h2>Evolução do peso</h2>${spark}
    </div>
  </div>

  <div class="card">
    <h2>Histórico de medidas</h2><p class="sub">Diferenças em relação à medição anterior.</p>
    ${ms.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Data</th>${fields.map(f => `<th>${f[1]}</th>`).join('')}<th></th></tr></thead>
      <tbody>${ms.map((m, i) => `<tr><td>${parseKey(m.data).toLocaleDateString('pt-BR')}</td>${fields.map(f => cell(m, i, f[0])).join('')}<td>${del('del-measure', m.id)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">Nenhuma medida registrada ainda.</p>'}
  </div>`;
}

/* ---------- Autenticação (Login, Cadastro e Sessão) ---------- */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('#tab-login').classList.toggle('active', isLogin);
  $('#tab-register').classList.toggle('active', !isLogin);
  $('#login-form').style.display = isLogin ? 'grid' : 'none';
  $('#register-form').style.display = isLogin ? 'none' : 'grid';
  $('#login-error').textContent = '';
  $('#register-error').textContent = '';
}

function enterAppWithUser(email, stateData) {
  currentUserEmail = email.toLowerCase().trim();
  localStorage.setItem(SESSION_KEY, currentUserEmail);
  S = hydrateState(stateData || loadUserState(currentUserEmail));
  localStorage.setItem(userStorageKey(currentUserEmail), JSON.stringify(S));

  $('#auth-gate').style.display = 'none';
  $('#app-shell').style.display = '';
  render(true);
}

async function logoutUser() {
  if (cloud.enabled && cloud.auth && cloud.fbModules) {
    try { await cloud.fbModules.authMod.signOut(cloud.auth); } catch (e) { /* ignora */ }
  }
  currentUserEmail = null;
  localStorage.removeItem(SESSION_KEY);
  $('#app-shell').style.display = 'none';
  $('#auth-gate').style.display = 'grid';
  switchAuthTab('login');
}

/* ---------- Renderização e rotas ---------- */
const RENDER = { inicio: renderInicio, treinos: renderTreinos, calorias: renderCalorias, agua: renderAgua, medidas: renderMedidas };
let route = 'inicio';
const openPlans = new Set();

function render(animate = false) {
  if (!currentUserEmail) {
    $('#app-shell').style.display = 'none';
    $('#auth-gate').style.display = 'grid';
    return;
  }
  const sc = score();
  const dt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today-label').textContent = dt.charAt(0).toUpperCase() + dt.slice(1);
  $('#page-title').textContent = TITLES[route];
  $('#topbar-score').innerHTML = `${ring(sc.total / 100, 34, 5, 'var(--lime)')}<b>${sc.total}</b><span>pts hoje</span>`;

  const firstName = (S.profile.nome || currentUserEmail).split(' ')[0];
  $('#topbar-user').innerHTML = `<b>${esc(firstName)}</b><button class="btn ghost small" data-action="logout" id="logout-btn" style="padding:4px 9px;font-size:.75rem">Sair</button>`;
  $('#nav-user').innerHTML = `
    <div>Conectado como <b style="color:var(--text)">${esc(S.profile.nome || firstName)}</b></div>
    <div class="nav-user-email">${esc(currentUserEmail)}</div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn ghost small" data-action="open-cloud-dialog" style="flex:1;padding:6px 8px;font-size:.75rem">☁️ Nuvem</button>
      <button class="btn danger small" data-action="logout" style="padding:6px 10px;font-size:.75rem">Sair</button>
    </div>`;

  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === route));

  const el = $(`#screen-${route}`);
  el.innerHTML = RENDER[route]();
  openPlans.forEach(id => $(`#plan-${id}`)?.classList.add('open'));
  if (animate) {
    el.classList.add('enter');
    setTimeout(() => el.classList.remove('enter'), 1100);
  }
}

function go() {
  const r = location.hash.slice(1);
  route = RENDER[r] ? r : 'inicio';
  if (currentUserEmail) {
    render(true);
    window.scrollTo({ top: 0 });
  }
}

function commit(msg) { save(); render(); if (msg) toast(msg); }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Ações ---------- */
function addSession(workoutId, tipo, min) {
  const w = S.workouts.find(x => x.id === workoutId);
  const before = score().total;
  today().sessions.push({ id: uid(), workoutId, nome: w ? w.nome : ACTIVITIES[tipo].nome, tipo, min, kcal: sessionKcal(tipo, min), hora: timeNow() });
  const gained = score().total - before;
  commit(gained > 0 ? `Treino concluído! +${gained} pontos 🔥` : 'Atividade registrada');
}

const ACTIONS = {
  'switch-auth-tab': id => switchAuthTab(id),
  'logout': () => logoutUser(),
  'open-cloud-dialog': () => {
    const cfg = getFirebaseConfig();
    $('#cloud-config-input').value = cfg ? JSON.stringify(cfg, null, 2) : '';
    $('#cloud-dialog-msg').textContent = cloud.enabled ? '✅ Conectado ao Firebase.' : 'Cole o firebaseConfig do seu projeto do Firebase.';
    $('#cloud-dialog').showModal();
  },
  'close-cloud-dialog': () => $('#cloud-dialog').close(),
  'clear-cloud-config': () => {
    localStorage.removeItem(FB_CONFIG_KEY);
    initCloud();
    $('#cloud-dialog').close();
    toast('Nuvem desativada · usando modo local');
  },
  'add-water': id => {
    const before = score().total;
    today().water.push({ id: uid(), ml: +id, hora: timeNow() });
    const gained = score().total - before;
    commit(`+${id} ml de água${gained > 0 ? ` · +${gained} pts` : ''}`);
  },
  'del-water': id => { today().water = today().water.filter(x => x.id !== id); commit('Registro removido'); },
  'del-meal': id => { today().meals = today().meals.filter(x => x.id !== id); commit('Alimento removido'); },
  'del-session': id => { today().sessions = today().sessions.filter(x => x.id !== id); commit('Treino removido'); },
  'del-measure': id => { S.measures = S.measures.filter(x => x.id !== id); commit('Medida removida'); },
  'toggle-day': id => {
    const d = +id;
    S.trainingDays = S.trainingDays.includes(d) ? S.trainingDays.filter(x => x !== d) : [...S.trainingDays, d].sort();
    commit();
  },
  'toggle-plan': id => {
    openPlans.has(id) ? openPlans.delete(id) : openPlans.add(id);
    $(`#plan-${id}`).classList.toggle('open');
  },
  'quick-session': id => addSession(id, 'musculacao', 60),
  'del-workout': id => {
    const w = S.workouts.find(x => x.id === id);
    if (w && confirm(`Excluir "${w.nome}"?`)) { S.workouts = S.workouts.filter(x => x.id !== id); commit('Treino excluído'); }
  },
  'new-workout': () => openWorkoutDialog(),
  'edit-workout': id => openWorkoutDialog(S.workouts.find(x => x.id === id)),
  'add-ex-row': () => addExRow(),
  'del-ex-row': (id, btn) => btn.closest('.ex-row').remove(),
  'close-dialog': () => $('#workout-dialog').close(),
};

/* ---------- Diálogo de treino ---------- */
function addExRow(e = { nome: '', series: 3, reps: '12', carga: '' }) {
  const row = document.createElement('div');
  row.className = 'ex-row';
  row.innerHTML = `<input name="ex-nome" placeholder="Exercício" value="${esc(e.nome)}" aria-label="Exercício" />
    <input name="ex-series" type="number" min="1" max="20" value="${esc(e.series)}" aria-label="Séries" />
    <input name="ex-reps" value="${esc(e.reps)}" aria-label="Repetições" />
    <input name="ex-carga" value="${esc(e.carga)}" placeholder="kg" aria-label="Carga" />
    <button type="button" class="icon-btn" data-action="del-ex-row" aria-label="Remover exercício">${ICON.trash}</button>`;
  $('#ex-rows').appendChild(row);
  if (!e.nome) row.querySelector('input').focus();
}
function openWorkoutDialog(w) {
  const f = $('#workout-form');
  f.reset();
  $('#workout-dialog-title').textContent = w ? 'Editar treino' : 'Novo treino';
  f.wid.value = w?.id || '';
  f.nome.value = w?.nome || '';
  f.foco.value = w?.foco || '';
  $('#ex-rows').innerHTML = '';
  (w?.exercicios?.length ? w.exercicios : [undefined]).forEach(e => addExRow(e));
  $('#workout-dialog').showModal();
  f.nome.focus();
}

/* ---------- Formulários ---------- */
const FORMS = {
  login: async f => {
    const email = f.email.value.trim().toLowerCase();
    const senha = f.senha.value;
    const errEl = $('#login-error');
    errEl.textContent = '';

    if (!isGmail(email)) {
      errEl.textContent = 'Use um endereço @gmail.com válido.';
      return;
    }

    // 1. Se a nuvem Firebase estiver ativa, autentica na nuvem primeiro
    if (cloud.enabled && cloud.auth) {
      try {
        const { signInWithEmailAndPassword } = cloud.fbModules.authMod;
        await signInWithEmailAndPassword(cloud.auth, email, senha);
        const remoteState = await pullFromCloud(email);
        const accs = loadAccounts();
        accs[email] = { email, senha };
        saveAccounts(accs);
        enterAppWithUser(email, remoteState || loadUserState(email));
        toast('Bem-vindo de volta! ☁️');
        return;
      } catch (err) {
        const code = err?.code || '';
        // Se o provedor Email/Senha ainda não foi ativado no painel do Firebase, tenta conta local/Firestore
        if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
          const remoteState = await pullFromCloud(email);
          const accs = loadAccounts();
          const acc = accs[email];
          if ((acc && acc.senha === senha) || remoteState) {
            enterAppWithUser(email, remoteState || loadUserState(email));
            toast('Bem-vindo de volta!');
            return;
          }
        }
        errEl.textContent = 'Gmail ou senha incorretos (ou conta ainda não cadastrada).';
        return;
      }
    }

    // 2. Autenticação local no aparelho
    const accs = loadAccounts();
    const acc = accs[email];
    if (!acc || acc.senha !== senha) {
      errEl.textContent = 'Gmail não encontrado ou senha incorreta.';
      return;
    }
    enterAppWithUser(email, loadUserState(email));
    toast('Bem-vindo de volta!');
  },

  register: async f => {
    const nome = f.nome.value.trim();
    const email = f.email.value.trim().toLowerCase();
    const senha = f.senha.value;
    const dia = +f.dia.value, mes = +f.mes.value, ano = +f.ano.value;
    const peso = +String(f.peso.value).replace(',', '.');
    const alturaM = normalizeMeters(f.altura_m.value);
    const sexo = f.sexo.value;
    const objetivo = f.objetivo.value;
    const errEl = $('#register-error');
    errEl.textContent = '';

    if (nome.split(/\s+/).length < 2) {
      errEl.textContent = 'Informe seu nome completo (nome e sobrenome).';
      return;
    }
    if (!isGmail(email)) {
      errEl.textContent = 'O e-mail precisa ser um @gmail.com válido.';
      return;
    }
    if (senha.length < 6) {
      errEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    const idade = calcAgeFromDOB(dia, mes, ano);
    if (idade == null) {
      errEl.textContent = 'Data de nascimento inválida. Verifique dia, mês e ano.';
      return;
    }
    if (!peso || peso < 25 || peso > 300) {
      errEl.textContent = 'Informe um peso válido em kg (entre 25 e 300 kg).';
      return;
    }
    if (!alturaM) {
      errEl.textContent = 'Informe a altura em metros (ex.: 1.75).';
      return;
    }

    const alturaCm = Math.round(alturaM * 100);
    const newState = structuredClone(DEFAULT_STATE);
    newState.profile = {
      nome,
      email,
      nascimento: { dia, mes, ano },
      sexo,
      idade,
      altura: alturaCm,
      altura_m: alturaM,
      peso,
      atividade: 1.55,
      objetivo,
      configurado: true,
    };
    newState.measures = [{ id: uid(), data: dkey(), peso }];

    // 1. Se a nuvem Firebase estiver ativa, cria a conta no Firebase Auth + Firestore
    if (cloud.enabled && cloud.auth) {
      try {
        const { createUserWithEmailAndPassword } = cloud.fbModules.authMod;
        await createUserWithEmailAndPassword(cloud.auth, email, senha);
      } catch (err) {
        const code = err?.code || '';
        if (code === 'auth/email-already-in-use') {
          errEl.textContent = 'Esse Gmail já possui conta cadastrada. Vá em "Entrar".';
          return;
        }
        // Se o provedor Email/Senha ainda não foi ativado no console do Firebase, não bloqueia o cadastro
        if (code !== 'auth/configuration-not-found' && code !== 'auth/operation-not-allowed') {
          errEl.textContent = 'Erro ao criar conta na nuvem: ' + (err.message || code);
          return;
        }
      }
    } else {
      const accs = loadAccounts();
      if (accs[email]) {
        errEl.textContent = 'Esse Gmail já está cadastrado neste aparelho. Vá em "Entrar".';
        return;
      }
    }

    const accs = loadAccounts();
    accs[email] = { email, senha, nome };
    saveAccounts(accs);
    enterAppWithUser(email, newState);
    await syncToCloud();
    toast(`Conta criada! Bem-vindo, ${nome.split(' ')[0]} 🎉`);
  },

  cloud: async f => {
    const cfg = parseFirebaseConfigInput(f.config.value);
    if (!cfg) {
      $('#cloud-dialog-msg').textContent = '❌ Formato inválido. Cole o objeto firebaseConfig com apiKey e projectId.';
      return;
    }
    localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg));
    const ok = await initCloud();
    if (ok) {
      $('#cloud-dialog').close();
      if (currentUserEmail) await syncToCloud();
      toast('☁️ Nuvem Firebase conectada com sucesso!');
    } else {
      $('#cloud-dialog-msg').textContent = '❌ Não foi possível conectar. Verifique os dados do Firebase.';
    }
  },

  session: f => addSession(f.workout.value, f.tipo.value, +f.min.value),
  meal: f => {
    const before = score().total;
    today().meals.push({ id: uid(), tipo: f.tipo.value, nome: f.nome.value.trim(), kcal: +f.kcal.value, prot: +f.prot.value || 0, hora: timeNow() });
    const gained = score().total - before;
    commit(`${f.nome.value.trim()} adicionado${gained > 0 ? ` · +${gained} pts` : ''}`);
    setTimeout(() => $('#meal-nome')?.focus(), 0);
  },
  water: f => ACTIONS['add-water'](+f.ml.value),
  profile: f => {
    const dia = +f.dia.value, mes = +f.mes.value, ano = +f.ano.value;
    const idade = calcAgeFromDOB(dia, mes, ano);
    if (idade == null) return toast('Data de nascimento inválida');
    const alturaM = normalizeMeters(f.altura_m.value);
    if (!alturaM) return toast('Informe a altura em metros (ex.: 1.75)');
    Object.assign(S.profile, {
      nome: f.nome.value.trim(),
      nascimento: { dia, mes, ano },
      sexo: f.sexo.value,
      idade,
      altura_m: alturaM,
      altura: Math.round(alturaM * 100),
      peso: +f.peso.value,
      atividade: +f.atividade.value,
      objetivo: f.objetivo.value,
      configurado: true,
    });
    commit('Perfil salvo · metas atualizadas');
  },
  measure: f => {
    const m = { id: uid(), data: f.data.value };
    ['peso', 'cintura', 'quadril', 'peito', 'braco', 'coxa', 'gordura'].forEach(k => { if (f[k].value !== '') m[k] = +f[k].value; });
    if (Object.keys(m).length <= 2) return toast('Preencha pelo menos uma medida');
    S.measures.push(m);
    const latest = [...S.measures].filter(x => x.peso).sort((a, b) => b.data.localeCompare(a.data))[0];
    if (latest) S.profile.peso = latest.peso;
    commit('Medidas salvas');
  },
  workout: f => {
    const exercicios = $$('.ex-row', f).map(r => ({
      nome: r.querySelector('[name="ex-nome"]').value.trim(),
      series: +r.querySelector('[name="ex-series"]').value || 1,
      reps: r.querySelector('[name="ex-reps"]').value.trim(),
      carga: r.querySelector('[name="ex-carga"]').value.trim(),
    })).filter(e => e.nome);
    const data = { nome: f.nome.value.trim(), foco: f.foco.value.trim(), exercicios };
    const existing = S.workouts.find(x => x.id === f.wid.value);
    if (existing) Object.assign(existing, data); else S.workouts.push({ id: uid(), ...data });
    $('#workout-dialog').close();
    commit(existing ? 'Treino atualizado' : 'Treino criado');
  },
};

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = ACTIONS[btn.dataset.action];
  if (fn) { e.preventDefault(); fn(btn.dataset.id, btn); }
});

document.addEventListener('submit', e => {
  const f = e.target, fn = FORMS[f.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(f);
});

document.addEventListener('input', e => {
  if (e.target.id === 'meal-nome') {
    const food = FOODS.find(f => f[0] === e.target.value);
    if (food) { $('#meal-kcal').value = food[1]; $('#meal-prot').value = food[2]; }
  }
  if (e.target.id === 'session-workout') $('#session-tipo').value = e.target.value ? 'musculacao' : 'caminhada';

  // Mostra a idade calculada em tempo real no cadastro
  if (['reg-dia', 'reg-mes', 'reg-ano'].includes(e.target.id)) {
    const age = calcAgeFromDOB($('#reg-dia')?.value, $('#reg-mes')?.value, $('#reg-ano')?.value);
    const preview = $('#reg-age-preview');
    if (preview) preview.textContent = age != null ? `— ${age} anos` : '';
  }
});

window.addEventListener('hashchange', go);

let lastDay = dkey();
setInterval(() => { if (dkey() !== lastDay) { lastDay = dkey(); if (currentUserEmail) render(); } }, 60000);

/* ---------- Inicialização ---------- */
(async function bootstrap() {
  await initCloud();
  const savedEmail = localStorage.getItem(SESSION_KEY);
  if (savedEmail) {
    let state = loadUserState(savedEmail);
    if (cloud.enabled) {
      const remote = await pullFromCloud(savedEmail);
      if (remote) state = remote;
    }
    enterAppWithUser(savedEmail, state);
  } else {
    render();
  }
})();
