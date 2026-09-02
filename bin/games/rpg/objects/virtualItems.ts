export const ITEM_CATCHME = "catchme";

export interface VirtualItem {
    id: string;
    name: string;
    warning: string;
}

export const VIRTUAL_ITEMS: Record<string, VirtualItem> = {
    [ITEM_CATCHME]: {
        id: ITEM_CATCHME,
        name: "Catch me if you can",
        warning: "This only makes their next challenge roll target you. If they reroll, disconnect, lose their quest, or never get a new roll, the item is wasted.",
    },
};

export function getVirtualItem(id: string): VirtualItem | undefined {
    return VIRTUAL_ITEMS[id];
}
