/* ==========================================================
   Tela "Cadastrar livro" (cadastrar-livro.html).

   Caminho: a pessoa digita o ISBN, o site procura o livro e preenche
   os dados, ela confere, diz como está o exemplar dela e salva.

   Onde procura, nesta ordem:
   1. no catálogo do próprio site (tabela livros): se outra pessoa já
      cadastrou esse ISBN, os dados vêm de lá e não são mudados;
   2. na função de servidor "consultar-isbn" (BrasilAPI, Open Library e
      Google Books juntos);
   3. se ninguém achar, a pessoa preenche à mão.

   Os dados que vêm de fora podem ter erros: por isso a pessoa SEMPRE
   confere antes de salvar, e tudo é mostrado como texto simples.
   ========================================================== */
(function () {
  "use strict";

  var NOMES_DAS_FONTES = {
    "brasilapi": "BrasilAPI",
    "open-library": "Open Library",
    "google-books": "Google Books"
  };
  var ESPERA_MAXIMA_MS = 15000;

  /* ---------- Funções de apoio ---------- */

  function porId(id) {
    return document.getElementById(id);
  }

  function mostrarErro(campo, mensagem) {
    var erro = porId(campo.id + "-erro");
    var controle = campo.closest(".field__control");
    if (erro) erro.textContent = mensagem || "";
    if (controle) controle.classList.toggle("is-invalid", Boolean(mensagem));
    campo.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  function avisoDoFormulario(form) {
    var p = form.querySelector(".form-erro");
    if (!p) {
      p = document.createElement("p");
      p.className = "field__error form-erro";
      p.setAttribute("role", "alert");
      var botao = form.querySelector("button[type=submit]");
      botao.parentNode.insertBefore(p, botao);
    }
    return p;
  }

  function ocupado(botao, ligado, textoOcupado) {
    if (ligado) {
      botao.dataset.textoOriginal = botao.textContent;
      botao.textContent = textoOcupado;
    } else if (botao.dataset.textoOriginal) {
      botao.textContent = botao.dataset.textoOriginal;
    }
    botao.disabled = ligado;
  }

  var cliente = null;
  function obterCliente() {
    if (cliente) return cliente;
    var cfg = window.SUPABASE_CONFIG;
    if (!window.supabase || !cfg || !cfg.url || !cfg.chavePublica) return null;
    cliente = window.supabase.createClient(cfg.url, cfg.chavePublica);
    return cliente;
  }

  function comTempoMaximo(promessa, ms) {
    return new Promise(function (resolve, reject) {
      var relogio = setTimeout(function () { reject(new Error("tempo esgotado")); }, ms);
      promessa.then(
        function (v) { clearTimeout(relogio); resolve(v); },
        function (e) { clearTimeout(relogio); reject(e); }
      );
    });
  }

  /* ---------- ISBN ---------- */

  function digitoIsbn13(doze) {
    var soma = 0;
    for (var i = 0; i < 12; i++) soma += Number(doze.charAt(i)) * (i % 2 === 0 ? 1 : 3);
    return (10 - (soma % 10)) % 10;
  }

  // Devolve { ok, isbn13 } ou { ok:false, mensagem }. Aceita ISBN de 10 ou 13 números.
  function interpretarIsbn(valor) {
    var s = String(valor || "").replace(/[\s-]/g, "").toUpperCase();
    if (!s) return { ok: false, mensagem: "Digite o ISBN do livro." };
    if (!/^(\d{13}|\d{9}[\dX])$/.test(s)) {
      return { ok: false, mensagem: "O ISBN tem 10 ou 13 números (pode ter hífens)." };
    }
    var invalido = { ok: false, mensagem: "Esse ISBN não é válido. Confira os números: o último é um dígito de verificação." };
    if (s.length === 13) {
      if (!/^97[89]/.test(s)) {
        return { ok: false, mensagem: "Esse número não parece um ISBN: o de 13 números começa com 978 ou 979." };
      }
      return digitoIsbn13(s.slice(0, 12)) === Number(s.charAt(12)) ? { ok: true, isbn13: s } : invalido;
    }
    var soma = 0;
    for (var i = 0; i < 10; i++) soma += (s.charAt(i) === "X" ? 10 : Number(s.charAt(i))) * (10 - i);
    if (soma % 11 !== 0) return invalido;
    var base = "978" + s.slice(0, 9);
    return { ok: true, isbn13: base + String(digitoIsbn13(base)) };
  }

  function formatarIsbn13(s) {
    return s.slice(0, 3) + "-" + s.slice(3, 5) + "-" + s.slice(5, 9) + "-" + s.slice(9, 12) + "-" + s.slice(12);
  }

  /* ---------- Conta ---------- */

  async function carregarConta() {
    var c = obterCliente();
    if (!c) return null;
    var r = await c.auth.getSession();
    var sessao = r.data && r.data.session;
    if (!sessao) return null;
    var p = await c.from("perfis").select("papel,nome").eq("id", sessao.user.id).maybeSingle();
    if (p.error || !p.data) return null;
    return { usuario: sessao.user, perfil: p.data };
  }

  /* ---------- Tela ---------- */

  async function iniciar() {
    var formIsbn = porId("form-isbn");
    var formLivro = porId("form-livro");
    var botaoBuscar = porId("botao-buscar");
    var botaoSalvar = porId("botao-salvar");
    var campoIsbn = porId("isbn");
    var resultado = porId("resultado");
    var capa = porId("capa");

    // enquanto a conta carrega, os formulários não enviam e os botões ficam desligados
    [formIsbn, formLivro].forEach(function (f) {
      f.addEventListener("submit", function (e) { e.preventDefault(); });
    });
    botaoBuscar.disabled = true;

    var conta = await carregarConta();
    if (!conta) {
      window.location.replace("login.html");
      return;
    }
    if (!conta.perfil.nome) {
      // cadastro pela metade: termina primeiro as informações
      window.location.replace("informacoes.html");
      return;
    }

    // estado do livro que está na tela
    var atual = { isbn13: "", origem: "manual", fonte: "manual", capa: null };

    var campos = {
      titulo: porId("titulo-livro"),
      autores: porId("autores"),
      editora: porId("editora"),
      ano: porId("ano"),
      paginas: porId("paginas"),
      observacao: porId("observacao")
    };

    function limparFormularioDoLivro() {
      Object.keys(campos).forEach(function (k) {
        campos[k].value = "";
        campos[k].readOnly = false;
        mostrarErro(campos[k], "");
      });
      formLivro.querySelectorAll("input[type=radio]").forEach(function (r) { r.checked = false; });
      porId("estado-erro").textContent = "";
      porId("oferta-erro").textContent = "";
      var erro = formLivro.querySelector(".form-erro");
      if (erro) erro.textContent = "";
      capa.hidden = true;
      capa.removeAttribute("src");
    }

    function voltarParaOIsbn() {
      limparFormularioDoLivro();
      formLivro.hidden = true;
      porId("sucesso").hidden = true;
      formIsbn.hidden = false;
      porId("lead").hidden = false;
      porId("titulo").hidden = false;
      campoIsbn.value = "";
      mostrarErro(campoIsbn, "");
      campoIsbn.focus();
    }

    function mostrarLivro(dados, origem, fonte, mensagem) {
      limparFormularioDoLivro();
      atual = { isbn13: atual.isbn13, origem: origem, fonte: fonte, capa: null };
      if (dados) {
        campos.titulo.value = dados.titulo || "";
        campos.autores.value = dados.autores || "";
        campos.editora.value = dados.editora || "";
        campos.ano.value = dados.ano ? String(dados.ano) : "";
        campos.paginas.value = dados.paginas ? String(dados.paginas) : "";
        var url = dados.capa || dados.capa_url || "";
        if (typeof url === "string" && url.indexOf("https://") === 0) {
          atual.capa = url;
          capa.onerror = function () { capa.hidden = true; };
          capa.src = url;
          capa.hidden = false;
        }
      }
      // dado que já está no catálogo não é mudado por quem cadastra o exemplar
      ["titulo", "autores", "editora", "ano", "paginas"].forEach(function (k) {
        campos[k].readOnly = origem === "catalogo";
      });
      porId("isbn-mostrado").textContent = formatarIsbn13(atual.isbn13);
      resultado.textContent = mensagem;
      formIsbn.hidden = true;
      porId("lead").hidden = true;
      formLivro.hidden = false;
      resultado.focus();
    }

    /* ----- passo 1: procurar o livro ----- */

    campoIsbn.addEventListener("input", function () {
      if (campoIsbn.getAttribute("aria-invalid") === "true") {
        var r = interpretarIsbn(campoIsbn.value);
        mostrarErro(campoIsbn, r.ok ? "" : r.mensagem);
      }
    });

    formIsbn.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var r = interpretarIsbn(campoIsbn.value);
      mostrarErro(campoIsbn, r.ok ? "" : r.mensagem);
      if (!r.ok) return campoIsbn.focus();

      var c = obterCliente();
      var aviso = avisoDoFormulario(formIsbn);
      aviso.textContent = "";
      atual.isbn13 = r.isbn13;
      ocupado(botaoBuscar, true, "Procurando...");
      try {
        // 1) já está no catálogo do site?
        var noCatalogo = await c.from("livros")
          .select("isbn13,titulo,autores,editora,ano,paginas,capa_url,fonte")
          .eq("isbn13", r.isbn13)
          .maybeSingle();
        if (noCatalogo.data) {
          mostrarLivro(noCatalogo.data, "catalogo", noCatalogo.data.fonte,
            "Esse livro já está no catálogo do site. Falta só dizer como está o seu exemplar.");
          return;
        }

        // 2) procura nas fontes de fora (BrasilAPI, Open Library, Google Books)
        var resposta = null;
        try {
          resposta = await comTempoMaximo(c.functions.invoke("consultar-isbn", { body: { isbn: r.isbn13 } }), ESPERA_MAXIMA_MS);
        } catch (e) {
          resposta = { error: e };
        }
        if (resposta.error) {
          var status = resposta.error.context && resposta.error.context.status;
          if (status === 401) {
            window.location.replace("login.html");
            return;
          }
          mostrarLivro(null, "manual", "manual",
            "Não consegui consultar as bases de livros agora. Você pode preencher os dados à mão.");
          return;
        }
        var d = resposta.data;
        if (d && d.encontrado && d.dados) {
          var fonte = d.fontes && d.fontes.length ? d.fontes[0] : "manual";
          var nomes = (d.fontes || []).map(function (f) { return NOMES_DAS_FONTES[f] || f; }).join(", ");
          mostrarLivro(d.dados, "fora", fonte,
            "Achamos o livro (" + nomes + ")! Confira os dados antes de salvar: eles podem ter erros.");
        } else {
          mostrarLivro(null, "manual", "manual",
            "Não achamos esse livro nas bases. Preencha os dados à mão.");
        }
      } catch (erro) {
        aviso.textContent = "Algo deu errado. Confira a internet e tente de novo.";
      } finally {
        ocupado(botaoBuscar, false);
      }
    });

    porId("trocar-isbn").addEventListener("click", voltarParaOIsbn);
    porId("outro-livro").addEventListener("click", voltarParaOIsbn);

    /* ----- passo 2: conferir e salvar ----- */

    function numeroOuNulo(campo, min, max, mensagem) {
      var t = campo.value.trim();
      if (!t) { mostrarErro(campo, ""); return { ok: true, valor: null }; }
      var n = /^\d+$/.test(t) ? Number(t) : NaN;
      if (!(n >= min && n <= max)) { mostrarErro(campo, mensagem); return { ok: false }; }
      mostrarErro(campo, "");
      return { ok: true, valor: n };
    }

    function limiteDeTexto(campo, max, nome) {
      var msg = campo.value.length > max ? nome + " pode ter até " + max + " letras." : "";
      mostrarErro(campo, msg);
      return !msg;
    }

    function radioEscolhido(nome, idErro, mensagem) {
      var marcado = formLivro.querySelector("input[name='" + nome + "']:checked");
      porId(idErro).textContent = marcado ? "" : mensagem;
      return marcado ? marcado.value : "";
    }

    formLivro.querySelectorAll("input[type=radio]").forEach(function (radio) {
      radio.addEventListener("change", function () {
        porId(radio.name + "-erro").textContent = "";
      });
    });

    // a mensagem de erro de um campo some assim que a pessoa começa a corrigir
    Object.keys(campos).forEach(function (k) {
      campos[k].addEventListener("input", function () {
        if (campos[k].getAttribute("aria-invalid") === "true") mostrarErro(campos[k], "");
      });
    });

    formLivro.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var titulo = campos.titulo.value.trim().replace(/\s+/g, " ");
      mostrarErro(campos.titulo, titulo ? "" : "Digite o título do livro.");
      var okTitulo = Boolean(titulo) && limiteDeTexto(campos.titulo, 300, "O título");
      var okAutores = limiteDeTexto(campos.autores, 300, "O campo de autores");
      var okEditora = limiteDeTexto(campos.editora, 200, "A editora");
      var ano = numeroOuNulo(campos.ano, 1400, 2100, "Digite um ano com 4 números, como 2005.");
      var paginas = numeroOuNulo(campos.paginas, 1, 20000, "Digite só números, entre 1 e 20000.");
      var estado = radioEscolhido("estado", "estado-erro", "Escolha como está o seu exemplar.");
      var oferta = radioEscolhido("oferta", "oferta-erro", "Escolha o que você quer fazer com o livro.");
      var okObs = limiteDeTexto(campos.observacao, 200, "A observação");

      if (!okTitulo) return campos.titulo.focus();
      if (!okAutores) return campos.autores.focus();
      if (!okEditora) return campos.editora.focus();
      if (!ano.ok) return campos.ano.focus();
      if (!paginas.ok) return campos.paginas.focus();
      if (!estado) return formLivro.querySelector("input[name='estado']").focus();
      if (!oferta) return formLivro.querySelector("input[name='oferta']").focus();
      if (!okObs) return campos.observacao.focus();

      var c = obterCliente();
      var aviso = avisoDoFormulario(formLivro);
      aviso.textContent = "";
      ocupado(botaoSalvar, true, "Salvando...");
      try {
        // Livro novo no catálogo (se for de outra pessoa que já cadastrou, não mexe nele)
        if (atual.origem !== "catalogo") {
          var novo = await c.from("livros").insert({
            isbn13: atual.isbn13,
            titulo: titulo,
            autores: campos.autores.value.trim() || null,
            editora: campos.editora.value.trim() || null,
            ano: ano.valor,
            paginas: paginas.valor,
            capa_url: atual.capa,
            fonte: atual.fonte
          });
          // 23505 = alguém acabou de cadastrar o mesmo ISBN: tudo bem, o exemplar segue
          if (novo.error && novo.error.code !== "23505") {
            aviso.textContent = novo.error.code === "42501"
              ? "Não foi possível salvar. Termine o seu cadastro primeiro."
              : "Algum dado não foi aceito. Confira os campos e tente de novo.";
            return;
          }
        }
        var exemplar = await c.from("exemplares").insert({
          isbn13: atual.isbn13,
          estado: estado,
          oferta: oferta,
          observacao: campos.observacao.value.trim() || null
        });
        if (exemplar.error) {
          aviso.textContent = exemplar.error.code === "42501"
            ? "Não foi possível salvar. Termine o seu cadastro primeiro."
            : "Não consegui salvar o seu exemplar. Tente de novo em instantes.";
          return;
        }
      } catch (erro) {
        aviso.textContent = "Algo deu errado. Confira a internet e tente de novo.";
        return;
      } finally {
        ocupado(botaoSalvar, false);
      }

      porId("sucesso-texto").textContent = "“" + titulo + "” já está no site, disponível para troca ou doação.";
      formLivro.hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso").hidden = false;
      porId("sucesso-titulo").focus();
    });

    // tudo pronto: agora o botão de buscar pode ser usado
    botaoBuscar.disabled = false;
  }

  iniciar();
})();
