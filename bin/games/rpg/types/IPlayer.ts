export interface IPlayer {
  memberNumber: number;
  level: number;
  money: number;

    addMoney(amount: number): void;
    moneyNeededToLevelUp(): number;
    moneyThatCanBeRefunded(): number;
    canLevelUp(): boolean;
    levelUp(): boolean;
    refundLevel(): void;
    toString(): string;
}
