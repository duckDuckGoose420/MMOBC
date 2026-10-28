import { IQuest } from "../types/IQuest";
import { API_Chatroom, API_Character, MapRegion, positionIsInRegion } from "bc-bot";
import { mapRegions } from "../util/areas";

const DEV_ROOM_QUEST_CANCEL_MS = 30 * 1000;

export abstract class AbstractQuest implements IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    private _additionalInfo: Record<string, unknown>;
    private devRoomSeenAt: number | null = null;

    failMessage: string;

    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any) {
        this.chatRoom = conn;
        this.owner = memberNumber;
        this.targetPlayer = target;
        this.additionalInfo = additionalInfo ?? {};
    }

     public get additionalInfo(): Record<string, unknown>{
        return this._additionalInfo;
    }
    public set additionalInfo(value: Record<string, unknown>) {
        this._additionalInfo = value;
    }

    protected findTarget(): API_Character | undefined {
        return this.chatRoom.findMember(this.targetPlayer);
    }

    protected targetName(): string {
        return this.findTarget()?.toString() ?? "";
    }

    protected armsLockOwner(target: API_Character): number | undefined {
        const lockOwner = target.Appearance.InventoryGet("ItemArms")?.getData()?.Property?.LockMemberNumber;
        return lockOwner === undefined || lockOwner === null ? undefined : Number(lockOwner);
    }

    protected armsLockedByOwner(target: API_Character): boolean {
        return this.armsLockOwner(target) === this.owner;
    }

    protected armsLockedByOther(target: API_Character): boolean {
        const lockOwner = this.armsLockOwner(target);
        return lockOwner !== undefined && lockOwner !== this.owner;
    }

    protected deliveredTo(target: API_Character, region: MapRegion): boolean {
        return this.armsLockedByOwner(target)
            && target.IsLeashed()
            && positionIsInRegion(target.MapPos, region);
    }

    protected targetIsFree(): boolean {
        const target = this.findTarget();
        return !!target && !target.IsRestrained();
    }

    abstract prerequisite(): boolean;

    failCondition(gracePeriods: Map<number, number>): boolean {
        const target = this.findTarget();
        if (!target) {
            this.failMessage = "(Your quest target left the room, you'll be assigned a new quest)";
            return true;
        }
        const grace = gracePeriods.get(this.targetPlayer);
        if (grace && Date.now() < grace) {
            this.failMessage = "(Your quest target completed their quest, we'll give you a new quest to not bother their possible session)";
            return true;
        }
        if (positionIsInRegion(target.MapPos, mapRegions.DEV_ROOM_AREA)) {
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
        return this.failConditionForTarget(target);
    }

    protected failConditionForTarget(target: API_Character): boolean {
        return false;
    }

    protected failIfLockedByOther(target: API_Character): boolean {
        if (this.armsLockedByOther(target)) {
            this.failMessage = "(Someone else locked your target before you, you'll be assigned a new quest)";
            return true;
        }
        this.failMessage = "";
        return false;
    }

    successCondition(): boolean {
        const target = this.findTarget();
        return !!target && this.successConditionForTarget(target);
    }

    protected abstract successConditionForTarget(target: API_Character): boolean;

    abstract bonus(): boolean;

    abstract description(): string;
}
