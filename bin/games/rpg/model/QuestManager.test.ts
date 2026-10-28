import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { API_Chatroom, API_Connector } from "bc-bot";
import { QuestManager } from "./QuestManager";
import { IQuest } from "../types/IQuest";
import { PlayerService } from "../service/PlayerService";
import { TargetPriorityService, TargetStatus } from "../service/TargetPriorityService";
import { RPG } from "../../rpg";
import { Player } from "./Player";

function stubQuest(owner: number, targetPlayer: number): IQuest {
    return {
        owner,
        targetPlayer,
        additionalInfo: null,
        failMessage: "",
        chatRoom: {} as API_Chatroom,
        prerequisite: () => true,
        failCondition: () => false,
        successCondition: () => false,
        bonus: () => false,
        description: () => "stub",
    };
}

function fakePlayerService(): PlayerService {
    const players = new Map<number, Player>();
    return {
        get(memberNumber: number) {
            if (!players.has(memberNumber)) {
                players.set(memberNumber, new Player(memberNumber));
            }
            return players.get(memberNumber)!;
        },
        save() {},
    } as unknown as PlayerService;
}

function assignmentHarness(options: {
    hunter: number;
    targetMe?: number;
    catchMe?: number;
}) {
    const hunter = options.hunter;
    const targetPriorityService = new TargetPriorityService();
    const playerService = fakePlayerService();
    const rpg = {
        isPlayerSafe: new Map<number, boolean>([[hunter, false]]),
    };

    if (options.targetMe !== undefined) {
        rpg.isPlayerSafe.set(options.targetMe, false);
        targetPriorityService.setTargetStatus(hunter, options.targetMe, TargetStatus.PRIORITY);
    }
    if (options.catchMe !== undefined) {
        rpg.isPlayerSafe.set(options.catchMe, false);
        playerService.get(hunter).setPendingCatchMeTarget(options.catchMe);
    }

    const questManager = new QuestManager(
        { findMember: () => undefined } as unknown as API_Chatroom,
        rpg as unknown as RPG,
        targetPriorityService,
        undefined,
        playerService,
    );
    questManager.generateQuestWithTarget = (owner, target) => stubQuest(owner, target);
    questManager.generateRandomQuest = () => null;

    return {
        questManager,
        playerService,
        conn: { SendMessage() {} } as unknown as API_Connector,
    };
}

describe("QuestManager.completeQuestForPlayer", () => {
    it("removes the player's quest and returns it", () => {
        const questManager = new QuestManager({} as API_Chatroom, {} as ConstructorParameters<typeof QuestManager>[1]);
        const quest = stubQuest(123, 456);
        questManager.quests.add(quest);

        const completed = questManager.completeQuestForPlayer(123);

        assert.equal(completed, quest);
        assert.equal(questManager.playerHasQuestAssigned(123), null);
        assert.equal(questManager.quests.count(), 0);
    });

    it("returns null when the player has no quest", () => {
        const questManager = new QuestManager({} as API_Chatroom, {} as ConstructorParameters<typeof QuestManager>[1]);
        questManager.quests.add(stubQuest(123, 456));

        assert.equal(questManager.completeQuestForPlayer(999), null);
        assert.ok(questManager.playerHasQuestAssigned(123));
        assert.equal(questManager.quests.count(), 1);
    });
});

describe("QuestManager.assignQuestToPlayer priority order", () => {
    it("assigns targetme before catchme", async () => {
        const hunter = 1;
        const targetMe = 2;
        const catchMe = 3;
        const { questManager, playerService, conn } = assignmentHarness({
            hunter,
            targetMe,
            catchMe,
        });

        await questManager.assignQuestToPlayer(conn, hunter, new Map(), new Map());

        const quest = questManager.playerHasQuestAssigned(hunter);
        assert.equal(quest?.targetPlayer, targetMe);
        assert.equal(playerService.get(hunter).getPendingCatchMeTarget(), catchMe);
    });

    it("assigns catchme last in last out after targetme is gone", async () => {
        const hunter = 1;
        const catchMe = 3;
        const { questManager, playerService, conn } = assignmentHarness({
            hunter,
            catchMe,
        });

        await questManager.assignQuestToPlayer(conn, hunter, new Map(), new Map());

        const quest = questManager.playerHasQuestAssigned(hunter);
        assert.equal(quest?.targetPlayer, catchMe);
        assert.equal(playerService.get(hunter).getPendingCatchMeTarget(), null);
    });
});
