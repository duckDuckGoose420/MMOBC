import { IPlayer } from "../types/IPlayer";

const linearFactor = 200;
const exponentialFactor = 1.3;
const nearestRoundingFactor = 10;
export class Player implements IPlayer {
    memberNumber: number;
    level: number;
    money: number;
    gracePeriodMinutes: number;
    isDominant: boolean;
    blockedPlayers: number[];
    inventory: Record<string, number>;
    pendingCatchMeTarget: number | null;


    constructor(memberNumber: number) {
        this.memberNumber = memberNumber;
        this.level = 1;
        this.money = 0;
        this.gracePeriodMinutes = 20; // Default: 20 minutes
        this.isDominant = false; // Default: not dominant
        this.blockedPlayers = [];
        this.inventory = {};
        this.pendingCatchMeTarget = null;
    }

    addMoney(amount: number): void {
        this.money += amount;
    }

    moneyNeededToLevelUp(): number {
        const rawXP = 100 * Math.pow(this.level + 1, exponentialFactor);
        return Math.round(rawXP / 100) * 100; // Round to nearest 100
    }

    moneyThatCanBeRefunded(): number {
        if (this.level <= 1)
            return 0;
        const rawXP = 100 * Math.pow(this.level, exponentialFactor);
        return Math.round(rawXP / 100) * 100; // Round to nearest 100
    }

    canLevelUp(): boolean {
        return this.money >= this.moneyNeededToLevelUp();
    }

    levelUp(): boolean {
        if (!this.canLevelUp())
            return false;

        this.money -= this.moneyNeededToLevelUp();
        this.level += 1;
        return true;
    }

    refundLevel(): void {
        this.money += this.moneyThatCanBeRefunded();
        this.level--;
    }

    toString(): string {
        return `Player #${this.memberNumber} - Level ${this.level}, Money: $${this.money}`;
    }

    // Settings methods
    getGracePeriodMinutes(): number {
        return this.gracePeriodMinutes;
    }

    setGracePeriodMinutes(minutes: number): void {
        // Validate: must be between 0 and 20
        if (minutes < 0 || minutes > 20) {
            throw new Error("Grace period minutes must be between 0 and 20");
        }
        this.gracePeriodMinutes = minutes;
    }

    // Dominant methods
    getIsDominant(): boolean {
        return this.isDominant;
    }

    setIsDominant(isDominant: boolean): void {
        this.isDominant = isDominant;
    }

    getBlockedPlayers(): number[] {
        return [...this.blockedPlayers];
    }

    hasBlocked(memberNumber: number): boolean {
        return this.blockedPlayers.includes(memberNumber);
    }

    toggleBlocked(memberNumber: number): boolean {
        const index = this.blockedPlayers.indexOf(memberNumber);
        if (index === -1) {
            this.blockedPlayers.push(memberNumber);
            return true;
        }
        this.blockedPlayers.splice(index, 1);
        return false;
    }

    getItemCount(itemId: string): number {
        return this.inventory[itemId] || 0;
    }

    addItem(itemId: string, amount: number): void {
        const next = (this.inventory[itemId] || 0) + amount;
        if (next <= 0) {
            delete this.inventory[itemId];
        } else {
            this.inventory[itemId] = next;
        }
    }

    removeItem(itemId: string, amount: number): boolean {
        const have = this.inventory[itemId] || 0;
        if (have < amount) return false;
        this.addItem(itemId, -amount);
        return true;
    }

    getPendingCatchMeTarget(): number | null {
        return this.pendingCatchMeTarget;
    }

    setPendingCatchMeTarget(memberNumber: number | null): void {
        this.pendingCatchMeTarget = memberNumber;
    }
}
