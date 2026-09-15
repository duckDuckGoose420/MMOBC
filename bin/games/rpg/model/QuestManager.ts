import { IQuest } from "../types/IQuest";
import { API_Chatroom, API_Connector, positionIsInRegion } from "bc-bot";
import { LockQuest } from "./LockQuest";
import { Util } from "../util/Util";
import { RPG } from "../../rpg";
import { ClimaxQuest, refractaryPeriod } from "./ClimaxQuest";
import { KidnapQuest } from "./KidnapQuest";
import { KidnapQuestBoundMaid } from "./KidnapQuestBoundMaid";
import { TargetPriorityService } from "../service/TargetPriorityService";
import { PrisonQuest } from "./PrisonQuest";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";
import { PlayerService } from "../service/PlayerService";
import { SavedQuest } from "../service/RejoinStateService";
import { mapRegions } from "../util/areas";

const botMemberNumber = 220073;
const questTypes: { constructor: QuestConstructor; weight: number }[] = [
    { constructor: LockQuest, weight: 5 },
    { constructor: ClimaxQuest, weight: 1 },
    { constructor: KidnapQuest, weight: 1 },
    { constructor: KidnapQuestBoundMaid, weight: 2 },
    { constructor: PrisonQuest, weight: 1 }
];

const questConstructors: Record<string, QuestConstructor> = {
    LockQuest,
    ClimaxQuest,
    KidnapQuest,
    KidnapQuestBoundMaid,
    PrisonQuest,
};

type QuestConstructor = new (
    chatRoom: API_Chatroom,
    owner: number,
    target: number,
    additionalInfo?: any,
    performanceMonitor?: PerformanceMonitorService
) => IQuest;

export type CatchMeBlockReason = "dominant" | "blocked" | "grace" | "safe" | "dev_room";

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
    private performanceMonitor: PerformanceMonitorService;
    private playerService: PlayerService;
    private assignedFromTargetMe = new Map<number, number>();

    public constructor(chatroom: API_Chatroom, RPG: RPG, targetPriorityService?: TargetPriorityService, performanceMonitor?: PerformanceMonitorService, playerService?: PlayerService) {
        this.chatRoom = chatroom;
        this.quests = new QuestList();
        this.RPG = RPG;
        this.targetPriorityService = targetPriorityService || new TargetPriorityService();
        this.performanceMonitor = performanceMonitor || new PerformanceMonitorService();
        this.playerService = playerService || new PlayerService(this.performanceMonitor);
    }

    playerHasQuestAssigned(memberNumber: number): IQuest | null {
        for (let q of this.quests.getAll()) {
            if (q.owner == memberNumber)
                return q;
        }
        return null;
    }

    cancelQuests(gracePeriods: Map<number, number>): IQuest[] {
        // Performance monitoring: Track quest cancellation checking
        this.performanceMonitor.incrementCounter('cancelQuests_calls');
        const startTime = this.performanceMonitor.startTimer('cancelQuests');

        const [active, canceled]: [IQuest[], IQuest[]] = [[], []];
        for (const quest of this.quests.getAll()) {
            if (!quest.failCondition(gracePeriods)) {
                active.push(quest);
            } else {
                canceled.push(quest);
            }
        }
        this.quests.set(active);
        for (const quest of canceled) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }

        this.performanceMonitor.endTimer('cancelQuests', startTime);
        return canceled;
    }

    cancelQuestForPlayer(memberNumber: number, conn?: API_Connector, ownerDisplayName?: string): boolean {
        const quest = this.playerHasQuestAssigned(memberNumber);
        if (!quest) return false;
        const index = this.quests.getAll().findIndex(q => q.owner === memberNumber);
        this.quests.removeAt(index);
        if (conn) {
            this.notifyPriorityTargetLost(conn, quest.owner, quest.targetPlayer, ownerDisplayName);
        } else {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }
        return true;
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
        for (const quest of removedQuests) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }
        return removedQuests;
    }

    assignQuests(conn: API_Connector, questCD: Map<number, number>, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        // Performance monitoring: Track quest assignment
        this.performanceMonitor.incrementCounter('assignQuests_calls');
        const startTime = this.performanceMonitor.startTimer('assignQuests');

        this.chatRoom.characters.forEach((character) => {
            if (!this.playerHasQuestAssigned(character.MemberNumber) && this.RPG.isPlayerSafe.get(character.MemberNumber) == false && !this.isQuestAssignmentInCD(questCD, character.MemberNumber)) {
                this.assignQuestToPlayer(conn, character.MemberNumber, gracePeriods, lastTargetBeforeReroll);
            }
        });

        this.performanceMonitor.endTimer('assignQuests', startTime);
    }

    async assignQuestToPlayer(conn: API_Connector, memberNumber: number, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): Promise<void> {
        // Performance monitoring: Track individual quest assignment attempts
        this.performanceMonitor.incrementCounter('assignQuestToPlayer_calls');

        const maxAttempts = 10;

        const catchMeQuest = this.consumeAndTryCatchMeQuest(memberNumber, gracePeriods);
        if (catchMeQuest) {
            this.quests.add(catchMeQuest);
            conn.SendMessage("Whisper", "(New quest: " + catchMeQuest.description() + ". If you don't like your target, can't find it or they're busy, you can /bot reroll) ", memberNumber);
            return;
        }

        // First, try to assign quest with priority targets
        const priorityTargets = this.targetPriorityService.getPriorityTargets(memberNumber);
        if (priorityTargets.length > 0) {
            for (const targetNumber of priorityTargets) {
                // Check if target is blocked
                if (this.arePlayersBlocked(memberNumber, targetNumber)) {
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

                if (this.isUnavailableAsQuestTarget(targetNumber)) {
                    continue;
                }

                // Try to generate quest with this priority target
                const quest = this.generateQuestWithTarget(memberNumber, targetNumber);
                if (quest && quest.prerequisite()) {
                    this.quests.add(quest);
                    conn.SendMessage("Whisper", "(New quest: " + quest.description() + ". If you don't like your target, can't find it or they're busy, you can /bot reroll) ", memberNumber);
                    this.notifyPriorityTargetAssigned(conn, memberNumber, targetNumber);
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
            if (this.arePlayersBlocked(memberNumber, quest.targetPlayer)) {
                continue;
            }

            if (!this.isInGracePeriod(gracePeriods, quest.targetPlayer)) {
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
            c => c.MemberNumber !== botMemberNumber
                && c.MemberNumber !== memberNumber
                && !this.arePlayersBlocked(memberNumber, c.MemberNumber)
        );

        if (candidateList.length === 0) return null;

        const target = candidateList.at(Util.getRandomInt(candidateList.length));
        const isTargetSafe = this.RPG.isPlayerSafe.get(target.MemberNumber);
        if (isTargetSafe === undefined || isTargetSafe) return null;

        if (this.isUnavailableAsQuestTarget(target.MemberNumber)) return null;

        // Choose a quest type randomly
        const constructor = this.chooseQuestWeighted(questTypes);

        // Instantiate the chosen quest
        const quest = new constructor(this.chatRoom, memberNumber, target.MemberNumber, undefined, this.performanceMonitor);
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
        if (this.arePlayersBlocked(memberNumber, targetNumber)) return null;

        // Choose a quest type randomly
        const constructor = this.chooseQuestWeighted(questTypes);

        // Instantiate the chosen quest
        const quest = new constructor(this.chatRoom, memberNumber, targetNumber, undefined, this.performanceMonitor);
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
        // Performance monitoring: Track quest completion checking
        this.performanceMonitor.incrementCounter('completeQuests_calls');
        const startTime = this.performanceMonitor.startTimer('completeQuests');

        const [active, completed]: [IQuest[], IQuest[]] = [[], []];
        for (const quest of this.quests.getAll()) {
            if (!quest.successCondition()) {
                active.push(quest);
            } else {
                completed.push(quest);
            }
        }
        this.quests.set(active);
        for (const quest of completed) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }

        this.performanceMonitor.endTimer('completeQuests', startTime);
        return completed;
    }

    completeQuestForPlayer(memberNumber: number): IQuest | null {
        const quest = this.playerHasQuestAssigned(memberNumber);
        if (!quest) return null;
        const index = this.quests.getAll().findIndex(q => q.owner === memberNumber);
        this.quests.removeAt(index);
        this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        return quest;
    }

    getCatchMeTargetBlockReason(hunterNumber: number, baitNumber: number, gracePeriods: Map<number, number>): CatchMeBlockReason | null {
        if (this.arePlayersBlocked(hunterNumber, baitNumber)) return "blocked";
        if (this.isInGracePeriod(gracePeriods, baitNumber)) return "grace";
        const isTargetSafe = this.RPG.isPlayerSafe.get(baitNumber);
        if (isTargetSafe === undefined || isTargetSafe) return "safe";
        if (this.playerService.get(baitNumber).getIsDominant()) return "dominant";
        const character = this.chatRoom.findMember(baitNumber);
        if (character && positionIsInRegion(character.MapPos, mapRegions.DEV_ROOM_AREA)) return "dev_room";
        return null;
    }

    private consumeAndTryCatchMeQuest(memberNumber: number, gracePeriods: Map<number, number>): IQuest | null {
        const hunter = this.playerService.get(memberNumber);
        const forcedTarget = hunter.getPendingCatchMeTarget();
        if (forcedTarget === null) return null;

        hunter.setPendingCatchMeTarget(null);
        this.playerService.save(hunter);

        if (this.getCatchMeTargetBlockReason(memberNumber, forcedTarget, gracePeriods)) return null;

        const quest = this.generateQuestWithTarget(memberNumber, forcedTarget);
        if (quest && quest.prerequisite()) return quest;
        return null;
    }

    private notifyPriorityTargetAssigned(conn: API_Connector, ownerNumber: number, targetNumber: number): void {
        this.targetPriorityService.removePriority(ownerNumber, targetNumber);
        this.assignedFromTargetMe.set(ownerNumber, targetNumber);
        const owner = this.chatRoom.findMember(ownerNumber);
        const ownerName = owner ? owner.toString() : `#${ownerNumber}`;
        conn.SendMessage("Whisper", `(${ownerName} now has you as a target)`, targetNumber);
    }

    private notifyPriorityTargetLost(conn: API_Connector, ownerNumber: number, targetNumber: number, ownerDisplayName?: string): void {
        if (!this.clearTargetMeAssignment(ownerNumber, targetNumber)) return;
        if (!this.chatRoom.findMember(targetNumber)) return;
        const owner = this.chatRoom.findMember(ownerNumber);
        const ownerName = ownerDisplayName ?? (owner ? owner.toString() : `#${ownerNumber}`);
        conn.SendMessage("Whisper", `(${ownerName} no longer has you as a target)`, targetNumber);
    }

    private clearTargetMeAssignment(ownerNumber: number, targetNumber: number): boolean {
        if (this.assignedFromTargetMe.get(ownerNumber) !== targetNumber) return false;
        this.assignedFromTargetMe.delete(ownerNumber);
        return true;
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

    private isUnavailableAsQuestTarget(memberNumber: number): boolean {
        if (this.playerService.get(memberNumber).getIsDominant()) return true;
        const character = this.chatRoom.findMember(memberNumber);
        return !!character && positionIsInRegion(character.MapPos, mapRegions.DEV_ROOM_AREA);
    }

    private arePlayersBlocked(owner: number, target: number): boolean {
        if (this.targetPriorityService.isBlocked(owner, target)) {
            return true;
        }
        return this.playerService.get(owner).hasBlocked(target) || this.playerService.get(target).hasBlocked(owner);
    }

    serializeQuests(): SavedQuest[] {
        return this.quests.getAll().map((quest) => ({
            type: this.getQuestTypeName(quest),
            owner: quest.owner,
            targetPlayer: quest.targetPlayer,
            additionalInfo: quest.additionalInfo ?? {},
        }));
    }

    restoreQuests(saved: SavedQuest[]): void {
        this.quests.set([]);
        for (const entry of saved) {
            const constructor = questConstructors[entry.type];
            if (!constructor) continue;
            const quest = new constructor(
                this.chatRoom,
                entry.owner,
                entry.targetPlayer,
                entry.additionalInfo,
                this.performanceMonitor,
            );
            this.quests.add(quest);
        }
    }

    private getQuestTypeName(quest: IQuest): string {
        if (quest instanceof LockQuest) return "LockQuest";
        if (quest instanceof ClimaxQuest) return "ClimaxQuest";
        if (quest instanceof KidnapQuest) return "KidnapQuest";
        if (quest instanceof KidnapQuestBoundMaid) return "KidnapQuestBoundMaid";
        if (quest instanceof PrisonQuest) return "PrisonQuest";
        return quest.constructor.name;
    }
}
