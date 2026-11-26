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
