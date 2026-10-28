import { AbstractQuest } from "./AbstractQuest";
import { API_Chatroom } from "bc-bot";

export const refractaryPeriod = 20 * 60 * 1000;
export class ClimaxQuest extends AbstractQuest {
    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any) {
        super(conn, memberNumber, target, additionalInfo);
        if (this.additionalInfo["orgasms"] === undefined) {
            this.additionalInfo["orgasms"] = 0;
        }
    }

    description(): string {
        const targetName = this.targetName();
        if (targetName == "")
            return null;
        return `Your current quest is to make ${targetName} climax [#${this.targetPlayer}]`;
    }
    prerequisite(): boolean {
        return (Number(this.additionalInfo["lastClimaxed"]) + refractaryPeriod) < Date.now();
    }

    successCondition(): boolean {
        return Number(this.additionalInfo['orgasms']) > 0;
    }

    protected successConditionForTarget(): boolean {
        return this.successCondition();
    }

    bonus(): boolean {
        return false;
    }

}
