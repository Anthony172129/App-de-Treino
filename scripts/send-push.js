'use strict';

/**
 * Disparador de Web Push Notifications (GitHub Actions -> Celular do Usuário via Supabase)
 * Lê os usuários inscritos nas tabelas do Supabase (`profiles`, `hydration_logs`, `nutrition_logs`, `workout_sessions`),
 * verifica o Timer exato de Hidratação (nextWaterRemindAt / waterIntervalMin),
 * Alimentação e Cobrança de 24h de Treino e envia Web Push real criptografado
 * com chaves VAPID mesmo com o app/navegador fechado, atualizando o próximo
 * ciclo do timer na tabela `profiles` do Supabase.
 */

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://fowevndykefesdozdxwd.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_6eo4lSgqSXX2qaEt9tpT_g_ZunKz8x1';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BNsRjJvsT-9CCBTZSWEdQ6WgavTeJ8Efwz9vUt2F0Rqx0fPTNbfBsm5fVGmbooYKukQJmDot6jUmWoSkwp08lYw';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:anthony172129@gmail.com';
const FORCE_TEST = process.env.FORCE_TEST === 'true';

if (!VAPID_PRIVATE_KEY) {
  console.error('❌ Erro: O secret VAPID_PRIVATE_KEY não está configurado nos Secrets do GitHub.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

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

function calcWaterGoal(p, sessions) {
  const basal = Math.round(((p.peso || 75) * 35) / 50) * 50;
  const sweat = (sessions || []).reduce((acc, s) => {
    const min = Number(s.min) || 60;
    return acc + Math.max(200, Math.round(((p.peso || 75) * 0.12 * min) / 50) * 50);
  }, 0);
  return basal + sweat;
}

async function run() {
  const br = getBrazilNow();
  console.log(`🕒 Verificando timers e metas no Supabase em ${br.dkey} às ${br.hour}:${String(br.minute).padStart(2, '0')} (Horário de Brasília)...`);

  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) {
    throw new Error(`Falha ao consultar tabela profiles no Supabase: ${profErr.message}`);
  }

  console.log(`👥 Total de perfis encontrados no Supabase: ${(profiles || []).length}`);

  let sentCount = 0;

  for (const p of profiles || []) {
    const notif = p.notifications || {};
    const sub = notif.pushSubscription;
    if (!sub || !sub.endpoint) continue;
    if (notif.enabled === false) continue;

    const [waterRes, mealsRes, sessionsRes] = await Promise.all([
      supabase.from('hydration_logs').select('ml').eq('user_id', p.id).eq('data', br.dkey),
      supabase.from('nutrition_logs').select('kcal, tipo').eq('user_id', p.id).eq('data', br.dkey),
      supabase.from('workout_sessions').select('min, kcal').eq('user_id', p.id).eq('data', br.dkey),
    ]);

    const waterRows = waterRes.data || [];
    const mealRows = mealsRes.data || [];
    const sessionRows = sessionsRes.data || [];

    const nome = (p.nome || p.email || 'Atleta').split(' ')[0];
    const drankMl = waterRows.reduce((acc, w) => acc + (Number(w.ml) || 0), 0);
    const waterGoal = calcWaterGoal(p, sessionRows);
    const eatenKcal = mealRows.reduce((acc, m) => acc + (Number(m.kcal) || 0), 0);
    const kcalGoal = p.meta_calorias || calcKcalGoal(p);
    const trainedToday = sessionRows.length > 0;
    const isTrainDay = (p.training_days || [1, 2, 3, 4, 5, 6]).includes(br.dayOfWeek);

    const messagesToSend = [];
    let notifModified = false;

    if (FORCE_TEST) {
      messagesToSend.push({
        title: `🔔 Teste Web Push (Supabase) · Olá, ${nome}!`,
        body: `Suas notificações reais de Água (${drankMl}/${waterGoal} ml), Alimentação (${eatenKcal}/${kcalGoal} kcal) e Treino estão funcionando!`,
        tag: 'pulso-test',
        url: './index.html#/app/inicio',
      });
    } else {
      // 1. Cobrança de Hidratação exatamente quando o timer de água fechar (mesmo com o app fechado)
      const intervalMin = Number(notif.waterIntervalMin) || 90;
      const intervalMs = intervalMin * 60000;
      const lastRemindAt = Number(notif.lastWaterRemindAt) || 0;
      const nextDueAt = Number(notif.nextWaterRemindAt) || (lastRemindAt > 0 ? lastRemindAt + intervalMs : 0);

      const waterTimerClosed = nextDueAt > 0 ? (br.timestamp + 60000 >= nextDueAt) : (br.timestamp - lastRemindAt >= intervalMs);

      if (drankMl < waterGoal && waterTimerClosed && (br.hour >= 7 && br.hour <= 23)) {
        const falta = waterGoal - drankMl;
        const dueAtExact = nextDueAt > br.timestamp ? nextDueAt : br.timestamp;
        messagesToSend.push({
          title: `💧 O timer de água fechou, ${nome}!`,
          body: `Hora de beber água! Você registrou ${drankMl} ml de ${waterGoal} ml hoje (faltam ${falta} ml). Beba 250 ml agora!`,
          tag: 'pulso-water-timer',
          url: './index.html#/app/agua',
          dueAt: dueAtExact,
        });
        notif.lastWaterRemindAt = br.timestamp;
        notif.nextWaterRemindAt = br.timestamp + intervalMs;
        notifModified = true;
      }

      // 2. Cobrança de 24h após o último treino
      const lastW = Number(p.last_workout_at) || 0;
      const hoursSinceWorkout = lastW ? (br.timestamp - lastW) / 3600000 : 0;
      const justifiedToday = (p.missed_reasons || []).some(r => r.data === br.dkey);
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
          url: './index.html#/app/treinos',
        });
        notif.lastMissedPromptAt = br.timestamp;
        notifModified = true;
      }

      // 3. Cobrança de Alimentação (1x por faixa de horário de refeição)
      let mealMsg = null;
      let mealSlot = null;
      if (br.hour >= 8 && br.hour < 11 && mealRows.length === 0) {
        mealMsg = 'Ainda não vimos seu Café da manhã hoje!';
        mealSlot = `${br.dkey}-cafe`;
      } else if (br.hour >= 12 && br.hour < 15 && !mealRows.some(m => m.tipo === 'Almoço')) {
        mealMsg = 'Hora do Almoço! Não esqueça de se alimentar e registrar as calorias.';
        mealSlot = `${br.dkey}-almoco`;
      } else if (br.hour >= 16 && br.hour < 18 && mealRows.length < 2) {
        mealMsg = 'Hora do Lanche da tarde! Registre o que você comeu.';
        mealSlot = `${br.dkey}-lanche`;
      } else if (br.hour >= 19 && br.hour <= 22 && !mealRows.some(m => m.tipo === 'Jantar')) {
        mealMsg = 'Já jantou? Registre seu Jantar para fechar os pontos de alimentação do dia.';
        mealSlot = `${br.dkey}-jantar`;
      }

      if (mealMsg && mealSlot && notif.lastMealPushSlot !== mealSlot) {
        messagesToSend.push({
          title: `🍽️ Se alimente e registre, ${nome}!`,
          body: `${mealMsg} (${eatenKcal} de ${kcalGoal} kcal registradas hoje).`,
          tag: 'pulso-meal',
          url: './index.html#/app/calorias',
        });
        notif.lastMealPushSlot = mealSlot;
        notifModified = true;
      }
    }

    for (const msg of messagesToSend) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(msg));
        sentCount++;
        console.log(`✅ Push [${msg.tag}] enviado para ${p.email}`);
      } catch (err) {
        console.warn(`⚠️ Falha ao enviar Push para ${p.email}:`, err.statusCode || err.message);
      }
    }

    if (notifModified) {
      await supabase.from('profiles').update({ notifications: notif }).eq('id', p.id);
    }
  }

  console.log(`🎉 Finalizado! Total de Web Push Notifications enviadas: ${sentCount}`);
}

run().catch(err => {
  console.error('Erro fatal no disparador de Web Push:', err);
  process.exit(1);
});
