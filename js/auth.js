/* ==========================================================
   Telas de conta (cadastro, confirmar e-mail, informações e,
   para professores, dias e horários na escola, login e senha).

   Agora tudo fala com o Supabase de verdade (js/supabase-config.js):
   a conta, o e-mail de confirmação, o login, a troca de senha e o
   perfil são guardados no servidor. A senha nunca fica salva no site.
   As etapas dependem da SESSÃO de quem entrou, não de dados na URL.

   Caminhos:
   - Aluno (@alunos.g12.br):
       cadastro -> confirme-email -> informacoes            (3 etapas)
   - Professor (@santanna.g12.br):
       cadastro -> confirme-email -> informacoes
                -> professor-dias -> professor-horarios     (5 etapas)
   ========================================================== */
(function () {
  "use strict";

  var DOMINIO_ALUNO = "alunos.g12.br";
  var DOMINIO_PROFESSOR = "santanna.g12.br";

  var DIAS = [
    { id: "seg", nome: "Segunda-feira" },
    { id: "ter", nome: "Terça-feira" },
    { id: "qua", nome: "Quarta-feira" },
    { id: "qui", nome: "Quinta-feira" },
    { id: "sex", nome: "Sexta-feira" }
  ];
  var HORA_MIN = "06:00";
  var HORA_MAX = "22:00";

  /* ---------- Funções de apoio ---------- */

  function porId(id) {
    return document.getElementById(id);
  }

  // Mostra ou limpa a mensagem de erro de um campo
  function mostrarErro(campo, mensagem) {
    var erro = porId(campo.id + "-erro");
    var controle = campo.closest(".field__control");
    if (erro) erro.textContent = mensagem || "";
    if (controle) controle.classList.toggle("is-invalid", Boolean(mensagem));
    campo.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  // Troca o texto "Etapa X de Y" do topo do card
  function definirEtapa(texto) {
    var el = document.querySelector(".auth-step");
    if (el) el.textContent = texto;
  }

  // Endereço completo de uma página do site (serve também para subpastas do GitHub Pages)
  function urlDaPagina(pagina) {
    return new URL(pagina, window.location.href).href;
  }

  // Monta um endereço de página com dados no final (?email=...)
  // Só usamos isto para coisas que não são segredo (ex.: mostrar o e-mail digitado).
  function montarUrl(pagina, dados) {
    var p = new URLSearchParams();
    Object.keys(dados).forEach(function (chave) {
      if (dados[chave] !== undefined && dados[chave] !== "") p.set(chave, dados[chave]);
    });
    return pagina + "?" + p.toString();
  }

  function emailDoEndereco() {
    return new URLSearchParams(window.location.search).get("email") || "";
  }

  function primeiroNome(nome) {
    return nome.trim().split(/\s+/)[0];
  }

  // botões de mostrar/ocultar senha (o olhinho) de qualquer tela
  function ativarBotoesSenha() {
    document.querySelectorAll(".toggle-senha").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var alvo = porId(botao.dataset.alvo);
        var mostrar = alvo.type === "password";
        alvo.type = mostrar ? "text" : "password";
        botao.setAttribute("aria-pressed", String(mostrar));
        botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      });
    });
  }

  /* ---------- Servidor (Supabase) ---------- */

  var cliente = null;

  function obterCliente() {
    if (cliente) return cliente;
    var cfg = window.SUPABASE_CONFIG;
    if (!window.supabase || !cfg || !cfg.url || !cfg.chavePublica) return null;
    cliente = window.supabase.createClient(cfg.url, cfg.chavePublica);
    return cliente;
  }

  // Traduz os erros do servidor para uma frase simples (sem mostrar detalhes técnicos)
  function traduzirErro(erro) {
    var texto = String((erro && (erro.message || erro.code)) || "").toLowerCase();
    var status = erro && erro.status;
    if (!erro) return "";
    if (texto.indexOf("invalid login") !== -1) return "E-mail ou senha incorretos.";
    if (texto.indexOf("not confirmed") !== -1) return "Você ainda não confirmou o e-mail.";
    if (status === 429 || texto.indexOf("rate limit") !== -1 || texto.indexOf("too many") !== -1 || texto.indexOf("security purposes") !== -1) {
      return "Muitas tentativas. Espere alguns minutos e tente de novo.";
    }
    if (texto.indexOf("database error saving new user") !== -1 || texto.indexOf("escola") !== -1) {
      return "Esse e-mail não pode criar conta. Use o e-mail da escola.";
    }
    if (texto.indexOf("different from the old") !== -1) return "Escolha uma senha diferente da anterior.";
    if (texto.indexOf("weak") !== -1 || texto.indexOf("password should") !== -1) {
      return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
    }
    if (texto.indexOf("failed to fetch") !== -1 || texto.indexOf("network") !== -1 || texto.indexOf("load failed") !== -1) {
      return "Não consegui falar com o servidor. Confira a internet e tente de novo.";
    }
    return "Algo deu errado. Tente de novo em instantes.";
  }

  // Mensagem de erro do formulário inteiro (acima do botão)
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

  // Trava o botão enquanto o servidor responde (evita clicar duas vezes)
  function ocupado(form, ligado, textoOcupado) {
    var botao = form.querySelector("button[type=submit]");
    if (!botao) return;
    if (ligado) {
      botao.dataset.textoOriginal = botao.textContent;
      botao.textContent = textoOcupado;
    } else if (botao.dataset.textoOriginal) {
      botao.textContent = botao.dataset.textoOriginal;
    }
    botao.disabled = ligado;
  }

  // Quem está com a sessão aberta e qual é o perfil dela. Devolve null se não há sessão.
  async function carregarConta() {
    var c = obterCliente();
    if (!c) return null;
    var r = await c.auth.getSession();
    var sessao = r.data && r.data.session;
    if (!sessao) return null;
    var p = await c.from("perfis")
      .select("papel,nome,programa,ano,periodo,email")
      .eq("id", sessao.user.id)
      .maybeSingle();
    if (p.error || !p.data) return null;
    return { usuario: sessao.user, perfil: p.data };
  }

  // Páginas das etapas: sem sessão volta para o login; devolve a conta ou null
  async function exigirConta() {
    var conta = await carregarConta();
    if (!conta) {
      window.location.replace("login.html");
      return null;
    }
    return conta;
  }

  // Páginas exclusivas de professor (dias e horários)
  async function exigirProfessor() {
    var conta = await exigirConta();
    if (!conta) return null;
    if (conta.perfil.papel !== "professor" || !conta.perfil.nome) {
      window.location.replace("informacoes.html");
      return null;
    }
    return conta;
  }

  // Horários que o professor já salvou antes (lista vazia se não houver)
  async function horariosSalvos(usuarioId) {
    var r = await obterCliente().from("horarios_professor")
      .select("dia,inicio,fim")
      .eq("professor_id", usuarioId);
    return r.error || !r.data ? [] : r.data;
  }

  function diasGuardados() {
    var ids = DIAS.map(function (d) { return d.id; });
    try {
      return (sessionStorage.getItem("troca_dias") || "").split(",").filter(function (d) {
        return ids.indexOf(d) !== -1;
      });
    } catch (e) {
      return [];
    }
  }

  function guardarDias(dias) {
    try { sessionStorage.setItem("troca_dias", dias.join(",")); } catch (e) { /* tudo bem */ }
  }

  function horaCurta(hora) {
    return String(hora || "").slice(0, 5); // "08:00:00" -> "08:00"
  }

  /* ---------- Validações ---------- */

  // Devolve { ok, papel, mensagem } para o e-mail da escola
  function validarEmail(valor) {
    var email = valor.trim().toLowerCase();
    if (!email) return { ok: false, mensagem: "Digite o seu e-mail da escola." };

    var partes = email.split("@");
    if (partes.length !== 2 || !partes[0] || !partes[1]) {
      return { ok: false, mensagem: "Digite um e-mail completo, como nome.sobrenome@alunos.g12.br." };
    }

    var usuario = partes[0];
    var dominio = partes[1];
    var papel = null;
    if (dominio === DOMINIO_ALUNO) papel = "aluno";
    else if (dominio === DOMINIO_PROFESSOR) papel = "professor";

    if (!papel) {
      return {
        ok: false,
        mensagem: "Use o e-mail da escola: nome.sobrenome@alunos.g12.br (alunos) ou terminado em @santanna.g12.br (professores)."
      };
    }
    // letras/números separados por ponto, hífen ou sublinhado, sem repetir nem começar/terminar com símbolo
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(usuario)) {
      return { ok: false, mensagem: "O e-mail tem caracteres inválidos ou pontos no lugar errado." };
    }
    if (papel === "aluno" && usuario.indexOf(".") === -1) {
      return { ok: false, mensagem: "No e-mail de aluno, use o formato nome.sobrenome@alunos.g12.br." };
    }
    return { ok: true, papel: papel, email: email };
  }

  function validarSenha(valor) {
    if (valor.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) return "Use letras e números na senha.";
    return "";
  }

  /* ---------- Página: cadastro ---------- */

  function iniciarCadastro() {
    var form = porId("form-cadastro");
    var email = porId("email");
    var senha = porId("senha");
    var senha2 = porId("senha2");

    function checarEmail() {
      var r = validarEmail(email.value);
      mostrarErro(email, r.ok ? "" : r.mensagem);
      return r;
    }
    function checarSenha() {
      var msg = validarSenha(senha.value);
      mostrarErro(senha, msg);
      return !msg;
    }
    function checarSenha2() {
      var msg = senha2.value && senha2.value !== senha.value ? "As senhas não são iguais." : "";
      if (!senha2.value) msg = "Repita a senha para confirmar.";
      mostrarErro(senha2, msg);
      return !msg;
    }

    email.addEventListener("blur", checarEmail);
    senha.addEventListener("blur", checarSenha);
    senha2.addEventListener("blur", checarSenha2);

    // professor tem mais etapas que aluno: o contador acompanha o e-mail digitado
    email.addEventListener("input", function () {
      var r = validarEmail(email.value);
      definirEtapa("Etapa 1 de " + (r.ok && r.papel === "professor" ? 5 : 3) + " · Cadastro");
    });

    // depois do primeiro erro, a mensagem some assim que a pessoa corrige
    [email, senha, senha2].forEach(function (campo) {
      campo.addEventListener("input", function () {
        if (campo.getAttribute("aria-invalid") === "true") {
          if (campo === email) checarEmail();
          else if (campo === senha) checarSenha();
          else checarSenha2();
        }
      });
    });

    ativarBotoesSenha();

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var r = checarEmail();
      var okSenha = checarSenha();
      var okSenha2 = checarSenha2();

      if (!r.ok) return email.focus();
      if (!okSenha) return senha.focus();
      if (!okSenha2) return senha2.focus();

      var c = obterCliente();
      var aviso = avisoDoFormulario(form);
      aviso.textContent = "";
      if (!c) {
        aviso.textContent = "Não foi possível carregar o servidor. Recarregue a página.";
        return;
      }

      ocupado(form, true, "Criando conta...");
      try {
        // O servidor confere de novo se o e-mail é da escola e envia o e-mail de confirmação.
        var resposta = await c.auth.signUp({
          email: r.email,
          password: senha.value,
          options: { emailRedirectTo: urlDaPagina("informacoes.html") }
        });
        if (resposta.error) {
          aviso.textContent = traduzirErro(resposta.error);
          return;
        }
        // Se o projeto não exigir confirmação de e-mail, a sessão já vem aberta
        if (resposta.data && resposta.data.session) {
          window.location.href = "informacoes.html";
          return;
        }
        window.location.href = montarUrl("confirme-email.html", { email: r.email });
      } catch (erro) {
        aviso.textContent = traduzirErro(erro);
      } finally {
        ocupado(form, false);
      }
    });
  }

  /* ---------- Página: confirmar e-mail ---------- */

  function iniciarConfirmacao() {
    // Aqui ainda não existe sessão (a conta só vale depois do clique no link do e-mail).
    // O e-mail vem no endereço só para ser mostrado e usado no reenvio.
    var r = validarEmail(emailDoEndereco());
    if (!r.ok) {
      window.location.replace("cadastro.html");
      return;
    }
    porId("email-mostrado").textContent = r.email;
    definirEtapa("Etapa 2 de " + (r.papel === "professor" ? 5 : 3) + " · Confirmar e-mail");

    var status = porId("status");
    var reenviar = porId("reenviar");
    var espera = null;

    // Só vale se a pessoa já estiver com a sessão aberta; senão, só o link do e-mail serve
    porId("simular-link").addEventListener("click", async function () {
      var conta = await carregarConta();
      if (conta) {
        window.location.href = "informacoes.html";
      } else {
        status.textContent = "Ainda sem sessão: clique no link que chegou no seu e-mail.";
      }
    });

    function contar() {
      var segundos = 30;
      reenviar.disabled = true;
      reenviar.textContent = "Reenviar em " + segundos + "s";
      espera = window.setInterval(function () {
        segundos -= 1;
        reenviar.textContent = "Reenviar em " + segundos + "s";
        if (segundos <= 0) {
          window.clearInterval(espera);
          reenviar.disabled = false;
          reenviar.textContent = "Reenviar e-mail";
        }
      }, 1000);
    }

    reenviar.addEventListener("click", async function () {
      var c = obterCliente();
      if (!c) {
        status.textContent = "Não foi possível carregar o servidor. Recarregue a página.";
        return;
      }
      reenviar.disabled = true;
      status.textContent = "Enviando...";
      try {
        var resposta = await c.auth.resend({
          type: "signup",
          email: r.email,
          options: { emailRedirectTo: urlDaPagina("informacoes.html") }
        });
        if (resposta.error) {
          status.textContent = traduzirErro(resposta.error);
          reenviar.disabled = false;
          return;
        }
        status.textContent = "Enviamos o e-mail de novo. Olhe também na caixa de spam.";
        contar();
      } catch (erro) {
        status.textContent = traduzirErro(erro);
        reenviar.disabled = false;
      }
    });
  }

  /* ---------- Página: informações adicionais ---------- */

  async function iniciarInformacoes() {
    // enquanto a conta carrega, um envio apressado não pode recarregar a página
    porId("form-informacoes").addEventListener("submit", function (e) { e.preventDefault(); });
    // Só entra aqui quem clicou no link do e-mail (ou fez login): precisa de sessão.
    var conta = await exigirConta();
    if (!conta) return;
    var perfil = conta.perfil;

    var ehAluno = perfil.papel === "aluno";
    var form = porId("form-informacoes");
    var nome = porId("nome");
    var ano = porId("ano");

    // Professor: não tem programa, ano nem período, mas ainda tem duas etapas
    // (dias e horários). O contador e o botão mostram isso.
    if (!ehAluno) {
      document.querySelectorAll(".somente-aluno").forEach(function (bloco) {
        bloco.hidden = true;
      });
      definirEtapa("Etapa 3 de 5 · Informações");
      form.querySelector("button[type=submit]").textContent = "Continuar";
    }
    // se a pessoa já preencheu antes (ou voltou da etapa seguinte), os dados aparecem
    if (perfil.nome) nome.value = perfil.nome;
    if (ehAluno) {
      if (perfil.ano) ano.value = perfil.ano;
      [["programa", perfil.programa], ["periodo", perfil.periodo]].forEach(function (par) {
        var radio = document.querySelector("input[name='" + par[0] + "'][value='" + par[1] + "']");
        if (radio) radio.checked = true;
      });
    }

    function checarNome() {
      var texto = nome.value.trim().replace(/\s+/g, " ");
      var msg = texto.split(" ").length < 2 || texto.length < 5 ? "Digite o seu nome completo (nome e sobrenome)." : "";
      mostrarErro(nome, msg);
      return !msg;
    }
    function checarAno() {
      var msg = ano.value ? "" : "Escolha o seu ano escolar.";
      mostrarErro(ano, msg);
      return !msg;
    }
    function programaEscolhido() {
      var marcado = document.querySelector("input[name='programa']:checked");
      porId("programa-erro").textContent = marcado ? "" : "Escolha o seu programa.";
      return marcado ? marcado.value : "";
    }
    function periodoEscolhido() {
      var marcado = document.querySelector("input[name='periodo']:checked");
      porId("periodo-erro").textContent = marcado ? "" : "Escolha o seu período.";
      return marcado ? marcado.value : "";
    }

    nome.addEventListener("blur", checarNome);
    ano.addEventListener("change", checarAno);
    document.querySelectorAll("input[name='programa']").forEach(function (radio) {
      radio.addEventListener("change", programaEscolhido);
    });
    document.querySelectorAll("input[name='periodo']").forEach(function (radio) {
      radio.addEventListener("change", periodoEscolhido);
    });

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var okNome = checarNome();
      var programa = ehAluno ? programaEscolhido() : "-";
      var okAno = ehAluno ? checarAno() : true;
      var periodo = ehAluno ? periodoEscolhido() : "-";

      if (!okNome) return nome.focus();
      if (!programa) return document.querySelector("input[name='programa']").focus();
      if (!okAno) return ano.focus();
      if (!periodo) return document.querySelector("input[name='periodo']").focus();

      // Salva no perfil de quem está logado (as regras do banco só deixam alterar o próprio)
      var nomeLimpo = nome.value.trim().replace(/\s+/g, " ");
      var campos = ehAluno
        ? { nome: nomeLimpo, programa: programa, ano: ano.value, periodo: periodo }
        : { nome: nomeLimpo };
      var aviso = avisoDoFormulario(form);
      aviso.textContent = "";
      ocupado(form, true, "Salvando...");
      try {
        var salvo = await obterCliente().from("perfis")
          .update(campos)
          .eq("id", conta.usuario.id)
          .select("id");
        if (salvo.error || !salvo.data || !salvo.data.length) {
          aviso.textContent = "Não consegui salvar. Tente de novo em instantes.";
          return;
        }
      } catch (erro) {
        aviso.textContent = traduzirErro(erro);
        return;
      } finally {
        ocupado(form, false);
      }

      if (!ehAluno) {
        // professor segue para a etapa dos dias na escola
        window.location.href = "professor-dias.html";
        return;
      }

      porId("sucesso-texto").textContent = "Bem-vindo(a), " + primeiroNome(nomeLimpo) + "!";
      form.hidden = true;
      porId("sucesso").hidden = false;
      document.querySelector(".auth-lead").hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso-titulo").focus();
    });
  }

  /* ---------- Página: professor, dias na escola ---------- */

  async function iniciarProfessorDias() {
    porId("form-dias").addEventListener("submit", function (e) { e.preventDefault(); });
    var ctx = await exigirProfessor();
    if (!ctx) return;

    // dias já escolhidos nesta visita; se não há, os que o professor salvou antes
    var diasMarcados = diasGuardados();
    if (!diasMarcados.length) {
      diasMarcados = (await horariosSalvos(ctx.usuario.id)).map(function (h) { return h.dia; });
    }

    var form = porId("form-dias");
    var erro = porId("dias-erro");
    var caixas = document.querySelectorAll("input[name='dia']");

    // ao voltar da etapa dos horários, os dias já escolhidos continuam marcados
    caixas.forEach(function (caixa) {
      caixa.checked = diasMarcados.indexOf(caixa.value) !== -1;
      caixa.addEventListener("change", function () {
        if (selecionados().length) erro.textContent = "";
      });
    });

    function selecionados() {
      return DIAS.filter(function (d) {
        return document.querySelector("input[name='dia'][value='" + d.id + "']").checked;
      }).map(function (d) { return d.id; });
    }

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var dias = selecionados();
      if (!dias.length) {
        erro.textContent = "Escolha pelo menos um dia da semana.";
        caixas[0].focus();
        return;
      }
      guardarDias(dias);
      window.location.href = "professor-horarios.html";
    });
  }

  /* ---------- Página: professor, horários na escola ---------- */

  async function iniciarProfessorHorarios() {
    var ctx = await exigirProfessor();
    if (!ctx) return;
    var salvos = await horariosSalvos(ctx.usuario.id);
    var diasEscolhidos = diasGuardados();
    if (!diasEscolhidos.length) {
      diasEscolhidos = salvos.map(function (h) { return h.dia; });
    }
    var dias = DIAS.filter(function (d) { return diasEscolhidos.indexOf(d.id) !== -1; });
    if (!dias.length) {
      // pulou a escolha dos dias: volta para ela
      window.location.replace("professor-dias.html");
      return;
    }

    var form = porId("form-horarios");
    var lista = porId("lista-horarios");
    var status = porId("status");

    // uma linha "das ... às ..." para cada dia escolhido
    function criarCampo(id, rotulo) {
      var campo = document.createElement("div");
      campo.className = "field";
      var label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = rotulo;
      var controle = document.createElement("div");
      controle.className = "field__control";
      var input = document.createElement("input");
      input.type = "time";
      input.id = id;
      input.min = HORA_MIN;
      input.max = HORA_MAX;
      input.step = 900;
      input.required = true;
      controle.appendChild(input);
      campo.appendChild(label);
      campo.appendChild(controle);
      return campo;
    }

    dias.forEach(function (d) {
      var bloco = document.createElement("fieldset");
      bloco.className = "horario";
      bloco.dataset.dia = d.id;
      var legenda = document.createElement("legend");
      legenda.textContent = d.nome;
      var linha = document.createElement("div");
      linha.className = "horario__linha";
      linha.appendChild(criarCampo("ini-" + d.id, "Das"));
      linha.appendChild(criarCampo("fim-" + d.id, "Às"));
      var erro = document.createElement("p");
      erro.className = "field__error";
      erro.id = "erro-" + d.id;
      erro.setAttribute("role", "alert");
      bloco.appendChild(legenda);
      bloco.appendChild(linha);
      bloco.appendChild(erro);
      lista.appendChild(bloco);
    });

    function campos(id) {
      return { ini: porId("ini-" + id), fim: porId("fim-" + id), erro: porId("erro-" + id) };
    }

    // horários que o professor já tinha salvo aparecem preenchidos
    salvos.forEach(function (h) {
      if (!porId("ini-" + h.dia)) return;
      var c = campos(h.dia);
      c.ini.value = horaCurta(h.inicio);
      c.fim.value = horaCurta(h.fim);
    });

    // devolve a mensagem de erro de um dia, ou "" quando está certo
    function conferirDia(id) {
      var c = campos(id);
      var msg = "";
      if (!c.ini.value || !c.fim.value) msg = "Informe o horário de início e de fim.";
      else if (c.ini.value < HORA_MIN || c.fim.value > HORA_MAX || c.ini.value > HORA_MAX || c.fim.value < HORA_MIN)
        msg = "Use horários entre " + HORA_MIN + " e " + HORA_MAX + ".";
      else if (c.fim.value <= c.ini.value) msg = "O horário final precisa ser depois do início.";
      c.erro.textContent = msg;
      [c.ini, c.fim].forEach(function (input) {
        input.setAttribute("aria-invalid", msg ? "true" : "false");
        input.closest(".field__control").classList.toggle("is-invalid", Boolean(msg));
      });
      return msg;
    }

    dias.forEach(function (d) {
      var c = campos(d.id);
      [c.ini, c.fim].forEach(function (input) {
        input.addEventListener("change", function () {
          status.textContent = "";
          if (c.erro.textContent) conferirDia(d.id);
        });
      });
    });

    // copia o horário do primeiro dia para todos os outros
    porId("copiar").addEventListener("click", function () {
      var primeiro = campos(dias[0].id);
      if (!primeiro.ini.value || !primeiro.fim.value) {
        status.textContent = "Preencha o primeiro dia (" + dias[0].nome + ") para copiar.";
        primeiro.ini.focus();
        return;
      }
      dias.forEach(function (d) {
        var c = campos(d.id);
        c.ini.value = primeiro.ini.value;
        c.fim.value = primeiro.fim.value;
        if (c.erro.textContent) conferirDia(d.id);
      });
      status.textContent = "Horário de " + dias[0].nome + " copiado para todos os dias.";
    });

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var primeiroErro = null;
      dias.forEach(function (d) {
        if (conferirDia(d.id) && !primeiroErro) primeiroErro = d.id;
      });
      if (primeiroErro) {
        var c = campos(primeiroErro);
        (c.ini.value ? c.fim : c.ini).focus();
        return;
      }

      // Salva os horários (um por dia) e apaga os dias que o professor tirou da lista
      var linhas = dias.map(function (d) {
        var c = campos(d.id);
        return { professor_id: ctx.usuario.id, dia: d.id, inicio: c.ini.value, fim: c.fim.value };
      });
      var aviso = avisoDoFormulario(form);
      aviso.textContent = "";
      ocupado(form, true, "Salvando...");
      try {
        var cl = obterCliente();
        var gravou = await cl.from("horarios_professor").upsert(linhas, { onConflict: "professor_id,dia" });
        if (gravou.error) {
          aviso.textContent = "Não consegui salvar os horários. Tente de novo em instantes.";
          return;
        }
        var apagou = await cl.from("horarios_professor").delete()
          .eq("professor_id", ctx.usuario.id)
          .not("dia", "in", "(" + dias.map(function (d) { return d.id; }).join(",") + ")");
        if (apagou.error) {
          aviso.textContent = "Salvei os horários, mas não consegui tirar os dias antigos. Tente de novo.";
          return;
        }
      } catch (erro) {
        aviso.textContent = traduzirErro(erro);
        return;
      } finally {
        ocupado(form, false);
      }
      guardarDias([]);

      var resumo = porId("resumo");
      resumo.textContent = "";
      dias.forEach(function (d) {
        var c = campos(d.id);
        var item = document.createElement("li");
        var nomeDia = document.createElement("strong");
        nomeDia.textContent = d.nome;
        item.appendChild(nomeDia);
        item.appendChild(document.createTextNode(": das " + c.ini.value + " às " + c.fim.value));
        resumo.appendChild(item);
      });
      porId("sucesso-texto").textContent = "Bem-vindo(a), " + primeiroNome(ctx.perfil.nome) + "!";
      form.hidden = true;
      porId("acoes-voltar").hidden = true;
      document.querySelector(".auth-lead").hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso").hidden = false;
      porId("sucesso-titulo").focus();
    });
  }

  /* ---------- Página: log in ---------- */

  function iniciarLogin() {
    var form = porId("form-login");
    var email = porId("email");
    var senha = porId("senha");
    var aviso = porId("aviso-teste");

    // ao voltar de "senha alterada", o e-mail já vem preenchido
    var inicial = validarEmail(emailDoEndereco());
    if (inicial.ok) email.value = inicial.email;

    function checarEmail() {
      var r = validarEmail(email.value);
      mostrarErro(email, r.ok ? "" : r.mensagem);
      return r.ok;
    }
    function checarSenha() {
      // no login só pedimos que a senha seja digitada: quem confere é o servidor
      var msg = senha.value ? "" : "Digite a sua senha.";
      mostrarErro(senha, msg);
      return !msg;
    }

    email.addEventListener("blur", checarEmail);
    senha.addEventListener("blur", checarSenha);
    [email, senha].forEach(function (campo) {
      campo.addEventListener("input", function () {
        avisoDoFormulario(form).textContent = "";
        if (campo.getAttribute("aria-invalid") === "true") {
          if (campo === email) checarEmail();
          else checarSenha();
        }
      });
    });
    ativarBotoesSenha();

    // Mostra a tela de "você entrou" (por enquanto não existe página depois do login)
    function mostrarEntrou(conta) {
      var nome = conta.perfil.nome ? primeiroNome(conta.perfil.nome) : conta.perfil.email;
      porId("logado-titulo").textContent = "Você entrou, " + nome + "!";
      porId("logado-texto").textContent = "Ainda não existe uma página depois do login. Ela será a próxima etapa do site.";
      form.hidden = true;
      porId("aviso-login").hidden = false;
      aviso.hidden = false;
    }

    porId("sair").addEventListener("click", async function () {
      var c = obterCliente();
      if (c) await c.auth.signOut();
      window.location.reload();
    });

    // se a pessoa já está logada, mostra direto
    carregarConta().then(function (conta) {
      if (conta) mostrarEntrou(conta);
    });

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var okEmail = checarEmail();
      var okSenha = checarSenha();
      if (!okEmail) return email.focus();
      if (!okSenha) return senha.focus();

      var c = obterCliente();
      var erroForm = avisoDoFormulario(form);
      erroForm.textContent = "";
      if (!c) {
        erroForm.textContent = "Não foi possível carregar o servidor. Recarregue a página.";
        return;
      }

      ocupado(form, true, "Entrando...");
      try {
        var emailLimpo = email.value.trim().toLowerCase();
        var resposta = await c.auth.signInWithPassword({ email: emailLimpo, password: senha.value });
        if (resposta.error) {
          if (String(resposta.error.message || "").toLowerCase().indexOf("not confirmed") !== -1) {
            // ainda não confirmou: leva para a tela que reenvia o e-mail
            window.location.href = montarUrl("confirme-email.html", { email: emailLimpo });
            return;
          }
          erroForm.textContent = traduzirErro(resposta.error);
          return;
        }
        var conta = await carregarConta();
        if (!conta) {
          erroForm.textContent = "Entrei, mas não achei o seu perfil. Tente de novo.";
          return;
        }
        // cadastro pela metade: continua de onde parou
        if (!conta.perfil.nome) {
          window.location.href = "informacoes.html";
          return;
        }
        mostrarEntrou(conta);
      } catch (erro) {
        erroForm.textContent = traduzirErro(erro);
      } finally {
        ocupado(form, false);
      }
    });
  }

  /* ---------- Página: esqueci minha senha ---------- */

  function iniciarEsqueci() {
    var form = porId("form-esqueci");
    var email = porId("email");
    var enviado = porId("enviado");
    var ultimo = null;

    function checarEmail() {
      var r = validarEmail(email.value);
      mostrarErro(email, r.ok ? "" : r.mensagem);
      return r;
    }
    email.addEventListener("blur", checarEmail);
    email.addEventListener("input", function () {
      if (email.getAttribute("aria-invalid") === "true") checarEmail();
    });

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var r = checarEmail();
      if (!r.ok) return email.focus();

      var c = obterCliente();
      var erroForm = avisoDoFormulario(form);
      erroForm.textContent = "";
      if (!c) {
        erroForm.textContent = "Não foi possível carregar o servidor. Recarregue a página.";
        return;
      }

      // A resposta na tela é a MESMA exista ou não uma conta com esse e-mail,
      // para ninguém descobrir quem tem cadastro. Só mostramos erro de limite ou de internet.
      ocupado(form, true, "Enviando...");
      try {
        var resposta = await c.auth.resetPasswordForEmail(r.email, {
          redirectTo: urlDaPagina("redefinir-senha.html")
        });
        if (resposta.error && (resposta.error.status === 429 || !resposta.error.status)) {
          erroForm.textContent = traduzirErro(resposta.error);
          return;
        }
      } catch (erro) {
        erroForm.textContent = traduzirErro(erro);
        return;
      } finally {
        ocupado(form, false);
      }

      ultimo = r.email;
      porId("email-mostrado").textContent = r.email;
      form.hidden = true;
      porId("lead").hidden = true;
      porId("titulo").hidden = true;
      enviado.hidden = false;
      porId("enviado-titulo").focus();
    });

    // Em vez de clicar no link do e-mail, o botão de teste faz o mesmo caminho
    porId("simular-reset").addEventListener("click", function () {
      // não dá para fingir o clique: o link de verdade só chega por e-mail
      var botao = porId("simular-reset");
      botao.textContent = "Use o link que chegou no seu e-mail";
      botao.disabled = true;
    });

    porId("outro-email").addEventListener("click", function () {
      enviado.hidden = true;
      form.hidden = false;
      porId("lead").hidden = false;
      porId("titulo").hidden = false;
      email.value = "";
      email.focus();
    });
  }

  /* ---------- Página: criar nova senha ---------- */

  async function iniciarRedefinir() {
    // O link do e-mail abre esta página com uma sessão de recuperação. Sem ela, pede um link novo.
    var c = obterCliente();
    var sessao = c ? (await c.auth.getSession()).data.session : null;
    if (!sessao) {
      window.location.replace("esqueci-senha.html");
      return;
    }
    var emailDaConta = sessao.user.email;

    var form = porId("form-redefinir");
    var senha = porId("senha");
    var senha2 = porId("senha2");

    function checarSenha() {
      var msg = validarSenha(senha.value);
      mostrarErro(senha, msg);
      return !msg;
    }
    function checarSenha2() {
      var msg = !senha2.value ? "Repita a senha para confirmar." : senha2.value !== senha.value ? "As senhas não são iguais." : "";
      mostrarErro(senha2, msg);
      return !msg;
    }
    senha.addEventListener("blur", checarSenha);
    senha2.addEventListener("blur", checarSenha2);
    [senha, senha2].forEach(function (campo) {
      campo.addEventListener("input", function () {
        if (campo.getAttribute("aria-invalid") === "true") {
          if (campo === senha) checarSenha();
          else checarSenha2();
        }
      });
    });
    ativarBotoesSenha();

    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var okSenha = checarSenha();
      var okSenha2 = checarSenha2();
      if (!okSenha) return senha.focus();
      if (!okSenha2) return senha2.focus();

      var aviso = avisoDoFormulario(form);
      aviso.textContent = "";
      ocupado(form, true, "Salvando...");
      try {
        var resposta = await c.auth.updateUser({ password: senha.value });
        if (resposta.error) {
          aviso.textContent = traduzirErro(resposta.error);
          return;
        }
        await c.auth.signOut(); // depois de trocar a senha, entra de novo com ela
      } catch (erro) {
        aviso.textContent = traduzirErro(erro);
        return;
      } finally {
        ocupado(form, false);
      }
      porId("ir-login").href = montarUrl("login.html", { email: emailDaConta });
      form.hidden = true;
      porId("lead").hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso").hidden = false;
      porId("sucesso-titulo").focus();
    });
  }

  /* ---------- Começar ---------- */

  var pagina = document.body.dataset.page;
  if (pagina === "cadastro") iniciarCadastro();
  else if (pagina === "confirme") iniciarConfirmacao();
  else if (pagina === "informacoes") iniciarInformacoes();
  else if (pagina === "professor-dias") iniciarProfessorDias();
  else if (pagina === "professor-horarios") iniciarProfessorHorarios();
  else if (pagina === "login") iniciarLogin();
  else if (pagina === "esqueci") iniciarEsqueci();
  else if (pagina === "redefinir") iniciarRedefinir();
})();
