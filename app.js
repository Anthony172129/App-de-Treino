'use strict';

/* =========================================================
   Pulso — app de treino com Contas (Gmail + senha), Nuvem (Firebase),
   Execução de Treino Série por Série, Notificações e Hidratação no Treino
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
  notifications: {
    enabled: true,
    waterIntervalMin: 90,   // Lembrete de água a cada 90 min
    mealHours: [8, 12, 16, 20], // Horários de cobrança de refeição
    lastWaterRemindAt: 0,
    lastMealRemindHour: -1,
    lastMissedPromptAt: 0,
  },
  lastWorkoutAt: 0, // Timestamp (ms) do último treino concluído para cobrar após 24h
  missedReasons: [], // Histórico de justificativas de falta
  trainingDays: [1, 2, 3, 4, 5, 6], // 0 = domingo
  bestStreak: 0,
  workouts: [
    { id: 'a', nome: 'Treino A', foco: 'Peito e tríceps', exercicios: [
      { nome: 'Supino reto', series: 4, reps: '10', carga: '40' },
      { nome: 'Supino inclinado halteres', series: 3, reps: '12', carga: '14' },
      { nome: 'Crucifixo', series: 3, reps: '12', carga: '10' },
      { nome: 'Tríceps corda', series: 4, reps: '12', carga: '20' },
    ] },
    { id: 'b', nome: 'Treino B', foco: 'Costas e bíceps', exercicios: [
      { nome: 'Puxada frontal', series: 4, reps: '10', carga: '45' },
      { nome: 'Remada curvada', series: 4, reps: '10', carga: '30' },
      { nome: 'Rosca direta', series: 3, reps: '12', carga: '12' },
      { nome: 'Rosca martelo', series: 3, reps: '12', carga: '10' },
    ] },
    { id: 'c', nome: 'Treino C', foco: 'Pernas e ombros', exercicios: [
      { nome: 'Agachamento livre', series: 4, reps: '10', carga: '50' },
      { nome: 'Leg press', series: 4, reps: '12', carga: '120' },
      { nome: 'Cadeira extensora', series: 3, reps: '15', carga: '35' },
      { nome: 'Desenvolvimento', series: 4, reps: '10', carga: '12' },
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
  if (num >= 100 && num <= 250) num = +(num / 100).toFixed(2);
  if (num < 1.0 || num > 2.5) return null;
  return +num.toFixed(2);
}

const isGmail = email => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(String(email || '').trim());

/* ---------- Estado, Sessão Ativa de Treino e Contas ---------- */
let currentUserEmail = null;
let S = structuredClone(DEFAULT_STATE);
let cloud = { enabled: false, auth: null, db: null, fbModules: null };

// Guarda o treino aberto na tela de execução série por série:
// { workoutId, min, tipo, sets: { [exIdx]: [ { reps, carga, done } ] } }
let activeExecution = null;

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {}; }
  catch (e) { return {}; }
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
    notifications: { ...base.notifications, ...(saved.notifications || {}) },
    missedReasons: saved.missedReasons || [],
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
  try {
    const saved = JSON.parse(localStorage.getItem(FB_CONFIG_KEY));
    if (saved && saved.apiKey && saved.projectId) return saved;
  } catch (e) { /* ignora */ }
  if (DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey) return DEFAULT_FIREBASE_CONFIG;
  return null;
}

function parseFirebaseConfigInput(rawText) {
  const txt = String(rawText || '').trim();
  if (!txt) return null;
  try {
    const parsed = JSON.parse(txt);
    if (parsed.apiKey && parsed.projectId) return parsed;
  } catch (e) { /* extrai de snippet JS */ }
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

/* ---------- Cálculos & Hidratação Científica ---------- */
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

// Meta basal do dia: 35 ml por kg de peso corporal
const basalWaterGoal = () => Math.round((P().peso * 35) / 50) * 50;

// Água extra recomendada DURANTE o treino (reposição de suor — ACSM / SBME):
// ~0.12 ml por kg por minuto de exercício (ex.: para 75 kg em 60 min = ~540 ml -> arredondado para 550 ml,
// ou ~180–220 ml a cada 15–20 minutos de treino).
function workoutSweatWaterMl(min = 60, met = 5) {
  const intensityFactor = met >= 7.5 ? 0.15 : 0.12; // treinos mais intensos transpiram mais
  const raw = P().peso * intensityFactor * min;
  return Math.max(200, Math.round(raw / 50) * 50);
}

// Total de água de treino exigida no dia k (soma dos treinos feitos ou estimativa de 60 min se for dia de treino)
function todayWorkoutWaterNeed(k = dkey()) {
  const sessions = peek(k).sessions;
  if (sessions.length) {
    return sum(sessions, s => workoutSweatWaterMl(s.min || 60, ACTIVITIES[s.tipo]?.met || 5));
  }
  return 0;
}

// Meta total do dia = Meta basal (35 ml/kg) + Água perdida transpirando nos treinos registrados no dia
const waterGoal = (k = dkey()) => basalWaterGoal() + todayWorkoutWaterNeed(k);
const waterOf = k => sum(peek(k).water, x => x.ml);
const workoutWaterOf = k => sum(peek(k).water.filter(w => w.duranteTreino), x => x.ml);

const kcalIn = k => sum(peek(k).meals, x => x.kcal);
const protIn = k => sum(peek(k).meals, x => x.prot);
const kcalOut = k => sum(peek(k).sessions, x => x.kcal);
const trained = k => peek(k).sessions.length > 0;
const isTrainingDay = d => S.trainingDays.includes(d.getDay());
const sessionKcal = (tipo, min) => Math.round((ACTIVITIES[tipo]?.met || 5) * P().peso * (min / 60));

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

/* ---------- Sistema de Web Push Notifications Reais (Service Worker + VAPID) ---------- */
// Chave pública VAPID exclusiva do projeto Pulso (par da VAPID_PRIVATE_KEY no GitHub Actions):
const VAPID_PUBLIC_KEY = 'BNsRjJvsT-9CCBTZSWEdQ6WgavTeJ8Efwz9vUt2F0Rqx0fPTNbfBsm5fVGmbooYKukQJmDot6jUmWoSkwp08lYw';

let swRegistration = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    return swRegistration;
  } catch (e) {
    console.warn('Falha ao registrar Service Worker:', e);
    return null;
  }
}

async function subscribeUserToWebPush() {
  const reg = swRegistration || (await registerServiceWorker());
  if (!reg || !('pushManager' in reg)) return null;

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const subJson = sub.toJSON();
    S.notifications.pushSubscription = subJson;
    S.notifications.pushSubscribedAt = Date.now();
    S.notifications.timezoneOffset = new Date().getTimezoneOffset();
    save(); // Salva localmente e envia a subscription para o Firestore (usuarios_pulso)
    return subJson;
  } catch (err) {
    console.warn('Não foi possível criar assinatura Web Push:', err);
    return null;
  }
}

async function sendBrowserNotification(title, body, tag, url = './index.html#inicio') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = swRegistration || (await registerServiceWorker());
    if (reg && reg.showNotification) {
      await reg.showNotification(title, {
        body,
        tag,
        renotify: true,
        vibrate: [200, 100, 200],
        icon: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
        data: { url },
      });
      return;
    }
    new Notification(title, { body, tag, icon: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png' });
  } catch (e) { /* fallback */ }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    toast('Neste dispositivo, adicione o site à Tela de Início para ativar Web Push.');
    return;
  }
  const perm = await Notification.requestPermission();
  S.notifications.enabled = true;
  if (perm === 'granted') {
    const sub = await subscribeUserToWebPush();
    await sendBrowserNotification(
      'Pulso · Web Push Ativado! 🔔',
      sub
        ? 'Pronto! Seu celular receberá notificações reais de Água, Alimentação e Treino (24h) mesmo com o navegador fechado.'
        : 'Notificações do sistema ativadas para Água, Alimentação e Treino!',
      'pulso-welcome'
    );
    render();
    toast(sub ? '✅ Web Push (VAPID) conectado e salvo na nuvem!' : '🔔 Notificações ativadas!');
  } else {
    save();
    render();
    toast('Permissão negada no navegador. Libere nas configurações do site.');
  }
}

function getLastWorkoutTimestamp() {
  if (S.lastWorkoutAt) return S.lastWorkoutAt;
  // Procura nos logs o último dia com treino
  const days = Object.keys(S.log).filter(k => S.log[k]?.sessions?.length).sort();
  if (!days.length) return 0;
  const lastDayKey = days[days.length - 1];
  const d = parseKey(lastDayKey);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
}

function getActiveReminders() {
  if (!currentUserEmail) return [];
  const k = dkey();
  const now = new Date();
  const hour = now.getHours();
  const alerts = [];

  // 1. Verifica se passaram 24 horas desde o último treino em dia de treino
  const lastW = getLastWorkoutTimestamp();
  const hoursSinceWorkout = lastW ? (Date.now() - lastW) / 3600000 : 0;
  const alreadyJustifiedToday = (S.missedReasons || []).some(r => r.data === k);

  if (lastW > 0 && hoursSinceWorkout >= 24 && !trained(k) && isTrainingDay(now) && !alreadyJustifiedToday) {
    const hRound = Math.floor(hoursSinceWorkout);
    alerts.push({
      type: 'warn',
      id: 'missed-24h',
      text: `⚠️ Faz <b>${hRound}h</b> desde o seu último treino! Por que você ainda não treinou hoje?`,
      actions: `
        <button class="btn primary small" data-action="go-train-now">Treinar agora</button>
        <button class="btn ghost small" data-action="open-missed-dialog">Explicar motivo</button>
      `,
    });
  }

  // 2. Cobrança de Água (se bebeu menos que o esperado até a hora atual do dia)
  const expectedWaterRatio = clamp01((hour - 7) / 14); // das 7h às 21h
  const currentWaterRatio = waterOf(k) / waterGoal(k);
  if (hour >= 8 && currentWaterRatio < expectedWaterRatio - 0.15 && waterOf(k) < waterGoal(k)) {
    const falta = waterGoal(k) - waterOf(k);
    alerts.push({
      type: 'water',
      id: 'water-remind',
      text: `💧 <b>Hora de beber água!</b> Você bebeu ${fmt(waterOf(k))} ml hoje (faltam ${fmt(falta)} ml para a meta). Registre agora!`,
      actions: `
        <button class="btn water small" data-action="add-water" data-id="250">+250 ml agora</button>
        <a class="btn ghost small" href="#agua">Abrir Água</a>
      `,
    });
  }

  // 3. Cobrança de Alimentação (cobra café após 8h, almoço após 12h, lanche após 16h, jantar após 20h)
  const meals = peek(k).meals;
  let missingMeal = null;
  if (hour >= 8 && hour < 12 && !meals.length) missingMeal = 'Café da manhã';
  else if (hour >= 12 && hour < 16 && !meals.some(m => m.tipo === 'Almoço')) missingMeal = 'Almoço';
  else if (hour >= 16 && hour < 19 && meals.length < 2) missingMeal = 'Lanche da tarde';
  else if (hour >= 19 && !meals.some(m => m.tipo === 'Jantar')) missingMeal = 'Jantar';

  if (missingMeal) {
    alerts.push({
      type: 'food',
      id: 'food-remind',
      text: `🍽️ <b>Se alimente e registre!</b> Ainda não vimos seu registro de <b>${missingMeal}</b> hoje (${fmt(kcalIn(k))} / ${fmt(kcalGoal())} kcal).`,
      actions: `<a class="btn food small" href="#calorias">Registrar refeição</a>`,
    });
  }

  return alerts;
}

function checkPeriodicNotifications() {
  if (!currentUserEmail || !S.notifications?.enabled) return;
  const now = Date.now();
  const k = dkey();
  const hour = new Date().getHours();

  // 1. Notificação de 24h após o último treino
  const lastW = getLastWorkoutTimestamp();
  const hoursSince = lastW ? (now - lastW) / 3600000 : 0;
  const alreadyJustifiedToday = (S.missedReasons || []).some(r => r.data === k);
  if (lastW > 0 && hoursSince >= 24 && !trained(k) && isTrainingDay(new Date()) && !alreadyJustifiedToday) {
    if (now - (S.notifications.lastMissedPromptAt || 0) > 4 * 3600000) {
      S.notifications.lastMissedPromptAt = now;
      save();
      sendBrowserNotification(
        '⚠️ Faz 24h desde o seu último treino!',
        'Você ainda não registrou seu treino de hoje. Por que você faltou?',
        'pulso-missed-24h'
      );
      const dlg = $('#missed-workout-dialog');
      if (dlg && !dlg.open) {
        $('#missed-workout-sub').textContent = `Já se passaram ${Math.floor(hoursSince)} horas desde o seu último treino. Conta pra gente o que houve ou inicie seu treino agora!`;
        dlg.showModal();
      }
    }
  }

  // 2. Notificação periódica de Água
  const intervalMs = (S.notifications.waterIntervalMin || 90) * 60000;
  if (hour >= 8 && hour <= 22 && waterOf(k) < waterGoal(k)) {
    if (now - (S.notifications.lastWaterRemindAt || 0) >= intervalMs) {
      S.notifications.lastWaterRemindAt = now;
      save();
      sendBrowserNotification(
        '💧 Beba água e registre no Pulso!',
        `Você bebeu ${fmt(waterOf(k))} ml de ${fmt(waterGoal(k))} ml hoje. Tome um copo de 250 ml agora!`,
        'pulso-water'
      );
    }
  }

  // 3. Notificação nos horários de refeição
  if ([8, 12, 16, 20].includes(hour) && S.notifications.lastMealRemindHour !== hour) {
    S.notifications.lastMealRemindHour = hour;
    save();
    sendBrowserNotification(
      '🍽️ Hora de se alimentar!',
      `Não esqueça de fazer sua refeição e registrar as calorias no Pulso.`,
      'pulso-meal'
    );
  }
}

function renderAlertBanners() {
  const box = $('#alert-banners');
  if (!box) return;
  const alerts = getActiveReminders();
  box.innerHTML = alerts.map(a => `
    <div class="alert-banner ${a.type}">
      <div>${a.text}</div>
      <div class="alert-banner-actions">${a.actions}</div>
    </div>
  `).join('');
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
  const notifPerm = ('Notification' in window) ? Notification.permission : 'unsupported';

  const goals = [
    { icon: ICON.dumbbell, cls: 'lime', color: 'var(--lime)', title: 'Treino',
      desc: trained(k) ? `Concluído · ${peek(k).sessions.map(s => esc(s.nome)).join(', ')}` : sc.rest ? 'Dia de descanso — pontos garantidos' : 'Toque na aba Treinos para abrir e preencher suas séries',
      pct: sc.tr, pts: sc.treino, max: POINTS.treino },
    { icon: ICON.drop, cls: 'water', color: 'var(--water)', title: 'Água (Dia + Treino)',
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
    <div class="ring-wrap">${ring(sc.total / 100, 190, 16, 'var(--lime)')}
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
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>🔔 Lembretes & Cobrança Automática</h2>
        <p class="sub" style="margin-bottom:6px">Notificações de "Beba água", "Se alimente" e alerta de 24h após o último treino caso você falte.</p>
      </div>
      <button class="btn ${notifPerm === 'granted' ? 'ghost' : 'primary'} small" data-action="enable-notifications">
        ${notifPerm === 'granted' ? '✅ Notificações Ativas (Testar)' : '🔔 Ativar notificações no celular'}
      </button>
    </div>
    <form class="form" data-form="notif-settings" style="margin-top:8px">
      <div class="row-2">
        <label class="field">
          <span>Lembrar de beber água a cada:</span>
          <select name="waterIntervalMin">
            ${[[60, '60 minutos (1h)'], [90, '90 minutos (1h30)'], [120, '120 minutos (2h)']].map(([v, l]) => `<option value="${v}" ${+S.notifications.waterIntervalMin === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Cobrança de falta (24h após último treino)</span>
          <input value="Ativada automaticamente" disabled />
        </label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn ghost small">Salvar intervalo</button>
        <button type="button" class="btn ghost small" data-action="open-missed-dialog">Simular cobrança de 24h sem treino</button>
      </div>
    </form>
  </div>`;
}

/* ---------- Tela: Treinos (Com Formulário Série por Série ao tocar no treino) ---------- */
function startWorkoutExecution(workoutId) {
  const w = S.workouts.find(x => x.id === workoutId);
  if (!w) return;
  const sets = {};
  w.exercicios.forEach((ex, exIdx) => {
    const count = Math.max(1, Number(ex.series) || 1);
    sets[exIdx] = Array.from({ length: count }, () => ({
      reps: String(ex.reps || '10'),
      carga: String(ex.carga || '').replace(/kg/i, '').trim(),
      done: true,
    }));
  });
  activeExecution = { workoutId: w.id, min: 60, tipo: 'musculacao', sets };
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderExecutionView() {
  const w = S.workouts.find(x => x.id === activeExecution?.workoutId);
  if (!w) { activeExecution = null; return ''; }
  const sweatMl = workoutSweatWaterMl(activeExecution.min || 60, ACTIVITIES[activeExecution.tipo]?.met || 5);
  const per15Min = Math.round(sweatMl / Math.max(1, (activeExecution.min || 60) / 15));

  return `
  <div class="exec-screen" id="exec-screen">
    <div class="card-head">
      <div>
        <p class="eyebrow" style="color:var(--lime)">Executando treino · Preencha Repetições e Carga de cada série</p>
        <h2>${esc(w.nome)} — ${esc(w.foco)}</h2>
      </div>
      <button type="button" class="btn ghost small" data-action="cancel-execution">← Voltar aos treinos</button>
    </div>

    <div class="sweat-box">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <b class="c-water">💧 Hidratação durante este treino: ~${fmt(sweatMl)} ml</b>
          <p class="note" style="margin:2px 0 0">Para repor o suor, beba cerca de <b>${fmt(per15Min)} ml a cada 15 min</b> de treino.</p>
        </div>
        <button type="button" class="btn water small" data-action="add-workout-water" data-id="${per15Min}">+ Beber ${per15Min} ml no treino</button>
      </div>
    </div>

    <form class="form" id="exec-workout-form" data-form="exec-workout">
      <div class="row-2">
        <label class="field">
          <span>Modalidade</span>
          <select name="tipo" id="exec-tipo">
            ${Object.entries(ACTIVITIES).map(([id, a]) => `<option value="${id}" ${activeExecution.tipo === id ? 'selected' : ''}>${a.nome}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Duração do treino (min)</span>
          <input name="min" id="exec-min" type="number" min="5" max="600" value="${activeExecution.min}" required />
        </label>
      </div>

      ${w.exercicios.map((ex, exIdx) => {
        const exSets = activeExecution.sets[exIdx] || [];
        return `
        <div class="exec-ex-card" data-ex-idx="${exIdx}">
          <div class="exec-ex-head">
            <div class="exec-ex-title">${exIdx + 1}. ${esc(ex.nome)}</div>
            <div class="exec-ex-meta">${exSets.length} ${exSets.length === 1 ? 'série' : 'séries'} · Meta: ${esc(ex.reps)} reps</div>
          </div>
          <div class="sets-table-head">
            <span>Série</span>
            <span>Repetições</span>
            <span>Carga (kg)</span>
            <span>OK</span>
          </div>
          ${exSets.map((s, sIdx) => `
            <div class="set-row ${s.done ? 'done' : ''}" data-ex="${exIdx}" data-set="${sIdx}">
              <div class="set-badge">${sIdx + 1}ª</div>
              <input type="text" inputmode="numeric" name="reps-${exIdx}-${sIdx}" value="${esc(s.reps)}" placeholder="Reps" aria-label="Repetições da ${sIdx + 1}ª série" required />
              <input type="text" inputmode="decimal" name="carga-${exIdx}-${sIdx}" value="${esc(s.carga)}" placeholder="Ex: 20kg" aria-label="Carga da ${sIdx + 1}ª série" />
              <button type="button" class="set-check" data-action="toggle-set-done" data-ex="${exIdx}" data-set="${sIdx}" title="Marcar série concluída">✓</button>
            </div>
          `).join('')}
        </div>`;
      }).join('')}

      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px">
        <button type="button" class="btn ghost" data-action="cancel-execution">Cancelar</button>
        <button type="submit" class="btn primary" id="finish-exec-btn">✅ Finalizar e salvar treino</button>
      </div>
    </form>
  </div>`;
}

function renderTreinos() {
  if (activeExecution) {
    return renderExecutionView();
  }

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

  return `
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Meus treinos</h2>
        <p class="sub">Toque em um treino para abrir a ficha e preencher as <b>Repetições e Carga</b> de cada série.</p>
      </div>
      <button class="btn primary small" data-action="new-workout" id="new-workout">+ Criar novo treino</button>
    </div>
    ${S.workouts.length ? S.workouts.map(w => `
      <div class="plan" id="plan-${w.id}">
        <div class="plan-head" data-action="open-workout-exec" data-id="${w.id}">
          <div>
            <div class="plan-name">${esc(w.nome)}</div>
            <div class="plan-focus">${esc(w.foco)} · ${w.exercicios.length} exercícios (${sum(w.exercicios, e => e.series)} séries no total)</div>
          </div>
          <button type="button" class="btn primary small" data-action="open-workout-exec" data-id="${w.id}">Abrir e treinar →</button>
        </div>
        <div class="plan-actions">
          <button class="btn ghost small" data-action="edit-workout" data-id="${w.id}">Editar exercícios / séries</button>
          <button class="btn danger small" data-action="del-workout" data-id="${w.id}">Excluir</button>
        </div>
      </div>`).join('') : '<p class="empty">Nenhum treino cadastrado. Toque em "+ Criar novo treino".</p>'}
  </div>

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
      <h2>Treinos concluídos hoje</h2>
      <p class="sub">${sessions.length ? `${fmt(kcalOut(k))} kcal gastas hoje` : 'Nenhum treino finalizado hoje ainda.'}</p>
      ${sessions.length ? `<ul class="list">${sessions.map(s => `
        <li class="item">
          <div>
            <div class="t">${esc(s.nome)}</div>
            <div class="m">${ACTIVITIES[s.tipo]?.nome || 'Treino'} · ${s.min} min · ${s.hora}</div>
            ${s.detalhes?.length ? `<div class="m" style="margin-top:4px;color:var(--text)">${s.detalhes.map(d => `${esc(d.nome)}: ${d.series.map(sr => `${esc(sr.reps)}x${esc(sr.carga || '0')}kg`).join(', ')}`).join(' · ')}</div>` : ''}
          </div>
          <div class="val">${fmt(s.kcal)} kcal</div>
          ${del('del-session', s.id)}
        </li>`).join('')}</ul>` : '<p class="empty">Toque em "Abrir e treinar" em um dos seus treinos acima para preencher suas séries.</p>'}
    </div>
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
    <div class="card hero" style="grid-template-columns:auto minmax(0,1fr)">
      <div class="ring-wrap">${ring(eaten / goal, 165, 14, eaten > goal * 1.1 ? 'var(--danger)' : 'var(--food)')}
        <div class="ring-center"><div class="big" style="font-size:1.9rem">${fmt(Math.abs(left))}</div><div class="lbl">${left >= 0 ? 'kcal restantes' : 'kcal acima'}</div></div>
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
        <div class="row-2">
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
      <p class="note">Objetivo atual: ${objetivo}. Para ganhar os 30 pontos de alimentação, fique entre 90% e 110% da meta.</p>
    </div>
  </div>`;
}
function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'Café da manhã' : h < 15 ? 'Almoço' : h < 19 ? 'Lanche' : h < 22 ? 'Jantar' : 'Ceia';
}

/* ---------- Tela: Água (Com Cálculo de Água do Dia + Água Durante o Treino) ---------- */
function renderAgua() {
  const k = dkey(), drank = waterOf(k), goal = waterGoal(k), pct = drank / goal, water = peek(k).water;
  const basal = basalWaterGoal();
  const trainedMinutes = sum(peek(k).sessions, s => s.min || 60);
  const estSweat60 = workoutSweatWaterMl(60, 5);
  const todaySweatNeed = todayWorkoutWaterNeed(k) || estSweat60;
  const drankInWorkout = workoutWaterOf(k);
  const sip15 = Math.round(estSweat60 / 4);

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
      <p class="eyebrow">Bebido hoje (Dia + Treino)</p>
      <div class="water-num">${fmt(drank)} <small>/ ${fmt(goal)} ml</small></div>
      <p class="note">${drank >= goal ? 'Meta de água batida! 30 pontos garantidos.' : `Faltam ${fmt(goal - drank)} ml · cerca de ${Math.ceil((goal - drank) / 250)} copos de 250 ml.`}</p>
      <div class="quick">
        ${[200, 250, 350, 500].map(ml => `<button class="btn" data-action="add-water" data-id="${ml}" id="water-${ml}">+${ml} ml<small>${ml === 200 ? 'copo pequeno' : ml === 250 ? 'copo' : ml === 350 ? 'lata' : 'garrafa'}</small></button>`).join('')}
      </div>
      <form class="form" data-form="water" id="water-form" style="grid-template-columns:minmax(0,1fr) auto;margin-top:10px">
        <input name="ml" id="water-custom" type="number" min="10" max="3000" placeholder="Outra quantidade (ml)" required />
        <button class="btn water" id="water-save">Adicionar</button>
      </form>
    </div>
  </div>

  <!-- Card específico de Hidratação Durante o Treino (reposição de suor) -->
  <div class="card">
    <div class="card-head">
      <div>
        <h2>💦 Água Durante o Treino (Reposição do Suor)</h2>
        <p class="sub">Segundo o Colégio Americano de Medicina do Esporte (ACSM), além da água do dia (${fmt(basal)} ml), você perde líquido transpirando e deve repor durante o treino.</p>
      </div>
    </div>
    <div class="grid-3">
      ${stat('Água basal do dia', fmt(basal), 'ml (35ml/kg)')}
      ${stat('Meta durante o treino', fmt(todaySweatNeed), `ml (${trainedMinutes || 60} min)`)}
      ${stat('Bebido no treino hoje', fmt(drankInWorkout), `de ${fmt(todaySweatNeed)} ml`)}
    </div>
    ${bar(drankInWorkout / todaySweatNeed, 'var(--water)')}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px">
      <p class="note" style="margin:0">Recomendação para o seu peso (${P().peso} kg): beber <b>~${fmt(sip15)} ml a cada 15 minutos</b> durante o exercício.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn water small" data-action="add-workout-water" data-id="${sip15}">+${sip15} ml (gole de 15 min)</button>
        <button class="btn ghost small" data-action="add-workout-water" data-id="500">+500 ml (garrafa de treino)</button>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Registros de hoje</h2>
      ${water.length ? `<ul class="list" style="margin-top:12px">${[...water].reverse().map(w => `<li class="item"><div><div class="t">${w.duranteTreino ? '💦 Água durante o treino' : '💧 Água do dia'}</div><div class="m">${w.hora}</div></div><div class="val c-water">${fmt(w.ml)} ml</div>${del('del-water', w.id)}</li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda. Comece com um copo!</p>'}
    </div>
    <div class="card">
      <h2>Últimos 7 dias</h2><p class="sub">Meta diária: ${fmt(basal)} ml basal + reposição dos treinos do dia</p>
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
              ${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
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
  checkPeriodicNotifications();
}

async function logoutUser() {
  if (cloud.enabled && cloud.auth && cloud.fbModules) {
    try { await cloud.fbModules.authMod.signOut(cloud.auth); } catch (e) { /* ignora */ }
  }
  currentUserEmail = null;
  activeExecution = null;
  localStorage.removeItem(SESSION_KEY);
  $('#app-shell').style.display = 'none';
  $('#auth-gate').style.display = 'flex';
  switchAuthTab('login');
}

/* ---------- Renderização e rotas ---------- */
const RENDER = { inicio: renderInicio, treinos: renderTreinos, calorias: renderCalorias, agua: renderAgua, medidas: renderMedidas };
let route = 'inicio';

function render(animate = false) {
  if (!currentUserEmail) {
    $('#app-shell').style.display = 'none';
    $('#auth-gate').style.display = 'flex';
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

  renderAlertBanners();

  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === route));

  const el = $(`#screen-${route}`);
  el.innerHTML = RENDER[route]();
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------- Ações ---------- */
const ACTIONS = {
  'switch-auth-tab': id => switchAuthTab(id),
  'logout': () => logoutUser(),
  'enable-notifications': () => requestNotificationPermission(),
  'open-missed-dialog': () => {
    const lastW = getLastWorkoutTimestamp();
    const hours = lastW ? Math.max(24, Math.floor((Date.now() - lastW) / 3600000)) : 24;
    $('#missed-workout-sub').textContent = `Já se passaram ${hours} horas desde o seu último treino registrado. Por que você faltou ao treino?`;
    $('#missed-workout-dialog').showModal();
  },
  'go-train-now': () => {
    $('#missed-workout-dialog')?.close();
    location.hash = '#treinos';
    if (S.workouts.length) startWorkoutExecution(S.workouts[0].id);
  },
  'open-workout-exec': id => {
    if (route !== 'treinos') location.hash = '#treinos';
    startWorkoutExecution(id);
  },
  'cancel-execution': () => {
    activeExecution = null;
    render();
  },
  'toggle-set-done': (id, btn) => {
    if (!activeExecution) return;
    const exIdx = +btn.dataset.ex, sIdx = +btn.dataset.set;
    const row = btn.closest('.set-row');
    const repsInput = row.querySelector(`[name="reps-${exIdx}-${sIdx}"]`);
    const cargaInput = row.querySelector(`[name="carga-${exIdx}-${sIdx}"]`);
    const item = activeExecution.sets[exIdx]?.[sIdx];
    if (item) {
      item.reps = repsInput.value;
      item.carga = cargaInput.value;
      item.done = !item.done;
      row.classList.toggle('done', item.done);
    }
  },
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
    toast('Configuração personalizada removida');
  },
  'add-water': id => {
    const before = score().total;
    today().water.push({ id: uid(), ml: +id, hora: timeNow(), duranteTreino: false });
    const gained = score().total - before;
    commit(`+${id} ml de água${gained > 0 ? ` · +${gained} pts` : ''}`);
  },
  'add-workout-water': id => {
    const before = score().total;
    today().water.push({ id: uid(), ml: +id, hora: timeNow(), duranteTreino: true });
    const gained = score().total - before;
    commit(`💦 +${id} ml hidratado no treino!${gained > 0 ? ` · +${gained} pts` : ''}`);
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

/* ---------- Diálogo de Criar/Editar Ficha de Treino ---------- */
function addExRow(e = { nome: '', series: 3, reps: '12' }) {
  const row = document.createElement('div');
  row.className = 'ex-row';
  row.innerHTML = `<input name="ex-nome" placeholder="Nome do exercício" value="${esc(e.nome)}" aria-label="Exercício" required />
    <input name="ex-series" type="number" min="1" max="20" value="${esc(e.series)}" placeholder="Séries" aria-label="Quantidade de séries" required />
    <input name="ex-reps" value="${esc(e.reps)}" placeholder="Ex: 10-12" aria-label="Meta de repetições" required />
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

  'exec-workout': f => {
    if (!activeExecution) return;
    const w = S.workouts.find(x => x.id === activeExecution.workoutId);
    if (!w) return;
    const min = +f.min.value || 60;
    const tipo = f.tipo.value || 'musculacao';

    const detalhes = w.exercicios.map((ex, exIdx) => {
      const count = (activeExecution.sets[exIdx] || []).length;
      const series = [];
      for (let sIdx = 0; sIdx < count; sIdx++) {
        const reps = f[`reps-${exIdx}-${sIdx}`]?.value?.trim() || String(ex.reps);
        const carga = f[`carga-${exIdx}-${sIdx}`]?.value?.trim().replace(/kg/i, '') || '0';
        series.push({ serie: sIdx + 1, reps, carga });
      }
      // Atualiza a última carga usada como referência no exercício do treino
      const lastCarga = series[series.length - 1]?.carga;
      if (lastCarga && lastCarga !== '0') ex.carga = lastCarga;
      return { nome: ex.nome, series };
    });

    const before = score().total;
    today().sessions.push({
      id: uid(),
      workoutId: w.id,
      nome: w.nome,
      tipo,
      min,
      kcal: sessionKcal(tipo, min),
      hora: timeNow(),
      detalhes,
    });
    S.lastWorkoutAt = Date.now();
    activeExecution = null;
    const gained = score().total - before;
    commit(gained > 0 ? `Treino finalizado! +${gained} pontos 🔥` : 'Treino salvo com todas as séries! 💪');
  },

  'notif-settings': f => {
    S.notifications.waterIntervalMin = +f.waterIntervalMin.value || 90;
    commit('Configurações de lembretes salvas 🔔');
  },

  'missed-workout': f => {
    const motivo = f.motivo.value;
    const nota = f.nota.value.trim();
    S.missedReasons = S.missedReasons || [];
    S.missedReasons.push({ id: uid(), data: dkey(), hora: timeNow(), motivo, nota });
    $('#missed-workout-dialog').close();
    if (motivo.includes('esqueci de registrar')) {
      location.hash = '#treinos';
      toast('Abra seu treino abaixo e registre suas séries!');
    } else {
      commit('Justificativa registrada. Amanhã voltamos com tudo! 💪');
    }
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
      series: Math.max(1, +r.querySelector('[name="ex-series"]').value || 1),
      reps: r.querySelector('[name="ex-reps"]').value.trim() || '10',
      carga: '',
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
  if (['reg-dia', 'reg-mes', 'reg-ano'].includes(e.target.id)) {
    const age = calcAgeFromDOB($('#reg-dia')?.value, $('#reg-mes')?.value, $('#reg-ano')?.value);
    const preview = $('#reg-age-preview');
    if (preview) preview.textContent = age != null ? `— ${age} anos` : '';
  }
  if (activeExecution && (e.target.id === 'exec-min' || e.target.id === 'exec-tipo')) {
    activeExecution.min = +($('#exec-min')?.value || 60);
    activeExecution.tipo = $('#exec-tipo')?.value || 'musculacao';
  }
});

window.addEventListener('hashchange', go);

let lastDay = dkey();
setInterval(() => {
  if (dkey() !== lastDay) { lastDay = dkey(); if (currentUserEmail) render(); }
  checkPeriodicNotifications();
}, 60000);

/* ---------- Inicialização ---------- */
(async function bootstrap() {
  registerServiceWorker();
  await initCloud();
  const savedEmail = localStorage.getItem(SESSION_KEY);
  if (savedEmail) {
    let state = loadUserState(savedEmail);
    if (cloud.enabled) {
      const remote = await pullFromCloud(savedEmail);
      if (remote) state = remote;
    }
    enterAppWithUser(savedEmail, state);
    if ('Notification' in window && Notification.permission === 'granted') {
      subscribeUserToWebPush();
    }
  } else {
    render();
  }
})();
