'use strict';

/**
 * Disparador de Web Push Notifications (GitHub Actions -> Celular do Usuário)
 * Lê os usuários inscritos no Firestore (pulso-61be3 / coleção usuarios_pulso),
 * verifica o Timer exato de Hidratação (nextWaterRemindAt / waterIntervalMin),
 * Alimentação e Cobrança de 24h de Treino e envia Web Push real criptografado
 * com chaves VAPID mesmo com o app/navegador fechado, atualizando o próximo
 * ciclo do timer no Firestore após o disparo.
 */

const webpush = require('web-push');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pulso-61be3';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BNsRjJvsT-9CCBTZSWEdQ6WgavTeJ8Efwz9vUt2F0Rqx0fPTNbfBsm5fVGmbooYKukQJmDot6jUmWoSkwp08lYw';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:anthony172129@gmail.com';
const FORCE_TEST = process.env.FORCE_TEST === 'true';

if (!VAPID_PRIVATE_KEY) {
  console.error('❌ Erro: O secret VAPID_PRIVATE_KEY não está configurado nos Secrets do GitHub.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Converte um valor no formato REST do Firestore para objeto JavaScript normal
function fromFirestoreValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const out = {};
    const fields = v.mapValue.fields || {};
    for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
    return out;
  }
  return null;
}

// Converte objeto JS para formato REST do Firestore
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const k of Object.keys(v)) {
      if (v[k] !== undefined) fields[k] = toFirestoreValue(v[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

// Data/hora atual no fuso horário do Brasil (America/Sao_Paulo)
function getBrazilNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const dkey = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const brDate = new Date(`${dkey}T${map.hour}:${map.minute}:00-03:00`);
  return { dkey, hour, minute, dayOfWeek: brDate.getDay(), timestamp: now.getTime() };
}

function calcKcalGoal(p) {
  const bmr = Math.round(10 * (p.peso || 75) + 6.25 * (p.altura || 175) - 5 * (p.idade || 25) + (p.sexo === 'f' ? -161 : 5));
  const tdee = Math.round(bmr * Number(p.atividade || 1.55));
  const adj = { perder: -500, manter: 0, ganhar: 300 }[p.objetivo] || 0;
  return Math.max(p.sexo === 'f' ? 1200 : 1500, tdee + adj);
}

function calcWaterGoal(p, dayLog) {
  const basal = Math.round(((p.peso || 75) * 35) / 50) * 50;
  const sessions = dayLog?.sessions || [];
  const sweat = sessions.reduce((acc, s) => {
    const min = Number(s.min) || 60;
    return acc + Math.max(200, Math.round(((p.peso || 75) * 0.12 * min) / 50) * 50);
  }, 0);
  return basal + sweat;
}

async function fetchUsersFromFirestore() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios_pulso?pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao consultar Firestore (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return (data.documents || []).map(doc => {
    const fields = doc.fields || {};
    const parsed = { _docName: doc.name };
    for (const k of Object.keys(fields)) parsed[k] = fromFirestoreValue(fields[k]);
    return parsed;
  });
}

async function updateUserNotificationsInFirestore(docName, state) {
  if (!docName || !state) return;
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=state.notifications&updateMask.fieldPaths=updatedAt`;
  const body = {
    fields: {
      updatedAt: toFirestoreValue(Date.now()),
      state: toFirestoreValue(state),
    },
  };
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('⚠️ Falha ao atualizar timer no Firestore:', err.message);
  }
}

async function run() {
  const br = getBrazilNow();
  console.log(`🕒 Verificando timers e metas em ${br.dkey} às ${br.hour}:${String(br.minute).padStart(2, '0')} (Horário de Brasília)...`);

  const users = await fetchUsersFromFirestore();
  console.log(`👥 Total de contas encontradas no Firestore: ${users.length}`);

  let sentCount = 0;

  for (const u of users) {
    const state = u.state;
    const notif = state?.notifications || {};
    const sub = notif.pushSubscription;
    if (!sub || !sub.endpoint) continue;
    if (notif.enabled === false) continue;

    const nome = (state.profile?.nome || u.email || 'Atleta').split(' ')[0];
    const dayLog = (state.log && state.log[br.dkey]) || { water: [], meals: [], sessions: [] };
    const drankMl = (dayLog.water || []).reduce((acc, w) => acc + (Number(w.ml) || 0), 0);
    const waterGoal = calcWaterGoal(state.profile || {}, dayLog);
    const eatenKcal = (dayLog.meals || []).reduce((acc, m) => acc + (Number(m.kcal) || 0), 0);
    const kcalGoal = calcKcalGoal(state.profile || {});
    const trainedToday = (dayLog.sessions || []).length > 0;
    const isTrainDay = (state.trainingDays || [1, 2, 3, 4, 5, 6]).includes(br.dayOfWeek);

    const messagesToSend = [];
    let stateModified = false;

    // Modo de disparo de teste manual pelo botão Run Workflow do GitHub Actions
    if (FORCE_TEST) {
      messagesToSend.push({
        title: `🔔 Teste Web Push · Olá, ${nome}!`,
        body: `Suas notificações reais de Água (${drankMl}/${waterGoal} ml), Alimentação (${eatenKcal}/${kcalGoal} kcal) e Treino estão funcionando!`,
        tag: 'pulso-test',
        url: './index.html#inicio',
      });
    } else {
      // 1. Cobrança de Hidratação exatamente quando o timer de água fechar (mesmo com o app fechado)
      const intervalMin = Number(notif.waterIntervalMin) || 90;
      const intervalMs = intervalMin * 60000;
      const lastRemindAt = Number(notif.lastWaterRemindAt) || 0;
      const nextDueAt = Number(notif.nextWaterRemindAt) || (lastRemindAt > 0 ? lastRemindAt + intervalMs : 0);

      // Verifica se o timer de água já fechou (ou fecha dentro dos próximos 60 segundos)
      const waterTimerClosed = nextDueAt > 0 ? (br.timestamp + 60000 >= nextDueAt) : (br.timestamp - lastRemindAt >= intervalMs);

      if (drankMl < waterGoal && waterTimerClosed && (br.hour >= 7 && br.hour <= 23)) {
        const falta = waterGoal - drankMl;
        const dueAtExact = nextDueAt > br.timestamp ? nextDueAt : br.timestamp;
        messagesToSend.push({
          title: `💧 O timer de água fechou, ${nome}!`,
          body: `Hora de beber água! Você registrou ${drankMl} ml de ${waterGoal} ml hoje (faltam ${falta} ml). Beba 250 ml agora!`,
          tag: 'pulso-water-timer',
          url: './index.html#agua',
          dueAt: dueAtExact,
        });
        notif.lastWaterRemindAt = br.timestamp;
        notif.nextWaterRemindAt = br.timestamp + intervalMs;
        stateModified = true;
      }

      // 2. Cobrança de 24h após o último treino
      const lastW = Number(state.lastWorkoutAt) || 0;
      const hoursSinceWorkout = lastW ? (br.timestamp - lastW) / 3600000 : 0;
      const justifiedToday = (state.missedReasons || []).some(r => r.data === br.dkey);
      const lastMissedPushAt = Number(notif.lastMissedPromptAt) || 0;

      if (
        lastW > 0 &&
        hoursSinceWorkout >= 24 &&
        !trainedToday &&
        isTrainDay &&
        !justifiedToday &&
        br.hour >= 9 &&
        br.hour <= 22 &&
        (br.timestamp - lastMissedPushAt >= 4 * 3600000)
      ) {
        messagesToSend.push({
          title: `⚠️ ${nome}, faz ${Math.floor(hoursSinceWorkout)}h desde o último treino!`,
          body: 'Por que você ainda não treinou hoje? Toque para abrir seu treino e preencher suas séries ou justificar.',
          tag: 'pulso-workout-24h',
          url: './index.html#treinos',
        });
        notif.lastMissedPromptAt = br.timestamp;
        stateModified = true;
      }

      // 3. Cobrança de Alimentação (1x por faixa de horário de refeição)
      const meals = dayLog.meals || [];
      let mealMsg = null;
      let mealSlot = null;
      if (br.hour >= 8 && br.hour < 11 && meals.length === 0) {
        mealMsg = 'Ainda não vimos seu Café da manhã hoje!';
        mealSlot = `${br.dkey}-cafe`;
      } else if (br.hour >= 12 && br.hour < 15 && !meals.some(m => m.tipo === 'Almoço')) {
        mealMsg = 'Hora do Almoço! Não esqueça de se alimentar e registrar as calorias.';
        mealSlot = `${br.dkey}-almoco`;
      } else if (br.hour >= 16 && br.hour < 18 && meals.length < 2) {
        mealMsg = 'Hora do Lanche da tarde! Registre o que você comeu.';
        mealSlot = `${br.dkey}-lanche`;
      } else if (br.hour >= 19 && br.hour <= 22 && !meals.some(m => m.tipo === 'Jantar')) {
        mealMsg = 'Já jantou? Registre seu Jantar para fechar os pontos de alimentação do dia.';
        mealSlot = `${br.dkey}-jantar`;
      }

      if (mealMsg && mealSlot && notif.lastMealPushSlot !== mealSlot) {
        messagesToSend.push({
          title: `🍽️ Se alimente e registre, ${nome}!`,
          body: `${mealMsg} (${eatenKcal} de ${kcalGoal} kcal registradas hoje).`,
          tag: 'pulso-meal',
          url: './index.html#calorias',
        });
        notif.lastMealPushSlot = mealSlot;
        stateModified = true;
      }
    }

    for (const msg of messagesToSend) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(msg));
        sentCount++;
        console.log(`✅ Push [${msg.tag}] enviado para ${u.email}`);
      } catch (err) {
        console.warn(`⚠️ Falha ao enviar Push para ${u.email}:`, err.statusCode || err.message);
      }
    }

    if (stateModified) {
      await updateUserNotificationsInFirestore(u._docName, state);
    }
  }

  console.log(`🎉 Finalizado! Total de Web Push Notifications enviadas: ${sentCount}`);
}

run().catch(err => {
  console.error('Erro fatal no disparador de Web Push:', err);
  process.exit(1);
});
