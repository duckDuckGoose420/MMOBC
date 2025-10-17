import { mapRegions } from "../util/areas";
import { AbstractQuest } from "./AbstractQuest";
import { API_Connector, API_Chatroom, API_Character, positionIsInRegion } from "bc-bot";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";
export class PrisonQuest extends AbstractQuest {
    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any, performanceMonitor?: PerformanceMonitorService) {
        super(conn, memberNumber, target, additionalInfo, performanceMonitor);
    }
    description(): string {
        const targetName = this.chatRoom.findMember(this.targetPlayer).toString();
        return `Your current quest is to put ${targetName}[#${this.targetPlayer}] in prison. They have to have their arms restrained and locked by you, then leashed to the ` +
        `prison`;
    }

    prerequisite(): boolean {
        return !this.chatRoom.findMember(this.targetPlayer).IsRestrained();
    }

    // In short, if someone else locked the target's arms,
    failCondition(gracePeriods: Map<number, number>): boolean {
        // Performance monitoring: Track fail condition calls
        this.performanceMonitor.incrementCounter('failCondition_calls');

        if (super.failCondition(gracePeriods))
            return true;
        const lockOwner = this.chatRoom
            .findMember(this.targetPlayer)
            ?.Appearance
            ?.InventoryGet("ItemArms")
            ?.getData()
            ?.Property
            ?.LockMemberNumber;

        if (lockOwner && lockOwner.toString() !== this.owner.toString()) {
            this.failMessage = "Someone else locked your target before you, you'll be assigned a new quest";
            return true;
        } else {
            this.failMessage = "";
            return false;
        }
    }

    // Locked, leashed, and in the collection building
    successCondition(): boolean {
        // Performance monitoring: Track success condition calls
        this.performanceMonitor.incrementCounter('successCondition_calls');

        const target = this.chatRoom
            .findMember(this.targetPlayer);
        if (target === undefined)
            return false;
        const correctLock = target
            ?.Appearance
            ?.InventoryGet("ItemArms")
            ?.getData()
            ?.Property
            ?.LockMemberNumber == this.owner;

        const leashed = target.hasEffect("IsLeashed");
        const inBuilding = positionIsInRegion(target.MapPos, mapRegions.PRISON_ROOM);

        return correctLock && leashed && inBuilding;
    }

    bonus(): boolean {
        return false;
    }

}
