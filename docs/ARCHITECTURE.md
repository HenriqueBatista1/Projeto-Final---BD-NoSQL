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

   * `UserRepository` $\rightarrow$ **PostgreSQL** (consulta de usuários ativos para autenticação demonstrativa).

4. **Camada 4 — Integração Externa (Seed Script):** Script idempotente executado na inicialização para popular MongoDB e PostgreSQL a partir da FakeStoreAPI, sem acoplamento em tempo real durante a navegação do usuário.

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

* **Fluxo de Autenticação (Demo / Faculdade):** Suporta tanto login tradicional (`email` + verificação de hash de senha) quanto **seleção rápida por ID de um usuário ativo do seed**. O `AuthService` consulta o `UserRepository`, cria a sessão no Redis e devolve o token; a camada C6 é a única responsável por escrever ou remover o cookie. Não há cadastro de usuários e nenhum hash de senha é exposto para a UI.

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
