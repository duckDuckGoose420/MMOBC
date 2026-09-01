import Storage from "node-storage";
import { TargetStatus } from "./TargetPriorityService";

export interface SavedQuest {
    type: string;
    owner: number;
    targetPlayer: number;
    additionalInfo: Record<string, unknown>;
}

export interface RejoinState {
    quests: SavedQuest[];
    gracePeriods: Record<string, number>;
    questCD: Record<string, number>;
    climaxTracker: Record<string, number>;
    bounties: Record<string, number>;
    rerollCD: Record<string, number>;
    lastTargetBeforeReroll: Record<string, number>;
    isPlayerSafe: Record<string, boolean>;
    targetPriorities: Record<string, Record<string, TargetStatus>>;
    privatePlayRequests: Record<string, PrivateRequestSnapshot>;
    alreadyEnteredBoundMaid: number[];
    alreadyEnteredIntroduction: number[];
    processedPlayers: number[];
    closedPermissionNotifiedPlayers: number[];
}

export interface PrivateRequestSnapshot {
    requestingPlayer: number;
    expiration: number;
    cost: number;
}

const STORAGE_KEY = "state";

export class RejoinStateService {
    private storage = new Storage("./bin/games/rpg/data/rejoin");

    save(state: RejoinState): void {
        this.storage.put(STORAGE_KEY, state);
    }

    load(): RejoinState | null {
        const state = this.storage.get(STORAGE_KEY);
        return state ?? null;
    }

    clear(): void {
        this.storage.remove(STORAGE_KEY);
    }
}

export function mapToRecord(map: Map<number, number>): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [key, value] of map) {
        record[key.toString()] = value;
    }
    return record;
}

export function recordToMap(record: Record<string, number>): Map<number, number> {
    return new Map(Object.entries(record).map(([key, value]) => [Number(key), value]));
}

export function setToArray(set: Set<number>): number[] {
    return [...set];
}

export function arrayToSet(values: number[]): Set<number> {
    return new Set(values);
}

export function booleanMapToRecord(map: Map<number, boolean>): Record<string, boolean> {
    const record: Record<string, boolean> = {};
    for (const [key, value] of map) {
        record[key.toString()] = value;
    }
    return record;
}

export function recordToBooleanMap(record: Record<string, boolean>): Map<number, boolean> {
    return new Map(Object.entries(record).map(([key, value]) => [Number(key), value]));
}

export function privateRequestsToRecord(map: Map<number, PrivateRequestSnapshot>): Record<string, PrivateRequestSnapshot> {
    const record: Record<string, PrivateRequestSnapshot> = {};
    for (const [key, value] of map) {
        record[key.toString()] = value;
    }
    return record;
}

export function recordToPrivateRequests(record: Record<string, PrivateRequestSnapshot>): Map<number, PrivateRequestSnapshot> {
    const map = new Map<number, PrivateRequestSnapshot>();
    const now = Date.now();
    for (const [key, value] of Object.entries(record)) {
        if (value.expiration > now) {
            map.set(Number(key), value);
        }
    }
    return map;
}
