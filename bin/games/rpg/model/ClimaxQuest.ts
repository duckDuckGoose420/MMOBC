import { AbstractQuest } from "./AbstractQuest";
import { API_Connector, API_Chatroom, API_Character } from "bc-bot";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";

export const refractaryPeriod = 20 * 60 * 1000;
export class ClimaxQuest extends AbstractQuest {
    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any, performanceMonitor?: PerformanceMonitorService) {
        super(conn, memberNumber, target, additionalInfo, performanceMonitor);
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
        // Performance monitoring: Track fail condition calls
        this.performanceMonitor.incrementCounter('failCondition_calls');

        return super.failCondition(gracePeriods);
    }
    successCondition(): boolean {
        // Performance monitoring: Track success condition calls
        this.performanceMonitor.incrementCounter('successCondition_calls');

        return Number(this.additionalInfo['orgasms']) > 0;
    }

    bonus(): boolean {
        return false;
    }

}
