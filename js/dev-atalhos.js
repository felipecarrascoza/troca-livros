/* ==========================================================
   ATALHOS DE TESTE (somente para desenvolvedores).

   Mostra uma caixa amarela no pé das telas de conta, com botões que
   pulam etapas SEM criar conta, para testar o site mais rápido.
   NÃO FAZ PARTE DA VERSÃO FINAL.

   Só funciona quando js/config.js define MODO_DEV: true. Sem o
   config.js, ou com MODO_DEV: false, este arquivo não faz nada.
   Para remover de vez: apague este arquivo, o js/config.js e as linhas
   marcadas com "DEV:" nos arquivos .html.
   ========================================================== */
(function () {
  "use strict";

  var config = window.TROCA_LIVROS;
  if (!config || config.MODO_DEV !== true) return;

  var main = document.querySelector("main.auth");
  if (!main) return;

  // E-mails de mentira, só para montar o endereço das etapas seguintes
  var EMAIL_ESTUDANTE = "estudante.teste@alunos.g12.br";
  var EMAIL_PROFESSOR = "professor.teste@santanna.g12.br";

  function ir(pagina, dados) {
    window.location.href = pagina + "?" + new URLSearchParams(dados).toString();
  }

  function marcarRadio(nome, valor) {
    var radio = document.querySelector("input[name='" + nome + "'][value='" + valor + "']");
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function enviar(formId) {
    var form = document.getElementById(formId);
    if (form) form.requestSubmit();
  }

  /* ---------- Botões de cada página ---------- */

  var pagina = document.body.dataset.page;
  var botoes = null;

  if (pagina === "cadastro") {
    // Pula cadastro e confirmação de e-mail: vai direto às informações
    botoes = [
      { texto: "Seguir como estudante", acao: function () { ir("informacoes.html", { email: EMAIL_ESTUDANTE, confirmado: "1" }); } },
      { texto: "Seguir como professor", acao: function () { ir("informacoes.html", { email: EMAIL_PROFESSOR, confirmado: "1" }); } }
    ];
  } else if (pagina === "informacoes") {
    botoes = [{
      texto: "Preencher e avançar",
      acao: function () {
        var ehAluno = !document.querySelector(".somente-aluno").hidden;
        document.getElementById("nome").value = ehAluno ? "Estudante Teste" : "Professor Teste";
        if (ehAluno) {
          marcarRadio("programa", "Brasileiro");
          document.getElementById("ano").selectedIndex = 4;
          marcarRadio("periodo", "Diurno");
        }
        enviar("form-informacoes");
      }
    }];
  } else if (pagina === "professor-dias") {
    botoes = [{
      texto: "Marcar seg, qua e sex e avançar",
      acao: function () {
        document.querySelectorAll("input[name='dia']").forEach(function (caixa) {
          caixa.checked = ["seg", "qua", "sex"].indexOf(caixa.value) !== -1;
        });
        enviar("form-dias");
      }
    }];
  } else if (pagina === "professor-horarios") {
    botoes = [{
      texto: "Preencher 08:00–17:00 e concluir",
      acao: function () {
        document.querySelectorAll("input[type='time']").forEach(function (campo) {
          campo.value = campo.id.indexOf("ini-") === 0 ? "08:00" : "17:00";
        });
        enviar("form-horarios");
      }
    }];
  }

  else if (pagina === "login") {
    // Sem página depois do login: os botões só preenchem e enviam o formulário
    var preencherLogin = function (email) {
      return function () {
        document.getElementById("email").value = email;
        document.getElementById("senha").value = "teste1234";
        enviar("form-login");
      };
    };
    botoes = [
      { texto: "Preencher como estudante", acao: preencherLogin(EMAIL_ESTUDANTE) },
      { texto: "Preencher como professor", acao: preencherLogin(EMAIL_PROFESSOR) }
    ];
  } else if (pagina === "esqueci") {
    botoes = [{
      texto: "Preencher e enviar o link",
      acao: function () {
        document.getElementById("email").value = EMAIL_ESTUDANTE;
        enviar("form-esqueci");
      }
    }];
  } else if (pagina === "redefinir") {
    botoes = [{
      texto: "Preencher e salvar a nova senha",
      acao: function () {
        document.getElementById("senha").value = "novasenha1";
        document.getElementById("senha2").value = "novasenha1";
        enviar("form-redefinir");
      }
    }];
  }

  if (!botoes) return;

  /* ---------- Caixa amarela (estilo e conteúdo) ---------- */

  var estilo = document.createElement("style");
  estilo.textContent =
    ".dev-box{width:min(440px,100%);padding:14px 16px;border:2px dashed #b7791f;border-radius:12px;" +
    "background:#fff7e0;color:#5c4500;font-size:.85rem;line-height:1.45}" +
    ".dev-box p{margin:0 0 10px}" +
    ".dev-box__etiqueta{display:inline-block;margin-right:6px;padding:1px 8px;border-radius:999px;" +
    "background:#b7791f;color:#fff;font-size:.75rem;font-weight:700;letter-spacing:.05em}" +
    ".dev-box__botoes{display:flex;flex-wrap:wrap;gap:8px}" +
    ".dev-btn{padding:9px 14px;border:2px solid #b7791f;border-radius:10px;background:#fff;color:#5c4500;" +
    "font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}" +
    ".dev-btn:hover{background:#ffedb8}";
  document.head.appendChild(estilo);

  var caixa = document.createElement("aside");
  caixa.className = "dev-box";
  caixa.setAttribute("aria-label", "Atalhos de teste para desenvolvedores");

  var titulo = document.createElement("p");
  var etiqueta = document.createElement("span");
  etiqueta.className = "dev-box__etiqueta";
  etiqueta.textContent = "DEV";
  titulo.appendChild(etiqueta);
  titulo.appendChild(document.createTextNode("Atalhos de teste: não criam conta e não vão para a versão final."));
  caixa.appendChild(titulo);

  var linha = document.createElement("div");
  linha.className = "dev-box__botoes";
  botoes.forEach(function (b) {
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "dev-btn";
    botao.textContent = b.texto;
    botao.addEventListener("click", b.acao);
    linha.appendChild(botao);
  });
  caixa.appendChild(linha);

  // fica embaixo de tudo, antes do link "Voltar ao início"
  main.insertBefore(caixa, main.querySelector(".auth-back"));
})();
