import { API_Chatroom } from "bc-bot";

export interface IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    additionalInfo: Record<string, unknown> | null;
    failMessage: string;

    prerequisite(): boolean;
    failCondition(gracePeriod: Map<number,number>): boolean;
    successCondition(): boolean;
    bonus(): boolean;

    description(): string;
}