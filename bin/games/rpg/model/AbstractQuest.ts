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

    failCondition() {
        let c = this.chatRoom.findMember(this.targetPlayer);
        if (c == null) {
            this.failMessage = "(Your quest target left the room, you'll be assigned a new quest)";
            return true;
        }
        return false;
    }

    abstract successCondition(): boolean;
    abstract bonus(): boolean;

    abstract description(): string;
}