import { API_Connector } from "bc-bot";
import autoMessagesConfig from "../config/auto-messages.config.json";

export type AutoMessageType = "Chat" | "Whisper";

export interface AutoMessage {
    enabled?: boolean;
    intervalMinutes: number;
    type?: AutoMessageType;
    text: string;
}

export class AutoMessageService {
    private intervals: ReturnType<typeof setInterval>[] = [];

    constructor(private conn: API_Connector) {}

    start(): void {
        const messages = (autoMessagesConfig as { messages?: AutoMessage[] }).messages ?? [];
        for (const message of messages) {
            if (message.enabled === false) continue;
            if (!message.text?.trim()) continue;
            if (!Number.isFinite(message.intervalMinutes) || message.intervalMinutes <= 0) continue;

            const type: AutoMessageType = message.type === "Whisper" ? "Whisper" : "Chat";
            const intervalMs = message.intervalMinutes * 60 * 1000;
            this.intervals.push(setInterval(() => this.send(type, message.text), intervalMs));
        }
    }

    stop(): void {
        for (const id of this.intervals) {
            clearInterval(id);
        }
        this.intervals = [];
    }

    previewTo(memberNumber: number): void {
        const messages = this.getMessages().filter(message => message.text?.trim());
        if (messages.length === 0) {
            this.conn.SendMessage("Whisper", "(No auto messages configured)", memberNumber);
            return;
        }

        for (const message of messages) {
            this.conn.SendMessage("Whisper", message.text, memberNumber);
        }
    }

    private getMessages(): AutoMessage[] {
        return (autoMessagesConfig as { messages?: AutoMessage[] }).messages ?? [];
    }

    private send(type: AutoMessageType, text: string): void {
        const players = this.conn.chatRoom.characters.filter(c => !c.IsBot());
        if (players.length === 0) return;

        if (type === "Whisper") {
            for (const player of players) {
                this.conn.SendMessage("Whisper", text, player.MemberNumber);
            }
            return;
        }

        this.conn.SendMessage("Chat", text);
    }
}
