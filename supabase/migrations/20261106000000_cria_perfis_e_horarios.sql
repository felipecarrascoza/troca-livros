-- Troca-Livros: tabelas de perfil e horários do professor, com RLS,
-- e bloqueio de e-mails fora da escola NO SERVIDOR.

-- ---------- Tabela perfis ----------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  papel text not null check (papel in ('aluno', 'professor')),
  nome text check (nome is null or char_length(nome) between 5 and 120),
  programa text check (programa in ('Brasileiro', 'Internacional')),
  ano text check (ano in (
    '6º ano (Fundamental)', '7º ano (Fundamental)', '8º ano (Fundamental)',
    '9º ano (Fundamental)', '1º ano (Ensino Médio)', '2º ano (Ensino Médio)',
    '3º ano (Ensino Médio)')),
  periodo text check (periodo in ('Diurno', 'Integral', 'Noturno')),
  criado_em timestamptz not null default now(),
  -- professor não tem programa, ano nem período
  constraint professor_sem_dados_de_aluno check (
    papel = 'aluno' or (programa is null and ano is null and periodo is null))
);

alter table public.perfis enable row level security;

create policy perfis_ver_proprio on public.perfis
  for select to authenticated
  using ((select auth.uid()) = id);

create policy perfis_alterar_proprio on public.perfis
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A pessoa só pode alterar estes campos (e-mail e papel ficam travados)
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome, programa, ano, periodo) on public.perfis to authenticated;

-- ---------- Tabela horarios_professor ----------
create table public.horarios_professor (
  id bigint generated always as identity primary key,
  professor_id uuid not null references public.perfis (id) on delete cascade,
  dia text not null check (dia in ('seg', 'ter', 'qua', 'qui', 'sex')),
  inicio time not null check (inicio >= time '06:00'),
  fim time not null check (fim <= time '22:00'),
  constraint fim_depois_do_inicio check (fim > inicio),
  constraint um_horario_por_dia unique (professor_id, dia)
);

alter table public.horarios_professor enable row level security;

create policy horarios_ver_proprios on public.horarios_professor
  for select to authenticated
  using ((select auth.uid()) = professor_id);

create policy horarios_criar_proprios on public.horarios_professor
  for insert to authenticated
  with check (
    (select auth.uid()) = professor_id
    and exists (select 1 from public.perfis p
                where p.id = (select auth.uid()) and p.papel = 'professor'));

create policy horarios_alterar_proprios on public.horarios_professor
  for update to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy horarios_apagar_proprios on public.horarios_professor
  for delete to authenticated
  using ((select auth.uid()) = professor_id);

revoke all on public.horarios_professor from anon, authenticated;
grant select, insert, update, delete on public.horarios_professor to authenticated;

-- ---------- Regra do e-mail, valendo no servidor ----------
-- Antes de criar a conta: só @alunos.g12.br (nome.sobrenome) ou @santanna.g12.br.
create or replace function public.checar_email_da_escola()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(new.email, '')));
begin
  -- mesmas regras do site: letras/números separados por . _ -
  if e ~ '^[a-z0-9]+([._-][a-z0-9]+)*@santanna\.g12\.br$'
     or e ~ '^[a-z0-9]+([._-][a-z0-9]+)*@alunos\.g12\.br$'
        and split_part(e, '@', 1) like '%.%' then
    return new;
  end if;
  raise exception 'Use o e-mail da escola (@alunos.g12.br ou @santanna.g12.br).'
    using errcode = 'check_violation';
end;
$$;

create trigger checar_email_antes_de_criar
  before insert on auth.users
  for each row execute function public.checar_email_da_escola();

-- Depois de criar a conta: cria o perfil, com o papel definido pelo e-mail.
create or replace function public.criar_perfil_do_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email, papel)
  values (
    new.id,
    lower(new.email),
    case when lower(new.email) like '%@santanna.g12.br' then 'professor' else 'aluno' end);
  return new;
end;
$$;

create trigger criar_perfil_depois_de_criar
  after insert on auth.users
  for each row execute function public.criar_perfil_do_novo_usuario();

-- Funções de gatilho não devem ser chamáveis pela API
revoke execute on function public.checar_email_da_escola() from public, anon, authenticated;
revoke execute on function public.criar_perfil_do_novo_usuario() from public, anon, authenticated;
