import { prisma } from "@/lib/prisma";
import { Badge, SPECIES_EMOJI } from "@/components/Badge";
import { confirmOrder, cancelOrder, completeOrder } from "./actions";

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: { animal: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Orders</h1>
        <p className="text-sm text-stone-500">Requests placed by buyers on the public site.</p>
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900">
                  {SPECIES_EMOJI[order.animal.species]} {order.animal.tagId}
                </span>
                <Badge label={order.status} />
              </div>
              <p className="mt-1 text-sm text-stone-600">
                {order.buyerName} · {order.buyerPhone}
                {order.buyerEmail ? ` · ${order.buyerEmail}` : ""}
              </p>
              {order.note && <p className="mt-1 text-sm text-stone-500">“{order.note}”</p>}
              <p className="mt-1 text-xs text-stone-400">{order.createdAt.toLocaleString()}</p>
            </div>

            {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
              <div className="flex flex-wrap gap-2">
                {order.status === "PENDING" && (
                  <form action={confirmOrder.bind(null, order.id)}>
                    <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                      Confirm
                    </button>
                  </form>
                )}
                {order.animal.status !== "SOLD" && (
                  <form action={completeOrder.bind(null, order.id)}>
                    <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800">
                      Mark sold
                    </button>
                  </form>
                )}
                <form action={cancelOrder.bind(null, order.id)}>
                  <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
                    Cancel
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
            No orders yet.
          </p>
        )}
      </div>
    </div>
  );
}
