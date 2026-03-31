import { JsonStore } from "../lib/json-store.js";

const shopsStore = new JsonStore("shops.json", []);

export async function listShops() {
  return shopsStore.read();
}

export async function getShopRecord(shopDomain) {
  const shops = await shopsStore.read();
  return shops.find((entry) => entry.shopDomain === shopDomain) || null;
}

export async function saveShopRecord(shopRecord) {
  return shopsStore.update((current) => {
    const withoutCurrent = current.filter((entry) => entry.shopDomain !== shopRecord.shopDomain);
    return [
      {
        ...shopRecord,
        updatedAt: new Date().toISOString()
      },
      ...withoutCurrent
    ];
  });
}

export async function removeShopRecord(shopDomain) {
  return shopsStore.update((current) =>
    current.filter((entry) => entry.shopDomain !== shopDomain)
  );
}
