-- Troca-Livros: índice que faltava na chave estrangeira livros.criado_por
-- (apontado pelo verificador de desempenho do Supabase). Ajuda quando uma conta é apagada.
create index if not exists livros_criado_por_idx on public.livros (criado_por);
