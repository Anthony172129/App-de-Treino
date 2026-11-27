-- =============================================================================
-- PULSO — SCHEMA COMPLETO DO BANCO DE DADOS (SUPABASE / POSTGRESQL)
-- Inclui:
--   1. Controle de Acesso Baseado em Roles (RBAC): 'admin', 'trainer', 'user'
--   2. Trigger automático de criação de perfil em auth.users
--   3. Catálogo Base de Exercícios para IA (exercises_catalog)
--   4. Fichas de Treino (workouts), Exercícios da Ficha (workout_exercises) e Sessões Concluídas (workout_sessions)
--   5. Logs de Alimentação (nutrition_logs), Hidratação (hydration_logs) e Medidas Corporais (body_measurements)
--   6. Configurações do Motor de IA (ai_settings)
--   7. Políticas completas de Row Level Security (RLS) para user, trainer e admin
-- =============================================================================

-- Extensão para geração de UUIDs
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. TABELA: public.profiles (Vinculada ao auth.users via Trigger)
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nome text not null default '',
  role text not null default 'user' check (role in ('admin', 'trainer', 'user')),
  trainer_id uuid references public.profiles(id) on delete set null,
  sexo text not null default 'm' check (sexo in ('m', 'f')),
  nascimento jsonb not null default '{"dia": 1, "mes": 1, "ano": 2000}'::jsonb,
  idade integer not null default 25,
  altura numeric(5,2) not null default 175, -- em cm (ex: 175)
  altura_m numeric(4,2) not null default 1.75, -- em metros (ex: 1.75)
  peso numeric(5,2) not null default 75.0,
  atividade numeric(4,3) not null default 1.55,
  objetivo text not null default 'manter' check (objetivo in ('perder', 'manter', 'ganhar')),
  meta_agua integer not null default 2650,
  meta_calorias integer not null default 2200,
  pontuacao integer not null default 0,
  best_streak integer not null default 0,
  training_days integer[] not null default array[1, 2, 3, 4, 5, 6],
  last_workout_at bigint not null default 0,
  missed_reasons jsonb not null default '[]'::jsonb,
  notifications jsonb not null default '{
    "enabled": true,
    "waterIntervalMin": 90,
    "mealHours": [8, 12, 16, 20],
    "lastWaterRemindAt": 0,
    "nextWaterRemindAt": 0,
    "lastMealRemindHour": -1,
    "lastMissedPromptAt": 0
  }'::jsonb,
  configurado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para buscas rápidas por role e vínculo de personal trainer
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_trainer_id on public.profiles(trainer_id);

-- =============================================================================
-- 2. FUNÇÕES AUXILIARES DE RBAC (SECURITY DEFINER PARA EVITAR RECURSÃO EM RLS)
-- =============================================================================
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'admin';
$$;

create or replace function public.is_trainer_of(student_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = student_uuid
      and trainer_id = auth.uid()
  ) and public.get_my_role() in ('trainer', 'admin');
$$;

-- Trigger de atualização automática de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Trigger automático que cria o registro em public.profiles + fichas iniciais ao cadastrar em auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peso numeric := coalesce((new.raw_user_meta_data->>'peso')::numeric, 75);
  v_altura_m numeric := coalesce((new.raw_user_meta_data->>'altura_m')::numeric, 1.75);
  v_altura_cm numeric := round(v_altura_m * 100);
  v_idade integer := coalesce((new.raw_user_meta_data->>'idade')::integer, 25);
  v_sexo text := coalesce(new.raw_user_meta_data->>'sexo', 'm');
  v_objetivo text := coalesce(new.raw_user_meta_data->>'objetivo', 'manter');
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'user');
  v_meta_agua integer := round((v_peso * 35) / 50.0) * 50;
  v_w_a uuid;
  v_w_b uuid;
  v_w_c uuid;
begin
  if v_role not in ('admin', 'trainer', 'user') then
    v_role := 'user';
  end if;

  insert into public.profiles (
    id, email, nome, role, sexo, nascimento, idade, altura, altura_m, peso,
    atividade, objetivo, meta_agua, configurado
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    v_role,
    v_sexo,
    coalesce(new.raw_user_meta_data->'nascimento', '{"dia": 1, "mes": 1, "ano": 2000}'::jsonb),
    v_idade,
    v_altura_cm,
    v_altura_m,
    v_peso,
    coalesce((new.raw_user_meta_data->>'atividade')::numeric, 1.55),
    v_objetivo,
    v_meta_agua,
    true
  )
  on conflict (id) do nothing;

  -- Cria medida corporal inicial
  insert into public.body_measurements (user_id, data, peso)
  values (new.id, current_date, v_peso);

  -- Cria fichas padrão A, B e C para o novo usuário
  insert into public.workouts (user_id, nome, foco, ordem)
  values (new.id, 'Treino A', 'Peito e tríceps', 1)
  returning id into v_w_a;

  insert into public.workout_exercises (workout_id, nome, series, reps, carga, ordem) values
    (v_w_a, 'Supino reto', 4, '10', '40', 1),
    (v_w_a, 'Supino inclinado halteres', 3, '12', '14', 2),
    (v_w_a, 'Crucifixo', 3, '12', '10', 3),
    (v_w_a, 'Tríceps corda', 4, '12', '20', 4);

  insert into public.workouts (user_id, nome, foco, ordem)
  values (new.id, 'Treino B', 'Costas e bíceps', 2)
  returning id into v_w_b;

  insert into public.workout_exercises (workout_id, nome, series, reps, carga, ordem) values
    (v_w_b, 'Puxada frontal', 4, '10', '45', 1),
    (v_w_b, 'Remada curvada', 4, '10', '30', 2),
    (v_w_b, 'Rosca direta', 3, '12', '12', 3),
    (v_w_b, 'Rosca martelo', 3, '12', '10', 4);

  insert into public.workouts (user_id, nome, foco, ordem)
  values (new.id, 'Treino C', 'Pernas e ombros', 3)
  returning id into v_w_c;

  insert into public.workout_exercises (workout_id, nome, series, reps, carga, ordem) values
    (v_w_c, 'Agachamento livre', 4, '10', '50', 1),
    (v_w_c, 'Leg press', 4, '12', '120', 2),
    (v_w_c, 'Cadeira extensora', 3, '15', '35', 3),
    (v_w_c, 'Desenvolvimento', 4, '10', '12', 4);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =============================================================================
-- 3. TABELA: public.exercises_catalog (Catálogo Base para Geração de Treinos IA)
-- =============================================================================
create table if not exists public.exercises_catalog (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo_muscular text not null,
  equipamento text not null default 'Livre',
  nivel text not null default 'intermediario' check (nivel in ('iniciante', 'intermediario', 'avancado')),
  media_url text default '',
  instrucoes text default '',
  ativo_ia boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Seed inicial do catálogo de exercícios para a futura IA consultar
insert into public.exercises_catalog (nome, grupo_muscular, equipamento, nivel, media_url, instrucoes)
select * from (values
  ('Supino reto com barra', 'Peito', 'Barra e Banco', 'intermediario', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', 'Mantenha escápulas retraídas e desça a barra até a linha do esterno.'),
  ('Supino inclinado com halteres', 'Peito', 'Halteres e Banco 30°', 'intermediario', '', 'Foco na porção clavicular do peitoral.'),
  ('Crucifixo na máquina (Peck Deck)', 'Peito', 'Máquina', 'iniciante', '', 'Movimento amplo controlando a fase excêntrica.'),
  ('Puxada frontal aberta', 'Costas', 'Polia Alta', 'iniciante', '', 'Traga a barra em direção à parte superior do peito.'),
  ('Remada curvada pronada', 'Costas', 'Barra Livre', 'avancado', '', 'Coluna neutra e tronco inclinado a 45 graus.'),
  ('Agachamento livre com barra', 'Pernas', 'Barra e Gaiola', 'avancado', '', 'Joelho alinhado com a ponta dos pés, descendo até quebrar a paralela.'),
  ('Leg press 45°', 'Pernas', 'Máquina Leg Press', 'intermediario', '', 'Não trave os joelhos na extensão total.'),
  ('Cadeira extensora', 'Pernas', 'Máquina', 'iniciante', '', 'Segure 1 segundo no pico de contração.'),
  ('Mesa flexora', 'Pernas', 'Máquina', 'iniciante', '', 'Mantenha o quadril apoiado no banco durante toda a execução.'),
  ('Desenvolvimento com halteres', 'Ombros', 'Halteres', 'intermediario', '', 'Empurre os halteres acima da cabeça sem arquear a lombar.'),
  ('Elevação lateral', 'Ombros', 'Halteres', 'iniciante', '', 'Eleve até a linha dos ombros com leve flexão de cotovelos.'),
  ('Tríceps corda na polia', 'Tríceps', 'Polia Alta', 'iniciante', '', 'Mantenha os cotovelos fixos ao lado do tronco.'),
  ('Rosca direta com barra W', 'Bíceps', 'Barra W', 'iniciante', '', 'Evite balançar o tronco durante a subida.')
) as seed(nome, grupo_muscular, equipamento, nivel, media_url, instrucoes)
where not exists (select 1 from public.exercises_catalog limit 1);

-- =============================================================================
-- 4. TABELA: public.ai_settings (Configurações de Geração de Treino por IA)
-- =============================================================================
create table if not exists public.ai_settings (
  id integer primary key default 1 check (id = 1),
  modelo text not null default 'gemini-2.5-flash',
  temperatura numeric(3,2) not null default 0.40,
  max_exercicios_por_treino integer not null default 6,
  priorizar_catalogo boolean not null default true,
  prompt_sistema text not null default 'Você é um fisiologista do exercício e personal trainer especialista. Monte fichas de treino personalizadas usando exclusivamente os exercícios ativos na tabela exercises_catalog.',
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

-- =============================================================================
-- 5. TABELAS: public.workouts, public.workout_exercises, public.workout_sessions
-- =============================================================================
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null,
  nome text not null,
  foco text not null default '',
  gerado_por_ia boolean not null default false,
  ordem integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workouts_user_id on public.workouts(user_id);
create index if not exists idx_workouts_trainer_id on public.workouts(trainer_id);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  catalog_exercise_id uuid references public.exercises_catalog(id) on delete set null,
  nome text not null,
  series integer not null default 3,
  reps text not null default '10-12',
  carga text not null default '',
  ordem integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_exercises_workout_id on public.workout_exercises(workout_id);

-- Histórico de execuções/sessões de treino concluídas (Série por Série)
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  data date not null default current_date,
  hora text not null default '12:00',
  nome text not null,
  tipo text not null default 'musculacao',
  min integer not null default 60,
  kcal integer not null default 300,
  detalhes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_sessions_user_date on public.workout_sessions(user_id, data);

-- =============================================================================
-- 6. TABELA: public.nutrition_logs (Registros Diários de Alimentação / Calorias)
-- =============================================================================
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  hora text not null default '12:00',
  tipo text not null default 'Almoço',
  nome text not null,
  kcal integer not null default 0,
  prot numeric(6,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_nutrition_logs_user_date on public.nutrition_logs(user_id, data);

-- =============================================================================
-- 7. TABELA: public.hydration_logs (Registros Diários de Água + Reposição de Suor)
-- =============================================================================
create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  hora text not null default '12:00',
  ml integer not null check (ml > 0),
  durante_treino boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_hydration_logs_user_date on public.hydration_logs(user_id, data);

-- =============================================================================
-- 8. TABELA: public.body_measurements (Medidas Corporais & Evolução de Peso)
-- =============================================================================
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  peso numeric(5,2),
  cintura numeric(5,2),
  quadril numeric(5,2),
  peito numeric(5,2),
  braco numeric(5,2),
  coxa numeric(5,2),
  gordura numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_body_measurements_user_date on public.body_measurements(user_id, data);

-- =============================================================================
-- 9. ROW LEVEL SECURITY (RLS) — POLÍTICAS DE SEGURANÇA POR ROLE
--    - 'user': acessa e edita apenas seus próprios dados
--    - 'trainer': acessa seus próprios dados e os dados dos alunos vinculados a ele (trainer_id = auth.uid())
--    - 'admin': permissão total (CRUD completo em todas as tabelas, inclusive catálogo de exercícios)
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.exercises_catalog enable row level security;
alter table public.ai_settings enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.body_measurements enable row level security;

-- ---------------- PROFILES ----------------
drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.get_my_role() = 'trainer' and (trainer_id = auth.uid() or role = 'user'))
);

drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy" on public.profiles
for insert to authenticated
with check (
  id = auth.uid() or public.is_admin()
);

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy" on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.get_my_role() = 'trainer' and (trainer_id = auth.uid() or trainer_id is null))
)
with check (
  id = auth.uid()
  or public.is_admin()
  or (public.get_my_role() = 'trainer' and (trainer_id = auth.uid() or trainer_id is null))
);

drop policy if exists "profiles_delete_policy" on public.profiles;
create policy "profiles_delete_policy" on public.profiles
for delete to authenticated
using (public.is_admin());

-- ---------------- EXERCISES_CATALOG ----------------
drop policy if exists "catalog_select_all" on public.exercises_catalog;
create policy "catalog_select_all" on public.exercises_catalog
for select to authenticated
using (true);

drop policy if exists "catalog_admin_all" on public.exercises_catalog;
create policy "catalog_admin_all" on public.exercises_catalog
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------- AI_SETTINGS ----------------
drop policy if exists "ai_settings_select" on public.ai_settings;
create policy "ai_settings_select" on public.ai_settings
for select to authenticated
using (true);

drop policy if exists "ai_settings_admin_all" on public.ai_settings;
create policy "ai_settings_admin_all" on public.ai_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------- WORKOUTS ----------------
drop policy if exists "workouts_access_policy" on public.workouts;
create policy "workouts_access_policy" on public.workouts
for all to authenticated
using (
  user_id = auth.uid()
  or trainer_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or trainer_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
);

-- ---------------- WORKOUT_EXERCISES ----------------
drop policy if exists "workout_exercises_access_policy" on public.workout_exercises;
create policy "workout_exercises_access_policy" on public.workout_exercises
for all to authenticated
using (
  exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id
      and (
        w.user_id = auth.uid()
        or w.trainer_id = auth.uid()
        or public.is_trainer_of(w.user_id)
        or public.is_admin()
      )
  )
)
with check (
  exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id
      and (
        w.user_id = auth.uid()
        or w.trainer_id = auth.uid()
        or public.is_trainer_of(w.user_id)
        or public.is_admin()
      )
  )
);

-- ---------------- WORKOUT_SESSIONS ----------------
drop policy if exists "workout_sessions_access_policy" on public.workout_sessions;
create policy "workout_sessions_access_policy" on public.workout_sessions
for all to authenticated
using (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
);

-- ---------------- NUTRITION_LOGS ----------------
drop policy if exists "nutrition_logs_access_policy" on public.nutrition_logs;
create policy "nutrition_logs_access_policy" on public.nutrition_logs
for all to authenticated
using (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
);

-- ---------------- HYDRATION_LOGS ----------------
drop policy if exists "hydration_logs_access_policy" on public.hydration_logs;
create policy "hydration_logs_access_policy" on public.hydration_logs
for all to authenticated
using (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
);

-- ---------------- BODY_MEASUREMENTS ----------------
drop policy if exists "body_measurements_access_policy" on public.body_measurements;
create policy "body_measurements_access_policy" on public.body_measurements
for all to authenticated
using (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
)
with check (
  user_id = auth.uid()
  or public.is_trainer_of(user_id)
  or public.is_admin()
);
