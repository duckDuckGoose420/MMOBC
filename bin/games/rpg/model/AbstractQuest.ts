import { IQuest, QuestRequirement } from "../types/IQuest";
import { API_Chatroom, API_Character, MapRegion, positionIsInRegion } from "bc-bot";
import { devRoomPresence } from "../util/devRoomPresence";

export abstract class AbstractQuest implements IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    private _additionalInfo: Record<string, unknown>;

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

    protected deliveryRequirements(target: API_Character | undefined, region: MapRegion): QuestRequirement[] {
        const lockedByOwner = !!target && this.armsLockedByOwner(target);
        const leashed = !!target && target.IsLeashed();
        let inPosition = false;
        if (target) {
            const targetInRegion = positionIsInRegion(target.MapPos, region);
            const owner = this.chatRoom.findMember(this.owner);
            const ownerInRegion = !!owner && positionIsInRegion(owner.MapPos, region);
            inPosition = targetInRegion || ownerInRegion;
        }
        return [
            { label: "Arms locked by you", met: lockedByOwner },
            { label: "Leashed", met: leashed },
            { label: "In position", met: inPosition },
        ];
    }

    protected targetIsFree(): boolean {
        const target = this.findTarget();
        if (!target || target.IsRestrained()) return false;
        // LockMemberNumber can be set without the Block effect IsRestrained() checks
        return this.armsLockOwner(target) === undefined;
    }

    abstract prerequisite(): boolean;

    failCondition(gracePeriods: Map<number, number>): boolean {
        const target = this.findTarget();
        if (!target) {
            devRoomPresence(this.targetPlayer, undefined);
            this.failMessage = "(Your quest target left the room, you'll be assigned a new quest)";
            return true;
        }
        const forcedByTargetMe = this.additionalInfo?.forcedByTargetMe === true;
        if (!forcedByTargetMe) {
            const grace = gracePeriods.get(this.targetPlayer);
            if (grace && Date.now() < grace) {
                this.failMessage = "(Your quest target completed their quest, we'll give you a new quest to not bother their possible session)";
                return true;
            }
            const presence = devRoomPresence(this.targetPlayer, target.MapPos);
            if (presence === "expired") {
                this.failMessage = "(Your quest target is no longer available, you'll be assigned a new quest)";
                return true;
            }
            if (presence === "waiting") return false;
        }
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

    abstract requirements(): QuestRequirement[];

    successCondition(): boolean {
        return this.requirements().every(r => r.met);
    }

    abstract bonus(): boolean;

    abstract description(): string;
}
