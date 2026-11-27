'use strict';

/* =========================================================
   Pulso — App de Treino (Infraestrutura 100% Supabase + RBAC + IA Ready)
   - Autenticação: Supabase Auth (signUp / signInWithPassword / signOut / getSession)
   - Banco de Dados: PostgreSQL + Row Level Security (RLS)
     Tabelas: profiles, exercises_catalog, ai_settings, workouts,
              workout_exercises, workout_sessions, nutrition_logs,
              hydration_logs, body_measurements
   - Controle de Acesso (RBAC):
     * 'admin'   -> Redireciona para /admin (Gestão de Usuários/Roles, Catálogo Base IA, Config IA + alternância /app)
     * 'trainer' -> Redireciona para /app com aba exclusiva "Meus Alunos"
     * 'user'    -> Redireciona para /app (Metas, Treinos, Calorias, Água, Medidas)
   ========================================================= */

const ACCOUNTS_KEY = 'pulso-accounts-v2';
const SESSION_KEY = 'pulso-session-v2';
const CATALOG_CACHE_KEY = 'pulso-exercises-catalog-v1';
const AI_SETTINGS_CACHE_KEY = 'pulso-ai-settings-v1';

const DEFAULT_CATALOG = [
  { id: 'cat-1', nome: 'Supino reto com barra', grupo_muscular: 'Peito', equipamento: 'Barra e Banco', nivel: 'intermediario', media_url: '', ativo_ia: true },
  { id: 'cat-2', nome: 'Supino inclinado com halteres', grupo_muscular: 'Peito', equipamento: 'Halteres e Banco 30°', nivel: 'intermediario', media_url: '', ativo_ia: true },
  { id: 'cat-3', nome: 'Crucifixo na máquina (Peck Deck)', grupo_muscular: 'Peito', equipamento: 'Máquina', nivel: 'iniciante', media_url: '', ativo_ia: true },
  { id: 'cat-4', nome: 'Puxada frontal aberta', grupo_muscular: 'Costas', equipamento: 'Polia Alta', nivel: 'iniciante', media_url: '', ativo_ia: true },
  { id: 'cat-5', nome: 'Remada curvada pronada', grupo_muscular: 'Costas', equipamento: 'Barra Livre', nivel: 'avancado', media_url: '', ativo_ia: true },
  { id: 'cat-6', nome: 'Agachamento livre com barra', grupo_muscular: 'Pernas', equipamento: 'Barra e Gaiola', nivel: 'avancado', media_url: '', ativo_ia: true },
  { id: 'cat-7', nome: 'Leg press 45°', grupo_muscular: 'Pernas', equipamento: 'Máquina Leg Press', nivel: 'intermediario', media_url: '', ativo_ia: true },
  { id: 'cat-8', nome: 'Cadeira extensora', grupo_muscular: 'Pernas', equipamento: 'Máquina', nivel: 'iniciante', media_url: '', ativo_ia: true },
  { id: 'cat-9', nome: 'Desenvolvimento com halteres', grupo_muscular: 'Ombros', equipamento: 'Halteres', nivel: 'intermediario', media_url: '', ativo_ia: true },
  { id: 'cat-10', nome: 'Tríceps corda na polia', grupo_muscular: 'Tríceps', equipamento: 'Polia Alta', nivel: 'iniciante', media_url: '', ativo_ia: true },
  { id: 'cat-11', nome: 'Rosca direta com barra W', grupo_muscular: 'Bíceps', equipamento: 'Barra W', nivel: 'iniciante', media_url: '', ativo_ia: true },
];

const DEFAULT_AI_SETTINGS = {
  modelo: 'gemini-2.5-flash',
  temperatura: 0.4,
  max_exercicios_por_treino: 6,
  priorizar_catalogo: true,
  prompt_sistema: 'Você é um fisiologista do exercício e personal trainer especialista. Monte fichas de treino personalizadas usando exclusivamente os exercícios ativos na tabela exercises_catalog.',
};

const DEFAULT_STATE = {
  profile: {
    id: null,
    nome: '',
    email: '',
    role: 'user', // 'admin' | 'trainer' | 'user'
    trainer_id: null,
    nascimento: { dia: 1, mes: 1, ano: 2000 },
    sexo: 'm',
    idade: 25,
    altura: 175,
    altura_m: 1.75,
    peso: 75,
    atividade: 1.55,
    objetivo: 'manter',
    meta_agua: 2650,
    pontuacao: 0,
    configurado: false,
  },
  notifications: {
    enabled: true,
    waterIntervalMin: 90,
    mealHours: [8, 12, 16, 20],
    lastWaterRemindAt: 0,
    nextWaterRemindAt: 0,
    lastMealRemindHour: -1,
    lastMissedPromptAt: 0,
  },
  lastWorkoutAt: 0,
  missedReasons: [],
  trainingDays: [1, 2, 3, 4, 5, 6],
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
  log: {},
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
const TITLES = {
  inicio: 'Metas do dia',
  treinos: 'Meus treinos',
  calorias: 'Calorias',
  agua: 'Água',
  medidas: 'Medidas do corpo',
  alunos: 'Meus Alunos (Personal Trainer)',
};
const ADMIN_TITLES = {
  users: 'Gestão de Usuários & Roles (RBAC)',
  catalog: 'Catálogo de Exercícios Base (IA)',
  ai: 'Configurações do Motor de IA',
};
const POINTS = { treino: 40, agua: 30, alim: 30 };

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const fmt = n => Math.round(n).toLocaleString('pt-BR');
const clamp01 = n => Math.max(0, Math.min(1, n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeNow = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const EMPTY_DAY = () => ({ water: [], meals: [], sessions: [] });
const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

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

/* ---------- Estado Global, Supabase e RBAC ---------- */
let currentUserEmail = null;
let currentUserId = null;
let S = structuredClone(DEFAULT_STATE);
let sb = null; // Instância ativa do @supabase/supabase-js
let activeExecution = null;

// Cache em memória das tabelas administrativas e de trainer
let allProfilesList = [];
let catalogExercises = [];
let aiSettings = structuredClone(DEFAULT_AI_SETTINGS);
let selectedStudentId = null;

// Estado de roteamento RBAC:
// currentArea: 'app' (/app) ou 'admin' (/admin)
let currentArea = 'app';
let route = 'inicio';
let adminRoute = 'users';

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAccounts(accs) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accs));
}
function userStorageKey(email) {
  return `pulso-user-data-${String(email || '').toLowerCase().trim()}`;
}

function loadLocalCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignora */ }
  return structuredClone(DEFAULT_CATALOG);
}
function saveLocalCatalog(list) {
  catalogExercises = list;
  localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(list));
}

function loadLocalAiSettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_CACHE_KEY);
    if (raw) return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* ignora */ }
  return structuredClone(DEFAULT_AI_SETTINGS);
}
function saveLocalAiSettings(cfg) {
  aiSettings = { ...DEFAULT_AI_SETTINGS, ...cfg };
  localStorage.setItem(AI_SETTINGS_CACHE_KEY, JSON.stringify(aiSettings));
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
  if (!['admin', 'trainer', 'user'].includes(merged.profile.role)) {
    merged.profile.role = 'user';
  }
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
  } catch (e) { /* ignora */ }
  return structuredClone(DEFAULT_STATE);
}

function saveLocalState() {
  if (!currentUserEmail) return;
  S.bestStreak = Math.max(S.bestStreak || 0, streak());
  if (S.profile.nascimento) {
    const calc = calcAgeFromDOB(S.profile.nascimento.dia, S.profile.nascimento.mes, S.profile.nascimento.ano);
    if (calc != null) S.profile.idade = calc;
  }
  S.profile.meta_agua = waterGoal();
  S.profile.pontuacao = totalPoints();
  localStorage.setItem(userStorageKey(currentUserEmail), JSON.stringify(S));

  // Sincroniza também na lista local de contas para o painel Admin funcionar mesmo antes das chaves
  const accs = loadAccounts();
  if (accs[currentUserEmail]) {
    accs[currentUserEmail].role = S.profile.role;
    accs[currentUserEmail].nome = S.profile.nome;
    accs[currentUserEmail].peso = S.profile.peso;
    accs[currentUserEmail].meta_agua = S.profile.meta_agua;
    accs[currentUserEmail].pontuacao = S.profile.pontuacao;
    accs[currentUserEmail].trainer_id = S.profile.trainer_id || null;
    saveAccounts(accs);
  }
}

function save() {
  saveLocalState();
  syncProfileToSupabase();
}

/* ---------- Inicialização e Queries do Supabase (@supabase/supabase-js) ---------- */
async function initSupabase() {
  const badge = $('#cloud-status-badge');
  sb = window.PulsoSupabase ? window.PulsoSupabase.init() : null;
  if (!sb) {
    if (badge) {
      badge.textContent = '⚡ Aguardando chaves Supabase';
      badge.classList.remove('online');
    }
    catalogExercises = loadLocalCatalog();
    aiSettings = loadLocalAiSettings();
    return false;
  }
  if (badge) {
    badge.textContent = '⚡ Supabase Ativo';
    badge.classList.add('online');
  }
  return true;
}

// Sincroniza os campos do perfil + notificações na tabela public.profiles do Supabase
async function syncProfileToSupabase() {
  if (!sb || !currentUserId) return;
  try {
    const p = S.profile;
    await sb.from('profiles').upsert({
      id: currentUserId,
      email: currentUserEmail,
      nome: p.nome || '',
      role: p.role || 'user',
      trainer_id: p.trainer_id || null,
      sexo: p.sexo || 'm',
      nascimento: p.nascimento || { dia: 1, mes: 1, ano: 2000 },
      idade: Number(p.idade) || 25,
      altura: Number(p.altura) || 175,
      altura_m: Number(p.altura_m) || 1.75,
      peso: Number(p.peso) || 75,
      atividade: Number(p.atividade) || 1.55,
      objetivo: p.objetivo || 'manter',
      meta_agua: waterGoal(),
      meta_calorias: kcalGoal(),
      pontuacao: totalPoints(),
      best_streak: Number(S.bestStreak) || 0,
      training_days: S.trainingDays || [1, 2, 3, 4, 5, 6],
      last_workout_at: Number(S.lastWorkoutAt) || 0,
      missed_reasons: S.missedReasons || [],
      notifications: S.notifications || {},
      configurado: Boolean(p.configurado),
    });
  } catch (err) {
    console.warn('Falha ao atualizar perfil no Supabase:', err.message || err);
  }
}

// Carrega todos os dados relacionais do usuário autenticado a partir das tabelas do Supabase
async function fetchUserDataFromSupabase(userId, email) {
  if (!sb || !userId) return null;
  try {
    const [
      profileRes,
      workoutsRes,
      sessionsRes,
      mealsRes,
      waterRes,
      measuresRes,
      catalogRes,
      aiRes,
    ] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
      sb.from('workouts').select('*, workout_exercises(*)').eq('user_id', userId).order('ordem', { ascending: true }),
      sb.from('workout_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      sb.from('nutrition_logs').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      sb.from('hydration_logs').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      sb.from('body_measurements').select('*').eq('user_id', userId).order('data', { ascending: false }),
      sb.from('exercises_catalog').select('*').order('grupo_muscular', { ascending: true }),
      sb.from('ai_settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    if (catalogRes.data && catalogRes.data.length) {
      saveLocalCatalog(catalogRes.data);
    }
    if (aiRes.data) {
      saveLocalAiSettings(aiRes.data);
    }

    const st = structuredClone(DEFAULT_STATE);
    const pf = profileRes.data;
    if (pf) {
      st.profile = {
        id: pf.id,
        nome: pf.nome || '',
        email: pf.email || email,
        role: pf.role || 'user',
        trainer_id: pf.trainer_id || null,
        nascimento: pf.nascimento || { dia: 1, mes: 1, ano: 2000 },
        sexo: pf.sexo || 'm',
        idade: Number(pf.idade) || 25,
        altura: Number(pf.altura) || 175,
        altura_m: Number(pf.altura_m) || 1.75,
        peso: Number(pf.peso) || 75,
        atividade: Number(pf.atividade) || 1.55,
        objetivo: pf.objetivo || 'manter',
        meta_agua: Number(pf.meta_agua) || 2650,
        pontuacao: Number(pf.pontuacao) || 0,
        configurado: pf.configurado !== false,
      };
      st.notifications = { ...st.notifications, ...(pf.notifications || {}) };
      st.trainingDays = Array.isArray(pf.training_days) ? pf.training_days : [1, 2, 3, 4, 5, 6];
      st.bestStreak = Number(pf.best_streak) || 0;
      st.lastWorkoutAt = Number(pf.last_workout_at) || 0;
      st.missedReasons = Array.isArray(pf.missed_reasons) ? pf.missed_reasons : [];
    }

    if (workoutsRes.data && workoutsRes.data.length) {
      st.workouts = workoutsRes.data.map(w => ({
        id: w.id,
        nome: w.nome,
        foco: w.foco || '',
        trainer_id: w.trainer_id || null,
        gerado_por_ia: Boolean(w.gerado_por_ia),
        exercicios: (w.workout_exercises || [])
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
          .map(ex => ({
            id: ex.id,
            nome: ex.nome,
            series: Number(ex.series) || 3,
            reps: String(ex.reps || '10'),
            carga: String(ex.carga || ''),
          })),
      }));
    }

    st.log = {};
    const ensureDay = k => (st.log[k] ||= EMPTY_DAY());

    (waterRes.data || []).forEach(w => {
      const k = String(w.data);
      ensureDay(k).water.push({
        id: w.id,
        ml: Number(w.ml),
        hora: w.hora || '12:00',
        duranteTreino: Boolean(w.durante_treino),
      });
    });

    (mealsRes.data || []).forEach(m => {
      const k = String(m.data);
      ensureDay(k).meals.push({
        id: m.id,
        tipo: m.tipo || 'Almoço',
        nome: m.nome,
        kcal: Number(m.kcal) || 0,
        prot: Number(m.prot) || 0,
        hora: m.hora || '12:00',
      });
    });

    (sessionsRes.data || []).forEach(s => {
      const k = String(s.data);
      ensureDay(k).sessions.push({
        id: s.id,
        workoutId: s.workout_id,
        nome: s.nome,
        tipo: s.tipo || 'musculacao',
        min: Number(s.min) || 60,
        kcal: Number(s.kcal) || 300,
        hora: s.hora || '12:00',
        detalhes: Array.isArray(s.detalhes) ? s.detalhes : [],
      });
    });

    if (measuresRes.data) {
      st.measures = measuresRes.data.map(m => ({
        id: m.id,
        data: String(m.data),
        peso: m.peso != null ? Number(m.peso) : undefined,
        cintura: m.cintura != null ? Number(m.cintura) : undefined,
        quadril: m.quadril != null ? Number(m.quadril) : undefined,
        peito: m.peito != null ? Number(m.peito) : undefined,
        braco: m.braco != null ? Number(m.braco) : undefined,
        coxa: m.coxa != null ? Number(m.coxa) : undefined,
        gordura: m.gordura != null ? Number(m.gordura) : undefined,
      }));
    }

    return hydrateState(st);
  } catch (err) {
    console.warn('Erro ao buscar dados do Supabase:', err.message || err);
    return null;
  }
}

async function fetchAllProfilesForAdminOrTrainer() {
  if (sb && currentUserId) {
    try {
      const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        allProfilesList = data;
        return data;
      }
    } catch (e) { /* fallback local */ }
  }
  const accs = loadAccounts();
  allProfilesList = Object.values(accs).map(a => ({
    id: a.id || a.email,
    email: a.email,
    nome: a.nome || a.email.split('@')[0],
    role: a.role || 'user',
    trainer_id: a.trainer_id || null,
    peso: a.peso || 75,
    meta_agua: a.meta_agua || 2650,
    pontuacao: a.pontuacao || 0,
  }));
  return allProfilesList;
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
const basalWaterGoal = () => Math.round((P().peso * 35) / 50) * 50;

function workoutSweatWaterMl(min = 60, met = 5) {
  const intensityFactor = met >= 7.5 ? 0.15 : 0.12;
  const raw = P().peso * intensityFactor * min;
  return Math.max(200, Math.round(raw / 50) * 50);
}

function todayWorkoutWaterNeed(k = dkey()) {
  const sessions = peek(k).sessions;
  if (sessions.length) {
    return sum(sessions, s => workoutSweatWaterMl(s.min || 60, ACTIVITIES[s.tipo]?.met || 5));
  }
  return 0;
}

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

/* ---------- Sistema de Web Push Notifications Reais (Service Worker + VAPID + Timer Exato de Água) ---------- */
const VAPID_PUBLIC_KEY = 'BNsRjJvsT-9CCBTZSWEdQ6WgavTeJ8Efwz9vUt2F0Rqx0fPTNbfBsm5fVGmbooYKukQJmDot6jUmWoSkwp08lYw';

let swRegistration = null;
let waterExactTimeout = null;

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

function getWaterIntervalMs() {
  return (Number(S.notifications?.waterIntervalMin) || 90) * 60000;
}

function formatWaterCountdown(ms) {
  if (ms <= 0) return '00:00 (disparando agora!)';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function scheduleExactWaterTimer(resetCycle = false) {
  if (!currentUserEmail) return;
  if (waterExactTimeout) {
    clearTimeout(waterExactTimeout);
    waterExactTimeout = null;
  }

  const k = dkey();
  const drank = waterOf(k);
  const goal = waterGoal(k);
  const intervalMs = getWaterIntervalMs();
  const now = Date.now();

  if (!S.notifications?.enabled || drank >= goal) {
    const reg = swRegistration || (await registerServiceWorker());
    reg?.active?.postMessage({ type: 'CANCEL_WATER_TIMER' });
    return;
  }

  if (resetCycle || !S.notifications.nextWaterRemindAt || S.notifications.nextWaterRemindAt <= now) {
    S.notifications.lastWaterRemindAt = now;
    S.notifications.nextWaterRemindAt = now + intervalMs;
    save();
  }

  const dueAt = Number(S.notifications.nextWaterRemindAt);
  const delayMs = Math.max(0, dueAt - now);
  const falta = Math.max(0, goal - drank);
  const nome = (S.profile?.nome || currentUserEmail || 'Atleta').split(' ')[0];

  const payload = {
    enabled: true,
    dueAt,
    intervalMs,
    title: `💧 O timer de água fechou, ${nome}!`,
    body: `Hora de beber água! Você bebeu ${fmt(drank)} ml de ${fmt(goal)} ml hoje (faltam ${fmt(falta)} ml). Beba 250 ml agora!`,
    tag: 'pulso-water-timer',
    url: './index.html#/app/agua',
  };

  try {
    const reg = swRegistration || (await registerServiceWorker());
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (sw) {
      sw.postMessage({ type: 'SCHEDULE_WATER_TIMER', payload });
    }
  } catch (e) { /* ignora */ }

  waterExactTimeout = setTimeout(() => {
    onWaterTimerClosed();
  }, delayMs);
}

function onWaterTimerClosed() {
  if (!currentUserEmail || !S.notifications?.enabled) return;
  const k = dkey();
  const drank = waterOf(k);
  const goal = waterGoal(k);
  if (drank >= goal) return;

  const now = Date.now();
  const intervalMs = getWaterIntervalMs();
  if (now - (S.notifications.lastWaterFiredAt || 0) > 3000) {
    S.notifications.lastWaterFiredAt = now;
    const falta = Math.max(0, goal - drank);
    const nome = (S.profile?.nome || currentUserEmail || 'Atleta').split(' ')[0];
    sendBrowserNotification(
      `💧 O timer de água fechou, ${nome}!`,
      `Hora de beber água! Você bebeu ${fmt(drank)} ml de ${fmt(goal)} ml hoje (faltam ${fmt(falta)} ml). Beba 250 ml agora!`,
      'pulso-water-timer',
      './index.html#/app/agua'
    );
  }
  S.notifications.lastWaterRemindAt = now;
  S.notifications.nextWaterRemindAt = now + intervalMs;
  save();
  scheduleExactWaterTimer(false);
  renderAlertBanners();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'WATER_TIMER_FIRED' && currentUserEmail) {
      const now = Date.now();
      S.notifications.lastWaterFiredAt = now;
      S.notifications.lastWaterRemindAt = now;
      S.notifications.nextWaterRemindAt = now + getWaterIntervalMs();
      save();
      scheduleExactWaterTimer(false);
      renderAlertBanners();
    }
  });
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
    if (!S.notifications.nextWaterRemindAt || S.notifications.nextWaterRemindAt <= Date.now()) {
      S.notifications.lastWaterRemindAt = Date.now();
      S.notifications.nextWaterRemindAt = Date.now() + getWaterIntervalMs();
    }
    save();
    scheduleExactWaterTimer(false);
    return subJson;
  } catch (err) {
    console.warn('Não foi possível criar assinatura Web Push:', err);
    return null;
  }
}

async function sendBrowserNotification(title, body, tag, url = './index.html#/app/inicio') {
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
    scheduleExactWaterTimer(true);
    await sendBrowserNotification(
      'Pulso · Web Push Ativado! 🔔',
      sub
        ? `Timer de água iniciado (${S.notifications.waterIntervalMin || 90} min)! Você será notificado exatamente quando o timer fechar, mesmo com o app fechado.`
        : 'Notificações do sistema ativadas para Água, Alimentação e Treino!',
      'pulso-welcome'
    );
    render();
    toast(sub ? '✅ Web Push (VAPID) + Timer de Água salvos no Supabase!' : '🔔 Notificações ativadas!');
  } else {
    save();
    render();
    toast('Permissão negada no navegador. Libere nas configurações do site.');
  }
}

function getLastWorkoutTimestamp() {
  if (S.lastWorkoutAt) return S.lastWorkoutAt;
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

  const expectedWaterRatio = clamp01((hour - 7) / 14);
  const currentWaterRatio = waterOf(k) / waterGoal(k);
  if (hour >= 8 && currentWaterRatio < expectedWaterRatio - 0.15 && waterOf(k) < waterGoal(k)) {
    const falta = waterGoal(k) - waterOf(k);
    alerts.push({
      type: 'water',
      id: 'water-remind',
      text: `💧 <b>Hora de beber água!</b> Você bebeu ${fmt(waterOf(k))} ml hoje (faltam ${fmt(falta)} ml para a meta). Registre agora!`,
      actions: `
        <button class="btn water small" data-action="add-water" data-id="250">+250 ml agora</button>
        <a class="btn ghost small" href="#/app/agua">Abrir Água</a>
      `,
    });
  }

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
      actions: `<a class="btn food small" href="#/app/calorias">Registrar refeição</a>`,
    });
  }

  return alerts;
}

function checkPeriodicNotifications() {
  if (!currentUserEmail || !S.notifications?.enabled) return;
  const now = Date.now();
  const k = dkey();
  const hour = new Date().getHours();

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

  if (waterOf(k) < waterGoal(k)) {
    const dueAt = Number(S.notifications.nextWaterRemindAt) || 0;
    if (!dueAt) {
      scheduleExactWaterTimer(true);
    } else if (now >= dueAt) {
      onWaterTimerClosed();
    }
  }

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

/* ---------- Componentes Visuais ---------- */
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
    <a class="btn body" href="#/app/medidas" id="setup-go">Preencher medidas</a>
  </div>`;

/* =========================================================================
   PAINEL ADMINISTRATIVO (/admin — Exclusivo para role === 'admin')
   1. Gestão de Usuários & Roles (RBAC) + Vínculo Aluno <-> Trainer
   2. Catálogo de Exercícios Base (exercises_catalog) para Geração IA
   3. Configurações do Motor de IA (ai_settings) + Gerador de Treino IA
   ========================================================================= */
function renderAdminUsers() {
  const trainers = allProfilesList.filter(u => u.role === 'trainer' || u.role === 'admin');
  return `
  <div class="card">
    <div class="card-head">
      <div>
        <h2>👥 Gestão de Usuários, Roles (RBAC) e Vínculo de Personal Trainer</h2>
        <p class="sub">Altere o nível de permissão (<code>admin</code>, <code>trainer</code>, <code>user</code>) e vincule alunos a um Personal Trainer na tabela <code>public.profiles</code>.</p>
      </div>
      <button class="btn ghost small" data-action="refresh-admin-data">🔄 Atualizar lista</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Role (RBAC)</th>
            <th>Trainer Vinculado</th>
            <th>Peso / Meta Água</th>
            <th>Pontuação</th>
          </tr>
        </thead>
        <tbody>
          ${allProfilesList.length ? allProfilesList.map(u => `
            <tr>
              <td><b>${esc(u.nome || 'Sem nome')}</b></td>
              <td>${esc(u.email || '')}</td>
              <td>
                <select data-action="change-user-role" data-user-id="${esc(u.id)}" data-user-email="${esc(u.email)}" style="width:140px;padding:6px 8px;font-size:.8rem">
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>user (Aluno)</option>
                  <option value="trainer" ${u.role === 'trainer' ? 'selected' : ''}>trainer (Personal)</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin (Total)</option>
                </select>
              </td>
              <td>
                <select data-action="assign-user-trainer" data-user-id="${esc(u.id)}" data-user-email="${esc(u.email)}" style="width:170px;padding:6px 8px;font-size:.8rem">
                  <option value="">— Sem trainer —</option>
                  ${trainers.map(t => `<option value="${esc(t.id)}" ${u.trainer_id === t.id ? 'selected' : ''}>${esc(t.nome || t.email)}</option>`).join('')}
                </select>
              </td>
              <td>${u.peso || 75} kg · ${fmt(u.meta_agua || 2650)} ml</td>
              <td><span class="c-lime"><b>${fmt(u.pontuacao || 0)} pts</b></span></td>
            </tr>
          `).join('') : '<tr><td colspan="6" class="empty">Nenhum perfil encontrado.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderAdminCatalog() {
  return `
  <div class="grid-2">
    <div class="card">
      <h2>➕ Cadastrar Exercício no Catálogo Base (IA)</h2>
      <p class="sub">Estes exercícios ficam salvos na tabela <code>public.exercises_catalog</code> para a IA montar treinos personalizados.</p>
      <form class="form" data-form="admin-catalog">
        <label class="field">
          <span>Nome do exercício *</span>
          <input name="nome" required placeholder="Ex.: Supino Inclinado com Halteres" />
        </label>
        <div class="row-2">
          <label class="field">
            <span>Grupo muscular *</span>
            <select name="grupo_muscular" required>
              ${['Peito', 'Costas', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen', 'Glúteos', 'Cardio / Full Body'].map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Equipamento *</span>
            <input name="equipamento" required placeholder="Ex.: Halteres e Banco 30°" value="Livre / Halteres" />
          </label>
        </div>
        <div class="row-2">
          <label class="field">
            <span>Nível</span>
            <select name="nivel">
              <option value="iniciante">Iniciante</option>
              <option value="intermediario" selected>Intermediário</option>
              <option value="avancado">Avançado</option>
            </select>
          </label>
          <label class="field">
            <span>URL de Mídia / Vídeo / GIF (opcional)</span>
            <input name="media_url" type="url" placeholder="https://exemplo.com/execucao.gif" />
          </label>
        </div>
        <label class="field">
          <span>Instruções biomecânicas para a IA (opcional)</span>
          <input name="instrucoes" placeholder="Ex.: Manter escápulas retraídas e controlar a descida." />
        </label>
        <button type="submit" class="btn primary">+ Salvar no Catálogo (exercises_catalog)</button>
      </form>
    </div>

    <div class="card">
      <h2>📚 Exercícios Cadastrados (${catalogExercises.length})</h2>
      <p class="sub">Disponíveis para a geração de treinos por IA e fichas manuais.</p>
      <ul class="list" style="max-height:420px;overflow-y:auto">
        ${catalogExercises.length ? catalogExercises.map(ex => `
          <li class="item">
            <div>
              <div class="t">${esc(ex.nome)}</div>
              <div class="m"><b class="c-lime">${esc(ex.grupo_muscular)}</b> · ${esc(ex.equipamento || 'Livre')} · ${esc(ex.nivel || 'intermediario')} ${ex.media_url ? `· <a href="${esc(ex.media_url)}" target="_blank" rel="noopener" class="c-water">Ver mídia</a>` : ''}</div>
            </div>
            <span class="role-chip user">IA Ativo</span>
            ${del('del-catalog-exercise', ex.id)}
          </li>
        `).join('') : '<p class="empty">Nenhum exercício no catálogo.</p>'}
      </ul>
    </div>
  </div>`;
}

function renderAdminAi() {
  return `
  <div class="grid-2">
    <div class="card">
      <h2>🤖 Configurações do Motor de Geração de Treinos por IA</h2>
      <p class="sub">Parâmetros persistidos na tabela <code>public.ai_settings</code> que controlam como a IA consulta a <code>exercises_catalog</code>.</p>
      <form class="form" data-form="admin-ai-settings">
        <div class="row-2">
          <label class="field">
            <span>Modelo LLM</span>
            <select name="modelo">
              ${['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4o-mini', 'claude-3-5-sonnet'].map(m => `<option value="${m}" ${aiSettings.modelo === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Máx. exercícios por ficha gerada</span>
            <input name="max_exercicios_por_treino" type="number" min="3" max="12" value="${aiSettings.max_exercicios_por_treino || 6}" required />
          </label>
        </div>
        <label class="field">
          <span>Temperatura criativa (0.0 a 1.0)</span>
          <input name="temperatura" type="number" step="0.05" min="0" max="1" value="${aiSettings.temperatura ?? 0.4}" required />
        </label>
        <label class="field">
          <span>System Prompt da IA</span>
          <textarea name="prompt_sistema" rows="4" required>${esc(aiSettings.prompt_sistema)}</textarea>
        </label>
        <button type="submit" class="btn primary">💾 Salvar configurações da IA</button>
      </form>
    </div>

    <div class="card">
      <h2>⚡ Testar Geração de Ficha a partir do Catálogo IA</h2>
      <p class="sub">Gera imediatamente uma ficha baseada no objetivo do usuário e nos exercícios ativos em <code>exercises_catalog</code>.</p>
      <form class="form" data-form="generate-ai-workout">
        <label class="field">
          <span>Foco muscular desejado</span>
          <select name="foco_ia">
            <option value="Peito e Tríceps">Peito e Tríceps</option>
            <option value="Costas e Bíceps">Costas e Bíceps</option>
            <option value="Pernas e Ombros">Pernas e Ombros</option>
            <option value="Full Body / Condicionamento">Full Body / Condicionamento</option>
          </select>
        </label>
        <button type="submit" class="btn body">✨ Gerar Ficha com IA usando Catálogo Base</button>
      </form>
      <div class="sweat-box" style="margin-top:14px">
        <b class="c-lime">Status do Catálogo IA</b>
        <p class="note" style="margin:4px 0 0">${catalogExercises.length} exercícios indexados e prontos para RAG / Function Calling.</p>
      </div>
    </div>
  </div>`;
}

/* =========================================================================
   ABA EXCLUSIVA DO PERSONAL TRAINER (/app/alunos — role === 'trainer' ou 'admin')
   ========================================================================= */
function renderAlunos() {
  const myStudents = allProfilesList.filter(u =>
    S.profile.role === 'admin' ? u.role === 'user' : (u.trainer_id === currentUserId || u.role === 'user')
  );

  return `
  <div class="card">
    <div class="card-head">
      <div>
        <h2>🏋️ Meus Alunos Vinculados (Personal Trainer)</h2>
        <p class="sub">Acompanhe peso, hidratação, pontuação e prescreva fichas de treino diretamente para seus alunos (protegido via RLS <code>is_trainer_of</code>).</p>
      </div>
      <button class="btn ghost small" data-action="refresh-admin-data">🔄 Atualizar alunos</button>
    </div>
    ${myStudents.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Aluno</th>
              <th>E-mail</th>
              <th>Medidas & Objetivo</th>
              <th>Meta de Água</th>
              <th>Pontuação</th>
              <th>Ações do Trainer</th>
            </tr>
          </thead>
          <tbody>
            ${myStudents.map(st => {
              const isMine = st.trainer_id === currentUserId;
              return `
              <tr>
                <td><b>${esc(st.nome || 'Aluno')}</b> ${isMine ? '<span class="role-chip trainer">Meu Aluno</span>' : ''}</td>
                <td>${esc(st.email || '')}</td>
                <td>${st.peso || 75} kg · ${st.altura_m || 1.75} m · ${esc(st.objetivo || 'manter')}</td>
                <td>${fmt(st.meta_agua || 2650)} ml</td>
                <td><b class="c-lime">${fmt(st.pontuacao || 0)} pts</b></td>
                <td style="display:flex;gap:6px">
                  ${!isMine ? `<button class="btn ghost small" data-action="claim-student" data-id="${esc(st.id)}">Vincular a mim</button>` : ''}
                  <button class="btn primary small" data-action="prescribe-workout" data-id="${esc(st.id)}" data-name="${esc(st.nome || st.email)}">+ Prescrever Treino</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="empty">Nenhum aluno encontrado ainda.</p>'}
  </div>`;
}

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
        <h2>🔔 Lembretes & Timer de Água (Web Push)</h2>
        <p class="sub" style="margin-bottom:6px">A notificação Web Push dispara exatamente quando o timer de água fechar (mesmo com o app fechado), além de cobrar refeições e 24h sem treino.</p>
      </div>
      <button class="btn ${notifPerm === 'granted' ? 'ghost' : 'primary'} small" data-action="enable-notifications">
        ${notifPerm === 'granted' ? '✅ Notificações Ativas (Testar)' : '🔔 Ativar notificações no celular'}
      </button>
    </div>
    <form class="form" data-form="notif-settings" style="margin-top:8px">
      <div class="row-2">
        <label class="field">
          <span>Timer de água (disparar push a cada):</span>
          <select name="waterIntervalMin">
            ${[[1, '1 minuto (Teste rápido)'], [15, '15 minutos (Durante treino)'], [30, '30 minutos'], [45, '45 minutos'], [60, '60 minutos (1h)'], [90, '90 minutos (1h30)'], [120, '120 minutos (2h)']].map(([v, l]) => `<option value="${v}" ${+S.notifications.waterIntervalMin === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Próximo disparo de água em:</span>
          <input id="water-timer-countdown" value="${waterOf(k) >= waterGoal(k) ? 'Meta de água concluída hoje! ✅' : formatWaterCountdown((S.notifications.nextWaterRemindAt || (Date.now() + getWaterIntervalMs())) - Date.now())}" disabled />
        </label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn water small">⏱️ Salvar e reiniciar timer de água</button>
        <button type="button" class="btn ghost small" data-action="open-missed-dialog">Simular cobrança de 24h sem treino</button>
      </div>
    </form>
  </div>`;
}

/* ---------- Tela: Treinos (Com Formulário Série por Série + Geração IA) ---------- */
function startWorkoutExecution(workoutId) {
  const w = S.workouts.find(x => String(x.id) === String(workoutId));
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
  const w = S.workouts.find(x => String(x.id) === String(activeExecution?.workoutId));
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
        <button type="submit" class="btn primary" id="finish-exec-btn">✅ Finalizar e salvar no Supabase</button>
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn body small" data-action="generate-quick-ai-workout">✨ Gerar Treino IA</button>
        <button class="btn primary small" data-action="new-workout" id="new-workout">+ Criar novo treino</button>
      </div>
    </div>
    ${S.workouts.length ? S.workouts.map(w => `
      <div class="plan" id="plan-${w.id}">
        <div class="plan-head" data-action="open-workout-exec" data-id="${w.id}">
          <div>
            <div class="plan-name">${esc(w.nome)} ${w.gerado_por_ia ? '<span class="role-chip admin">IA</span>' : ''}</div>
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
      <h2>Adicionar alimento</h2><p class="sub">Salvo automaticamente em <code>nutrition_logs</code> no Supabase.</p>
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

/* ---------- Tela: Água ---------- */
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
      <p class="eyebrow">Bebido hoje (Dia + Treino · <code>hydration_logs</code>)</p>
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
      <h2>Meu perfil (${esc(p.nome || currentUserEmail)}) <span class="role-chip ${esc(p.role)}">${esc(p.role)}</span></h2>
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
        <button class="btn body" id="profile-save">Salvar perfil no Supabase</button>
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
      <h2>Registrar medidas (<code>body_measurements</code>)</h2><p class="sub">Meça sempre no mesmo horário, de preferência em jejum.</p>
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

/* ---------- Autenticação, Roteamento e Proteção RBAC (/admin vs /app) ---------- */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('#tab-login').classList.toggle('active', isLogin);
  $('#tab-register').classList.toggle('active', !isLogin);
  $('#login-form').style.display = isLogin ? 'grid' : 'none';
  $('#register-form').style.display = isLogin ? 'none' : 'grid';
  $('#login-error').textContent = '';
  $('#register-error').textContent = '';
}

async function enterAppWithUser(email, stateData, userId = null) {
  currentUserEmail = email.toLowerCase().trim();
  S = hydrateState(stateData || loadUserState(currentUserEmail));
  currentUserId = userId || S.profile.id || currentUserEmail;
  S.profile.id = currentUserId;
  S.profile.email = currentUserEmail;

  localStorage.setItem(SESSION_KEY, JSON.stringify({ email: currentUserEmail, id: currentUserId }));
  saveLocalState();

  const role = S.profile.role || 'user';
  if (role === 'admin' || role === 'trainer') {
    await fetchAllProfilesForAdminOrTrainer();
  }

  $('#auth-gate').style.display = 'none';

  // Roteamento inicial baseado na Role (RBAC):
  // Se role === 'admin' -> vai para /admin
  // Se role === 'trainer' ou 'user' -> vai para /app
  if (role === 'admin') {
    currentArea = 'admin';
    adminRoute = 'users';
    location.hash = '#/admin/users';
  } else {
    currentArea = 'app';
    route = 'inicio';
    location.hash = '#/app/inicio';
  }

  render(true);
  scheduleExactWaterTimer(false);
  checkPeriodicNotifications();
}

async function logoutUser() {
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) { /* ignora */ }
  }
  currentUserEmail = null;
  currentUserId = null;
  activeExecution = null;
  localStorage.removeItem(SESSION_KEY);
  $('#app-shell').style.display = 'none';
  $('#admin-shell').style.display = 'none';
  $('#auth-gate').style.display = 'flex';
  switchAuthTab('login');
}

/* ---------- Renderização e Guardião de Rotas (RBAC) ---------- */
const RENDER = {
  inicio: renderInicio,
  treinos: renderTreinos,
  calorias: renderCalorias,
  agua: renderAgua,
  medidas: renderMedidas,
  alunos: renderAlunos,
};

const ADMIN_RENDER = {
  users: renderAdminUsers,
  catalog: renderAdminCatalog,
  ai: renderAdminAi,
};

function render(animate = false) {
  if (!currentUserEmail) {
    $('#app-shell').style.display = 'none';
    $('#admin-shell').style.display = 'none';
    $('#auth-gate').style.display = 'flex';
    return;
  }

  const role = S.profile.role || 'user';
  const firstName = (S.profile.nome || currentUserEmail).split(' ')[0];

  // Proteção estrita de Rota: bloqueia qualquer usuário sem role === 'admin' de acessar /admin
  if (currentArea === 'admin' && role !== 'admin') {
    currentArea = 'app';
    route = 'inicio';
    location.hash = '#/app/inicio';
    toast('⛔ Acesso negado: a rota /admin é restrita a administradores.');
  }

  // Proteção da aba Meus Alunos: apenas 'trainer' e 'admin'
  if (currentArea === 'app' && route === 'alunos' && role === 'user') {
    route = 'inicio';
    location.hash = '#/app/inicio';
    toast('⛔ Acesso restrito a Personal Trainers.');
  }

  $('#auth-gate').style.display = 'none';

  // Visão 1: PAINEL ADMINISTRATIVO (/admin)
  if (currentArea === 'admin') {
    $('#app-shell').style.display = 'none';
    $('#admin-shell').style.display = '';

    $('#admin-page-title').textContent = ADMIN_TITLES[adminRoute] || ADMIN_TITLES.users;
    $('#admin-topbar-user').innerHTML = `
      <span class="role-chip admin">ADMIN</span>
      <b>${esc(firstName)}</b>
      <button class="btn ghost small" data-action="logout" style="padding:4px 9px;font-size:.75rem">Sair</button>`;
    $('#admin-nav-user').innerHTML = `
      <div>Administrador <b style="color:var(--text)">${esc(S.profile.nome || firstName)}</b></div>
      <div class="nav-user-email">${esc(currentUserEmail)}</div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn ghost small" data-action="open-cloud-dialog" style="flex:1;padding:6px 8px;font-size:.75rem">⚡ Supabase</button>
        <button class="btn danger small" data-action="logout" style="padding:6px 10px;font-size:.75rem">Sair</button>
      </div>`;

    $$('.admin-nav-link').forEach(a => a.classList.toggle('active', a.dataset.adminRoute === adminRoute));
    const el = $('#admin-screen-content');
    el.innerHTML = (ADMIN_RENDER[adminRoute] || ADMIN_RENDER.users)();
    return;
  }

  // Visão 2: APLICATIVO PRINCIPAL (/app)
  $('#admin-shell').style.display = 'none';
  $('#app-shell').style.display = '';

  // Exibe aba "Meus Alunos" se for 'trainer' ou 'admin'
  const navAlunos = $('#nav-alunos');
  if (navAlunos) navAlunos.style.display = (role === 'trainer' || role === 'admin') ? '' : 'none';

  // Exibe botão de voltar para /admin se for 'admin'
  const adminBackWrap = $('#admin-back-btn-wrap');
  const topbarAdminBtn = $('#topbar-admin-btn');
  if (adminBackWrap) adminBackWrap.style.display = role === 'admin' ? '' : 'none';
  if (topbarAdminBtn) topbarAdminBtn.style.display = role === 'admin' ? '' : 'none';

  const roleBadge = $('#app-role-badge');
  if (roleBadge) {
    roleBadge.textContent = role.toUpperCase();
    roleBadge.className = `role-chip ${role}`;
  }

  const sc = score();
  const dt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today-label').textContent = dt.charAt(0).toUpperCase() + dt.slice(1);
  $('#page-title').textContent = TITLES[route] || TITLES.inicio;
  $('#topbar-score').innerHTML = `${ring(sc.total / 100, 34, 5, 'var(--lime)')}<b>${sc.total}</b><span>pts hoje</span>`;

  $('#topbar-user').innerHTML = `
    <span class="role-chip ${esc(role)}">${esc(role)}</span>
    <b>${esc(firstName)}</b>
    <button class="btn ghost small" data-action="logout" id="logout-btn" style="padding:4px 9px;font-size:.75rem">Sair</button>`;
  $('#nav-user').innerHTML = `
    <div>Conectado como <b style="color:var(--text)">${esc(S.profile.nome || firstName)}</b></div>
    <div class="nav-user-email">${esc(currentUserEmail)}</div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn ghost small" data-action="open-cloud-dialog" style="flex:1;padding:6px 8px;font-size:.75rem">⚡ Supabase</button>
      <button class="btn danger small" data-action="logout" style="padding:6px 10px;font-size:.75rem">Sair</button>
    </div>`;

  renderAlertBanners();

  $$('.app-nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  $$('.screen', $('#app-shell')).forEach(s => s.classList.toggle('active', s.dataset.screen === route));

  const el = $(`#screen-${route}`);
  if (el) {
    el.innerHTML = (RENDER[route] || RENDER.inicio)();
    if (animate) {
      el.classList.add('enter');
      setTimeout(() => el.classList.remove('enter'), 1100);
    }
  }
}

function go() {
  const rawHash = location.hash.slice(1); // ex: "/admin/users", "/app/treinos" ou "treinos"
  const role = S.profile.role || 'user';

  if (rawHash.startsWith('/admin')) {
    if (role !== 'admin') {
      currentArea = 'app';
      route = 'inicio';
      location.hash = '#/app/inicio';
      if (currentUserEmail) {
        toast('⛔ Rota /admin bloqueada: você não possui permissão de administrador.');
        render(true);
      }
      return;
    }
    currentArea = 'admin';
    const sub = rawHash.replace('/admin', '').replace(/^\/+/, '') || 'users';
    adminRoute = ADMIN_RENDER[sub] ? sub : 'users';
  } else {
    currentArea = 'app';
    const sub = rawHash.replace(/^\/?app\/?/, '').replace(/^\/+/, '') || 'inicio';
    route = RENDER[sub] ? sub : 'inicio';
  }

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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Geração de Ficha Inteligente a partir do Catálogo IA ---------- */
async function generateWorkoutFromCatalog(focoDesejado = 'Peito e Tríceps') {
  const maxEx = Number(aiSettings.max_exercicios_por_treino) || 5;
  const focusTerms = focoDesejado.toLowerCase();
  let pool = catalogExercises.filter(ex => {
    const g = (ex.grupo_muscular || '').toLowerCase();
    return focusTerms.includes(g) || g.includes(focusTerms);
  });
  if (pool.length < 3) pool = [...catalogExercises];

  const chosen = pool.slice(0, maxEx).map((ex, idx) => ({
    nome: ex.nome,
    series: idx === 0 ? 4 : 3,
    reps: S.profile.objetivo === 'ganhar' ? '8-10' : S.profile.objetivo === 'perder' ? '12-15' : '10-12',
    carga: '',
  }));

  const newW = {
    id: uid(),
    nome: `Treino IA · ${focoDesejado.split(' ')[0]}`,
    foco: focoDesejado,
    gerado_por_ia: true,
    exercicios: chosen,
  };

  if (sb && currentUserId) {
    try {
      const { data: wRow } = await sb.from('workouts').insert({
        user_id: currentUserId,
        nome: newW.nome,
        foco: newW.foco,
        gerado_por_ia: true,
        ordem: S.workouts.length + 1,
      }).select().single();

      if (wRow) {
        newW.id = wRow.id;
        await sb.from('workout_exercises').insert(
          chosen.map((ex, i) => ({
            workout_id: wRow.id,
            nome: ex.nome,
            series: ex.series,
            reps: ex.reps,
            carga: ex.carga,
            ordem: i + 1,
          }))
        );
      }
    } catch (e) { /* continua local */ }
  }

  S.workouts.push(newW);
  commit(`✨ "${newW.nome}" gerado com exercícios do Catálogo IA!`);
}

/* ---------- Ações ---------- */
const ACTIONS = {
  'switch-auth-tab': id => switchAuthTab(id),
  'logout': () => logoutUser(),
  'enable-notifications': () => requestNotificationPermission(),
  'switch-to-app-view': () => {
    currentArea = 'app';
    route = 'inicio';
    location.hash = '#/app/inicio';
    render(true);
  },
  'switch-to-admin-view': () => {
    if (S.profile.role !== 'admin') {
      toast('⛔ Apenas usuários com role "admin" podem acessar /admin.');
      return;
    }
    currentArea = 'admin';
    adminRoute = 'users';
    location.hash = '#/admin/users';
    render(true);
  },
  'refresh-admin-data': async () => {
    await fetchAllProfilesForAdminOrTrainer();
    if (sb) {
      const { data } = await sb.from('exercises_catalog').select('*').order('grupo_muscular', { ascending: true });
      if (data?.length) saveLocalCatalog(data);
    }
    render();
    toast('✅ Dados sincronizados com o Supabase!');
  },
  'del-catalog-exercise': async id => {
    if (sb) {
      try { await sb.from('exercises_catalog').delete().eq('id', id); } catch (e) { /* ignora */ }
    }
    saveLocalCatalog(catalogExercises.filter(x => String(x.id) !== String(id)));
    render();
    toast('Exercício removido do catálogo');
  },
  'generate-quick-ai-workout': () => {
    const focos = ['Peito e Tríceps', 'Costas e Bíceps', 'Pernas e Ombros'];
    const foco = focos[S.workouts.length % focos.length];
    generateWorkoutFromCatalog(foco);
  },
  'claim-student': async id => {
    if (sb && currentUserId) {
      try {
        await sb.from('profiles').update({ trainer_id: currentUserId }).eq('id', id);
      } catch (e) { /* ignora */ }
    }
    const target = allProfilesList.find(u => String(u.id) === String(id));
    if (target) target.trainer_id = currentUserId;
    const accs = loadAccounts();
    if (target && accs[target.email]) {
      accs[target.email].trainer_id = currentUserId;
      saveAccounts(accs);
    }
    render();
    toast('🤝 Aluno vinculado à sua carteira de Personal Trainer!');
  },
  'prescribe-workout': (id, btn) => {
    selectedStudentId = id;
    openWorkoutDialog(null, id, btn.dataset.name);
  },
  'open-missed-dialog': () => {
    const lastW = getLastWorkoutTimestamp();
    const hours = lastW ? Math.max(24, Math.floor((Date.now() - lastW) / 3600000)) : 24;
    $('#missed-workout-sub').textContent = `Já se passaram ${hours} horas desde o seu último treino registrado. Por que você faltou ao treino?`;
    $('#missed-workout-dialog').showModal();
  },
  'go-train-now': () => {
    $('#missed-workout-dialog')?.close();
    location.hash = '#/app/treinos';
    if (S.workouts.length) startWorkoutExecution(S.workouts[0].id);
  },
  'open-workout-exec': id => {
    if (route !== 'treinos') location.hash = '#/app/treinos';
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
    const creds = window.PulsoSupabase ? window.PulsoSupabase.getCredentials() : { url: '', anonKey: '', isConfigured: false };
    $('#supabase-url-input').value = creds.url || '';
    $('#supabase-key-input').value = creds.anonKey || '';
    $('#cloud-dialog-msg').textContent = creds.isConfigured
      ? '✅ Cliente @supabase/supabase-js conectado.'
      : 'Informe o SUPABASE_URL e SUPABASE_ANON_KEY do seu projeto.';
    $('#cloud-dialog').showModal();
  },
  'close-cloud-dialog': () => $('#cloud-dialog').close(),
  'clear-cloud-config': () => {
    if (window.PulsoSupabase) window.PulsoSupabase.clearCredentials();
    initSupabase();
    $('#cloud-dialog').close();
    toast('Credenciais do Supabase removidas deste navegador.');
  },
  'add-water': async id => {
    const before = score().total;
    const item = { id: uid(), ml: +id, hora: timeNow(), duranteTreino: false };
    today().water.push(item);
    if (sb && currentUserId) {
      try {
        const { data } = await sb.from('hydration_logs').insert({
          user_id: currentUserId,
          data: dkey(),
          hora: item.hora,
          ml: item.ml,
          durante_treino: false,
        }).select().single();
        if (data?.id) item.id = data.id;
      } catch (e) { /* salva local */ }
    }
    const gained = score().total - before;
    scheduleExactWaterTimer(true);
    commit(`+${id} ml de água${gained > 0 ? ` · +${gained} pts` : ''} · Timer reiniciado`);
  },
  'add-workout-water': async id => {
    const before = score().total;
    const item = { id: uid(), ml: +id, hora: timeNow(), duranteTreino: true };
    today().water.push(item);
    if (sb && currentUserId) {
      try {
        const { data } = await sb.from('hydration_logs').insert({
          user_id: currentUserId,
          data: dkey(),
          hora: item.hora,
          ml: item.ml,
          durante_treino: true,
        }).select().single();
        if (data?.id) item.id = data.id;
      } catch (e) { /* salva local */ }
    }
    const gained = score().total - before;
    scheduleExactWaterTimer(true);
    commit(`💦 +${id} ml hidratado no treino!${gained > 0 ? ` · +${gained} pts` : ''}`);
  },
  'del-water': async id => {
    today().water = today().water.filter(x => String(x.id) !== String(id));
    if (sb && currentUserId) {
      try { await sb.from('hydration_logs').delete().eq('id', id); } catch (e) { /* ignora */ }
    }
    scheduleExactWaterTimer(false);
    commit('Registro removido');
  },
  'del-meal': async id => {
    today().meals = today().meals.filter(x => String(x.id) !== String(id));
    if (sb && currentUserId) {
      try { await sb.from('nutrition_logs').delete().eq('id', id); } catch (e) { /* ignora */ }
    }
    commit('Alimento removido');
  },
  'del-session': async id => {
    today().sessions = today().sessions.filter(x => String(x.id) !== String(id));
    if (sb && currentUserId) {
      try { await sb.from('workout_sessions').delete().eq('id', id); } catch (e) { /* ignora */ }
    }
    commit('Treino removido');
  },
  'del-measure': async id => {
    S.measures = S.measures.filter(x => String(x.id) !== String(id));
    if (sb && currentUserId) {
      try { await sb.from('body_measurements').delete().eq('id', id); } catch (e) { /* ignora */ }
    }
    commit('Medida removida');
  },
  'toggle-day': id => {
    const d = +id;
    S.trainingDays = S.trainingDays.includes(d) ? S.trainingDays.filter(x => x !== d) : [...S.trainingDays, d].sort();
    commit();
  },
  'del-workout': async id => {
    const w = S.workouts.find(x => String(x.id) === String(id));
    if (w && confirm(`Excluir "${w.nome}"?`)) {
      S.workouts = S.workouts.filter(x => String(x.id) !== String(id));
      if (sb && currentUserId) {
        try { await sb.from('workouts').delete().eq('id', id); } catch (e) { /* ignora */ }
      }
      commit('Treino excluído');
    }
  },
  'new-workout': () => openWorkoutDialog(),
  'edit-workout': id => openWorkoutDialog(S.workouts.find(x => String(x.id) === String(id))),
  'add-ex-row': () => addExRow(),
  'del-ex-row': (id, btn) => btn.closest('.ex-row').remove(),
  'close-dialog': () => $('#workout-dialog').close(),
};

/* ---------- Diálogo de Criar/Editar Ficha de Treino ---------- */
function addExRow(e = { nome: '', series: 3, reps: '12' }) {
  const row = document.createElement('div');
  row.className = 'ex-row';
  row.innerHTML = `<input name="ex-nome" list="catalog-exercises-list" placeholder="Nome do exercício" value="${esc(e.nome)}" aria-label="Exercício" required />
    <input name="ex-series" type="number" min="1" max="20" value="${esc(e.series)}" placeholder="Séries" aria-label="Quantidade de séries" required />
    <input name="ex-reps" value="${esc(e.reps)}" placeholder="Ex: 10-12" aria-label="Meta de repetições" required />
    <button type="button" class="icon-btn" data-action="del-ex-row" aria-label="Remover exercício">${ICON.trash}</button>`;
  $('#ex-rows').appendChild(row);
  if (!e.nome) row.querySelector('input').focus();
}
function openWorkoutDialog(w, targetUserId = '', targetStudentName = '') {
  const f = $('#workout-form');
  f.reset();
  const dl = $('#catalog-exercises-list');
  if (dl) {
    dl.innerHTML = catalogExercises.map(c => `<option value="${esc(c.nome)}">${esc(c.grupo_muscular)}</option>`).join('');
  }
  $('#workout-dialog-title').textContent = targetStudentName
    ? `Prescrever treino para ${targetStudentName}`
    : (w ? 'Editar treino' : 'Novo treino');
  f.wid.value = w?.id || '';
  f.target_user_id.value = targetUserId || '';
  f.nome.value = w?.nome || '';
  f.foco.value = w?.foco || '';
  $('#ex-rows').innerHTML = '';
  (w?.exercicios?.length ? w.exercicios : [undefined]).forEach(e => addExRow(e));
  $('#workout-dialog').showModal();
  f.nome.focus();
}

/* ---------- Formulários (Supabase Auth + Tabelas PostgreSQL) ---------- */
const FORMS = {
  login: async f => {
    const email = f.email.value.trim().toLowerCase();
    const senha = f.senha.value;
    const errEl = $('#login-error');
    errEl.textContent = '';

    if (!isValidEmail(email)) {
      errEl.textContent = 'Informe um endereço de e-mail válido.';
      return;
    }

    if (sb) {
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        const userId = data.user?.id;
        const remoteState = await fetchUserDataFromSupabase(userId, email);
        const accs = loadAccounts();
        accs[email] = {
          ...(accs[email] || {}),
          id: userId,
          email,
          senha,
          role: remoteState?.profile?.role || 'user',
          nome: remoteState?.profile?.nome || email.split('@')[0],
        };
        saveAccounts(accs);
        await enterAppWithUser(email, remoteState || loadUserState(email), userId);
        toast(`Bem-vindo! Role: ${(S.profile.role || 'user').toUpperCase()} ⚡`);
        return;
      } catch (err) {
        errEl.textContent = 'E-mail ou senha incorretos no Supabase: ' + (err.message || '');
        return;
      }
    }

    const accs = loadAccounts();
    const acc = accs[email];
    if (!acc || acc.senha !== senha) {
      errEl.textContent = 'E-mail não encontrado ou senha incorreta.';
      return;
    }
    const localSt = loadUserState(email);
    if (acc.role) localSt.profile.role = acc.role;
    await enterAppWithUser(email, localSt, acc.id || email);
    toast(`Bem-vindo! Role: ${(S.profile.role || 'user').toUpperCase()}`);
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
    const role = ['admin', 'trainer', 'user'].includes(f.role?.value) ? f.role.value : 'user';
    const errEl = $('#register-error');
    errEl.textContent = '';

    if (nome.split(/\s+/).length < 2) {
      errEl.textContent = 'Informe seu nome completo (nome e sobrenome).';
      return;
    }
    if (!isValidEmail(email)) {
      errEl.textContent = 'Informe um endereço de e-mail válido.';
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
    let userId = uid();

    newState.profile = {
      id: userId,
      nome,
      email,
      role,
      trainer_id: null,
      nascimento: { dia, mes, ano },
      sexo,
      idade,
      altura: alturaCm,
      altura_m: alturaM,
      peso,
      atividade: 1.55,
      objetivo,
      meta_agua: Math.round((peso * 35) / 50) * 50,
      pontuacao: 0,
      configurado: true,
    };
    newState.measures = [{ id: uid(), data: dkey(), peso }];

    if (sb) {
      try {
        const { data, error } = await sb.auth.signUp({
          email,
          password: senha,
          options: {
            data: {
              nome,
              role,
              sexo,
              nascimento: { dia, mes, ano },
              idade,
              altura_m: alturaM,
              peso,
              atividade: 1.55,
              objetivo,
            },
          },
        });
        if (error) throw error;
        if (data?.user?.id) {
          userId = data.user.id;
          newState.profile.id = userId;
        }
        const remoteState = await fetchUserDataFromSupabase(userId, email);
        if (remoteState) {
          remoteState.profile.role = role;
        }
        const accs = loadAccounts();
        accs[email] = { id: userId, email, senha, nome, role, peso, meta_agua: newState.profile.meta_agua, pontuacao: 0 };
        saveAccounts(accs);
        await enterAppWithUser(email, remoteState || newState, userId);
        await syncProfileToSupabase();
        toast(`Conta criada no Supabase (${role.toUpperCase()})! 🎉`);
        return;
      } catch (err) {
        errEl.textContent = 'Erro ao cadastrar no Supabase: ' + (err.message || '');
        return;
      }
    }

    const accs = loadAccounts();
    if (accs[email]) {
      errEl.textContent = 'Esse e-mail já está cadastrado. Vá na aba "Entrar".';
      return;
    }
    accs[email] = { id: userId, email, senha, nome, role, peso, meta_agua: newState.profile.meta_agua, pontuacao: 0 };
    saveAccounts(accs);
    await enterAppWithUser(email, newState, userId);
    toast(`Conta criada! Perfil: ${role.toUpperCase()} 🎉`);
  },

  'admin-catalog': async f => {
    if (S.profile.role !== 'admin') return toast('⛔ Permissão negada.');
    const item = {
      id: uid(),
      nome: f.nome.value.trim(),
      grupo_muscular: f.grupo_muscular.value,
      equipamento: f.equipamento.value.trim() || 'Livre',
      nivel: f.nivel.value || 'intermediario',
      media_url: f.media_url.value.trim(),
      instrucoes: f.instrucoes.value.trim(),
      ativo_ia: true,
    };
    if (sb && currentUserId) {
      try {
        const { data, error } = await sb.from('exercises_catalog').insert({
          nome: item.nome,
          grupo_muscular: item.grupo_muscular,
          equipamento: item.equipamento,
          nivel: item.nivel,
          media_url: item.media_url,
          instrucoes: item.instrucoes,
          ativo_ia: true,
          created_by: currentUserId,
        }).select().single();
        if (!error && data) item.id = data.id;
      } catch (e) { /* salva local */ }
    }
    saveLocalCatalog([item, ...catalogExercises]);
    f.reset();
    render();
    toast(`✅ "${item.nome}" adicionado ao Catálogo IA!`);
  },

  'admin-ai-settings': async f => {
    if (S.profile.role !== 'admin') return toast('⛔ Permissão negada.');
    const cfg = {
      modelo: f.modelo.value,
      temperatura: +f.temperatura.value || 0.4,
      max_exercicios_por_treino: +f.max_exercicios_por_treino.value || 6,
      priorizar_catalogo: true,
      prompt_sistema: f.prompt_sistema.value.trim(),
    };
    if (sb) {
      try {
        await sb.from('ai_settings').upsert({ id: 1, ...cfg });
      } catch (e) { /* salva local */ }
    }
    saveLocalAiSettings(cfg);
    render();
    toast('🤖 Configurações do motor de IA salvas!');
  },

  'generate-ai-workout': async f => {
    await generateWorkoutFromCatalog(f.foco_ia.value);
  },

  'exec-workout': async f => {
    if (!activeExecution) return;
    const w = S.workouts.find(x => String(x.id) === String(activeExecution.workoutId));
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
      const lastCarga = series[series.length - 1]?.carga;
      if (lastCarga && lastCarga !== '0') ex.carga = lastCarga;
      return { nome: ex.nome, series };
    });

    const before = score().total;
    const sessionItem = {
      id: uid(),
      workoutId: w.id,
      nome: w.nome,
      tipo,
      min,
      kcal: sessionKcal(tipo, min),
      hora: timeNow(),
      detalhes,
    };

    if (sb && currentUserId) {
      try {
        const { data } = await sb.from('workout_sessions').insert({
          user_id: currentUserId,
          workout_id: String(w.id).length > 10 ? w.id : null,
          data: dkey(),
          hora: sessionItem.hora,
          nome: sessionItem.nome,
          tipo: sessionItem.tipo,
          min: sessionItem.min,
          kcal: sessionItem.kcal,
          detalhes: sessionItem.detalhes,
        }).select().single();
        if (data?.id) sessionItem.id = data.id;
      } catch (e) { /* salva local */ }
    }

    today().sessions.push(sessionItem);
    S.lastWorkoutAt = Date.now();
    activeExecution = null;
    const gained = score().total - before;
    commit(gained > 0 ? `Treino finalizado! +${gained} pontos 🔥` : 'Treino salvo no Supabase! 💪');
  },

  'notif-settings': f => {
    S.notifications.waterIntervalMin = +f.waterIntervalMin.value || 90;
    scheduleExactWaterTimer(true);
    commit(`⏱️ Timer de água iniciado (${S.notifications.waterIntervalMin} min)!`);
  },

  'missed-workout': f => {
    const motivo = f.motivo.value;
    const nota = f.nota.value.trim();
    S.missedReasons = S.missedReasons || [];
    S.missedReasons.push({ id: uid(), data: dkey(), hora: timeNow(), motivo, nota });
    $('#missed-workout-dialog').close();
    if (motivo.includes('esqueci de registrar')) {
      location.hash = '#/app/treinos';
      toast('Abra seu treino abaixo e registre suas séries!');
    } else {
      commit('Justificativa registrada. Amanhã voltamos com tudo! 💪');
    }
  },

  cloud: async f => {
    const url = f.supabase_url.value.trim();
    const anonKey = f.supabase_anon_key.value.trim();
    if (!url || !anonKey || !/^https?:\/\//i.test(url)) {
      $('#cloud-dialog-msg').textContent = '❌ Informe uma SUPABASE_URL válida (https://...) e a SUPABASE_ANON_KEY.';
      return;
    }
    window.PulsoSupabase.saveCredentials(url, anonKey);
    const ok = await initSupabase();
    if (ok) {
      $('#cloud-dialog').close();
      if (currentUserEmail) await syncProfileToSupabase();
      toast('⚡ Conectado ao Supabase com sucesso!');
    } else {
      $('#cloud-dialog-msg').textContent = '❌ Não foi possível inicializar o cliente Supabase.';
    }
  },

  meal: async f => {
    const before = score().total;
    const item = {
      id: uid(),
      tipo: f.tipo.value,
      nome: f.nome.value.trim(),
      kcal: +f.kcal.value,
      prot: +f.prot.value || 0,
      hora: timeNow(),
    };
    today().meals.push(item);
    if (sb && currentUserId) {
      try {
        const { data } = await sb.from('nutrition_logs').insert({
          user_id: currentUserId,
          data: dkey(),
          hora: item.hora,
          tipo: item.tipo,
          nome: item.nome,
          kcal: item.kcal,
          prot: item.prot,
        }).select().single();
        if (data?.id) item.id = data.id;
      } catch (e) { /* salva local */ }
    }
    const gained = score().total - before;
    commit(`${item.nome} adicionado${gained > 0 ? ` · +${gained} pts` : ''}`);
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
    commit('Perfil salvo no Supabase · metas atualizadas');
  },

  measure: async f => {
    const m = { id: uid(), data: f.data.value };
    ['peso', 'cintura', 'quadril', 'peito', 'braco', 'coxa', 'gordura'].forEach(k => { if (f[k].value !== '') m[k] = +f[k].value; });
    if (Object.keys(m).length <= 2) return toast('Preencha pelo menos uma medida');

    if (sb && currentUserId) {
      try {
        const { data } = await sb.from('body_measurements').insert({
          user_id: currentUserId,
          data: m.data,
          peso: m.peso ?? null,
          cintura: m.cintura ?? null,
          quadril: m.quadril ?? null,
          peito: m.peito ?? null,
          braco: m.braco ?? null,
          coxa: m.coxa ?? null,
          gordura: m.gordura ?? null,
        }).select().single();
        if (data?.id) m.id = data.id;
      } catch (e) { /* salva local */ }
    }

    S.measures.push(m);
    const latest = [...S.measures].filter(x => x.peso).sort((a, b) => b.data.localeCompare(a.data))[0];
    if (latest) S.profile.peso = latest.peso;
    commit('Medidas salvas em body_measurements');
  },

  workout: async f => {
    const exercicios = $$('.ex-row', f).map(r => ({
      nome: r.querySelector('[name="ex-nome"]').value.trim(),
      series: Math.max(1, +r.querySelector('[name="ex-series"]').value || 1),
      reps: r.querySelector('[name="ex-reps"]').value.trim() || '10',
      carga: '',
    })).filter(e => e.nome);

    const targetUserId = f.target_user_id.value || currentUserId;
    const data = { nome: f.nome.value.trim(), foco: f.foco.value.trim(), exercicios };
    const existing = S.workouts.find(x => String(x.id) === String(f.wid.value));

    if (sb && targetUserId) {
      try {
        if (existing && String(existing.id).length > 10) {
          await sb.from('workouts').update({ nome: data.nome, foco: data.foco }).eq('id', existing.id);
          await sb.from('workout_exercises').delete().eq('workout_id', existing.id);
          await sb.from('workout_exercises').insert(
            exercicios.map((ex, idx) => ({
              workout_id: existing.id,
              nome: ex.nome,
              series: ex.series,
              reps: ex.reps,
              carga: ex.carga,
              ordem: idx + 1,
            }))
          );
        } else {
          const { data: wRow } = await sb.from('workouts').insert({
            user_id: targetUserId,
            trainer_id: targetUserId !== currentUserId ? currentUserId : null,
            nome: data.nome,
            foco: data.foco,
            ordem: S.workouts.length + 1,
          }).select().single();
          if (wRow) {
            data.id = wRow.id;
            await sb.from('workout_exercises').insert(
              exercicios.map((ex, idx) => ({
                workout_id: wRow.id,
                nome: ex.nome,
                series: ex.series,
                reps: ex.reps,
                carga: ex.carga,
                ordem: idx + 1,
              }))
            );
          }
        }
      } catch (e) { /* salva local */ }
    }

    if (targetUserId && targetUserId !== currentUserId) {
      $('#workout-dialog').close();
      toast('🏋️ Ficha prescrita e salva para o aluno!');
      return;
    }

    if (existing) Object.assign(existing, data);
    else S.workouts.push({ id: data.id || uid(), ...data });
    $('#workout-dialog').close();
    commit(existing ? 'Treino atualizado' : 'Treino criado');
  },
};

/* ---------- Eventos Globais ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.tagName === 'SELECT') return;
  const fn = ACTIONS[btn.dataset.action];
  if (fn) { e.preventDefault(); fn(btn.dataset.id, btn); }
});

document.addEventListener('change', async e => {
  const sel = e.target.closest('select[data-action]');
  if (!sel) return;
  const action = sel.dataset.action;
  const userId = sel.dataset.userId;
  const userEmail = sel.dataset.userEmail;

  if (action === 'change-user-role') {
    if (S.profile.role !== 'admin') return toast('⛔ Apenas administradores podem alterar roles.');
    const newRole = sel.value;
    if (sb) {
      try { await sb.from('profiles').update({ role: newRole }).eq('id', userId); } catch (err) { /* ignora */ }
    }
    const u = allProfilesList.find(x => String(x.id) === String(userId) || x.email === userEmail);
    if (u) u.role = newRole;
    const accs = loadAccounts();
    if (userEmail && accs[userEmail]) {
      accs[userEmail].role = newRole;
      saveAccounts(accs);
    }
    if (userEmail === currentUserEmail) {
      S.profile.role = newRole;
      saveLocalState();
    }
    toast(`✅ Role de ${userEmail || userId} alterada para "${newRole}"`);
    render();
  }

  if (action === 'assign-user-trainer') {
    if (S.profile.role !== 'admin') return toast('⛔ Apenas administradores podem vincular trainers.');
    const trainerId = sel.value || null;
    if (sb) {
      try { await sb.from('profiles').update({ trainer_id: trainerId }).eq('id', userId); } catch (err) { /* ignora */ }
    }
    const u = allProfilesList.find(x => String(x.id) === String(userId) || x.email === userEmail);
    if (u) u.trainer_id = trainerId;
    const accs = loadAccounts();
    if (userEmail && accs[userEmail]) {
      accs[userEmail].trainer_id = trainerId;
      saveAccounts(accs);
    }
    toast('✅ Vínculo de Personal Trainer atualizado!');
  }
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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentUserEmail) {
    checkPeriodicNotifications();
  }
});

let lastDay = dkey();
setInterval(() => {
  if (dkey() !== lastDay) { lastDay = dkey(); if (currentUserEmail) render(); }
  if (currentUserEmail) {
    const cd = $('#water-timer-countdown');
    if (cd) {
      const k = dkey();
      cd.value = waterOf(k) >= waterGoal(k)
        ? 'Meta de água concluída hoje! ✅'
        : formatWaterCountdown((S.notifications.nextWaterRemindAt || (Date.now() + getWaterIntervalMs())) - Date.now());
    }
    checkPeriodicNotifications();
  }
}, 1000);

/* ---------- Inicialização ---------- */
(async function bootstrap() {
  await registerServiceWorker();
  catalogExercises = loadLocalCatalog();
  aiSettings = loadLocalAiSettings();
  await initSupabase();

  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        const email = session.user.email;
        const userId = session.user.id;
        const remote = await fetchUserDataFromSupabase(userId, email);
        await enterAppWithUser(email, remote || loadUserState(email), userId);
        if ('Notification' in window && Notification.permission === 'granted') {
          subscribeUserToWebPush();
        }
        return;
      }
    } catch (e) { /* fallback sessão local */ }
  }

  try {
    const savedRaw = localStorage.getItem(SESSION_KEY);
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      const email = parsed?.email || savedRaw;
      const userId = parsed?.id || email;
      const state = loadUserState(email);
      await enterAppWithUser(email, state, userId);
      if ('Notification' in window && Notification.permission === 'granted') {
        subscribeUserToWebPush();
      }
      return;
    }
  } catch (e) { /* ignora */ }

  render();
})();
