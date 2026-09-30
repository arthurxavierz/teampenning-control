# Subir com banco (Supabase)

Passo a passo para ligar o Achilles Team Penning a um banco de verdade. As
partes marcadas com **[você]** dependem da sua conta. As com **[Claude]** eu
faço no código depois que o projeto existir.

## 1. Criar o projeto [você]

1. Entre em https://supabase.com e crie um projeto novo.
2. Região: **South America (São Paulo)** — mais perto, menos latência na pista.
3. Guarde a senha do banco que ele pedir.

## 2. Criar as tabelas [você]

No painel do Supabase, abra **SQL Editor** e rode os dois arquivos, na ordem:

1. Cole todo o conteúdo de `supabase/migrations/001_initial.sql` e execute.
2. Antes de rodar o `002`, execute **sozinha** esta linha (o Postgres não deixa
   adicionar valor a um enum junto com outros comandos):

   ```sql
   alter type public.payment_status add value if not exists 'rejected';
   ```

3. Agora cole o resto de `supabase/migrations/002_rules_audit.sql` (pode colar o
   arquivo inteiro; a linha acima repetida é ignorada por causa do
   `if not exists`) e execute.

Se algum comando reclamar que "já existe", pode ignorar: quer dizer que aquela
parte já rodou.

## 3. Criar a organização e o primeiro administrador [você]

1. Em **Authentication → Users → Add user**, crie seu usuário com e-mail e
   senha. É com ele que você vai entrar na área da organização.
2. Copie o **User UID** que aparece na lista.
3. Volte ao **SQL Editor** e rode, trocando o UID e, se quiser, o nome:

   ```sql
   with org as (
     insert into public.organizations (name, slug)
     values ('CTM Team Penning', 'ctm-team-penning')
     returning id
   )
   insert into public.organization_members (organization_id, user_id, role)
   select org.id, 'COLE_AQUI_O_USER_UID', 'owner' from org;
   ```

## 4. Pegar as chaves [você]

Em **Project Settings → API**, copie:

- **Project URL** (algo como `https://xxxx.supabase.co`)
- **anon public** (a chave `anon`, não a `service_role`)

A chave `anon` é pública de propósito: ela vai no site e só pode fazer o que a
RLS permitir. **Nunca** use a `service_role` no front-end.

## 5. Configurar as variáveis [você]

**No Netlify** (Site settings → Environment variables), adicione:

```
VITE_SUPABASE_URL   = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY = a-chave-anon
VITE_DATA_MODE      = supabase
```

Depois clique em **Deploys → Trigger deploy → Deploy site** para reconstruir com
as variáveis.

**No seu computador** (para desenvolver), crie um arquivo `.env` na pasta do
projeto (ele é ignorado pelo git):

```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=a-chave-anon
```

Enquanto `VITE_DATA_MODE` não for `supabase`, o app continua rodando no modo
local (dados no navegador), sem depender do banco.

## 6. O que eu construo depois [Claude]

Com o projeto criado e as chaves em mãos (me passe a **Project URL** e a chave
**anon** — são públicas), eu faço, testando contra o seu projeto:

1. **Login da organização** (e-mail e senha) e proteção das telas de `/admin`.
2. **Camada de dados** que troca o localStorage pelo Supabase, mantendo as
   telas iguais. Cada ação continua com a mesma assinatura.
3. **RLS ligada** e **Realtime**: a Arena passa a atualizar entre máquinas
   diferentes, não só entre abas.
4. **Inscrição e "já paguei" do competidor** por funções no Netlify (mesmo
   padrão do Achilles Content), para não abrir escrita ao público sem validação.

## Ordem sugerida

Primeiro sobem as telas públicas e a área da organização lendo do banco (é onde
está o valor de operar em rede). Depois a inscrição self-service do competidor.
Assim dá para usar em um evento real já no meio do caminho, com a organização
cadastrando os trios, enquanto a parte pública é concluída.
