import { positionIsInRegion } from "bc-bot";
import { mapRegions } from "./areas";

export const DEV_ROOM_QUEST_CANCEL_MS = 30 * 1000;

const enteredAt = new Map<number, number>();

export function devRoomPresence(
    memberNumber: number,
    mapPos: { X: number; Y: number } | undefined,
    now = Date.now(),
): "outside" | "waiting" | "expired" {
    if (!mapPos || !positionIsInRegion(mapPos, mapRegions.DEV_ROOM_AREA)) {
        enteredAt.delete(memberNumber);
        return "outside";
    }

    const started = enteredAt.get(memberNumber);
    if (started === undefined) {
        enteredAt.set(memberNumber, now);
        return "waiting";
    }

    return now - started >= DEV_ROOM_QUEST_CANCEL_MS ? "expired" : "waiting";
}

export function resetDevRoomPresence(): void {
    enteredAt.clear();
}
