// Troca-Livros: consulta um ISBN em várias fontes e devolve os dados do livro já juntos.
//
// - Só quem está logado pode chamar. O portão do Supabase (verify_jwt) sozinho NÃO basta: ele aceita
//   a chave pública do site, que todo mundo vê. Por isso a função pergunta ao servidor de login se o
//   token é de uma pessoa de verdade (usuarioLogado).
// - Não grava nada no banco: quem grava é o site, depois que a pessoa confere os dados.
// - Fontes (consultadas ao mesmo tempo): BrasilAPI, Open Library e Google Books.
//   Para cada campo vale a primeira fonte que trouxer um valor, nessa ordem.
// - Chave do Google (opcional): guardar em segredo no Supabase com o nome GOOGLE_BOOKS_API_KEY.
//   Sem ela o Google Books ainda tenta, mas pode recusar por excesso de consultas.

const TEMPO_MAXIMO_MS = 6000;
const USER_AGENT = "TrocaLivros/1.0 (projeto escolar)";

const CORS = {
  "Access-Control-Allow-Origin": "*", // quem protege é o login (JWT), não a origem
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Dados = {
  titulo: string | null;
  autores: string | null;
  editora: string | null;
  ano: number | null;
  paginas: number | null;
  capa: string | null;
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ---------- Login ---------- */

// Devolve o id da pessoa logada, ou null. A chave pública sozinha (sem pessoa) NÃO passa.
async function usuarioLogado(req: Request): Promise<string | null> {
  const m = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  const url = Deno.env.get("SUPABASE_URL");
  const chave = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey");
  if (!m || !url || !chave) return null;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 5000);
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      signal: controle.signal,
      headers: { apikey: chave, Authorization: `Bearer ${m[1]}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" ? u.id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/* ---------- ISBN ---------- */

function soNumeros(valor: unknown): string {
  return String(valor ?? "").replace(/[\s-]/g, "").toUpperCase();
}

function digitoIsbn13(doze: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (soma % 10)) % 10;
}

function isbn13Valido(s: string): boolean {
  return /^97[89]\d{10}$/.test(s) && digitoIsbn13(s) === Number(s[12]);
}

function isbn10Valido(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 10; i++) soma += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
  return soma % 11 === 0;
}

// Devolve o ISBN-13 (converte o de 10 dígitos) ou null se não for válido
function paraIsbn13(valor: unknown): string | null {
  const s = soNumeros(valor);
  if (s.length === 13) return isbn13Valido(s) ? s : null;
  if (s.length === 10 && isbn10Valido(s)) {
    const base = "978" + s.slice(0, 9);
    return base + String(digitoIsbn13(base));
  }
  return null;
}

/* ---------- Limpeza dos dados (nunca confiar no que vem de fora) ---------- */

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function lista(valores: unknown, max: number): string | null {
  if (!Array.isArray(valores)) return null;
  const itens = valores
    .map((v) => texto(typeof v === "string" ? v : (v as { name?: unknown })?.name, 120))
    .filter((v): v is string => Boolean(v));
  return itens.length ? itens.join(", ").slice(0, max) : null;
}

function inteiro(valor: unknown, min: number, max: number): number | null {
  const n = typeof valor === "number" ? valor : parseInt(String(valor ?? ""), 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function anoDe(valor: unknown): number | null {
  const m = String(valor ?? "").match(/\b(1[4-9]\d{2}|20\d{2})\b/);
  return m ? inteiro(m[1], 1400, 2100) : null;
}

function capaHttps(valor: unknown): string | null {
  const t = texto(valor, 500);
  if (!t) return null;
  const https = t.replace(/^http:\/\//i, "https://");
  return /^https:\/\/[^\s]+$/.test(https) ? https : null;
}

/* ---------- Fontes ---------- */

async function buscarJson(url: string): Promise<any | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
  try {
    const r = await fetch(url, {
      signal: controle.signal,
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

async function brasilApi(isbn: string): Promise<Dados | null> {
  const d = await buscarJson(`https://brasilapi.com.br/api/isbn/v1/${isbn}`);
  if (!d || typeof d !== "object") return null;
  return {
    titulo: texto(d.title, 300),
    autores: lista(d.authors, 300),
    editora: texto(d.publisher, 200),
    ano: anoDe(d.year),
    paginas: inteiro(d.page_count, 1, 20000),
    capa: capaHttps(d.cover_url),
  };
}

async function openLibrary(isbn: string): Promise<Dados | null> {
  const r = await buscarJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const d = r?.[`ISBN:${isbn}`];
  if (!d) return null;
  return {
    titulo: texto(d.title, 300),
    autores: lista(d.authors, 300),
    editora: lista(d.publishers, 200),
    ano: anoDe(d.publish_date),
    paginas: inteiro(d.number_of_pages, 1, 20000),
    capa: capaHttps(d.cover?.large ?? d.cover?.medium ?? d.cover?.small),
  };
}

async function googleBooks(isbn: string): Promise<Dados | null> {
  const chave = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1` +
    (chave ? `&key=${encodeURIComponent(chave)}` : "");
  const r = await buscarJson(url);
  const v = r?.items?.[0]?.volumeInfo;
  if (!v) return null;
  return {
    titulo: texto(v.title, 300),
    autores: lista(v.authors, 300),
    editora: texto(v.publisher, 200),
    ano: anoDe(v.publishedDate),
    paginas: inteiro(v.pageCount, 1, 20000),
    capa: capaHttps(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
  };
}

const FONTES: { nome: string; consultar: (isbn: string) => Promise<Dados | null> }[] = [
  { nome: "brasilapi", consultar: brasilApi },
  { nome: "open-library", consultar: openLibrary },
  { nome: "google-books", consultar: googleBooks },
];

/* ---------- Servidor ---------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return responder({ ok: false, erro: "metodo_invalido" }, 405);
  if (!(await usuarioLogado(req))) return responder({ ok: false, erro: "login_necessario" }, 401);

  let corpo: { isbn?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    return responder({ ok: false, erro: "pedido_invalido" }, 400);
  }

  const isbn13 = paraIsbn13(corpo?.isbn);
  if (!isbn13) return responder({ ok: false, erro: "isbn_invalido" }, 400);

  const respostas = await Promise.all(FONTES.map((f) => f.consultar(isbn13).catch(() => null)));

  // Junta as fontes: para cada campo vale a primeira que trouxe valor
  const juntos: Dados = { titulo: null, autores: null, editora: null, ano: null, paginas: null, capa: null };
  const fontesQueAchou: string[] = [];
  respostas.forEach((d, i) => {
    if (!d || !d.titulo) return; // sem título não consideramos que a fonte achou o livro
    fontesQueAchou.push(FONTES[i].nome);
    (Object.keys(juntos) as (keyof Dados)[]).forEach((campo) => {
      if (juntos[campo] === null && d[campo] !== null) (juntos[campo] as unknown) = d[campo];
    });
  });

  if (!fontesQueAchou.length) {
    return responder({ ok: true, isbn13, encontrado: false, dados: null, fontes: [] });
  }
  return responder({ ok: true, isbn13, encontrado: true, dados: juntos, fontes: fontesQueAchou });
});
