# Testes

## Suíte padrão (offline)

A suíte padrão não precisa de PostgreSQL, MongoDB ou Redis:

```sh
npm run typecheck
npm test
```

O teste E2 de concorrência é pulado, sem abrir conexões, a menos que
`RUN_LIVE_TESTS=1` esteja definido.

## E2 — concorrência do checkout com serviços reais

O teste exercita o `CheckoutService` contra PostgreSQL, MongoDB e Redis reais.
Use bancos de desenvolvimento/teste, nunca produção: o cenário cria usuários,
um produto e registros de inventário temporários, e os remove ao final.

### Preparação

Configure as URLs válidas conforme [ENVIRONMENT.md](./ENVIRONMENT.md), aplique o
schema PostgreSQL e exporte as variáveis no shell:

```sh
set -a
source .env.local
set +a
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f init.sql
```

O E2 não depende do seed: cria seus próprios usuários, produto e estoque. MongoDB
e Redis devem aceitar escrita e remoção no banco/instância configurados.

### Executar

Rodar somente E2:

```sh
RUN_LIVE_TESTS=1 npx tsx --test tests/persistence/checkout-concurrency.test.ts
```

Rodar a suíte completa, incluindo E2:

```sh
RUN_LIVE_TESTS=1 npm test
```

Com a flag ligada, a ausência de qualquer URL necessária faz E2 falhar com o nome
da variável ausente; sem a flag, o teste é marcado como skipped e não conecta a
nenhum serviço.

### Cenário e resultado esperado

E2 cria um SKU com estoque 3 e dez usuários com carrinhos separados, cada um
pedindo uma unidade do mesmo SKU simultaneamente. O teste exige exatamente três
pedidos aprovados e sete rejeições por estoque insuficiente. Confirma também:

- estoque final zero e três itens de pedido, sem oversell;
- nenhuma rejeição por deadlock;
- uma linha de auditoria por débito, com quantidades coerentes;
- os três carrinhos aprovados vazios e os sete carrinhos rejeitados preservados.

O trigger de `init.sql` também registra a inserção inicial do inventário. A tabela
de auditoria no schema atual chama-se `inventory_logs` (não
`inventory_audit_log`); essa linha inicial não é contada como débito.

### Isolamento e cleanup

O teste gera IDs/emails exclusivos, verifica que o SKU não existe nos dois
datastores e se recusa a sobrescrever uma chave de carrinho Redis já existente.
Não usa `TRUNCATE`, `FLUSHDB`, nem altera dados do seed. Em `finally`, remove
somente os itens/pedidos, logs, inventário, usuários, documento Mongo e chaves
Redis que criou. A remoção PostgreSQL respeita as FKs; em seguida, o teste fecha
o pool PostgreSQL e as conexões MongoDB e Redis, mesmo se setup, asserções ou
alguma etapa de cleanup falhar. Falhas de cleanup ou fechamento fazem o teste
falhar e são reportadas junto à falha original, quando houver.

Como o PostgreSQL usa sequências para IDs, os contadores podem avançar mesmo
depois da remoção das fixtures; o teste não tenta redefini-los, para não afetar
outros processos que usem o mesmo banco.

## E3 — integração com serviços reais

### Suíte offline

```sh
npm test
```

Sem `RUN_LIVE_TESTS=1`, os testes de E2 e E3 são marcados como skipped antes de
abrir conexões. A suíte padrão não precisa de PostgreSQL, MongoDB, Redis ou
acesso à FakeStoreAPI.

### Preparação dos serviços live

Use somente serviços e bancos de desenvolvimento/teste, nunca produção. Configure
as variáveis `POSTGRES_URL`, `MONGODB_URI` e `REDIS_URL` em `.env.local` ou no
ambiente do processo. O schema PostgreSQL deve estar aplicado com `init.sql`, e
MongoDB/Redis precisam permitir as operações de leitura, escrita e remoção
limitadas aos dados do teste.

```sh
set -a
source .env.local
set +a
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f init.sql
```

Os helpers live usam timeouts limitados e mantêm a validação de certificados TLS
habilitada. Configure URLs com certificados confiáveis; os testes não desativam
a verificação TLS.

### Executar

Executar somente os testes de integração E3 contra os serviços reais:

```sh
npm run test:live
```

Esse script define `RUN_LIVE_TESTS=1` e executa `tests/integration/*.test.ts`.
Para executar toda a suíte, incluindo E2 e E3:

```sh
RUN_LIVE_TESTS=1 npm test
```

Executar apenas uma parte de E3:

```sh
RUN_LIVE_TESTS=1 npx tsx --test tests/integration/seed.test.ts
RUN_LIVE_TESTS=1 npx tsx --test tests/integration/inventory-audit.test.ts
RUN_LIVE_TESTS=1 npx tsx --test tests/integration/checkout.test.ts
```

O teste do seed exige `POSTGRES_URL`, `MONGODB_URI` e acesso de saída à
FakeStoreAPI. O trigger de auditoria exige `POSTGRES_URL`. O checkout integrado
exige as três URLs. Com live habilitado, a ausência de uma URL necessária falha
com o nome da variável; não é convertida em skip.

### Cenários e isolamento

- **Seed e índices MongoDB:** executa `npm run seed` duas vezes em processos
  separados, pois o `finally` do seed encerra seu pool PostgreSQL e cliente
  MongoDB. Confirma que cada ID de produto e email do seed ocorre uma vez, que
  as quantidades de estoque existentes não mudam e que os índices de
  `external_id`, `category` e texto existem. Os registros canônicos do seed não
  são removidos; por isso, execute somente em banco de teste dedicado.
- **Trigger PostgreSQL:** cria um ID de produto aleatório e não utilizado,
  verifica os registros de auditoria da inserção e da alteração de quantidade,
  e remove somente os logs e o item de inventário criados pelo teste.
- **Checkout integrado:** cria um usuário, produto, inventário e chave de
  carrinho exclusivos; confirma o pedido e item no PostgreSQL, a baixa de
  estoque, o log de auditoria e o carrinho vazio após o sucesso.

Os testes verificam colisões antes de criar fixtures, não usam `TRUNCATE` ou
`FLUSHDB` e limpam em `finally` apenas os dados sintéticos que criaram
(incluindo itens/pedidos, logs, produto e chave de carrinho). O teste de seed
preserva os registros seed e remove apenas seus sentinelas não-seed. Falhas de
limpeza ou fechamento de conexões também fazem o teste falhar.
