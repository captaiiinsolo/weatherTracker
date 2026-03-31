import { JsonStore } from "../lib/json-store.js";

const ordersStore = new JsonStore("orders.json", []);
const evaluationsStore = new JsonStore("evaluations.json", []);

export async function listOrders() {
  return ordersStore.read();
}

export async function saveOrderSnapshot(order) {
  return ordersStore.update((current) => {
    const withoutCurrent = current.filter((entry) => String(entry.id) !== String(order.id));
    return [{ ...order, updatedAt: new Date().toISOString() }, ...withoutCurrent].slice(0, 200);
  });
}

export async function getOrderSnapshot(orderId) {
  const orders = await ordersStore.read();
  return orders.find((entry) => String(entry.id) === String(orderId)) || null;
}

export async function listEvaluations(limit = 50) {
  const entries = await evaluationsStore.read();
  return entries.slice(0, limit);
}

export async function saveEvaluation(record) {
  return evaluationsStore.update((current) => {
    const next = [{ ...record, savedAt: new Date().toISOString() }, ...current];
    return next.slice(0, 200);
  });
}
