# Banco e instalação

## Produção atual

- Supabase: organização **Team Penning** (plano grátis), projeto `teampenning`, ref `pqtxzpnbpfsjswhqvixu`, região São Paulo.
- Organização no sistema: **CTM Team Penning**, endereço curto `ctm`.
- Netlify: projeto `teampenning-control`, domínio `teampenning.achillesmedia.com.br` (CNAME com proxy no Cloudflare).
- URL e chave publicável estão em `netlify.toml`. A chave secreta fica só nas variáveis do Netlify.

O plano grátis do Supabase pausa o projeto depois de cerca de 7 dias sem nenhum acesso. Se pausar, o painel do Supabase tem um botão "Restore". Para não correr esse risco perto de uma etapa, abra o site uma vez por semana ou passe o projeto para um plano pago.

## Instalar para outra organização (ou na conta do organizador)

Uns 20 minutos. Nada no código muda, só configuração.

### 1. Projeto no Supabase

1. Crie uma organização (o plano grátis serve) e um projeto na região **South America (São Paulo)**. Use "Generate a password" para a senha do banco.
2. Em **SQL Editor**, cole e rode `supabase/migrations/001_schema.sql` inteiro. Se aparecer o aviso de "destructive operations" ou de RLS, escolha **Run and enable RLS**: são só os `drop ... if exists` de um banco vazio.
3. Ainda no SQL Editor, rode `supabase/seed_organization.sql`, trocando nome, endereço curto (`slug`) e o e-mail do responsável.
4. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up** e salve.
5. Em **Authentication > Users > Add user > Create new user**, crie o usuário com o mesmo e-mail do passo 3 e marque **Auto Confirm User**. Repita para cada pessoa da equipe (depois de incluída no painel, em Equipe).

### 2. Chaves

Em **Project Settings > API Keys**:

- **Publishable key** (`sb_publishable_...`): pública, vai no site.
- **Secret key** (`sb_secret_...`): nunca vai para o navegador nem para o repositório.

### 3. Netlify

1. Novo site a partir do repositório. O `netlify.toml` já define build, pasta e funções.
2. Em `netlify.toml`, troque `VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (a publicável), `VITE_ORG_SLUG` e `ORG_SLUG` pelos do projeto novo. Ou defina esses nomes nas variáveis do site.
3. Em **Project configuration > Environment variables**, crie `SUPABASE_SERVICE_ROLE_KEY` com a **Secret key**. Só a função do portal usa.
4. **Deploys > Trigger deploy > Deploy project**, para as funções lerem a variável nova.

### 4. Domínio

No Netlify, **Domain management > Add a domain you already own**. No DNS (Cloudflare), um CNAME do subdomínio para `<site>.netlify.app`.

### 5. Conferir

- `/admin` mostra o login e, depois de entrar, a Central de eventos vazia.
- `/minha-area` com um CPF qualquer responde "CPF ou dígitos do celular não conferem" (se responder "Servidor sem configuração do banco", falta a chave secreta do passo 3.3).
- Crie um evento, lance um trio no balcão e abra o site público em outro aparelho: o trio aparece sem recarregar quando a montagem for publicada.

## Atualizar o banco depois

Mudanças de estrutura entram como novos arquivos em `supabase/migrations/` (002, 003...), rodados em ordem no SQL Editor. O 001 pode ser rodado de novo sem perder dados: ele só cria o que falta.
