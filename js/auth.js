/* ==========================================================
   Telas de conta (cadastro, confirmar e-mail, informações).

   ATENÇÃO: este script é uma SIMULAÇÃO, só para testar o visual
   e o caminho das telas. Ele NÃO cria conta, NÃO envia e-mail
   e NÃO guarda nada. A senha nunca sai do campo: não é salva em
   lugar nenhum. Quando houver servidor (ex.: Supabase), as partes
   marcadas com "TODO" passam a falar com ele.
   ========================================================== */
(function () {
  "use strict";

  var DOMINIO_ALUNO = "alunos.g12.br";
  var DOMINIO_PROFESSOR = "santanna.g12.br";

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

  // Lê o e-mail e a confirmação do endereço da página (?email=...&confirmado=1)
  // TODO: com servidor, isto vira a sessão da pessoa que entrou.
  function lerEndereco() {
    var p = new URLSearchParams(window.location.search);
    return { email: p.get("email") || "", confirmado: p.get("confirmado") === "1" };
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

    // botão de mostrar/ocultar senha
    document.querySelectorAll(".toggle-senha").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var alvo = porId(botao.dataset.alvo);
        var mostrar = alvo.type === "password";
        alvo.type = mostrar ? "text" : "password";
        botao.setAttribute("aria-pressed", String(mostrar));
        botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      });
    });

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var r = checarEmail();
      var okSenha = checarSenha();
      var okSenha2 = checarSenha2();

      if (!r.ok) return email.focus();
      if (!okSenha) return senha.focus();
      if (!okSenha2) return senha2.focus();

      // TODO: aqui o servidor cria a conta e envia o e-mail de confirmação.
      window.location.href = "confirme-email.html?email=" + encodeURIComponent(r.email);
    });
  }

  /* ---------- Página: confirmar e-mail ---------- */

  function iniciarConfirmacao() {
    var dados = lerEndereco();
    var r = validarEmail(dados.email);
    if (!r.ok) {
      window.location.replace("cadastro.html");
      return;
    }
    porId("email-mostrado").textContent = r.email;

    var status = porId("status");
    var reenviar = porId("reenviar");
    var espera = null;

    // Em vez de clicar no link do e-mail, o botão de teste faz o mesmo caminho
    porId("simular-link").addEventListener("click", function () {
      window.location.href =
        "informacoes.html?email=" + encodeURIComponent(r.email) + "&confirmado=1";
    });

    reenviar.addEventListener("click", function () {
      // TODO: aqui o servidor reenvia o e-mail de verdade.
      var segundos = 30;
      reenviar.disabled = true;
      status.textContent = "Reenvio simulado. Nenhum e-mail foi enviado de verdade.";
      espera = window.setInterval(function () {
        segundos -= 1;
        reenviar.textContent = "Reenviar em " + segundos + "s";
        if (segundos <= 0) {
          window.clearInterval(espera);
          reenviar.disabled = false;
          reenviar.textContent = "Reenviar e-mail";
        }
      }, 1000);
      reenviar.textContent = "Reenviar em " + segundos + "s";
    });
  }

  /* ---------- Página: informações adicionais ---------- */

  function iniciarInformacoes() {
    var dados = lerEndereco();
    var r = validarEmail(dados.email);

    // sem e-mail válido ou sem confirmação, volta para o começo do caminho
    if (!r.ok) {
      window.location.replace("cadastro.html");
      return;
    }
    if (!dados.confirmado) {
      window.location.replace("confirme-email.html?email=" + encodeURIComponent(r.email));
      return;
    }

    var ehAluno = r.papel === "aluno";
    var form = porId("form-informacoes");
    var nome = porId("nome");
    var ano = porId("ano");

    // professores e alunos são todos usuários; só não precisam informar ano e período
    if (!ehAluno) {
      document.querySelectorAll(".somente-aluno").forEach(function (bloco) {
        bloco.hidden = true;
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

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var okNome = checarNome();
      var programa = ehAluno ? programaEscolhido() : "-";
      var okAno = ehAluno ? checarAno() : true;
      var periodo = ehAluno ? periodoEscolhido() : "-";

      if (!okNome) return nome.focus();
      if (!programa) return document.querySelector("input[name='programa']").focus();
      if (!okAno) return ano.focus();
      if (!periodo) return document.querySelector("input[name='periodo']").focus();

      // TODO: aqui o servidor salva nome, ano e período no perfil.
      var primeiroNome = nome.value.trim().split(/\s+/)[0];
      porId("sucesso-texto").textContent = "Bem-vindo(a), " + primeiroNome + "!";
      form.hidden = true;
      porId("sucesso").hidden = false;
      document.querySelector(".auth-lead").hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso-titulo").focus();
    });
  }

  /* ---------- Começar ---------- */

  var pagina = document.body.dataset.page;
  if (pagina === "cadastro") iniciarCadastro();
  else if (pagina === "confirme") iniciarConfirmacao();
  else if (pagina === "informacoes") iniciarInformacoes();
})();
