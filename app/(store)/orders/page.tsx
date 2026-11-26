import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../../actions/auth";
import { OrderHistoryService } from "@/lib/services/order-history";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { Card } from "@/components/ui/card";

export default async function OrdersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  // 1. Busca os pedidos no PostgreSQL e enriquece com fotos em lote pelo MongoDB
  const orderHistoryService = new OrderHistoryService(
    new OrderAndInventoryRepository(),
    new CatalogRepository(),
  );
  const orders = await orderHistoryService.getHistory(session.userId);

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Meus Pedidos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Histórico de compras e snapshots de transações gravados no PostgreSQL.
        </p>
      </div>

      {/* Lista de Pedidos ou Estado Vazio */}
      {orders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl">
            📦
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-800">
            Você ainda não fez nenhum pedido
          </h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            Seus pedidos finalizados aparecerão aqui com o comprovante e os detalhes dos itens.
          </p>
          <Link
            href="/"
            className="mt-6 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            Explorar Catálogo
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const formattedTotal = new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(order.totalAmount);

            const formattedDate = new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(order.createdAt));

            return (
              <Card key={order.id} className="overflow-hidden border border-slate-200">
                {/* Cabeçalho do Pedido */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-center gap-4 sm:gap-8">
                    <div>
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Pedido
                      </span>
                      <p className="text-base font-bold text-slate-900">
                        #{order.id}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Data da Compra
                      </span>
                      <p className="text-sm font-medium text-slate-700">
                        {formattedDate}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Pagamento
                      </span>
                      <p className="text-sm font-medium text-slate-700">
                        {order.paymentMethod === "PIX" ? "⚡ PIX" : "💳 Cartão"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      ✓ {order.status}
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      {formattedTotal}
                    </span>
                  </div>
                </div>

                {/* Detalhes de Entrega e Itens com Foto */}
                <div className="p-5 space-y-4">
                  <div className="text-xs text-slate-500">
                    <strong className="text-slate-700">Endereço de Entrega:</strong>{" "}
                    {order.deliveryAddress}
                  </div>

                  {/* Lista dos Itens do Pedido */}
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
                    {order.items.map((item, index) => {
                      const itemSubtotal = new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(item.subtotal);

                      const unitPrice = new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(item.unitPrice);

                      const imageUrl = item.image;

                      return (
                        <div
                          key={`${order.id}-${item.externalId}-${index}`}
                          className="flex items-center justify-between p-3.5 text-sm gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Miniatura da foto */}
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-50 border border-slate-100 p-1">
                              {imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={item.title}
                                  fill
                                  unoptimized
                                  className="object-contain"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                  📦
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-slate-800" title={item.title}>
                                {item.title}
                              </p>
                              <p className="text-xs text-slate-400">
                                Qtd: {item.quantity} × {unitPrice}
                              </p>
                            </div>
                          </div>

                          <span className="font-semibold text-slate-900 shrink-0">
                            {itemSubtotal}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}