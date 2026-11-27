# Especificação Arquitetural — E-Commerce com Persistência Poliglota

> **Objetivo:** Documento de referência técnica para implementação da aplicação de E-Commerce utilizando **Next.js 16 (App Router)** com persistência poliglota distribuída entre **PostgreSQL**, **MongoDB** e **Redis**, alimentada via seed pela **FakeStoreAPI**.

## 1. Visão Geral da Arquitetura e Stack

### 1.1. Stack Tecnológica

* **Framework Full-Stack:** Next.js 16 (App Router, Server Actions / Route Handlers, React, Tailwind CSS).

* **Drivers de Banco de Dados (Nativos — Sem ORM/ODM):**

  * PostgreSQL: `pg` (controle explícito de transações ACID e locks pessimistas `FOR UPDATE`).

  * MongoDB: `mongodb` (manipulação direta de documentos BSON, índices de texto e projeções leves).

  * Redis: `ioredis` (comandos atômicos nativos de Hash e controle de TTL).

* **Fonte de Dados Externa (Seed/ETL):** `https://fakestoreapi.com` (`/products` e `/users`).

### 1.2. Infraestrutura Cloud, Ciclo de Vida de Conexões & Variáveis de Ambiente

A aplicação opera de forma desacoplada da infraestrutura física, conectando-se a provedores gerenciados em nuvem (Free Tier) por meio de variáveis de ambiente padronizadas.

* **Estratégia de Execução e Deploy (Vercel + WSL2):**
  * **Deploy na Vercel (Suportado para Demonstração/Protótipo):** A aplicação pode ser publicada na Vercel para validação funcional e demonstração online do protótipo com tráfego baixo/moderado (sem carga massiva concorrente), utilizando as mesmas variáveis de ambiente configuradas no painel do projeto.
  * **Execução Local via Ubuntu WSL2 (Recomendada para Testes de Carga e Apresentação ao Vivo):** Para evitar *cold starts* de funções *serverless*, latência de handshake TLS ou possíveis restrições de rede durante a apresentação presencial, o ambiente local no WSL2 conectado aos serviços em nuvem permanece como a via principal para testes de concorrência (`FOR UPDATE`) e demonstração ao vivo.

* **Gerenciamento de Conexões (*Singleton*):** Todos os clientes (`Pool` do `pg`, `MongoClient` do `mongodb` e instância do `ioredis`) devem ser instanciados como **singletons** armazenados em `globalThis`. Isso garante o reaproveitamento de conexões tanto durante o *Hot Module Replacement (HMR)* no desenvolvimento local (`next dev`) quanto entre invocações reutilizadas em containers *serverless* da Vercel, mantendo o `max` do pool do `pg` conservador (ex.: `max: 5`) para respeitar os limites do *Free Tier*.

| Banco de Dados | Provedor Cloud | Driver Nativo | Variável de Ambiente | Observações Técnicas de Conexão | 
| ----- | ----- | ----- | ----- | ----- | 
| **PostgreSQL** | **Supabase** | `pg` | `POSTGRES_URL` | Utilizar a *Connection String* na **porta 5432** (Direct ou Pooler Session Mode) com `ssl: { rejectUnauthorized: false }` e singleton global (`max: 5`) para suportar transações multi-statement (`BEGIN` / `FOR UPDATE` / `COMMIT`). Manter o projeto ativo antes de demonstrações (o Free Tier pausa após inatividade). | 
| **MongoDB** | **MongoDB Atlas** | `mongodb` | `MONGODB_URI` | Cluster compartilhado `M0` via URI SRV (`mongodb+srv://...`). Liberar acesso de rede (`0.0.0.0/0`) no Network Access para compatibilidade com IPs dinâmicos da Vercel e redes externas. | 
| **Redis** | **Upstash** | `ioredis` | `REDIS_URL` | Protocolo TCP nativo criptografado via TLS (`rediss://default:...@...upstash.io:6379`). Suporta nativamente `HSET`, `HINCRBY`, `HDEL`, `HGETALL` e `EXPIRE`. | 

#### Exemplo de `.env.local`

```
POSTGRES_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
MONGODB_URI="mongodb+srv://[USER]:[PASSWORD]@cluster0.[ID].mongodb.net/polyglot_store?retryWrites=true&w=majority"
REDIS_URL="rediss://default:[PASSWORD]@[ENDPOINT].upstash.io:6379"

```

### 1.3. Modelo em 4 Camadas

1. **Camada 1 — Apresentação (Client / Browser):** Interface reativa em React + Tailwind CSS (Login/Seleção Rápida de Usuário, Catálogo com Busca/Autocomplete, Drawer do Carrinho, Checkout e Histórico de Pedidos). **Proibido** acesso direto aos bancos a partir do cliente.

2. **Camada 2 — Aplicação & Regras de Negócio (Next.js Server):** Server Actions e Services orquestrando validações, leitura de sessão via cookie `HttpOnly`, cálculos de valores no servidor e comunicação com a camada de repositórios.

3. **Camada 3 — Persistência Poliglota (Repositories):**

   * `CatalogRepository` $\rightarrow$ **MongoDB** (Catálogo de produtos e categorias).

   * `CartAndSessionRepository` $\rightarrow$ **Redis** (Carrinho volátil via Hash nativo e Sessão de usuário).

   * `OrderAndInventoryRepository` $\rightarrow$ **PostgreSQL** (Controle de Estoque, Pedidos, Itens/Snapshot e Auditoria).

   * `UserRepository` $\rightarrow$ **PostgreSQL** (cadastro e consulta de usuários para autenticação).

4. **Camada 4 — Integração Externa (Seed Script):** Script idempotente executado na inicialização para popular MongoDB e PostgreSQL a partir da FakeStoreAPI, sem acoplamento em tempo real durante a navegação do usuário.

> **Mapa de código:** a Seção 5 (`Mapa de Código — De uma Ação ao Banco`) mostra, para cada ação da interface, qual banco é acionado e onde isso é tratado no repositório.

## 2. Modelagem de Dados por Banco

### 2.1. MongoDB — Catálogo de Produtos (`products`)

* **Responsabilidade:** Armazenamento de leitura rápida para vitrine, filtros por categoria, busca textual e autocomplete.

* **Regra Estrita de Contrato:** Seguir **fielmente** os campos reais retornados por `GET https://fakestoreapi.com/products`. **Não inventar** atributos fictícios (como `attributes`).

#### Estrutura do Documento (`products`)

```
{
  "_id": "ObjectId('6733a4c10a4e76a1420b91d1')",
  "external_id": 1,
  "title": "Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops",
  "price": 109.95,
  "description": "Your perfect pack for everyday use and walks in the forest...",
  "category": "men's clothing",
  "image": "https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png",
  "rating": {
    "rate": 3.9,
    "count": 120
  }
}

```

#### Índices Obrigatórios (Setup / Seed)

```
// 1. Garante unicidade e busca O(log n) na correlação com o PostgreSQL
db.products.createIndex({ external_id: 1 }, { unique: true });

// 2. Filtro rápido por categoria
db.products.createIndex({ category: 1 });

// 3. Índice de texto completo para pesquisa geral
db.products.createIndex({ title: "text", description: "text", category: "text" });

```

#### Padrões de Consulta (Queries)

* **Listagem / Filtro por Categoria:** `db.products.find(category ? { category } : {})`

* **Listagem de Categorias:** `db.products.distinct("category")`

* **Detalhe do Produto:** `db.products.findOne({ external_id: Number(id) })`

* **Autocomplete na Barra de Pesquisa (Debounce \~300ms no Front-end):**

  * **Guard Clause:** Ignorar consultas vazias ou com `query.trim().length < 2` antes de consultar o banco.

  * **Sanitização:** Escapar metacaracteres de expressão regular (`query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) antes de montar o filtro `$regex`.

  ```
  // Busca parcial case-insensitive sanitizada com projeção leve e limite de 5 sugestões
  const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  
  db.products
    .find(
      { title: { $regex: safeQuery, $options: "i" } },
      { projection: { _id: 0, external_id: 1, title: 1, price: 1, image: 1 } }
    )
    .limit(5)
    .toArray();
  
  ```

### 2.2. Redis — Carrinho Volátil e Sessão

* **Responsabilidade:** Armazenamento em memória RAM de alta velocidade e baixa latência com expiração automática (`TTL`).

#### Estrutura 1: Carrinho de Compras (`cart:{userId}`)

* **Tipo Oficial no Redis:** `Hash` (nativo do núcleo do Redis, sem módulos externos).

* **Formato:** `field = external_product_id` (string) $\rightarrow$ `value = quantity` (inteiro).

* **Motivo Arquitetural:** Elimina serialização/desserialização de JSON (`JSON.parse`/`JSON.stringify`) a cada clique e evita *race conditions* / *lost updates* por meio de operações atômicas por item.

```
# Adicionar ou incrementar quantidade de um produto
HINCRBY cart:1 "1" 1
EXPIRE cart:1 86400

# Decrementar quantidade (se retornar <= 0, executar HDEL)
HINCRBY cart:1 "1" -1

# Remover item específico do carrinho
HDEL cart:1 "1"

# Ler todos os itens do carrinho (retorna { "1": "2", "14": "1" })
HGETALL cart:1

# Limpar carrinho após COMMIT no PostgreSQL
DEL cart:1

```

#### Estrutura 2: Sessão do Usuário (`session:{token}`) & Transporte

* **Transporte:** O `token` opaco (gerado via `crypto.randomUUID()`) é armazenado em um cookie **`HttpOnly`** (`SameSite=Lax`, `Path=/`, `Max-Age=7200` e `Secure` em produção) gerenciado exclusivamente pelas *Server Actions* / *Route Handlers* do Next.js.

* **Fluxo de Autenticação:** A página `/cadastro` cria contas no PostgreSQL com um hash `scrypt` e salt aleatório por conta. Após o cadastro, o usuário é encaminhado ao login. O `AuthService` valida a senha, cria a sessão no Redis e devolve o token à camada C6, que gerencia o cookie. O serviço também reconhece o hash dos usuários do seed e oferece seleção rápida por ID de usuário ativo para a demonstração.

* **Tipo Oficial no Redis:** `String` contendo payload JSON leve da sessão autenticada.

* **TTL:** `7200` segundos (2 horas).

```
SET session:usr_tok_98234 '{"userId":1,"name":"Pedro Luiz","email":"pedro@email.com"}' EX 7200
GET session:usr_tok_98234
DEL session:usr_tok_98234

```

### 2.3. PostgreSQL — Transacional, Estoque e Auditoria

* **Responsabilidade:** Fonte da verdade para usuários, saldo de estoque, pedidos fechados, snapshot de itens vendidos e trilha de auditoria.

#### Diagrama Entidade-Relacionamento (Cardinalidades)

* `users` **(1)** $\rightarrow$ **(N)** `orders` (Um usuário realiza N pedidos).

* `orders` **(1)** $\rightarrow$ **(N)** `order_items` (Um pedido contém N itens).

* `inventory` **(1)** $\rightarrow$ **(N)** `order_items` (Um SKU em estoque é referenciado em N itens de pedidos via `external_product_id`).

* `inventory` **(1)** $\rightarrow$ **(N)** `inventory_logs` (Cada alteração de saldo gera 1 registro imutável de auditoria).

#### DDL Completo (`init.sql`)

```
-- 1. Tabela de Usuários
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Estoque Atual (1 linha por produto, sem updated_at sobrescrito)
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    external_product_id INT NOT NULL UNIQUE,
    quantity INT NOT NULL CHECK (quantity >= 0)
);

-- 3. Tabela de Pedidos (Cabeçalho)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PAGO' CHECK (status IN ('PAGO')),
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Tabela de Itens do Pedido (Snapshot histórico imutável)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    external_product_id INT NOT NULL REFERENCES inventory(external_product_id) ON DELETE RESTRICT,
    product_title VARCHAR(255) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0)
);

-- 5. Tabela Append-Only de Auditoria de Estoque
CREATE TABLE inventory_logs (
    id SERIAL PRIMARY KEY,
    external_product_id INT NOT NULL REFERENCES inventory(external_product_id) ON DELETE RESTRICT,
    old_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    change_amount INT NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices de Performance para Consultas Frequentes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_inventory_logs_product_id ON inventory_logs(external_product_id);

-- 6. Função e Trigger de Auditoria Automática de Movimentação de Estoque
CREATE OR REPLACE FUNCTION fn_audit_inventory_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO inventory_logs (external_product_id, old_quantity, new_quantity, change_amount)
        VALUES (NEW.external_product_id, 0, NEW.quantity, NEW.quantity);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE' AND OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
        INSERT INTO inventory_logs (external_product_id, old_quantity, new_quantity, change_amount)
        VALUES (NEW.external_product_id, OLD.quantity, NEW.quantity, NEW.quantity - OLD.quantity);
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_inventory
AFTER INSERT OR UPDATE OF quantity ON inventory
FOR EACH ROW
EXECUTE FUNCTION fn_audit_inventory_changes();

```

## 3. Fluxos Críticos de Orquestração Poliglota

### 3.1. Composição do Catálogo (Application-Side Join)

Como os metadados ficam no MongoDB e o saldo em tempo real fica no PostgreSQL:

1. O backend consulta os produtos no **MongoDB** (`find(...)`).

2. Extrai o array de IDs externos: `const ids = products.map(p => p.external_id)`.

3. Executa uma única query em lote no **PostgreSQL**:

   ```
   SELECT external_product_id, quantity FROM inventory WHERE external_product_id = ANY($1::int[]);
   
   ```

4. Constrói um `Map<number, number>` em memória e injeta o campo `stock` em cada produto antes de retornar à UI (complexidade $O(N)$, zero queries $N+1$).

### 3.2. Hidratação e Validação do Carrinho (Drawer)

1. Lê o Hash do usuário no **Redis**: `` const rawCart = await redis.hgetall(`cart:${userId}`) ``.

2. Se vazio, retorna lista vazia.

3. Busca detalhes (título, preço, imagem) no **MongoDB** usando `{ external_id: { $in: ids } }`.

   Se algum ID do carrinho não existir mais no catálogo, a hidratação falha com erro de produto indisponível e mantém o Hash inalterado, evitando uma resposta parcial ou um carrinho fantasma.

4. Busca saldo atual no **PostgreSQL** usando `WHERE external_product_id = ANY($1::int[])`.

5. Retorna os itens hidratados indicando se algum item possui `cartQuantity > currentStock` para alerta visual imediato na UI.

### 3.3. Checkout Transacional ACID (Prevenção de Race Condition e Deadlock)

**Passo a passo obrigatório no `CheckoutService`:**

1. **Validação Prévia (Redis + MongoDB):**

   * Lê `HGETALL cart:{userId}`. Se vazio, aborta.

   * Busca os preços oficiais no **MongoDB** (`{ external_id: { $in: ids } }`). **Nunca confiar em preços enviados pelo cliente.**

   * Se algum produto não existir mais no catálogo, aborta todo o checkout e mantém o carrinho.

   * Recebe um endereço de entrega livre e obrigatório, já validado pela camada de action, e aceita somente `PIX` ou `CARTAO_CREDITO` como forma de pagamento.

   * Ordena os itens do carrinho por `external_product_id` em **ordem crescente (`a.id - b.id`)** antes de iniciar os locks no banco para prevenir *deadlocks* entre transações concorrentes.

2. **Início da Transação PostgreSQL:**

   * O repositório rejeita listas vazias e `external_product_id` duplicados com `InvalidOrderError` antes de obter uma conexão.

   * Obtém um cliente dedicado do pool (`const client = await pool.connect()`) e executa `BEGIN`.

3. **Lock Pessimista e Baixa de Estoque (Loop Ordenado):**

   * Para cada item:

     ```
     SELECT quantity FROM inventory WHERE external_product_id = $1 FOR UPDATE;
     
     ```

   * Se `quantity < item.requestedQty`: executa `ROLLBACK`, libera o cliente e retorna erro amigável (*"Estoque insuficiente para o produto X"*), mantendo o carrinho intacto no Redis.

   * Se houver saldo suficiente:

     ```
     UPDATE inventory SET quantity = quantity - $1 WHERE external_product_id = $2;
     
     ```

     *(Nota: A trigger `trg_audit_inventory` gravará automaticamente a linha correspondente em `inventory_logs`).*

4. **Criação do Pedido e Snapshot dos Itens:**

   * Calcula `total_amount` somando `unit_price * quantity` de todos os itens.

   * Insere o cabeçalho em `orders`:

     ```
     INSERT INTO orders (user_id, total_amount, payment_method, status, delivery_address)
     VALUES ($1, $2, $3, 'PAGO', $4)
     RETURNING id, created_at;
     
     ```

   * Insere cada item congelando `product_title` e `unit_price` (padrão *Snapshot*):

     ```
     INSERT INTO order_items (order_id, external_product_id, product_title, unit_price, quantity, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6);
     
     ```

5. **Efetivação e Limpeza Pós-Venda:**

   * Executa `COMMIT` no PostgreSQL.

   * Somente após o `COMMIT` ser confirmado sem erros, executa `` await redis.del(`cart:${userId}`) ``.

   * Se a limpeza do Redis falhar após o `COMMIT`, o pedido continua concluído e o serviço retorna `cartCleared: false`; a falha não pode induzir uma nova tentativa de criação do pedido.

Submissões simultâneas do mesmo carrinho não possuem chave de idempotência neste protótipo. A prevenção de *oversell* permanece garantida pelos locks, mas a deduplicação de pedidos fica fora do escopo atual.

### 3.4. Consulta de Histórico de Pedidos ("Meus Pedidos")

* Executada exclusivamente no **PostgreSQL** (sem dependência do MongoDB, graças ao snapshot em `order_items`):

```
SELECT 
    o.id AS order_id,
    o.total_amount,
    o.status,
    o.payment_method,
    o.delivery_address,
    o.created_at,
    oi.external_product_id,
    oi.product_title,
    oi.unit_price,
    oi.quantity,
    oi.subtotal
FROM orders o
INNER JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = $1
ORDER BY o.created_at DESC, oi.id ASC;

```

* A camada de serviço agrupa as linhas pelo `order_id` antes de devolver o array estruturado ao front-end.

## 4. Estratégia de Seed Inicial (FakeStoreAPI)

O script de seed (`scripts/seed.ts`) deve ser idempotente (`ON CONFLICT DO NOTHING` / `bulkWrite` com `upsert: true`):

1. **Produtos (`GET https://fakestoreapi.com/products`):**

   * Insere/atualiza cada produto no **MongoDB** mapeando `id` $\rightarrow$ `external_id` e mantendo exatamente os demais campos (`title`, `price`, `description`, `category`, `image`, `rating`).

   * Insere cada `external_id` na tabela `inventory` do **PostgreSQL** com um estoque inicial determinístico ou aleatório entre `10` e `50` unidades (`ON CONFLICT (external_product_id) DO NOTHING`).

2. **Usuários (`GET https://fakestoreapi.com/users`):**

   * Insere na tabela `users` do **PostgreSQL** combinando `name.firstname + ' ' + name.lastname`, `email`, hash da senha gerado via `crypto.scryptSync` nativo do Node.js (utilizando uma senha padrão de demonstração documentada no projeto, ex.: `123456`) e endereço formatado (`address.street`, `address.number`, `address.city`, `address.zipcode`), utilizando `ON CONFLICT (email) DO NOTHING`.

---

## 5. Mapa de Código — De uma Ação ao Banco

Esta seção é um índice prático: para cada coisa que o usuário faz (ou que o seed faz), mostra **quem dispara**, **qual banco responde** e **onde no código** cada etapa está implementada. Os números de linha refletem o estado atual do repositório; se algum arquivo for movimentado, use o par *arquivo + função/método* como referência estável.

### 5.1 Convenções de acesso (leia primeiro)

- **O browser nunca toca um banco.** Client Components chamam Server Actions (`app/actions/*.ts`, todos com `"use server"`). Server Components chamam serviços diretamente no servidor (`app/(store)/page.tsx:25`, `app/(store)/orders/page.tsx:17`).
- **Clientes são singletons em `globalThis`:** `src/lib/db/postgres.ts:13` (`Pool` com `max: 5` e SSL, necessário para transações multi-statement), `src/lib/db/mongodb.ts:13` (`MongoClient`) e `src/lib/db/redis.ts:13` (`Redis` com `lazyConnect`). As credenciais vêm de `POSTGRES_URL`, `MONGODB_URI` e `REDIS_URL`.
- **Repositórios recebem o cliente por injeção** no construtor e só importam o singleton sob demanda (`repositories/catalog.ts:44-47`, `repositories/cart-session.ts:35-37`, `repositories/orders-inventory.ts:71-73`, `repositories/users.ts:38-40`). É isso que permite aos testes em `tests/persistence/` usarem fakes, sem rede.
- **Contratos em `src/lib/repositories/contracts.ts:11-47`.** Os serviços dependem dessas interfaces e são montados pelas fábricas em `src/lib/services/factories.ts:10-37`. Exceção: a vitrine (`app/(store)/page.tsx:14-19`) e Meus Pedidos (`app/(store)/orders/page.tsx:17-20`) instanciam repositórios/serviços diretamente.
- **Sessão:** `src/lib/session.ts:10` é `server-only` e lê o cookie `polyglot_session`; **somente** as actions escrevem/deletam o cookie (`app/actions/auth.ts:87-92` e `:113-119`). O payload da sessão vive no Redis; nunca no navegador.
- **Tradução de erro:** Zod em `src/lib/action-schemas.ts`; mensagens amigáveis em `src/lib/action-errors.ts:4,13` e `services/checkout.ts:96-105` (`CheckoutError`). Todas as mensagens voltam em português.
- **Regras de ouro:** preço sempre lido do catálogo no servidor; IDs de produto ordenados antes dos locks no PostgreSQL; carrinho do Redis apagado **apenas depois** do `COMMIT`.

### 5.2 Matriz rápida — Ação × Banco × Código

| Ação (origem na UI) | Banco(s) | Caminho no código |
|---|---|---|
| Entrar — `app/login/login-form.tsx:13` → `loginAction` | PostgreSQL (`users`) + Redis (`session:*`) | `app/actions/auth.ts:58` → `services/auth.ts:78` → `repositories/users.ts:58` → `repositories/cart-session.ts:89` |
| Criar conta — `app/cadastro/register-form.tsx:9` → `registerAction` | PostgreSQL (`users`) | `app/actions/auth.ts:22` → `services/auth.ts:60` → `repositories/users.ts:42` |
| Sair — `app/(store)/store-navbar.tsx:10` → `logoutAction` | Redis (`session:*`) | `app/actions/auth.ts:111` → `services/auth.ts:113` → `repositories/cart-session.ts:116` |
| Vitrine e filtro por categoria — Server Component | MongoDB (`products`) + PostgreSQL (`inventory`) | `app/(store)/page.tsx:21` → `services/catalog.ts:28` → `repositories/catalog.ts:49,69` + `repositories/orders-inventory.ts:75` |
| Sugestões da busca — `src/components/catalog/search-bar.tsx:32` → `suggestProductsAction` | MongoDB (`products`) | `app/actions/catalog.ts:12` → `services/catalog.ts:46` → `repositories/catalog.ts:74` |
| Abrir/hidratar carrinho — `src/components/cart/cart-context.tsx:39` → `getCartAction` | Redis (`cart:*`) + MongoDB + PostgreSQL | `app/actions/cart.ts:13` → `services/cart.ts:56` → `repositories/cart-session.ts:39`, `catalog.ts:55`, `orders-inventory.ts:75` |
| Adicionar / incrementar — `src/components/catalog/product-card.tsx:70` e `cart-drawer.tsx:104` | Redis (`cart:*`) + MongoDB (validação) | `app/actions/cart.ts:33` → `services/cart.ts:37` → `repositories/cart-session.ts:60` |
| Diminuir — `src/components/cart/cart-drawer.tsx:93` (`quantity = -1`) | Redis (`cart:*`) | mesma cadeia de adicionar; `HINCRBY` negativo e `HDEL` se chegar a zero |
| Remover item — `src/components/cart/cart-drawer.tsx:70` → `removeCartItemAction` | Redis (`cart:*`) | `app/actions/cart.ts:72` → `services/cart.ts:52` → `repositories/cart-session.ts:77` |
| Finalizar compra — `app/(store)/checkout/page.tsx:17` → `checkoutAction` | Redis → MongoDB → PostgreSQL (transação) → Redis | `app/actions/checkout.ts:20` → `services/checkout.ts:48` → `repositories/{cart-session,catalog,orders-inventory}.ts` |
| Meus Pedidos — Server Component | PostgreSQL (`orders`, `order_items`) + MongoDB (só imagens) | `app/(store)/orders/page.tsx:10` → `services/order-history.ts:24` → `repositories/orders-inventory.ts:180` + `repositories/catalog.ts:55` |
| Proteger rotas da loja — `app/(store)/layout.tsx:11` | Redis (`session:*`) | `src/lib/session.ts:10` → `services/auth.ts:109` → `repositories/cart-session.ts:101` |
| Seed — `npm run seed` | MongoDB + PostgreSQL | `scripts/seed.ts:133` (upsert de produtos `:145`, estoque `:170`, usuários `:177`) |
| Auditoria de estoque — qualquer `UPDATE inventory` | PostgreSQL (trigger, sem código TypeScript) | `init.sql:50-71` (`fn_audit_inventory_changes` + `trg_audit_inventory`) |

### 5.3 Roteiros por fluxo

#### A. Quando o usuário se cadastra

1. `app/cadastro/register-form.tsx:29` envia `name`, `email`, `password` via `useActionState(registerAction)`.
2. `app/actions/auth.ts:26-37` valida com `registerSchema` (`src/lib/action-schemas.ts:8-23`: nome 1–150, e-mail válido, senha 8–128).
3. `services/auth.ts:60-76` gera salt aleatório com `randomBytes(16)` e deriva a chave com `scrypt`, gravando `scrypt:<salt>:<hash>`.
4. `repositories/users.ts:42-56` faz `INSERT INTO users ... WHERE NOT EXISTS (lower(email) = $2) ON CONFLICT (email) DO NOTHING` no **PostgreSQL**. E-mail repetido vira `EmailAlreadyRegisteredError` → "Já existe uma conta com este e-mail.".
5. A action redireciona para `/login?cadastro=sucesso` (`app/actions/auth.ts:52`).

#### B. Quando o usuário entra (login)

1. `app/login/login-form.tsx:46` submete o formulário; `app/actions/auth.ts:66-77` valida `loginSchema`.
2. `services/auth.ts:78-89` busca o usuário no **PostgreSQL** (`repositories/users.ts:58-70`) e compara a senha com `timingSafeEqual` (`services/auth.ts:26-38`). Aceita tanto hashes `scrypt:<salt>:<hash>` quanto o hash legado do seed (salt fixo `polyglot-store-demo`); quando o e-mail não existe, compara contra um hash dummy para não revelar presença da conta. Usuário inativo é rejeitado.
3. `repositories/cart-session.ts:89-99` cria token com `randomUUID()` e grava `SET session:<token> <json> EX 7200` no **Redis**. Somente `userId`, `name` e `email` entram no payload — nunca `password_hash`.
4. `app/actions/auth.ts:87-92` escreve o cookie `polyglot_session` com `getSessionCookieOptions()` (`src/lib/session-cookie.ts:1-9`) e redireciona para `/`.

#### C. Quando o usuário sai

`store-navbar.tsx:10` → `logoutAction` (`app/actions/auth.ts:111-129`): lê o cookie, `AuthService.logout()` (`services/auth.ts:113-115`) faz `DEL session:<token>` no **Redis** (`repositories/cart-session.ts:116-119`), a action apaga o cookie e redireciona para `/login`. O carrinho **não** é apagado no logout.

#### D. Quando a vitrine carrega (inclui filtro por categoria)

1. `app/(store)/page.tsx:23` lê `?category=` dos `searchParams`; `CategoryFilter` (`src/components/catalog/category-filter.tsx:29-44`) apenas monta links — não chama ações.
2. `services/catalog.ts:28-30` e `:42-44` pedem ao **MongoDB**: `find({ category })` e `distinct("category")` (`repositories/catalog.ts:49-53` e `:69-72`).
3. `services/catalog.ts:13-26` extrai os `externalId`s, chama **uma única** query no **PostgreSQL** via `stocksFor()` (`repositories/orders-inventory.ts:75-87`: `WHERE external_product_id = ANY($1::int[])`) e injeta `stock` em cada produto em memória — sem N+1. Estoque ausente vira `0`.
4. `ProductCard` (`src/components/catalog/product-card.tsx:16,67-74`) desabilita "Adicionar" quando `stock <= 0`.

#### E. Quando o usuário digita na busca (sugestões)

1. `SearchBar` (`src/components/catalog/search-bar.tsx:32-61`) aplica debounce de 300 ms e não chama nada com menos de 2 caracteres.
2. `suggestProductsAction` (`app/actions/catalog.ts:12-32`) revalida com `suggestProductsSchema` (`src/lib/action-schemas.ts:25-28`) e devolve `[]` sem consultar nada se a entrada for curta.
3. `repositories/catalog.ts:74-99` busca no **MongoDB** com `{ title: { $regex: safeQuery, $options: "i" } }` — é regex parcial, **não** é o *autocomplete* do Atlas Search. Metacaracteres são escapados em `:80`, a projeção traz só `external_id`, `title`, `price`, `image` e o cursor usa `.limit(5)`.
4. O clique em uma sugestão (`search-bar.tsx:63-74`) preenche o input com o título e faz scroll até `#product-<externalId>`; ele **não filtra** a grade de produtos.
5. O índice de texto criado no seed (`scripts/seed.ts:165-168`) não é usado por essa query — `$regex` não se beneficia de índice `$text`.

#### F. Quando o carrinho é aberto ou alterado

1. `CartProvider` (`src/components/cart/cart-context.tsx:39-57`) chama `getCartAction` ao montar. Sem sessão, a action devolve `[]` (`app/actions/cart.ts:15-18`).
2. `CartService.getCart()` (`services/cart.ts:56-91`): lê o Hash `cart:{userId}` no **Redis** (`repositories/cart-session.ts:39-58`); se vazio, retorna sem consultar outros bancos; busca metadados no **MongoDB** (`catalog.ts:55-61`) e saldos no **PostgreSQL** (`orders-inventory.ts:75-87`). Se algum ID do carrinho não existir no catálogo, lança `CartProductUnavailableError` (`services/cart.ts:18-28`) e **não altera** o Hash. Cada item volta com `available: quantity <= stock`.
3. Adicionar/incrementar (`services/cart.ts:37-50`): valida a existência do produto no **MongoDB** quando `quantity > 0` e executa `HINCRBY cart:<id> <produto> <qtd>` + `EXPIRE 86400` no **Redis** (`repositories/cart-session.ts:60-75`). Diminuir usa `quantity = -1` (`cart-drawer.tsx:93`); se o saldo do Hash chegar a zero, o campo é removido com `HDEL`.
4. Remover (`services/cart.ts:52-54` → `repositories/cart-session.ts:77-82`) faz `HDEL` + renova o TTL. `clearCart()` (`:84-87`) usa apenas `DEL cart:<id>` — **nunca** apaga `session:*`.
5. `CartDrawer` (`src/components/cart/cart-drawer.tsx:18,82-86`) mostra o alerta de estoque insuficiente; preços exibidos vêm da hidratação feita no servidor, não do formulário.

#### G. Quando o checkout é confirmado (o fluxo mais crítico)

```mermaid
sequenceDiagram
    participant UI as CheckoutPage
    participant A as checkoutAction
    participant S as CheckoutService
    participant R as Redis
    participant M as MongoDB
    participant P as PostgreSQL
    UI->>A: FormData(endereço, forma de pagamento)
    A->>R: getCurrentSession → GET session:token
    A->>A: Zod: endereço ≥ 5, PIX ou CARTAO_CREDITO
    A->>S: checkout(userId, endereço, pagamento)
    S->>R: HGETALL cart:userId
    S->>M: find external_id $in ids (preços oficiais)
    S->>P: BEGIN → FOR UPDATE ordenado → UPDATE → INSERT orders/order_items → COMMIT
    S->>R: DEL cart:userId (somente após COMMIT)
    S-->>A: orderId, createdAt, cartCleared
    A-->>UI: { success: true, orderId }
```

1. `app/(store)/checkout/page.tsx:17-27` usa `useActionState`; sem sessão, `checkoutAction` redireciona para `/login` (`app/actions/checkout.ts:35-37`). Endereço e pagamento são validados em `:42-52` (`checkoutSchema`, `src/lib/action-schemas.ts:42-49`).
2. `services/checkout.ts:49-57` lê o carrinho no **Redis** e aborta com `EMPTY_CART` se vazio — carrinho preservado.
3. `services/checkout.ts:59-74` busca os produtos no **MongoDB** e aborta com `MISSING_PRODUCT` se algum ID sumiu do catálogo. Os preços oficiais vêm daqui (`:76-86`); **nenhum preço enviado pelo cliente é aceito**.
4. `repositories/orders-inventory.ts:89-98` valida itens vazios/duplicados (`InvalidOrderError`, `:41-65`), pega um cliente dedicado do pool e ordena os itens por `externalId` antes de qualquer lock.
5. Transação no **PostgreSQL** (`:100-177`): `BEGIN`; `SELECT quantity ... FOR UPDATE` item a item em ordem crescente (`:103-115`); estoque insuficiente → `InsufficientStockError` → `ROLLBACK`, carrinho intacto; `UPDATE inventory` (`:117-124`, a trigger grava `inventory_logs`); `INSERT orders` com `status = 'PAGO'` e `total_amount` calculado no servidor (`:126-145`); `INSERT order_items` congelando `product_title` e `unit_price` (`:147-161`); `COMMIT` (`:163`); qualquer erro → `ROLLBACK` e `client.release()` (`:168-177`).
6. `services/checkout.ts:107-112` limpa o carrinho no **Redis** depois do commit. Se essa limpeza falhar, o pedido permanece válido e o serviço retorna `cartCleared: false` — nunca uma nova tentativa de compra.
7. `app/actions/checkout.ts:63-66` devolve `{ success, orderId }` e a tela de confirmação aparece (`app/(store)/checkout/page.tsx:35-69`), chamando `refreshCart()` para sincronizar o drawer.

#### H. Quando o usuário abre Meus Pedidos

1. `app/(store)/orders/page.tsx:10-14` exige sessão válida (Redis) e monta `OrderHistoryService` (`:17-21`).
2. `repositories/orders-inventory.ts:180-228` consulta só o **PostgreSQL**: `orders INNER JOIN order_items ... WHERE user_id = $1 ORDER BY created_at DESC, oi.id ASC`, agrupando as linhas em `Order[]` por `order_id` (`:202-227`). Título e preço vêm do snapshot, então um pedido antigo não muda se o catálogo mudar.
3. `services/order-history.ts:24-53` faz uma consulta em lote ao **MongoDB** (`findByExternalIds`) apenas para anexar `image` a cada item — sem N+1.

#### I. Quando o seed roda

`scripts/seed.ts:133-193` busca `/products` e `/users` da FakeStoreAPI, valida os payloads (`:50-123`), conecta no **MongoDB** e cria os índices (`:143,165-168`), faz `bulkWrite` com `upsert: true` em `products` (`:145-163`), insere `inventory` no **PostgreSQL** com `ON CONFLICT (external_product_id) DO NOTHING` (`:170-175`, preservando estoque já consumido) e `users` com `ON CONFLICT (email) DO NOTHING` (`:177-188`). O hash demo usa `scryptSync("123456", "polyglot-store-demo", 64)` (`:26-28`).

#### J. Quando o estoque muda (regra que vive no banco)

Não há código TypeScript para a auditoria: `init.sql:50-71` define `fn_audit_inventory_changes()` e `trg_audit_inventory`. Qualquer `INSERT` ou `UPDATE OF quantity` em `inventory` grava uma linha em `inventory_logs` com `old_quantity`, `new_quantity` e `change_amount`. No checkout isso acontece automaticamente durante os `UPDATE` da transação.

### 5.4 Mapa de funções de persistência

| Arquivo | Função / método | Operação |
|---|---|---|
| `src/lib/db/postgres.ts:13` | `pool` | Singleton `pg.Pool` (`max: 5`, SSL) |
| `src/lib/db/mongodb.ts:13` | `mongoClient` | Singleton `MongoClient` |
| `src/lib/db/redis.ts:13` | `redis` | Singleton `ioredis` (`lazyConnect`) |
| `src/lib/repositories/catalog.ts` (MongoDB) | `products()` `:44` | Seleciona db `polyglot_store` / collection `products` |
| | `list(category?)` `:49` | `find({ category })` ou `find({})` |
| | `findByExternalIds(ids)` `:55` | `find({ external_id: { $in: ids } })` |
| | `findByExternalId(id)` `:63` | `findOne({ external_id: id })` |
| | `listCategories()` `:69` | `distinct("category")` |
| | `suggest(query)` `:74` | `$regex` insensível a caixa, projeção leve, `limit(5)` |
| `src/lib/repositories/cart-session.ts` (Redis) | `cartKey` / `sessionKey` `:9-15` | Chaves `cart:{userId}` e `session:{token}` |
| | `getCart(userId)` `:39` | `HGETALL` + filtro de entradas inválidas |
| | `addItem(...)` `:60` | `HINCRBY`, `HDEL` se ≤ 0, `EXPIRE 86400` |
| | `removeItem(...)` `:77` | `HDEL` + `EXPIRE 86400` |
| | `clearCart(userId)` `:84` | `DEL cart:{userId}` (não toca sessões) |
| | `createSession(...)` `:89` | `SET session:<uuid> <json> EX 7200` |
| | `getSession(token)` `:101` | `GET` + validação `isSession` (`:17-30`) |
| | `deleteSession(token)` `:116` | `DEL session:<token>` |
| `src/lib/repositories/orders-inventory.ts` (PostgreSQL) | `validateOrderItems()` `:48` | Rejeita pedido vazio e IDs duplicados |
| | `stocksFor(ids)` `:75` | `SELECT ... WHERE external_product_id = ANY($1::int[])` |
| | `placeOrder(input)` `:89` | Transação ACID com `FOR UPDATE` ordenado + snapshot |
| | `history(userId)` `:180` | Join `orders`/`order_items` + agrupamento |
| `src/lib/repositories/users.ts` (PostgreSQL) | `create(...)` `:42` | `INSERT ... ON CONFLICT (email) DO NOTHING` |
| | `findByEmail(email)` `:58` | Busca por e-mail exato ou minúsculo |
| | `findActiveById(id)` `:72` | Busca por ID com `is_active = TRUE` |
| | `listActive()` `:85` | Lista usuários ativos ordenados por nome |
| `init.sql` | `fn_audit_inventory_changes` / `trg_audit_inventory` `:50-71` | Auditoria append-only de estoque |
| `scripts/seed.ts` | `seed()` `:133` | Upsert Mongo + inserts idempotentes no Postgres |

### 5.5 Lacunas conhecidas entre documentação e código

- `checkoutAction` (`app/actions/checkout.ts:63-66`) não propaga `cartCleared`: se a limpeza do Redis falhar após o `COMMIT`, o cliente vê sucesso mesmo com o carrinho ainda persistido. `CheckoutService` e seus testes (`tests/services/checkout.test.ts:205`) estão corretos; falta a camada action.
- `AuthService.quickLogin()` (`services/auth.ts:91`) e `listActiveUsers()` (`:100`) existem e são testados, mas não há Server Action nem controle na tela de login que os exponha — a "seleção rápida" descrita na Seção 2.2 não está ligada na UI atual.
- O plano em `docs/TODO.md:193` descreve C5 como "sem dependência do Mongo", mas `OrderHistoryService` enriquece imagens via MongoDB (`:40-44`). O histórico de preços/títulos continua 100% no PostgreSQL.
- Não existe chave de idempotência no checkout (`ARCHITECTURE.md` Seção 3.3): os locks impedem *oversell*, mas submissões duplicadas podem gerar dois pedidos.
