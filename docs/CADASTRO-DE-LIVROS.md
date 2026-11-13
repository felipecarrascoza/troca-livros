# Cadastro de livros por ISBN

Como funciona a tela **Cadastrar livro** (`cadastrar-livro.html`) e onde mexer em cada parte.

## Como funciona

1. A pessoa digita o **ISBN** (10 ou 13 números, com ou sem hífens). O site confere o dígito
   verificador sozinho e converte o de 10 para 13.
2. O site procura o livro, **nesta ordem**:
   1. no **catálogo do próprio site** (tabela `livros`): se outra pessoa já cadastrou esse ISBN,
      os dados vêm de lá e **não podem ser mudados** por quem cadastra o exemplar;
   2. na **função de servidor `consultar-isbn`**, que pergunta ao mesmo tempo à **BrasilAPI**, à
      **Open Library** e ao **Google Books** e junta o resultado (para cada campo vale a primeira
      fonte que trouxer valor, nessa ordem);
   3. se ninguém achar, a pessoa **preenche à mão**.
3. A pessoa **confere os dados** (eles podem ter erros), diz como está o exemplar
   (novo, bom, regular ou desgastado), se quer trocar, doar ou os dois, e salva.

Salvar grava duas coisas: o **livro** no catálogo (se ainda não existia) e o **exemplar** da pessoa.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Tela | `cadastrar-livro.html` e `js/livros.js` |
| Banco (tabelas `livros` e `exemplares`, regras de acesso) | `supabase/migrations/20261113000000_cria_livros_e_exemplares.sql` |
| Função que consulta as fontes | `supabase/functions/consultar-isbn/index.ts` (publicada no Supabase) |

## Regras de segurança (resumo)

- Só quem **está logado e já terminou o cadastro (tem nome)** cadastra livros e exemplares.
- Todo mundo que está logado **vê** o catálogo e os exemplares (a busca vai precisar disso).
- Cada pessoa só **altera ou apaga o próprio exemplar**. O dono de um exemplar não pode ser trocado.
- **Ninguém altera ou apaga um livro do catálogo pelo site.** Para corrigir um dado errado, use o
  painel do Supabase (**Table Editor → livros**).
- O ISBN é conferido de novo **no banco** (dígito verificador), e as capas só podem ser endereços `https://`.
- A função `consultar-isbn` **só responde para quem está logado**. Atenção: o "portão" `verify_jwt` do
  Supabase sozinho **não** barra a chave pública do site; por isso a própria função pergunta ao
  servidor de login se existe uma pessoa de verdade (`usuarioLogado`). **Não tire essa conferência.**

## Se for publicar a função de novo

No painel do Supabase (**Edge Functions → consultar-isbn**) ou pelo plugin do Supabase no Claude,
publique o conteúdo de `supabase/functions/consultar-isbn/index.ts` com **"Verify JWT" ligado**.

## Google Books (opcional)

Sem chave, o Google Books ainda tenta, mas pode recusar por excesso de consultas. A BrasilAPI e a
Open Library não precisam de chave. Se um dia houver uma chave do Google (criada no Google Cloud
por um adulto responsável), guarde-a como **segredo** do Supabase com o nome `GOOGLE_BOOKS_API_KEY`
(**Edge Functions → Secrets**). **Nunca** coloque a chave no código nem no GitHub.

## Limites que vocês precisam saber

- Os dados vêm de **bases feitas por muita gente** e podem ter erros (já apareceram registros
  estranhos, como anos errados). Por isso a pessoa sempre confere antes de salvar.
- Livros **didáticos de sistemas de ensino e apostilas** muitas vezes não têm ISBN ou não estão nas bases.
  O preenchimento à mão continua existindo para esses casos.
- Qualquer pessoa logada pode cadastrar um livro novo no catálogo, e ninguém revisa. Se isso virar
  problema, o próximo passo é uma etapa de moderação.
- **Ainda não há foto do exemplar** (falta o armazenamento de imagens) **nem busca de livros**.
- A Open Library pede que os sites se identifiquem; a função usa `TrocaLivros/1.0 (projeto escolar)`.
  Se o uso crescer, vale colocar um contato de verdade (de um responsável, nunca um e-mail pessoal de aluno).
