/* ==========================================================
   Ligação com o Supabase (o servidor do site).

   Aqui só pode ficar a chave PÚBLICA (publishable). Ela foi feita
   para aparecer no site: quem protege os dados são as regras de
   acesso (RLS) do banco.

   NUNCA coloque aqui a chave service_role, uma chave que começa
   com "sb_secret_" ou a senha do banco.
   ========================================================== */
window.SUPABASE_CONFIG = {
  url: "https://ithzvrxgrwgabhqlxxug.supabase.co",
  chavePublica: "sb_publishable_fS01dA8RVqMaZJ_DBvsyzQ_2ZOAsTMR"
};
