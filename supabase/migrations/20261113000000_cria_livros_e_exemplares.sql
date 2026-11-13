-- Troca-Livros: catálogo de livros (um por ISBN) e exemplares (a cópia de cada pessoa),
-- com RLS. Segue o estilo da migração anterior.

-- ---------- Conferência do ISBN-13 (dígito verificador) ----------
-- Valida no servidor o mesmo cálculo que o site faz: 13 números, começando com 978 ou 979.
create or replace function public.isbn13_valido(isbn text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select isbn ~ '^97[89][0-9]{10}$'
     and (10 - (
           (select sum(substr(isbn, i, 1)::int * case when i % 2 = 1 then 1 else 3 end)
              from generate_series(1, 12) as i) % 10
         )) % 10 = substr(isbn, 13, 1)::int;
$$;

-- ---------- Tabela livros (catálogo: um registro por ISBN) ----------
create table public.livros (
  isbn13 text primary key check (public.isbn13_valido(isbn13)),
  titulo text not null check (char_length(titulo) between 1 and 300),
  autores text check (autores is null or char_length(autores) <= 300),
  editora text check (editora is null or char_length(editora) <= 200),
  ano smallint check (ano is null or ano between 1400 and 2100),
  paginas smallint check (paginas is null or paginas between 1 and 20000),
  capa_url text check (capa_url is null or (capa_url ~ '^https://[^[:space:]]+$' and char_length(capa_url) <= 500)),
  fonte text not null check (fonte in ('brasilapi', 'open-library', 'google-books', 'manual')),
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);

alter table public.livros enable row level security;

-- Quem está logado vê o catálogo inteiro (a busca de livros vai precisar disso).
create policy livros_ver_catalogo on public.livros
  for select to authenticated
  using (true);

-- Só cadastra livro quem já terminou o próprio perfil (tem nome).
create policy livros_criar on public.livros
  for insert to authenticated
  with check (
    (select auth.uid()) = criado_por
    and exists (select 1 from public.perfis p
                where p.id = (select auth.uid()) and p.nome is not null));

-- Ninguém altera nem apaga livro do catálogo pelo site: correções ficam com os desenvolvedores.
revoke all on public.livros from anon, authenticated;
grant select on public.livros to authenticated;
grant insert (isbn13, titulo, autores, editora, ano, paginas, capa_url, fonte)
  on public.livros to authenticated;

-- ---------- Tabela exemplares (a cópia de cada pessoa) ----------
create table public.exemplares (
  id uuid primary key default gen_random_uuid(),
  isbn13 text not null references public.livros (isbn13),
  dono_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  estado text not null check (estado in ('novo', 'bom', 'regular', 'desgastado')),
  oferta text not null check (oferta in ('troca', 'doacao', 'ambos')),
  observacao text check (observacao is null or char_length(observacao) <= 200),
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Chaves estrangeiras precisam de índice (junções e exclusões em cascata)
create index exemplares_dono_id_idx on public.exemplares (dono_id);
create index exemplares_isbn13_idx on public.exemplares (isbn13);

alter table public.exemplares enable row level security;

-- Quem está logado vê todos os exemplares (para poder procurar livros).
create policy exemplares_ver on public.exemplares
  for select to authenticated
  using (true);

create policy exemplares_criar_proprios on public.exemplares
  for insert to authenticated
  with check (
    (select auth.uid()) = dono_id
    and exists (select 1 from public.perfis p
                where p.id = (select auth.uid()) and p.nome is not null));

create policy exemplares_alterar_proprios on public.exemplares
  for update to authenticated
  using ((select auth.uid()) = dono_id)
  with check ((select auth.uid()) = dono_id);

create policy exemplares_apagar_proprios on public.exemplares
  for delete to authenticated
  using ((select auth.uid()) = dono_id);

-- O dono não pode ser trocado: só estes campos podem mudar
revoke all on public.exemplares from anon, authenticated;
grant select, delete on public.exemplares to authenticated;
grant insert (isbn13, estado, oferta, observacao) on public.exemplares to authenticated;
grant update (estado, oferta, observacao, disponivel) on public.exemplares to authenticated;

-- (isbn13_valido fica com a permissão padrão de propósito: é só uma conta matemática,
--  sem acesso a dados, e o próprio banco precisa chamá-la ao conferir o ISBN na gravação.)
