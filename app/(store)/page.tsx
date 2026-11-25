import { CatalogService } from "@/lib/services/catalog";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";
import { ProductCard } from "@/components/catalog/product-card";
import { CategoryFilter } from "@/components/catalog/category-filter";
import { SearchBar } from "@/components/catalog/search-bar";

type StorePageProps = {
  searchParams: Promise<{
    category?: string;
  }>;
};

function getCatalogService() {
  return new CatalogService(
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}

export default async function StorePage({ searchParams }: StorePageProps) {
  // 1. Lê a categoria selecionada na URL (se houver)
  const { category } = await searchParams;

  const catalogService = getCatalogService();

  // 2. Busca paralela: categorias distintas e lista de produtos com estoque
  const [categories, products] = await Promise.all([
    catalogService.listCategories(),
    catalogService.list(category),
  ]);

  return (
    <div className="space-y-8">
      {/* Cabeçalho da vitrine */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {category ? (
              <span className="capitalize">{category}</span>
            ) : (
              "Nosso Catálogo"
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Produtos com dados do MongoDB e inventário transacional do PostgreSQL.
          </p>
        </div>
        {/* Aqui está a barra de busca! */}
        <SearchBar />
      </div>

      {/* Barra de Filtro de Categorias */}
      <CategoryFilter
        categories={categories}
        selectedCategory={category}
      />

      {/* Grade de Produtos */}
      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-base font-medium text-slate-700">
            Nenhum produto encontrado nesta categoria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.externalId} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}