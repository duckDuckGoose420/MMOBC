import { IQuest } from "../types/IQuest";
import { API_Chatroom, API_Connector } from "bc-bot";
import { LockQuest } from "./LockQuest";
import { Util } from "../util/Util";

const botMemberNumber = 4492;
class QuestList {
    private quests: IQuest[] = [];
    
    add(quest: IQuest): void {
        this.quests.push(quest);
    }

    removeAt(index: number): void {
        this.quests.splice(index, 1);
    }

    getAll(): IQuest[] {
        return [...this.quests];
    }

    count(): number {
        return this.quests.length;
    }

    get(index: number): IQuest {
        return this.quests.at(index);
    }

    set(elements: IQuest[]): void {
        this.quests = elements;
    }
}

export class QuestManager {
    quests: QuestList;
    private chatRoom: API_Chatroom;
    private isPlayerSafe: Map<number, boolean> = new Map<number, boolean>();

    public constructor(chatroom: API_Chatroom, isPlayerSafe: Map<number, boolean>) {
        this.chatRoom = chatroom;
        this.quests = new QuestList();
        this.isPlayerSafe = isPlayerSafe;
    }

    playerHasQuestAssigned(memberNumber: number): IQuest | null {
        for (let q of this.quests.getAll()) {
            if (q.owner == memberNumber)
                return q;
        }
        return null;
    }

    cancelQuests(gracePeriods: Map<number, number>): IQuest[] {
        const [active, canceled]: [IQuest[], IQuest[]] = [[], []];
        for (const quest of this.quests.getAll()) {
            if (!quest.failCondition(gracePeriods)) {
                active.push(quest);
            } else {
                canceled.push(quest);
            }
        }
        this.quests.set(active);
        return canceled;
    }

    cancelQuestForPlayer(memberNumber: number): boolean {
        let result = -1;
        let i = 0;
        for (let q of this.quests.getAll()) {
            if (q.owner == memberNumber) {
                result = i;
                break;
            }
            i++;
        }
        if (result != -1) {
            this.quests.removeAt(result);
            return true;
        } else
            return false;
    }

    assignQuests(conn: API_Connector, questCD: Map<number, number>, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        this.chatRoom.characters.forEach((character) => {
            if (!this.playerHasQuestAssigned(character.MemberNumber) && this.isPlayerSafe.get(character.MemberNumber) == false && !this.isQuestAssignmentInCD(questCD, character.MemberNumber)) {
                this.assignQuestToPlayer(conn, character.MemberNumber, gracePeriods, lastTargetBeforeReroll);
            }
        });
    }

    async assignQuestToPlayer(conn: API_Connector, memberNumber: number, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        const maxAttempts = 10;

        for (let i = 0; i < maxAttempts; i++) {
            const quest = this.generateRandomQuest(memberNumber);
            const lastTarget = lastTargetBeforeReroll.get(memberNumber);
            if (quest && !this.isInGracePeriod(gracePeriods, quest.targetPlayer) && quest.targetPlayer != lastTarget) {
                this.quests.add(quest);
                conn.SendMessage("Whisper", "(You've been assigned a new quest, you can check it with /bot quest. If you don't like your target or they're busy, you can /bot reroll)", memberNumber);
                return;
            }

            // Yield to event loop between retries to avoid blocking
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    generateRandomQuest(memberNumber: number): IQuest | null {
        
        const candidateList = this.chatRoom.characters.filter((character) => { return character.MemberNumber != botMemberNumber && character.MemberNumber != memberNumber });
        if (candidateList.length == 0)
            return null;
        const target = candidateList.at(Util.getRandomInt(candidateList.length));
        const quest = new LockQuest(this.chatRoom, memberNumber, target.MemberNumber);

        // We don't want to target players that just entered the room or are generally considered protected in some way
        const isTargetSafe = this.isPlayerSafe.get(target.MemberNumber);
        if (isTargetSafe === undefined || isTargetSafe)
            return null;
        //if(Math.random() < Util.questAssignmentProbability()
        if (quest.prerequisite()) {
            return quest;
        } else {
            //console.log("Prerequisite failed");

            return null;
        }
    }

    completeQuests(): IQuest[] {
        const [active, completed]: [IQuest[], IQuest[]] = [[], []];
        for (const quest of this.quests.getAll()) {
            if (!quest.successCondition()) {
                active.push(quest);
            } else {
                completed.push(quest);
            }
        }
        this.quests.set(active);
        return completed;
    }

    private isQuestAssignmentInCD(questCD: Map<number, number>, memberNumber: number) {
        const CD = questCD.get(memberNumber);
        if (CD === undefined || CD < Date.now())
            return false;
        else
            return true;
    }

    private isInGracePeriod(gracePeriods: Map<number, number>, targetPlayer: number) {
        const grace = gracePeriods.get(targetPlayer);
        if (grace && Date.now() < grace) {
            return true;
        } else
            return false;
    }
}