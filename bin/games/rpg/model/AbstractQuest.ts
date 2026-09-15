import { IQuest } from "../types/IQuest";
import { API_Connector, API_Chatroom, API_Character, positionIsInRegion } from "bc-bot";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";
import { mapRegions } from "../util/areas";

const DEV_ROOM_QUEST_CANCEL_MS = 30 * 1000;

export abstract class AbstractQuest implements IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    private _additionalInfo: Record<string, unknown>;
    protected performanceMonitor: PerformanceMonitorService;
    private devRoomSeenAt: number | null = null;

    failMessage: string;

    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any, performanceMonitor?: PerformanceMonitorService) {
        this.chatRoom = conn;
        this.owner = memberNumber;
        this.targetPlayer = target;
        this.additionalInfo = additionalInfo ?? {};
        this.performanceMonitor = performanceMonitor || new PerformanceMonitorService();
    }

     public get additionalInfo(): Record<string, unknown>{
        return this._additionalInfo;
    }
    public set additionalInfo(value: Record<string, unknown>) {
        this._additionalInfo = value;
    }

    abstract prerequisite(): boolean;

    failCondition(gracePeriods: Map<number, number>) {
        // Performance monitoring: Track findMember calls
        this.performanceMonitor.incrementCounter('findMember_calls');

        let c = this.chatRoom.findMember(this.targetPlayer);
        if (c == null) {
            this.failMessage = "(Your quest target left the room, you'll be assigned a new quest)";
            return true;
        }
        const grace = gracePeriods.get(this.targetPlayer);
        if (grace && Date.now() < grace) {
            this.failMessage = "(Your quest target completed their quest, we'll give you a new quest to not bother their possible session)";
            return true;
        }
        if (positionIsInRegion(c.MapPos, mapRegions.DEV_ROOM_AREA)) {
            if (this.devRoomSeenAt === null) {
                this.devRoomSeenAt = Date.now();
            }
            if (Date.now() - this.devRoomSeenAt >= DEV_ROOM_QUEST_CANCEL_MS) {
                this.failMessage = "(Your quest target is no longer available, you'll be assigned a new quest)";
                return true;
            }
            return false;
        }
        this.devRoomSeenAt = null;
        return false;
    }

    abstract successCondition(): boolean;
    abstract bonus(): boolean;

    abstract description(): string;
}
