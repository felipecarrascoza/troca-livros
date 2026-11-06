/* ==========================================================
   Telas de conta (cadastro, confirmar e-mail, informações e,
   para professores, dias e horários na escola).

   ATENÇÃO: este script é uma SIMULAÇÃO, só para testar o visual
   e o caminho das telas. Ele NÃO cria conta, NÃO envia e-mail
   e NÃO guarda nada. A senha nunca sai do campo: não é salva em
   lugar nenhum. Quando houver servidor (ex.: Supabase), as partes
   marcadas com "TODO" passam a falar com ele.

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

  // Monta um endereço de página com dados no final (?email=...&nome=...)
  function montarUrl(pagina, dados) {
    var p = new URLSearchParams();
    Object.keys(dados).forEach(function (chave) {
      if (dados[chave] !== undefined && dados[chave] !== "") p.set(chave, dados[chave]);
    });
    return pagina + "?" + p.toString();
  }

  // Lê os dados que vieram no endereço da página
  // TODO: com servidor, isto vira a sessão da pessoa que entrou.
  function lerEndereco() {
    var p = new URLSearchParams(window.location.search);
    var idsValidos = DIAS.map(function (d) { return d.id; });
    return {
      email: p.get("email") || "",
      confirmado: p.get("confirmado") === "1",
      nome: p.get("nome") || "",
      dias: (p.get("dias") || "").split(",").filter(function (d) {
        return idsValidos.indexOf(d) !== -1;
      })
    };
  }

  function primeiroNome(nome) {
    return nome.trim().split(/\s+/)[0];
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

  // Páginas exclusivas de professor: quem não é professor volta para o seu caminho.
  // Devolve os dados da pessoa, ou null quando redirecionou.
  function exigirProfessor() {
    var dados = lerEndereco();
    var r = validarEmail(dados.email);
    if (!r.ok) {
      window.location.replace("cadastro.html");
      return null;
    }
    if (!dados.confirmado) {
      window.location.replace(montarUrl("confirme-email.html", { email: r.email }));
      return null;
    }
    if (r.papel !== "professor") {
      window.location.replace(montarUrl("informacoes.html", { email: r.email, confirmado: "1" }));
      return null;
    }
    return { email: r.email, nome: dados.nome, dias: dados.dias };
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
      window.location.href = montarUrl("confirme-email.html", { email: r.email });
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
    definirEtapa("Etapa 2 de " + (r.papel === "professor" ? 5 : 3) + " · Confirmar e-mail");

    var status = porId("status");
    var reenviar = porId("reenviar");
    var espera = null;

    // Em vez de clicar no link do e-mail, o botão de teste faz o mesmo caminho
    porId("simular-link").addEventListener("click", function () {
      window.location.href = montarUrl("informacoes.html", { email: r.email, confirmado: "1" });
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
      window.location.replace(montarUrl("confirme-email.html", { email: r.email }));
      return;
    }

    var ehAluno = r.papel === "aluno";
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
    if (dados.nome) nome.value = dados.nome; // ao voltar da etapa seguinte

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

      // TODO: aqui o servidor salva nome, programa, ano e período no perfil.
      if (!ehAluno) {
        // professor segue para a etapa dos dias na escola
        window.location.href = montarUrl("professor-dias.html", {
          email: r.email,
          confirmado: "1",
          nome: nome.value.trim().replace(/\s+/g, " ")
        });
        return;
      }

      porId("sucesso-texto").textContent = "Bem-vindo(a), " + primeiroNome(nome.value) + "!";
      form.hidden = true;
      porId("sucesso").hidden = false;
      document.querySelector(".auth-lead").hidden = true;
      porId("titulo").hidden = true;
      porId("sucesso-titulo").focus();
    });
  }

  /* ---------- Página: professor, dias na escola ---------- */

  function iniciarProfessorDias() {
    var ctx = exigirProfessor();
    if (!ctx) return;
    if (!ctx.nome) {
      // pulou a etapa do nome: volta para ela
      window.location.replace(montarUrl("informacoes.html", { email: ctx.email, confirmado: "1" }));
      return;
    }

    var form = porId("form-dias");
    var erro = porId("dias-erro");
    var caixas = document.querySelectorAll("input[name='dia']");

    // ao voltar da etapa dos horários, os dias já escolhidos continuam marcados
    caixas.forEach(function (caixa) {
      caixa.checked = ctx.dias.indexOf(caixa.value) !== -1;
      caixa.addEventListener("change", function () {
        if (selecionados().length) erro.textContent = "";
      });
    });

    function selecionados() {
      return DIAS.filter(function (d) {
        return document.querySelector("input[name='dia'][value='" + d.id + "']").checked;
      }).map(function (d) { return d.id; });
    }

    porId("voltar").href = montarUrl("informacoes.html", {
      email: ctx.email, confirmado: "1", nome: ctx.nome
    });

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var dias = selecionados();
      if (!dias.length) {
        erro.textContent = "Escolha pelo menos um dia da semana.";
        caixas[0].focus();
        return;
      }
      window.location.href = montarUrl("professor-horarios.html", {
        email: ctx.email, confirmado: "1", nome: ctx.nome, dias: dias.join(",")
      });
    });
  }

  /* ---------- Página: professor, horários na escola ---------- */

  function iniciarProfessorHorarios() {
    var ctx = exigirProfessor();
    if (!ctx) return;
    if (!ctx.nome) {
      window.location.replace(montarUrl("informacoes.html", { email: ctx.email, confirmado: "1" }));
      return;
    }
    var dias = DIAS.filter(function (d) { return ctx.dias.indexOf(d.id) !== -1; });
    if (!dias.length) {
      // pulou a escolha dos dias: volta para ela
      window.location.replace(montarUrl("professor-dias.html", {
        email: ctx.email, confirmado: "1", nome: ctx.nome
      }));
      return;
    }

    var form = porId("form-horarios");
    var lista = porId("lista-horarios");
    var status = porId("status");

    porId("voltar").href = montarUrl("professor-dias.html", {
      email: ctx.email, confirmado: "1", nome: ctx.nome, dias: ctx.dias.join(",")
    });

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

    form.addEventListener("submit", function (evento) {
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

      // TODO: aqui o servidor salva o nome, os dias e os horários no perfil.
      var resumo = porId("resumo");
      dias.forEach(function (d) {
        var c = campos(d.id);
        var item = document.createElement("li");
        var nomeDia = document.createElement("strong");
        nomeDia.textContent = d.nome;
        item.appendChild(nomeDia);
        item.appendChild(document.createTextNode(": das " + c.ini.value + " às " + c.fim.value));
        resumo.appendChild(item);
      });
      porId("sucesso-texto").textContent = "Bem-vindo(a), " + primeiroNome(ctx.nome) + "!";
      form.hidden = true;
      porId("acoes-voltar").hidden = true;
      document.querySelector(".auth-lead").hidden = true;
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
})();
