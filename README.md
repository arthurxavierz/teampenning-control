# Achilles Team Penning

Sistema de gestão de Team Penning da Achilles Media. Cobre o evento inteiro: inscrição por trio, financeiro por CPF, montagem sorteada, operação de pista, ranking, finais, homologação e Arena Live.

Esta versão ainda é um protótipo sem backend. Todo o estado fica no navegador, e as regras de negócio já estão isoladas e testadas para a troca por Supabase.

Leia `PROJECT_SPEC.md` antes de qualquer grande alteração.

## Como executar

Node.js 20 ou superior.

```bash
npm install
npm run dev      # servidor local
npm test         # regras de negócio e fluxo completo da store
npm run e2e      # percorre o sistema clicando no Chrome (com npm run dev rodando)
npm run build    # build de produção
```

O `npm run e2e` usa o Chrome ou o Edge instalado. Se o servidor estiver em outra porta, use `BASE_URL=http://localhost:5174 npm run e2e`. As capturas de tela ficam em `e2e/out`.

### Testar em outro computador

Os dados moram no navegador. Em Configurações do evento, **Baixar backup** gera um arquivo JSON. No outro computador, **Carregar backup** traz tudo de volta.

### Acessos da demonstração

| Área | Endereço | Acesso |
| --- | --- | --- |
| Site público | `/` | aberto |
| Área do competidor | `/minha-area` | CPF `111.222.333-96`, final do telefone `0001` |
| Organização | `/admin` | aberto no protótipo. Informe o nome do operador no menu lateral para assinar os lançamentos |
| Arena Live | `/eventos/8-etapa-ctm-hsf/live` | aberto. `?modo=led` para painel de LED |

A base traz duas etapas. A **8ª Etapa** está com inscrições abertas, trios em todos os estados, um convite pendente e um pagamento informado para conferir. A **7ª Etapa** está encerrada, com classificatória, final e resultado homologado. Ela alimenta histórico e relatórios.

Para voltar ao estado inicial: Configurações do evento, Restaurar demonstração.

## O que o protótipo faz

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
- Desempate configurável por categoria: melhor tempo individual, último tempo válido ou empate mantido (posição dividida).
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
- Atualiza sozinha entre abas do mesmo navegador. Em produção, Supabase Realtime.

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
- Backup e restauração dos dados do protótipo em JSON.
- Se uma tela quebrar, aparece uma tela de erro com saída, em vez de página em branco.

## Estrutura

```text
src/
  lib/                 regras de negócio, sem React
    rules.js           status do trio, prazo, limites, validação da inscrição
    finance.js         conta por CPF, distribuição de pagamentos, créditos
    schedule.js        sorteio com semente, distância mínima, conflitos, boiada
    ranking.js         tempos válidos, desempate, final, tempo para liderar
    contep.js          leitura de planilha (UTF-8 ou Windows-1252), mapeamento e pré-visualização
    contepBase.js      consulta à base CONTEP importada
    defaults.js        regras padrão de evento, categoria e ocorrências
    store.jsx          estado, ações, auditoria e persistência local
    seed.js            base de demonstração
    pix.js, export.js, utils.js
    domain.test.js     testes das regras
    store.test.js      fluxo completo: inscrição até homologação
  components/          layouts público e administrativo, UI, tabelas de ranking
  pages/public/        início, evento, inscrição, resultados, minha área, Arena
  pages/admin/         central, competidores, CONTEP e as telas de cada evento, incluindo a locução
e2e/flow.mjs           teste de ponta a ponta no navegador
public/                marca Achilles e silhuetas do galope
supabase/migrations/   001 modelo base, 002 regras, ocorrências e auditoria
```

As ações da store têm a mesma forma que terão no Supabase: recebem dados, validam, gravam e devolvem `{ ok, errors }`. A troca de backend fica restrita a `store.jsx`.

## Identidade visual

Mesma família do Achilles Content: Anton nos títulos, Manrope no texto, ouro `#D8AF58` sobre preto e branco quente.

- Área pública clara e editorial, com navegação flutuante e grade de fundo.
- Organização em tema escuro com barra lateral, como a área do cliente do Achilles Content.
- Arena em alto contraste para telão.

Os detalhes equestres vêm de "The Horse in Motion" (Eadweard Muybridge, 1878, domínio público), recortado em silhuetas que galopam em CSS. O projeto de Muybridge nasceu justamente para cronometrar um cavalo. Completam o conjunto a corda como divisória, a cerca no rodapé, a ferradura como marcador e o número do boi no formato de marca a ferro.

## Roadmap

| Fase | Situação |
| --- | --- |
| 1. Validação do MVP | Pronto para validar com coordenador e narrador |
| 2. Supabase | Migrations 001 e 002 escritas, falta criar o projeto, trocar a store e ligar Auth e RLS |
| 3. Inscrição | Feita no protótipo, exceto recuperação de conta, notificações e comprovante em arquivo |
| 4. CONTEP | Importador pronto. Falta a planilha oficial para fechar o mapeamento |
| 5. Motor de montagem | Feito, com semente, espaçamento, travamento, ajustes auditados e impressão |
| 6. Operação de pista | Feita, exceto contingência offline com fila de sincronização, que depende do backend |
| 7. Ranking e finais | Feito com critérios configuráveis. Falta a regra oficial da organização |
| 8. Arena Live | Feita. Falta o Realtime do Supabase para funcionar entre máquinas |
| 9. Relatórios e histórico | Feitos em CSV e impressão. PDF quando houver demanda |
| 10. Produto Achilles | Duplicação de evento pronta. Multiorganização, marca por cliente e domínio dependem do backend |

## Pontos que ainda não devem ser inventados

Estes itens estão configuráveis e com valores provisórios. Precisam de confirmação da organização antes da produção:

1. Número oficial de passadas em cada formato.
2. Definição de SAT e das demais ocorrências.
3. Critério de desempate.
4. Regra da final e quantos trios vão para ela.
5. Se a classificatória entra na soma da final.
6. Limites reais de participação por competidor e de repetição de trio.
7. Regra de boiada.
8. Distância mínima entre passadas do mesmo competidor.
9. Política de cancelamento, substituição e devolução de valores.

## Limites do protótipo

- Os dados ficam só no navegador em que foram criados. Outra máquina não vê o mesmo evento.
- Não há login da organização. Qualquer pessoa com o endereço `/admin` entra.
- O acesso do competidor por CPF e telefone serve para demonstrar o fluxo. Não é autenticação.
