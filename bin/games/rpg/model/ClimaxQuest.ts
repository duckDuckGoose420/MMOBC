import { AbstractQuest } from "./AbstractQuest";
import { API_Connector, API_Chatroom, API_Character } from "bc-bot";

export const refractaryPeriod = 20 * 60 * 1000;
export class ClimaxQuest extends AbstractQuest {
    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any) {
        super(conn, memberNumber, target, additionalInfo);
        this.additionalInfo["orgasms"] = 0;
    }

    description(): string {
        const targetName = this.chatRoom.findMember(this.targetPlayer)?.toString() ?? "";
        if (targetName == "")
            return null;
        return `Your current quest is to make ${targetName} climax [#${this.targetPlayer}]`;
    }
    prerequisite(): boolean {
        return (Number(this.additionalInfo["lastClimaxed"]) + refractaryPeriod) < Date.now();
    }

    // In short, if someone else locked the target's arms, 
    failCondition(gracePeriods: Map<number, number>): boolean {
        return false;
    }
    successCondition(): boolean {
        return Number(this.additionalInfo["orgasms"]) > 0;
    }

    bonus(): boolean {
        return false;
    }

}