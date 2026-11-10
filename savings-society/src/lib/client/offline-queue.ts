/**
 * NFR-REL-04: a payment submitted without internet is kept on the phone
 * (IndexedDB) and sent when the connection returns — by the page when it's
 * open, or by the service worker's background sync.
 */
const DB = "dreamhive-offline";
const STORE = "payments";

export type QueuedPayment = { id: string; createdAt: number; fields: Array<[string, string]>; file: { name: string; type: string; data: Blob } | null };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function queuePayment(form: FormData): Promise<void> {
  const fields: Array<[string, string]> = [];
  let file: QueuedPayment["file"] = null;
  for (const [k, v] of form.entries()) {
    if (v instanceof File) {
      if (v.size) file = { name: v.name, type: v.type, data: v };
    } else fields.push([k, v]);
  }
  await tx("readwrite", (s) => s.put({ id: crypto.randomUUID(), createdAt: Date.now(), fields, file } satisfies QueuedPayment));
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync?.register("send-payments");
  } catch {
    // no background sync: the page sends it when it's next open and online
  }
}

export async function queuedPayments(): Promise<QueuedPayment[]> {
  return tx("readonly", (s) => s.getAll() as IDBRequest<QueuedPayment[]>);
}

/** Sends everything queued. Returns how many were accepted; ones the server refused are dropped with their error. */
export async function flushQueue(): Promise<{ sent: number; failed: string[] }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { sent: 0, failed: [] };
  const items = await queuedPayments();
  let sent = 0;
  const failed: string[] = [];
  for (const item of items) {
    const form = new FormData();
    for (const [k, v] of item.fields) form.append(k, v);
    if (item.file) form.append("proof", new File([item.file.data], item.file.name, { type: item.file.type }));
    form.set("offline", "1");
    try {
      const res = await fetch("/api/payments", { method: "POST", body: form, credentials: "same-origin" });
      if (res.status >= 500) continue; // try again later
      if (!res.ok) failed.push(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Not accepted");
      else sent++;
      await tx("readwrite", (s) => s.delete(item.id));
    } catch {
      break; // still offline
    }
  }
  return { sent, failed };
}
