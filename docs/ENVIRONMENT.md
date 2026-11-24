# Configuração do ambiente

O projeto usa PostgreSQL, MongoDB e Redis gerenciados. As credenciais devem ficar
somente em arquivos ignorados pelo Git ou em variáveis de ambiente. Nunca substitua
os placeholders de `.env.example` por credenciais reais.

## Variáveis obrigatórias

Copie o modelo para o arquivo local:

```sh
cp .env.example .env.local
```

Preencha as três variáveis em `.env.local`:

- `POSTGRES_URL`: conexão do Supabase pela porta `5432`, usando conexão direta ou
  pooler em Session Mode, necessária para transações com múltiplos comandos.
- `MONGODB_URI`: URI SRV (`mongodb+srv://`) do MongoDB Atlas para o banco
  `polyglot_store`.
- `REDIS_URL`: conexão TCP TLS (`rediss://`) do Upstash Redis.

Para comandos executados diretamente no shell, exporte as variáveis do arquivo
antes de aplicar o schema ou executar o seed. Por exemplo, em Bash:

```sh
set -a
source .env.local
set +a
```

## Preparação dos bancos

Com as variáveis exportadas, aplique o schema PostgreSQL e faça a carga inicial:

```sh
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f init.sql
npm run seed
```

O seed lê produtos e usuários da FakeStoreAPI, atualiza o catálogo no MongoDB e
insere usuários e inventário ausentes no PostgreSQL. Ele pode ser executado de novo
sem substituir as quantidades de estoque existentes.

## Acesso de demonstração

Os usuários importados usam a senha de demonstração `123456`. O hash é gerado com
`scrypt` e o salt fixo `polyglot-store-demo`. Essa configuração existe apenas para
a demonstração acadêmica: não reutilize a senha, o salt ou esse modelo de
autenticação em produção.

## Verificação local

Os testes padrão não acessam serviços externos e usam URLs de placeholder quando
necessário:

```sh
npm ci
npm run typecheck
npm test
```
