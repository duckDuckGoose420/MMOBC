import { IQuest } from "../types/IQuest";
import { IPlayer } from "../types/IPlayer";
import { API_Character, API_Chatroom, API_Connector, positionIsInRegion } from "bc-bot";
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
    additionalInfo?: any
) => IQuest;

const NEW_QUEST_HINT = ". If you don't like your target, can't find it or they're busy, you can /bot reroll) ";

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

    findByOwner(owner: number): IQuest | null {
        return this.quests.find(q => q.owner === owner) ?? null;
    }

    removeByOwner(owner: number): IQuest | null {
        const index = this.quests.findIndex(q => q.owner === owner);
        if (index === -1) return null;
        return this.quests.splice(index, 1)[0];
    }

    partition(predicate: (quest: IQuest) => boolean): [IQuest[], IQuest[]] {
        const matching: IQuest[] = [];
        const rest: IQuest[] = [];
        for (const quest of this.quests) {
            (predicate(quest) ? matching : rest).push(quest);
        }
        return [matching, rest];
    }

    owners(): Set<number> {
        return new Set(this.quests.map(q => q.owner));
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
        return this.quests.findByOwner(memberNumber);
    }

    cancelQuests(gracePeriods: Map<number, number>): IQuest[] {
        const startTime = this.performanceMonitor.startTimer();

        const [canceled, active] = this.quests.partition(quest => quest.failCondition(gracePeriods));
        this.quests.set(active);
        for (const quest of canceled) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }

        this.performanceMonitor.endTimer('cancelQuests', startTime);
        return canceled;
    }

    cancelQuestForPlayer(memberNumber: number, conn?: API_Connector, ownerDisplayName?: string): boolean {
        const quest = this.quests.removeByOwner(memberNumber);
        if (!quest) return false;
        if (conn) {
            this.notifyPriorityTargetLost(conn, quest.owner, quest.targetPlayer, ownerDisplayName);
        } else {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }
        return true;
    }

    cancelQuestsByTarget(targetNumber: number): IQuest[] {
        const [removedQuests, remainingQuests] = this.quests.partition(quest => quest.targetPlayer === targetNumber);
        this.quests.set(remainingQuests);
        for (const quest of removedQuests) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }
        return removedQuests;
    }

    assignQuests(conn: API_Connector, questCD: Map<number, number>, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        const startTime = this.performanceMonitor.startTimer();

        const owners = this.quests.owners();
        for (const character of this.chatRoom.characters) {
            const memberNumber = character.MemberNumber;
            if (owners.has(memberNumber)) continue;
            if (this.RPG.isPlayerSafe.get(memberNumber) !== false) continue;
            if (this.isQuestAssignmentInCD(questCD, memberNumber)) continue;
            this.assignQuestToPlayer(conn, memberNumber, gracePeriods, lastTargetBeforeReroll);
        }

        this.performanceMonitor.endTimer('assignQuests', startTime);
    }

    assignQuestToPlayer(conn: API_Connector, memberNumber: number, gracePeriods: Map<number, number>, lastTargetBeforeReroll: Map<number, number>): void {
        this.performanceMonitor.incrementCounter('assignQuestToPlayer_calls');

        const hunter = this.playerService.get(memberNumber);

        // First, try to assign quest with priority targets
        for (const targetNumber of this.targetPriorityService.getPriorityTargets(memberNumber)) {
            if (this.getTargetBlockReason(memberNumber, targetNumber, gracePeriods, hunter)) continue;

            const quest = this.generateQuestWithTarget(memberNumber, targetNumber);
            if (quest) {
                this.quests.add(quest);
                conn.SendMessage("Whisper", "(New quest: " + quest.description() + NEW_QUEST_HINT, memberNumber);
                this.notifyPriorityTargetAssigned(conn, memberNumber, targetNumber);
                return;
            }
        }

        const catchMeQuest = this.consumeAndTryCatchMeQuest(hunter, gracePeriods);
        if (catchMeQuest) {
            this.quests.add(catchMeQuest);
            conn.SendMessage("Whisper", "(New quest: " + catchMeQuest.description() + NEW_QUEST_HINT, memberNumber);
            return;
        }

        // If no priority target worked, try normal quest generation
        const quest = this.generateRandomQuest(memberNumber, gracePeriods, lastTargetBeforeReroll.get(memberNumber), hunter);
        if (quest) {
            this.quests.add(quest);
            conn.SendMessage("Whisper", "(New quest: " + quest.description() + NEW_QUEST_HINT, memberNumber);
        }
    }

    generateRandomQuest(
        memberNumber: number,
        gracePeriods: Map<number, number> = new Map(),
        excludedTarget?: number,
        hunter: IPlayer = this.playerService.get(memberNumber),
    ): IQuest | null {
        const candidateList = this.chatRoom.characters.filter(
            c => !c.IsBot()
                && c.MemberNumber !== memberNumber
                && c.MemberNumber !== excludedTarget
                && !this.getTargetBlockReason(memberNumber, c.MemberNumber, gracePeriods, hunter, c)
        );

        // Each candidate gets a few tries so a failed prerequisite (e.g. already restrained) does not waste the whole loop
        const maxAttempts = Math.min(candidateList.length * 2, 10);
        for (let i = 0; i < maxAttempts; i++) {
            const target = candidateList[Util.getRandomInt(candidateList.length)];
            const quest = this.buildQuest(memberNumber, target.MemberNumber);
            if (quest) return quest;
        }
        return null;
    }

    generateQuestWithTarget(memberNumber: number, targetNumber: number): IQuest | null {
        if (!this.chatRoom.findMember(targetNumber)) return null;
        if (this.arePlayersBlocked(memberNumber, targetNumber)) return null;
        return this.buildQuest(memberNumber, targetNumber);
    }

    private buildQuest(memberNumber: number, targetNumber: number): IQuest | null {
        const constructor = this.chooseQuestWeighted(questTypes);
        const quest = new constructor(this.chatRoom, memberNumber, targetNumber);
        if (quest instanceof ClimaxQuest) {
            if (this.RPG.climaxTracker.get(quest.targetPlayer) === undefined)
                this.RPG.climaxTracker.set(quest.targetPlayer, Date.now() - refractaryPeriod);
            quest.additionalInfo["lastClimaxed"] = this.RPG.climaxTracker.get(quest.targetPlayer);
        }
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
        const startTime = this.performanceMonitor.startTimer();

        const [completed, active] = this.quests.partition(quest => quest.successCondition());
        this.quests.set(active);
        for (const quest of completed) {
            this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        }

        this.performanceMonitor.endTimer('completeQuests', startTime);
        return completed;
    }

    completeQuestForPlayer(memberNumber: number): IQuest | null {
        const quest = this.quests.removeByOwner(memberNumber);
        if (!quest) return null;
        this.clearTargetMeAssignment(quest.owner, quest.targetPlayer);
        return quest;
    }

    getCatchMeTargetBlockReason(hunterNumber: number, baitNumber: number, gracePeriods: Map<number, number>): CatchMeBlockReason | null {
        return this.getTargetBlockReason(hunterNumber, baitNumber, gracePeriods);
    }

    private getTargetBlockReason(
        hunterNumber: number,
        targetNumber: number,
        gracePeriods: Map<number, number>,
        hunter: IPlayer = this.playerService.get(hunterNumber),
        target: API_Character | undefined = this.chatRoom.findMember(targetNumber),
    ): CatchMeBlockReason | null {
        const targetPlayer = this.playerService.get(targetNumber);
        if (this.arePlayersBlocked(hunterNumber, targetNumber, hunter, targetPlayer)) return "blocked";
        if (this.isInGracePeriod(gracePeriods, targetNumber)) return "grace";
        if (this.RPG.isPlayerSafe.get(targetNumber) !== false) return "safe";
        if (targetPlayer.getIsDominant()) return "dominant";
        if (target && positionIsInRegion(target.MapPos, mapRegions.DEV_ROOM_AREA)) return "dev_room";
        return null;
    }

    private consumeAndTryCatchMeQuest(hunter: IPlayer, gracePeriods: Map<number, number>): IQuest | null {
        const forcedTarget = hunter.getPendingCatchMeTarget();
        if (forcedTarget === null) return null;

        hunter.setPendingCatchMeTarget(null);
        this.playerService.save(hunter);

        if (this.getTargetBlockReason(hunter.memberNumber, forcedTarget, gracePeriods, hunter)) return null;

        return this.generateQuestWithTarget(hunter.memberNumber, forcedTarget);
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

    private isQuestAssignmentInCD(questCD: Map<number, number>, memberNumber: number): boolean {
        const CD = questCD.get(memberNumber);
        return CD !== undefined && CD >= Date.now();
    }

    private isInGracePeriod(gracePeriods: Map<number, number>, targetPlayer: number): boolean {
        const grace = gracePeriods.get(targetPlayer);
        return Boolean(grace) && Date.now() < grace;
    }

    private arePlayersBlocked(
        owner: number,
        target: number,
        ownerPlayer: IPlayer = this.playerService.get(owner),
        targetPlayer: IPlayer = this.playerService.get(target),
    ): boolean {
        if (this.targetPriorityService.isBlocked(owner, target)) {
            return true;
        }
        return ownerPlayer.hasBlocked(target) || targetPlayer.hasBlocked(owner);
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
            this.quests.add(new constructor(
                this.chatRoom,
                entry.owner,
                entry.targetPlayer,
                entry.additionalInfo,
            ));
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
