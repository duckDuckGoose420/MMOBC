export interface IPlayer {
  memberNumber: number;
  level: number;
  money: number;
  gracePeriodMinutes: number;
  isDominant: boolean;
  blockedPlayers: number[];

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

    // Dominant methods
    getIsDominant(): boolean;
    setIsDominant(isDominant: boolean): void;

    getBlockedPlayers(): number[];
    hasBlocked(memberNumber: number): boolean;
    toggleBlocked(memberNumber: number): boolean;
}
