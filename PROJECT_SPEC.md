# Team Penning Manager

## Fonte de verdade do produto

Este documento registra o contexto funcional consolidado antes da primeira implementação. O objetivo é impedir que regras do projeto fiquem dependentes de uma conversa específica.

## Visão

O produto é uma ferramenta permanente de gestão de eventos de Team Penning. Ele não pertence a uma prova específica. A organização cria eventos e cada evento possui inscrições, categorias, financeiro, montagem, operação de pista, ranking, finais e Arena Live próprios.

Arquitetura conceitual:

`Organização > Evento > Gestão do evento`

A primeira operação pode trabalhar com um único evento ativo por vez, mas o banco deve aceitar múltiplos eventos simultâneos para histórico, preparação de próximas etapas e futura expansão comercial.

## Regra central da inscrição

1. Um trio é uma inscrição.
2. O trio tem exatamente três competidores.
3. Um competidor pode participar de vários trios com combinações diferentes.
4. O competidor é uma entidade permanente e identificada internamente por CPF.
5. O trio não é uma equipe permanente.
6. A pessoa que cria o trio confirma a própria participação no ato.
7. Os outros integrantes precisam aceitar ou recusar o convite.
8. O pagamento pertence à participação individual, nunca ao trio inteiro.
9. Um competidor paga somente pelas participações dele no evento.
10. Um trio só fica confirmado quando os três integrantes aceitaram e as três participações estão pagas.
11. Apenas trios confirmados entram na montagem oficial da prova.

Estados principais do trio:

- aguardando confirmação
- aguardando pagamento
- confirmado
- recusado
- cancelado

## Financeiro

A conta financeira é por CPF e por evento.

Exemplo:

Arthur participa de seis trios e o valor por participação é R$ 100. O saldo do Arthur é R$ 600. Isso não significa que ele paga os trios completos. Os outros participantes possuem contas próprias.

Requisitos do MVP:

- calcular participações aceitas por CPF
- calcular valor devido, pago e pendente
- gerar Pix estático com valor e chave configurados no evento
- mostrar QR Code e Pix Copia e Cola
- permitir ao competidor informar que pagou
- não utilizar gateway
- não consultar banco
- baixa financeira manual pelo administrador
- armazenar quem confirmou e quando na versão Supabase
- permitir novas participações depois de um pagamento sem reabrir o que já foi quitado

## CONTEP

A integração externa prevista para o produto é a base anual de handicap.

Não é necessária API em tempo real.

Fluxo pretendido:

1. Organização recebe ou baixa a relação anual.
2. Importa planilha para o sistema.
3. O sistema relaciona competidores por CPF quando a fonte possuir CPF.
4. Caso a fonte não possua CPF, relaciona por Código CONTEP com conferência administrativa.
5. O competidor mantém um cadastro permanente.
6. Cada evento guarda um snapshot do handicap utilizado naquela prova.
7. A soma de handicap do trio é validada contra a categoria escolhida.
8. A base pode ser atualizada durante o ano sem reescrever resultados históricos.

Termos de interface:

- Handicap CONTEP
- Soma do trio

Evitar chamar handicap de pontuação para não confundir com classificação da prova.

## Regras esportivas já identificadas na planilha de referência

Arquivo analisado: `TEAM PENNING CTM HSF 2026.xlsm`.

A planilha trabalha com:

- categorias INICIANTE, SOMA 03 e SOMA 11
- até quatro passadas no modelo atual
- controle de 1º, 2º, 3º e 4º tempo
- cálculo chamado SOMA 2T
- consideração dos dois melhores tempos no modelo atual
- corte de 12 na SOMA 11
- corte de 12 na SOMA 03
- corte de 6 no INICIANTE
- geração de finais
- indicação de tempo necessário para liderar na final
- numeração de boiada configurável de 0 até 6 no arquivo analisado

Importante: nenhuma dessas quantidades deve ficar fixa no código. Elas são configurações de categoria/evento.

Regras que precisam ser fechadas com a organização antes de produção:

- definição oficial de tempo válido
- códigos e efeitos de SAT, sem tempo e penalidades
- critério exato de desempate
- regras de final
- se e como a classificatória é carregada para a final
- sorteio de boiada
- distância mínima recomendada entre passadas de um mesmo competidor
- regras de cancelamento e substituição de integrantes
- limites por competidor e por combinação de trio

## Motor de prova

Cada categoria deve configurar no mínimo:

- nome
- soma máxima de handicap
- quantidade de passadas classificatórias
- quantidade de melhores tempos considerados
- quantidade de classificados para final
- quantidade de passadas da final
- regra de carregamento da classificatória

O ranking deve ser calculado automaticamente após cada resultado lançado.

A ordem de passadas deve usar apenas inscrições confirmadas e precisa evoluir para um algoritmo que distribua as participações de um mesmo competidor ao longo da grade.

## Operação no dia do evento

A tela de operação deve priorizar velocidade e segurança operacional.

Informações principais:

- número da passada
- três competidores
- categoria
- boiada
- tempo
- observação
- sem tempo ou ocorrência equivalente

Ao confirmar um resultado:

1. salvar a passada
2. recalcular automaticamente o ranking
3. atualizar Arena Live
4. liberar a próxima passada

No produto final, essa operação precisa ter estratégia de contingência para conexão instável.

## Arena Live

Tela pública em modo fullscreen para TV, painel de LED e navegador.

Conteúdos previstos:

- ranking por categoria
- trio atual ou próxima passada
- último resultado
- classificados para final
- tempo necessário para liderar na final
- rotação automática entre categorias e blocos

A atualização final será via Supabase Realtime.

O protótipo atual usa localStorage e sincronização entre abas do mesmo navegador apenas para demonstrar o fluxo.

## Áreas do sistema

### Público

- lista de eventos
- página do evento
- inscrição
- Arena Live
- resultados públicos

### Competidor

- cadastro e autenticação
- convites recebidos
- confirmações e recusas
- minhas participações
- financeiro por evento
- Pix
- passadas
- resultados e histórico

### Organização

- dashboard
- eventos
- categorias e regras
- inscrições
- competidores
- base CONTEP
- financeiro
- montagem
- operação
- ranking
- finais
- Arena Live
- relatórios
- configurações

## Identidade visual

Direção aprovada para este projeto:

- títulos em Anton
- textos e subtítulos em Montserrat
- linguagem esportiva, editorial e profissional
- alto contraste
- identidade Achilles com preto, branco e dourado quando aplicável
- evitar estética genérica de produto de IA
- evitar emojis
- evitar travessões na copy visível
- foco principal em funcionalidade e legibilidade operacional

## Stack alvo

- React + Vite
- Supabase Postgres
- Supabase Auth
- Supabase Realtime
- Supabase Storage quando necessário
- RLS
- GitHub
- Netlify
- Cloudflare

## Princípios técnicos

1. Não copiar a estrutura de colunas do Excel para o banco.
2. Modelar entidades reais e relações.
3. Toda entidade operacional relevante deve apontar para `event_id`.
4. Competidor é global e participação é contextual ao evento.
5. Salvar snapshot de regras importantes que possam mudar no futuro.
6. Pagamento precisa ser auditável.
7. Ranking deve ser determinístico e testável.
8. Lançamentos da operação precisam de log e possibilidade de correção auditada em produção.
9. O sistema deve ser mobile first no portal do competidor e desktop first na operação administrativa, sem perder responsividade.
10. O MVP precisa nascer preparado para múltiplos organizadores, mas sem implementar cobrança SaaS agora.
