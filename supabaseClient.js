'use strict';

/**
 * Cliente Oficial do Supabase (@supabase/supabase-js)
 * Lê as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (com suporte a prefixos NEXT_PUBLIC_ e VITE_, window.__ENV__, localStorage e fallback padrão do projeto).
 */

const SUPABASE_CONFIG_STORAGE_KEY = 'pulso-supabase-env-v1';

// Credenciais públicas oficiais do projeto Supabase (fowevndykefesdozdxwd)
const DEFAULT_SUPABASE_URL = 'https://fowevndykefesdozdxwd.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_6eo4lSgqSXX2qaEt9tpT_g_ZunKz8x1';

function resolveEnvVar(names) {
  for (const name of names) {
    // 1. Variáveis de ambiente Node / Next.js / Webpack (process.env)
    try {
      if (typeof process !== 'undefined' && process.env && process.env[name]) {
        return process.env[name];
      }
    } catch (e) { /* ignora */ }

    // 2. Variáveis globais em window.__ENV__ ou window[name]
    if (typeof window !== 'undefined') {
      if (window.__ENV__ && window.__ENV__[name]) return window.__ENV__[name];
      if (window[name]) return window[name];
    }
  }
  return '';
}

function getStoredSupabaseConfig() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.url && parsed.anonKey) return parsed;
  } catch (e) { /* ignora */ }
  return null;
}

function getSupabaseCredentials() {
  const envUrl = resolveEnvVar([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ]);
  const envKey = resolveEnvVar([
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
  ]);

  const stored = getStoredSupabaseConfig();
  const url = (envUrl && !envUrl.includes('SEU_PROJETO'))
    ? envUrl
    : (stored?.url || DEFAULT_SUPABASE_URL);
  const anonKey = (envKey && !envKey.includes('SUA_SUPABASE_ANON_KEY'))
    ? envKey
    : (stored?.anonKey || DEFAULT_SUPABASE_ANON_KEY);

  return {
    url: String(url).trim(),
    anonKey: String(anonKey).trim(),
    isConfigured: Boolean(url && anonKey && /^https?:\/\//i.test(url)),
  };
}

let supabaseInstance = null;

function initSupabaseClient() {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();
  if (!isConfigured) {
    supabaseInstance = null;
    return null;
  }

  // Suporta tanto o bundle global UMD (window.supabase.createClient) quanto ESM/CommonJS
  const createClientFn =
    (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
      ? window.supabase.createClient
      : (typeof require === 'function' ? require('@supabase/supabase-js').createClient : null);

  if (!createClientFn) {
    console.warn('Biblioteca @supabase/supabase-js ainda não carregada.');
    return null;
  }

  supabaseInstance = createClientFn(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

function saveSupabaseCredentials(url, anonKey) {
  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(anonKey || '').trim();
  if (!cleanUrl || !cleanKey) return null;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
  }
  return initSupabaseClient();
}

function clearSupabaseCredentials() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
  }
  supabaseInstance = null;
}

if (typeof window !== 'undefined') {
  window.PulsoSupabase = {
    getCredentials: getSupabaseCredentials,
    init: initSupabaseClient,
    getClient: () => supabaseInstance || initSupabaseClient(),
    saveCredentials: saveSupabaseCredentials,
    clearCredentials: clearSupabaseCredentials,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SUPABASE_URL,
    DEFAULT_SUPABASE_ANON_KEY,
    getSupabaseCredentials,
    initSupabaseClient,
    saveSupabaseCredentials,
    clearSupabaseCredentials,
  };
}
