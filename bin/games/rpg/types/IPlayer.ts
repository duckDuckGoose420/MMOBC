export interface IPlayer {
  memberNumber: number;
  level: number;
  money: number;
  gracePeriodMinutes: number;

    addMoney(amount: number): void;
    moneyNeededToLevelUp(): number;
    moneyThatCanBeRefunded(): number;
    canLevelUp(): boolean;
    levelUp(): boolean;
    refundLevel(): void;
    toString(): string;

    // Settings methods
    getGracePeriodMinutes(): number;
    setGracePeriodMinutes(minutes: number): void;
}
