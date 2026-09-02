import { API_Character } from "bc-bot";
import Storage from "node-storage";

export const PRISON_DURATION = 5 * 60 * 1000; // 5 Minuten
const STORAGE_KEY = "prisoners";
const DEFAULT_STORAGE_PATH = "./bin/games/rpg/data/prison";

export type ImprisonmentState = {
    inPrisonRoom: boolean;
    restrained: boolean;
    leashed: boolean;
    dominant: boolean;
    imprisoned: boolean;
    releaseHold: boolean;
};

export function shouldImprison(state: ImprisonmentState): boolean {
    return state.inPrisonRoom
        && state.restrained
        && state.leashed
        && !state.dominant
        && !state.imprisoned
        && !state.releaseHold;
}

export class PrisonService {
    private prisoners: Map<number, number> = new Map(); // memberNumber → imprisonedAt timestamp
    private releaseHold: Set<number> = new Set();
    private storage: Storage;

    constructor(storagePath = DEFAULT_STORAGE_PATH) {
        this.storage = new Storage(storagePath);
        this.load();
    }

    imprisonPlayer(character: API_Character): void {
        this.releaseHold.delete(character.MemberNumber);
        this.prisoners.set(character.MemberNumber, Date.now());
        this.save();
    }

    releasePlayer(character: API_Character): void {
        this.prisoners.delete(character.MemberNumber);
        character.giveKey(["bronze"]);
        this.save();
    }

    holdReleaseUntilLeave(memberNumber: number): void {
        this.releaseHold.add(memberNumber);
    }

    clearReleaseHold(memberNumber: number): void {
        this.releaseHold.delete(memberNumber);
    }

    hasReleaseHold(memberNumber: number): boolean {
        return this.releaseHold.has(memberNumber);
    }

    getRemainingTime(character: API_Character): number {
        const imprisonedAt = this.prisoners.get(character.MemberNumber);
        if (!imprisonedAt) return 0;

        const timeInPrison = Date.now() - imprisonedAt;
        const remainingTime = PRISON_DURATION - timeInPrison;

        return Math.max(0, remainingTime);
    }

    isImprisoned(character: API_Character): boolean {
        return this.prisoners.has(character.MemberNumber);
    }

    checkExpiredPrisons(): number[] {
        const now = Date.now();
        const expired: number[] = [];

        for (const [memberNumber, imprisonedAt] of this.prisoners) {
            if (now - imprisonedAt >= PRISON_DURATION) {
                expired.push(memberNumber);
            }
        }

        if (expired.length > 0) {
            for (const memberNumber of expired) {
                this.prisoners.delete(memberNumber);
            }
            this.save();
        }

        return expired;
    }

    getAllPrisoners(character: API_Character): Map<number, number> {
        return new Map(this.prisoners);
    }

    save(): void {
        const data: Record<string, number> = {};
        for (const [memberNumber, imprisonedAt] of this.prisoners) {
            data[memberNumber.toString()] = imprisonedAt;
        }
        this.storage.put(STORAGE_KEY, data);
    }

    private load(): void {
        const data = this.storage.get(STORAGE_KEY) as Record<string, number> | undefined;
        if (!data) return;

        const now = Date.now();
        for (const [memberNumber, imprisonedAt] of Object.entries(data)) {
            if (now - imprisonedAt < PRISON_DURATION) {
                this.prisoners.set(Number(memberNumber), imprisonedAt);
            }
        }
    }
}
