import { IQuest } from "../types/IQuest";
import { API_Connector, API_Chatroom, API_Character } from "bc-bot";

export abstract class AbstractQuest implements IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    additionalInfo: Record<string, unknown> | null;
    failMessage: string;

    constructor(conn: API_Chatroom, memberNumber: number, target: number, additionalInfo?: any) {
        this.chatRoom = conn;
        this.owner = memberNumber;
        this.targetPlayer = target;
        this.additionalInfo = additionalInfo ?? null;
    }
    
    
    abstract prerequisite(): boolean;

    failCondition(gracePeriods: Map<number, number>) {
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
        return false;
    }

    abstract successCondition(): boolean;
    abstract bonus(): boolean;

    abstract description(): string;
}