# Como trazer de volta a confirmação por e-mail e o "Esqueci minha senha"

Para a **versão de demonstração**, retiramos do site:

- a tela **"Confira seu e-mail"** (`confirme-email.html`), que vinha depois do Sign up;
- o **"Esqueci minha senha"** (`esqueci-senha.html`) e a tela de **criar nova senha** (`redefinir-senha.html`);
- o link "Esqueci minha senha" na tela de Log In.

Nada foi perdido: tudo está guardado no GitHub.

## Onde está guardado

A branch **`guardado-confirmacao-e-senha`** tem o site exatamente como era antes
(commit `a40f8b2`, "Liga o site ao Supabase"), com as três telas funcionando.

Para ver: no GitHub, abra o seletor de branches (onde está escrito `main`) e escolha
`guardado-confirmacao-e-senha`.

## O que mudou na demonstração (para saber o que desfazer)

| Onde | O que mudou |
|---|---|
| Painel do Supabase | **"Confirm email" foi DESLIGADO** (Authentication → Providers → Email) |
| `js/auth.js` | cadastro entra direto (sem tela de e-mail); removidas as funções `iniciarConfirmacao`, `iniciarEsqueci`, `iniciarRedefinir`; mensagens de erro novas |
| `confirme-email.html`, `esqueci-senha.html`, `redefinir-senha.html` | apagados |
| `login.html` | sem o link "Esqueci minha senha" |
| Contadores "Etapa X de Y" | aluno: 2 etapas; professor: 4 (antes 3 e 5) |
| `js/config.js` | `MODO_DEV: false` |
| Selo "Versão de demonstração" | no canto de cada página |

## Passo a passo para restaurar

### 1. O envio de e-mail (faça ANTES de mexer no site)
O envio de e-mail padrão do Supabase **só manda para membros da equipe do projeto** e tem
limite baixo. Para alunos e professores receberem, é preciso um **SMTP próprio**:

1. Crie conta num serviço de envio com plano grátis (por exemplo Resend ou Brevo).
2. Verifique o endereço ou domínio de envio (provavelmente com a **TI da escola**).
3. No Supabase: **Authentication → SMTP Settings** e preencha com os dados do serviço.
   A senha do serviço fica **só** ali. Nunca no site, no GitHub ou no chat.
4. Teste enviando para um e-mail de aluno que **não** é da equipe do Supabase.

### 2. Ajustes no painel do Supabase
1. **Authentication → Providers → Email → "Confirm email": LIGAR.**
2. **Authentication → URL Configuration:**
   - Site URL: `https://felipecarrascoza.github.io/troca-livros/`
   - Redirect URLs: a mesma URL com `/**` no final.
3. Se forem usar **código de 6 dígitos** em vez de link (recomendado em escolas, porque filtros
   de e-mail podem "gastar" o link antes da pessoa clicar): em **Authentication → Email Templates**,
   troque o botão de link pelo código `{{ .Token }}` nos e-mails "Confirm sign up" e
   "Reset password", e peça a mudança correspondente no site (campo para digitar o código).

### 3. Trazer o código de volta
Escolha um dos jeitos:

- **Pelo GitHub:** abra um *Pull request* de `guardado-confirmacao-e-senha` para `main`,
  ou compare as duas branches e copie só o que precisa.
- **Pelo terminal:**
  ```
  git checkout main
  git checkout guardado-confirmacao-e-senha -- confirme-email.html esqueci-senha.html redefinir-senha.html
  ```
  Depois traga de volta, da branch guardada, as partes de `js/auth.js` e `login.html`
  que tratam disso (use `git diff main guardado-confirmacao-e-senha -- js/auth.js login.html`
  para ver exatamente o que foi retirado) e **desfaça os contadores de etapa**
  (aluno 3 etapas, professor 5).

### 4. Testar
1. Cadastro com um e-mail de aluno real → chega o e-mail → confirma → informações.
2. "Esqueci minha senha" completo → nova senha → Log In com a nova senha.
3. Olhe a caixa de **spam**.

## Antes do lançamento de verdade (além disto)
- Ligar o **captcha** (o Supabase aceita Turnstile e hCaptcha).
- Tirar o selo "Versão de demonstração" (linhas marcadas com `DEMO:`).
- Apagar `js/config.js`, `js/dev-atalhos.js` e as linhas marcadas com `DEV:`.
- Combinar com a escola e os responsáveis o que pode ser guardado e quem vê os horários dos professores.
