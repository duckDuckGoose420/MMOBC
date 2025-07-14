import { API_Chatroom } from "bc-bot";

export interface IQuest {
    chatRoom: API_Chatroom;
    owner: number;
    targetPlayer: number;
    additionalInfo: Record<string, unknown> | null;
    failMessage: string;

    prerequisite(): boolean;
    failCondition(): boolean;
    successCondition(): boolean;
    bonus(): boolean;

    description(): string;
}