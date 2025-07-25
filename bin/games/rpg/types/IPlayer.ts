export interface IPlayer {
  memberNumber: number;
  level: number;
  money: number;

    addMoney(amount: number): void;
    moneyNeededToLevelUp(): number;
    canLevelUp(): boolean;
    levelUp(): boolean;
    toString(): string;
}
