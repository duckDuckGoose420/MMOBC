import { IQuest } from "../types/IQuest";
import { API_Chatroom, API_Connector } from "bc-bot";
import { LockQuest } from "./LockQuest";
import { Util } from "../util/Util";
import { RPG } from "../../rpg";
import { ClimaxQuest, refractaryPeriod } from "./ClimaxQuest";
import { KidnapQuest } from "./KidnapQuest";
import { KidnapQuestBoundMaid } from "./KidnapQuestBoundMaid";
import { TargetPriorityService } from "../service/TargetPriorityService";
import { PrisonQuest } from "./PrisonQuest";

const botMemberNumber = 220073;
const questTypes: { constructor: QuestConstructor; weight: number }[] = [
    { constructor: LockQuest, weight: 5 },
    { constructor: ClimaxQuest, weight: 1 },
    { constructor: KidnapQuest, weight: 1 },
    { constructor: KidnapQuestBoundMaid, weight: 2 },
    { constructor: PrisonQuest, weight: 1 }
];

type QuestConstructor = new (
    chatRoom: API_Chatroom,
    owner: number,
    target: number
) => IQuest;

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
    private RPG: RPG;
    private targetPriorityService: TargetPriorityService;

    public constructor(chatroom: API_Chatroom, RPG: RPG, targetPriorityService?: TargetPriorityService) {
        this.chatRoom = chatroom;
        this.quests = new QuestList();
        this.RPG = RPG;
        this.targetPriorityService = targetPriorityService || new TargetPriorityService();
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
        const index = this.quests.getAll().findIndex(q => q.owner === memberNumber);
        if (index !== -1) {
            this.quests.removeAt(index);
            return true;
        }
        return false;
    }

    cancelQuestsByTarget(targetNumber: number): IQuest[] {
        const allQuests = this.quests.getAll();
        const remainingQuests: IQuest[] = [];
        const removedQuests: IQuest[] = [];

        for (const quest of allQuests) {
            if (quest.targetPlayer === targetNumber) {
                removedQuests.push(quest);
            } else {
                remainingQuests.push(quest);
            }
        }

        this.quests.set(remainingQuests); // Update the QuestList to exclude the removed ones
        return removedQuests;
    }

    assignQuests(conn: API_Connector, questCD: Map<number, number>, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        this.chatRoom.characters.forEach((character) => {
            if (!this.playerHasQuestAssigned(character.MemberNumber) && this.RPG.isPlayerSafe.get(character.MemberNumber) == false && !this.isQuestAssignmentInCD(questCD, character.MemberNumber)) {
                this.assignQuestToPlayer(conn, character.MemberNumber, gracePeriods, lastTargetBeforeReroll);
            }
        });
    }

    async assignQuestToPlayer(conn: API_Connector, memberNumber: number, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): Promise<void> {
        const maxAttempts = 10;

        // First, try to assign quest with priority targets
        const priorityTargets = this.targetPriorityService.getPriorityTargets(memberNumber);
        if (priorityTargets.length > 0) {
            for (const targetNumber of priorityTargets) {
                // Check if target is blocked
                if (this.targetPriorityService.isBlocked(memberNumber, targetNumber)) {
                    continue;
                }

                // Check if target is in grace period
                if (this.isInGracePeriod(gracePeriods, targetNumber)) {
                    continue;
                }

                // Check if target is safe
                const isTargetSafe = this.RPG.isPlayerSafe.get(targetNumber);
                if (isTargetSafe === undefined || isTargetSafe) {
                    continue;
                }

                // Try to generate quest with this priority target
                const quest = this.generateQuestWithTarget(memberNumber, targetNumber);
                if (quest && quest.prerequisite()) {
                    this.quests.add(quest);
                    conn.SendMessage("Whisper", "(New quest: " + quest.description() + ". If you don't like your target, can't find it or they're busy, you can /bot reroll) ", memberNumber);
                    return;
                }
            }
        }

        // If no priority target worked, try normal quest generation
        for (let i = 0; i < maxAttempts; i++) {
            const quest = this.generateRandomQuest(memberNumber);
            const lastTarget = lastTargetBeforeReroll.get(memberNumber);
            if (!quest || quest.targetPlayer == lastTarget)
                continue;

            // Check if target is blocked
            if (this.targetPriorityService.isBlocked(memberNumber, quest.targetPlayer)) {
                continue;
            }

            const playerLevel = this.RPG.playerService.get(quest.owner).level;
            const targetLevel = this.RPG.playerService.get(quest.targetPlayer).level;
            if (!this.isInGracePeriod(gracePeriods, quest.targetPlayer) && Math.random() < Util.questAssignmentProbability(playerLevel, targetLevel)) {
                this.quests.add(quest);
                conn.SendMessage("Whisper", "(New quest: " + quest.description() + ". If you don't like your target, can't find it or they're busy, you can /bot reroll) ", memberNumber);
                return;
            }

            // Yield to event loop between retries to avoid blocking
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    generateRandomQuest(memberNumber: number): IQuest | null {
        const candidateList = this.chatRoom.characters.filter(
            c => c.MemberNumber !== botMemberNumber && c.MemberNumber !== memberNumber
        );

        if (candidateList.length === 0) return null;

        const target = candidateList.at(Util.getRandomInt(candidateList.length));
        const isTargetSafe = this.RPG.isPlayerSafe.get(target.MemberNumber);
        if (isTargetSafe === undefined || isTargetSafe) return null;

        // Choose a quest type randomly
        const constructor = this.chooseQuestWeighted(questTypes);

        // Instantiate the chosen quest
        const quest = new constructor(this.chatRoom, memberNumber, target.MemberNumber);
        if (quest instanceof ClimaxQuest) {
            if (this.RPG.climaxTracker.get(quest.targetPlayer) === undefined)
                this.RPG.climaxTracker.set(quest.targetPlayer, Date.now() - refractaryPeriod);
            quest.additionalInfo["lastClimaxed"] = this.RPG.climaxTracker.get(quest.targetPlayer);
        }

        // Check prerequisite
        return quest.prerequisite() ? quest : null;
    }

    generateQuestWithTarget(memberNumber: number, targetNumber: number): IQuest | null {
        const target = this.chatRoom.findMember(targetNumber);
        if (!target) return null;

        // Choose a quest type randomly
        const constructor = this.chooseQuestWeighted(questTypes);

        // Instantiate the chosen quest
        const quest = new constructor(this.chatRoom, memberNumber, targetNumber);
        if (quest instanceof ClimaxQuest) {
            if (this.RPG.climaxTracker.get(quest.targetPlayer) === undefined)
                this.RPG.climaxTracker.set(quest.targetPlayer, Date.now() - refractaryPeriod);
            quest.additionalInfo["lastClimaxed"] = this.RPG.climaxTracker.get(quest.targetPlayer);
        }

        // Check prerequisite
        return quest.prerequisite() ? quest : null;
    }

    private chooseQuestWeighted(quests: { constructor: QuestConstructor, weight: number }[]): QuestConstructor {
        const totalWeight = quests.reduce((sum, entry) => sum + entry.weight, 0);
        let rand = Math.random() * totalWeight;

        for (const entry of quests) {
            if (rand < entry.weight) return entry.constructor;
            rand -= entry.weight;
        }

        // Fallback
        return quests[quests.length - 1].constructor;
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
