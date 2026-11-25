# Deploy na Vercel

Este guia prepara o deploy de demonstração da Polyglot Store na Vercel. As
credenciais devem ser configuradas somente no painel da Vercel; nunca copie
valores reais para arquivos versionados.

## Pré-requisitos

- projeto PostgreSQL ativo no Supabase;
- cluster MongoDB Atlas disponível e populado pelo seed;
- banco Redis Upstash disponível;
- branch de deploy enviada ao repositório remoto;
- schema de `init.sql` aplicado e `npm run seed` executado ao menos uma vez.

O seed deve ser executado em um ambiente confiável com acesso à FakeStoreAPI e
aos três datastores. Ele não faz parte do build da Vercel.

## Criar o projeto

1. Importe o repositório no painel da Vercel.
2. Selecione o framework Next.js e mantenha a raiz do projeto no diretório raiz.
3. Use `npm run build` como comando de build. O projeto declara Node.js 20 em
   `.nvmrc` e usa Webpack no build de produção. Confirme Node.js 20 nas
   configurações do projeto e verifique a versão efetiva no log do primeiro
   deploy.
4. Configure as variáveis abaixo para Production e, quando necessário, Preview.

| Variável | Origem | Requisito |
| --- | --- | --- |
| `POSTGRES_URL` | Supabase | Porta `5432`, conexão direta ou pooler em Session Mode |
| `MONGODB_URI` | MongoDB Atlas | URI SRV para o banco `polyglot_store` |
| `REDIS_URL` | Upstash | URI TCP TLS iniciada por `rediss://` |

Não use o pooler em Transaction Mode: o checkout precisa manter a mesma sessão
PostgreSQL durante `BEGIN`, locks `FOR UPDATE` e `COMMIT`.

## Acesso de rede

No MongoDB Atlas, autorize os IPs usados pela Vercel. Para a demonstração com
IPs dinâmicos, pode ser necessário liberar `0.0.0.0/0`; nesse caso, use usuário
dedicado, senha forte e privilégios mínimos, e remova a regra após a demo se ela
não for mais necessária.

O Supabase Free Tier pode pausar após inatividade. Confirme que o projeto está
ativo antes de publicar ou apresentar a aplicação.

## Publicar e validar

Após salvar as variáveis, inicie um novo deploy e acompanhe o build até o estado
Ready. Na URL de produção, valide:

1. a página inicial responde com HTTP 200;
2. nenhum segredo aparece no HTML, nos logs públicos ou nos artefatos do build;
3. as conexões usam somente as variáveis configuradas no ambiente;
4. catálogo, sessão, carrinho e checkout são verificados quando as respectivas
   telas e actions estiverem disponíveis.

Para validar apenas a fundação atual:

```sh
curl --fail --show-error --silent "https://SEU-PROJETO.vercel.app/" > /dev/null
```

## Diagnóstico

- Falha PostgreSQL: confirme porta `5432`, SSL e Session Mode.
- Falha MongoDB: confirme a URI SRV, o banco `polyglot_store` e a lista de IPs.
- Falha Redis: confirme o esquema `rediss://` e se o endpoint aceita TCP nativo.
- Build sem acesso aos dados: o build não deve consultar bancos; revise imports
  para manter os clientes e repositórios carregados apenas no servidor.
