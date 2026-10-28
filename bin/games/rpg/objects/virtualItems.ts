import itemsConfig from "../config/items.config.json";

export const ITEM_CATCHME = "catchme";
export const ITEM_RELEASE = "release";

export interface VirtualItem {
    id: string;
    name: string;
    warning: string;
    price: number;
    sellPrice: number;
    isPurchaseable: boolean;
    isSellable: boolean;
    levelRequirement: number;
}

export const VIRTUAL_ITEMS: Record<string, VirtualItem> = Object.fromEntries(
    itemsConfig.items.map(item => [item.id, item])
);

export function getVirtualItem(id: string): VirtualItem | undefined {
    if (VIRTUAL_ITEMS[id]) return VIRTUAL_ITEMS[id];
    const lower = id.toLowerCase();
    return Object.values(VIRTUAL_ITEMS).find(item => item.id.toLowerCase() === lower);
}

export function getAllVirtualItems(): VirtualItem[] {
    return Object.values(VIRTUAL_ITEMS);
}
