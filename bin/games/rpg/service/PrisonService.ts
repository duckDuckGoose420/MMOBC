import { API_Character, API_Connector } from "bc-bot";

const PRISON_DURATION = 5 * 60 * 1000; // 5 Minuten

export class PrisonService {
    private prisoners: Map<number, number> = new Map(); // memberNumber → imprisonedAt timestamp

    /**
     * Imprisons a player and starts the timer
     */
    imprisonPlayer(character: API_Character): void {
        this.prisoners.set(character.MemberNumber, Date.now());
    }

    /**
     * Releases a player and removes the timer
     */
    releasePlayer(character: API_Character): void {
        this.prisoners.delete(character.MemberNumber);
        character.giveKey(["bronze"]);
    }

    /**
     * Gets the remaining prison time in milliseconds
     */
    getRemainingTime(character: API_Character): number {
        const imprisonedAt = this.prisoners.get(character.MemberNumber);
        if (!imprisonedAt) return 0;

        const timeInPrison = Date.now() - imprisonedAt;
        const remainingTime = PRISON_DURATION - timeInPrison;

        return Math.max(0, remainingTime);
    }

    /**
     * Checks if a player is currently imprisoned
     */
    isImprisoned(character: API_Character): boolean {
        return this.prisoners.has(character.MemberNumber);
    }

    /**
     * Checks for expired prisons and returns list of member numbers to release
     */
    checkExpiredPrisons(character: API_Character): number[] {
        const now = Date.now();
        const expired: number[] = [];

        for (const [memberNumber, imprisonedAt] of this.prisoners) {
            if (now - imprisonedAt >= PRISON_DURATION) {
                character.giveKey(["bronze"]);
                expired.push(character.MemberNumber);
            }
        }

        return expired;
    }

    /**
     * Gets all currently imprisoned players (for debugging)
     */
    getAllPrisoners(character: API_Character): Map<number, number> {
        return new Map(this.prisoners);
    }
}
