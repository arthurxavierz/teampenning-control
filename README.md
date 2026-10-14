# Achilles Team Penning

Sistema de gestão de Team Penning da Achilles Media. Cobre o evento inteiro: inscrição por trio, financeiro por CPF, montagem sorteada, operação de pista, ranking, finais, homologação, locução e Arena Live no telão.

Feito a partir da planilha de controle usada nas etapas CTM HSF (`TEAM PENNING CTM HSF 2026.xlsm`, versão 3.2), que pode ser importada direto para um evento.

Leia `PROJECT_SPEC.md` antes de qualquer grande alteração e `SUPABASE.md` para instalar em outra organização.

## No ar

| | Endereço |
| --- | --- |
| Site público | https://teampenning.achillesmedia.com.br |
| Painel da organização | https://teampenning.achillesmedia.com.br/admin (e-mail e senha) |
| Arena para o telão | `/eventos/<etapa>/live`, com `?modo=led` para painel de LED |
| Banco | Supabase, org **Team Penning** (plano grátis), projeto `teampenning` (`pqtxzpnbpfsjswhqvixu`, São Paulo) |
| Hospedagem | Netlify `teampenning-control`, publica a cada push na `main` |

## Dois modos

- **Nuvem** (produção): `VITE_DATA_MODE=supabase`. Os dados ficam no banco, a organização entra com login, a Arena e os resultados atualizam em tempo real em qualquer máquina, e a pista continua lançando tempos sem internet (a fila sobe sozinha quando a conexão volta).
- **Local** (demonstração e testes): sem variáveis. Tudo mora no navegador, com uma base de demonstração. Em Configurações do evento, "Restaurar demonstração" volta ao início.

## Como executar

Node.js 20 ou superior.

```bash
npm install
npm run dev                  # modo local, com a demonstração
npm run dev -- --mode cloud  # contra o banco, usando .env.cloud.local
npm test                     # regras, portal, importação da planilha e fluxo completo
npm run e2e                  # percorre o sistema clicando no Chrome (modo local, com npm run dev rodando)
npm run build
```

`.env.cloud.local` (ignorado pelo git) leva `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_ORG_SLUG`. Em produção esses valores estão no `netlify.toml`. A chave secreta do Supabase fica só no Netlify, como `SUPABASE_SERVICE_ROLE_KEY`.

Na demonstração local: área do competidor com CPF `111.222.333-96` e final do telefone `0001`; `/admin` aberto.

## O que o sistema faz

### Novidades desta versão

- **Lançar trio pelo balcão**: a organização digita o trio como na planilha, já aceito pelos três, pode repetir o mesmo trio até o limite e marcar o pagamento no ato. CPF e celular podem ficar para depois.
- **Importar a planilha de controle** (.xlsm 3.2): inscrições, limites, boiada, valor e pagamentos da aba Acerto, com prévia antes de gravar. A planilha da 8ª etapa entra inteira (94 inscrições, 85 competidores).
- **Categorias do circuito**: modelos prontos (Iniciante, Soma 01 a 11, Feminina, Mirim, Kids), tempo limite com SAT automático, handicap máximo por competidor, idade máxima, soma de idades do trio (Mirim CONTEP: até 13 anos, soma até 36) e sexo.
- **Boi sorteado na hora**: a mesa sorteia ou digita o número da fotocélula quando o trio entra na pista. Os outros modos (sorteado na montagem, sequencial) continuam.
- **Desempate em pista** e **premiação**, no ranking.
- **Banco de verdade**: login da organização, equipe por e-mail, tempo real, fila offline na pista, portal do competidor no servidor (inscrição, convites e "já paguei" com as mesmas regras do painel).

### Inscrição (público)

- Assistente em três passos: categoria, trio e revisão.
- Busca de competidor na base por nome, apelido ou código CONTEP, com CPF mascarado.
- Competidor cadastrado usa o handicap da base. O handicap digitado não sobrescreve mais o cadastro.
- Competidor novo com código CONTEP conhecido pega o handicap da base importada. Sem código, o handicap fica marcado como declarado, para conferência.
- Validações: CPF com dígito verificador, celular com DDD para quem é novo, prazo e status do evento, soma do trio contra a categoria, limite de participações por competidor, bloqueio de trio repetido e aceite do regulamento.
- Depois de criar o trio, botões de WhatsApp avisam os outros dois integrantes, já com o link e as instruções de acesso.

### Área do competidor

- Acesso por CPF e final do telefone.
- Convites em destaque, com aceitar e recusar.
- Trios com o aceite e o pagamento de cada integrante.
- Pix estático com QR Code e Copia e Cola, "Já paguei" com observação.
- Passadas do competidor quando a montagem é publicada.
- Histórico de etapas com melhor colocação.

### Financeiro

- Conta por CPF e por evento: devido, recebido, saldo e crédito.
- Um pagamento quita primeiro as participações aceitas mais antigas. A distribuição é estável: aceitar um convite antigo não reabre o que já estava pago.
- Trio recusado ou cancelado devolve o valor como crédito, que quita a próxima participação aceita sem baixa manual.
- Conferência do pagamento informado com valor editável, marcação de "não localizado" e baixa manual avulsa.
- Cobrança pelo WhatsApp com o saldo e o link da área do competidor.
- Cada valor guarda o preço da época: mudar o preço do evento não mexe em quem já se inscreveu.

### Inscrições (organização)

- Filtros por status, busca por nome ou CPF e detalhe de cada integrante.
- Substituição de integrante com motivo e cancelamento de trio com motivo. As passadas pendentes do trio cancelado saem da montagem.
- Aviso de trios com handicap declarado.

### Montagem

- Sorteio com semente registrada. A mesma semente gera a mesma ordem e a mesma boiada.
- Distância mínima configurável entre participações do mesmo competidor, com os conflitos apontados na lista.
- Categorias intercaladas por rodada ou em sequência.
- Boiada sorteada sem repetir o boi no mesmo trio, ou sequencial, na faixa configurada.
- Publicar e travar. Depois de publicada, mover passada ou trocar boi pede motivo e fica na auditoria.
- Trios confirmados depois do sorteio entram no fim com um clique.
- Impressão e CSV.

### Operação de pista

- Passada atual com trio, categoria, rodada e número do boi.
- Enter confirma o tempo. Alt + número lança a ocorrência. Ctrl + Z desfaz o último.
- O tempo aceita vírgula (44,5) e minutos (1:02,345).
- Mostra o que o trio já fez na etapa e quanto precisa para entrar no corte da final.
- Ocorrências configuráveis por evento: anular tempo, penalidade em segundos ou desclassificação.
- Trava contra duplo lançamento da mesma passada.
- Correção e desfazer com motivo, guardando o valor anterior.
- Tempo para liderar na última passada da final.

### Ranking, finais e homologação

- Soma dos N melhores tempos, com penalidades.
- Desempate configurável por categoria: melhor tempo individual, último tempo válido, empate mantido (posição dividida) ou desempate em pista, em que os empatados correm de novo.
- Premiação por categoria: percentual do arrecadado ou valor fixo, dividida pela tabela de colocações. Empatados dividem o valor.
- Linha de corte da final.
- Geração da final: o último classificado corre primeiro. Final soma ou não a classificatória, conforme a categoria.
- Homologação por categoria. Resultado homologado não aceita correção até ser reaberto com motivo.

### Locução

- Mesa do locutor em letra grande: nomes completos, apelidos, handicap e código CONTEP de quem está na pista.
- Tempos do trio nesta etapa, posição na categoria e a frase pronta: quanto precisa para entrar no corte da final ou para assumir a liderança.
- Último resultado com a nova posição, pódio parcial da categoria e as próximas passadas.

### Arena Live

- Modo TV e modo LED.
- Rotação entre categorias com tempo configurável. Mostra a final quando existe.
- Na pista, último resultado, próximas passadas, tempo para entrar na final e tempo para liderar.
- Tela de intervalo acionada pela organização, patrocinadores no rodapé e cor de destaque por evento.
- Atualiza sozinha em qualquer máquina, pelo Supabase Realtime (no modo local, entre abas do mesmo navegador).

### Base CONTEP

- Importação de XLSX, XLS ou CSV, com mapeamento automático das colunas e ajuste manual.
- Pré-visualização antes de gravar: atualiza, novo, conferir, inválido, sem mudança.
- Associação por CPF, depois por código. Associação só pelo nome vai para conferência.
- Célula vazia não zera handicap. Vírgula decimal é aceita.
- Histórico de importações. Inscrições feitas antes mantêm o handicap da época.

### Organização

- Central de eventos com criação a partir de modelo ou duplicando uma etapa anterior (categorias, regras, ocorrências, Pix e Arena).
- Visão do evento com o andamento de cada etapa.
- Competidores: cadastro permanente, histórico por evento, edição com motivo.
- Relatórios em CSV para Excel: inscrições, financeiro, pagamentos, passadas, resultados e participações. Inadimplência para imprimir.
- Auditoria: toda ação sobre inscrição, dinheiro, montagem e resultado, com operador, horário, motivo e valor anterior.
- Cópia de segurança em JSON. No modo local, também leva os dados de um computador para outro.
- Se uma tela quebrar, aparece uma tela de erro com saída, em vez de página em branco.

## Estrutura

```text
src/
  lib/
    core.js            todas as ações de escrita (painel e servidor usam o mesmo código)
    rules.js           status do trio, prazo, limites, restrições de categoria, validação
    finance.js         conta por CPF, distribuição de pagamentos, créditos
    schedule.js        sorteio com semente, distância mínima, conflitos, boiada
    ranking.js         tempos válidos, desempate, final, desempate em pista, premiação
    legacy.js          leitura da planilha de controle antiga
    portal.js          regras do portal do competidor (rodam no servidor)
    store.jsx          estado e ações; modo local ou nuvem
    cloud/schema.js    estado <-> tabelas, diferença entre estados, carga da organização
    cloud/client.js    fila offline, Realtime, leitura pública e pulso
    contep.js, contepBase.js, defaults.js, seed.js, pix.js, export.js, utils.js
    *.test.js          testes
  components/          layouts, UI, tabelas de ranking, integrante do trio, portões de carregamento
  pages/public/        início, evento, inscrição, resultados, minha área, Arena
  pages/admin/         login, equipe, central, competidores, CONTEP e as telas de cada evento
netlify/functions/     portal.mjs, o portal do competidor
supabase/migrations/   001_schema.sql: tabelas, RLS, funções públicas, pulso, Realtime e permissões
supabase/seed_organization.sql   primeira organização e responsável
e2e/flow.mjs           teste de ponta a ponta no navegador
```

### Como os dados andam

- **Organização**: carrega a organização inteira, aplica cada ação em memória com as regras de `core.js` e grava só a diferença no banco, por uma fila guardada no navegador. Outras máquinas recebem as mudanças pelo Realtime.
- **Público**: não lê tabela nenhuma. As funções `public_base` e `public_event` devolvem eventos, categorias, trios, passadas e competidores sem CPF completo, telefone, nascimento ou dinheiro. A tabela `sync_pulse` avisa quando buscar de novo.
- **Competidor**: fala com `/.netlify/functions/portal`, que confere CPF e final do celular (com limite de tentativas), assina um token e aplica as mesmas regras do painel.

## Identidade visual

Mesma família do Achilles Content: Anton nos títulos, Manrope no texto, ouro `#D8AF58` sobre preto e branco quente.

- Área pública clara e editorial, com navegação flutuante e grade de fundo.
- Organização em tema escuro com barra lateral, como a área do cliente do Achilles Content.
- Arena em alto contraste para telão.

Os detalhes equestres vêm de "The Horse in Motion" (Eadweard Muybridge, 1878, domínio público), recortado em silhuetas que galopam em CSS. O projeto de Muybridge nasceu justamente para cronometrar um cavalo. Completam o conjunto a corda como divisória, a cerca no rodapé, a ferradura como marcador e o número do boi no formato de marca a ferro.

## O que falta

| Item | Situação |
| --- | --- |
| Validar com o organizador e o locutor numa etapa real | Próximo passo |
| Regras oficiais (lista abaixo) | Configuráveis, aguardando a organização |
| Base CONTEP oficial do ano | Importador pronto, falta o arquivo |
| Login do competidor por código no WhatsApp ou e-mail | Hoje é CPF + final do celular, conferido no servidor |
| Ranking do circuito (soma de etapas) | Não feito. Cada etapa tem resultado próprio |
| Semifinais em dias diferentes (modelo Barretos) | Não feito. O modelo atual é classificatória + final |
| Plano do Supabase | O grátis pausa depois de 7 dias sem acesso. Para operação contínua, plano pago ou transferir a org para o organizador |

## Pontos que ainda não devem ser inventados

Tudo abaixo é configurável por evento ou categoria. A planilha da CTM HSF já responde parte: 4 passadas por inscrição, soma dos 2 melhores tempos, corte de 12 na Soma 11 e na Soma 03 e de 6 na Iniciante, até 10 inscrições por competidor, até 2 do mesmo trio, boiada de 0 a 6, R$ 350 por participação. Falta a organização confirmar:

1. Definição de SAT e das demais ocorrências, e se há tempo limite por categoria (regulamentos usam de 30 a 120 segundos).
2. Critério de desempate: melhor tempo individual, último tempo ou desempate em pista.
3. Quantas passadas na final e se a classificatória entra na soma (a planilha soma).
4. Boi sorteado na montagem ou na hora, pela fotocélula.
5. Distância mínima entre passadas do mesmo competidor.
6. Premiação: percentual do arrecadado e divisão por colocação.
7. Política de cancelamento, substituição e devolução de valores.
8. Se vai haver Mirim, Kids ou Feminina, e com quais limites de idade.

## Segurança

- A organização entra com e-mail e senha do Supabase Auth. O cadastro aberto está desligado: só entra quem a organização incluir em Equipe e tiver usuário criado no Supabase.
- Todas as tabelas têm RLS por organização. O público não lê tabela nenhuma, só as funções públicas, que não devolvem CPF completo, telefone, nascimento nem dinheiro.
- O acesso do competidor (CPF e quatro últimos dígitos do celular) é conferido no servidor, com bloqueio depois de 8 tentativas erradas em 15 minutos. É simples de propósito, para quem corre não precisar de senha. Um código por WhatsApp é o próximo passo, se a organização quiser.
