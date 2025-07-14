import { IPlayer } from "../types/IPlayer";

const linearFactor = 200;
const exponentialFactor = 1.1;
const nearestRoundingFactor = 10;
export class Player implements IPlayer {
    memberNumber: number;
    level: number;
    money: number;

    
    constructor(memberNumber: number) {
        this.memberNumber = memberNumber;
        this.level = 1;
        this.money = 0;
    }

    addMoney(amount: number): void {
        this.money += amount;
    }

    moneyNeededToLevelUp(): number {
        return Math.ceil(Math.pow(this.level, exponentialFactor) * 200 / nearestRoundingFactor) * nearestRoundingFactor; 
    }

    private canLevelUp(): boolean {
        return this.money >= this.moneyNeededToLevelUp();
    }

    levelUp(): boolean {
        if (!this.canLevelUp())
            return false;
        this.level += 1;
        this.money -= this.moneyNeededToLevelUp();
        return true;
    }

    toString(): string {
        return `Player #${this.memberNumber} - Level ${this.level}, Money: $${this.money}`;
    }
}