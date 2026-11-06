import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { API_Character, API_Chatroom, API_Connector } from "bc-bot";
import { QuestManager } from "./QuestManager";
import { IQuest } from "../types/IQuest";
import { PlayerService } from "../service/PlayerService";
import { TargetPriorityService, TargetStatus } from "../service/TargetPriorityService";
import { RPG } from "../../rpg";
import { Player } from "./Player";
import { LockQuest } from "./LockQuest";
import { KidnapQuestBoundMaid } from "./KidnapQuestBoundMaid";
import { ClimaxQuest } from "./ClimaxQuest";
import { mapRegions } from "../util/areas";
import { resetDevRoomPresence } from "../util/devRoomPresence";

function stubQuest(owner: number, targetPlayer: number, additionalInfo: Record<string, unknown> = {}): IQuest {
    return {
        owner,
        targetPlayer,
        additionalInfo,
        failMessage: "",
        chatRoom: {} as API_Chatroom,
        prerequisite: () => true,
        failCondition: () => false,
        requirements: () => [],
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

function fakeMember(memberNumber: number): API_Character {
    return { MemberNumber: memberNumber, IsBot: () => false } as unknown as API_Character;
}

function assignmentHarness(options: {
    hunter: number;
    targetMe?: number;
    catchMe?: number;
    members?: number[];
}) {
    const hunter = options.hunter;
    const targetPriorityService = new TargetPriorityService();
    const playerService = fakePlayerService();
    const members = new Set<number>(options.members ?? [hunter]);
    const rpg = {
        isPlayerSafe: new Map<number, boolean>([[hunter, false]]),
    };

    if (options.targetMe !== undefined) {
        members.add(options.targetMe);
        rpg.isPlayerSafe.set(options.targetMe, false);
        targetPriorityService.setTargetStatus(hunter, options.targetMe, TargetStatus.PRIORITY);
    }
    if (options.catchMe !== undefined) {
        members.add(options.catchMe);
        rpg.isPlayerSafe.set(options.catchMe, false);
        playerService.get(hunter).setPendingCatchMeTarget(options.catchMe);
    }

    const chatRoom = {
        findMember: (memberNumber: number) => members.has(memberNumber) ? fakeMember(memberNumber) : undefined,
        characters: [...members].map(fakeMember),
    } as unknown as API_Chatroom;

    const questManager = new QuestManager(
        chatRoom,
        rpg as unknown as RPG,
        targetPriorityService,
        undefined,
        playerService,
    );
    questManager.generateQuestWithTarget = (owner, target, opts) => {
        if (!chatRoom.findMember(target)) return null;
        if (!opts?.ignoreBlock && questManager.isBlocked(owner, target)) return null;
        const quest = stubQuest(owner, target);
        if (opts?.forcedByTargetMe) quest.additionalInfo.forcedByTargetMe = true;
        return quest;
    };
    questManager.generateRandomQuest = () => null;

    return {
        questManager,
        playerService,
        targetPriorityService,
        rpg,
        chatRoom,
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
        assert.equal(quest?.additionalInfo.forcedByTargetMe, true);
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

    it("assigns targetme even when target is safe dominant or would be blocked by protections", async () => {
        const hunter = 1;
        const targetMe = 2;
        const { questManager, playerService, rpg, conn } = assignmentHarness({
            hunter,
            targetMe,
        });
        rpg.isPlayerSafe.set(targetMe, true);
        playerService.get(targetMe).setIsDominant(true);

        await questManager.assignQuestToPlayer(conn, hunter, new Map(), new Map());

        const quest = questManager.playerHasQuestAssigned(hunter);
        assert.equal(quest?.targetPlayer, targetMe);
        assert.equal(quest?.additionalInfo.forcedByTargetMe, true);
    });

    it("silently drops blocked catchme and assigns nothing when no random", async () => {
        const hunter = 1;
        const catchMe = 3;
        const { questManager, playerService, conn } = assignmentHarness({
            hunter,
            catchMe,
        });
        playerService.get(catchMe).toggleBlocked(hunter);

        const whispers: string[] = [];
        const connSpy = {
            SendMessage(_type: string, text: string) { whispers.push(text); },
        } as unknown as API_Connector;

        await questManager.assignQuestToPlayer(connSpy, hunter, new Map(), new Map());

        assert.equal(questManager.playerHasQuestAssigned(hunter), null);
        assert.equal(playerService.get(hunter).getPendingCatchMeTarget(), null);
        assert.equal(whispers.length, 0);
        void conn;
    });

    it("does not randomly assign targets that already have an arms lock", async () => {
        const hunter = 1;
        const lockedTarget = 2;
        const freeTarget = 3;
        const playerService = fakePlayerService();
        const rpg = { isPlayerSafe: new Map<number, boolean>([[hunter, false], [lockedTarget, false], [freeTarget, false]]) };
        const lockedChar = {
            MemberNumber: lockedTarget,
            IsBot: () => false,
            Appearance: {
                InventoryGet: (group: string) => group === "ItemArms"
                    ? { getData: () => ({ Property: { LockMemberNumber: 99 } }) }
                    : undefined,
            },
            MapPos: { X: 0, Y: 0 },
        };
        const freeChar = {
            MemberNumber: freeTarget,
            IsBot: () => false,
            Appearance: { InventoryGet: () => undefined },
            MapPos: { X: 0, Y: 0 },
        };
        const chatRoom = {
            findMember: (n: number) => n === lockedTarget ? lockedChar : n === freeTarget ? freeChar : n === hunter ? fakeMember(hunter) : undefined,
            characters: [fakeMember(hunter), lockedChar, freeChar],
        } as unknown as API_Chatroom;

        const questManager = new QuestManager(
            chatRoom,
            rpg as unknown as RPG,
            new TargetPriorityService(),
            undefined,
            playerService,
        );

        assert.equal(
            questManager.getCatchMeTargetBlockReason(hunter, lockedTarget, new Map()),
            "locked",
        );
        assert.equal(
            questManager.getCatchMeTargetBlockReason(hunter, freeTarget, new Map()),
            null,
        );
    });
});

describe("dev room quest availability", () => {
    const devRoomPos = {
        X: (mapRegions.DEV_ROOM_AREA.TopLeft.X + mapRegions.DEV_ROOM_AREA.BottomRight.X) / 2,
        Y: (mapRegions.DEV_ROOM_AREA.TopLeft.Y + mapRegions.DEV_ROOM_AREA.BottomRight.Y) / 2,
    };

    it("stays assignable until the same moment existing quests are cancelled", () => {
        const hunter = 1;
        const targetNumber = 2;
        const target = {
            MemberNumber: targetNumber,
            MapPos: { ...devRoomPos },
            Appearance: { InventoryGet: () => undefined },
            IsRestrained: () => false,
            IsLeashed: () => false,
            IsBot: () => false,
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === targetNumber ? target : undefined,
            characters: [target],
        } as unknown as API_Chatroom;
        const playerService = fakePlayerService();
        const rpg = { isPlayerSafe: new Map<number, boolean>([[hunter, false], [targetNumber, false]]) };
        const questManager = new QuestManager(
            chatRoom,
            rpg as unknown as RPG,
            new TargetPriorityService(),
            undefined,
            playerService,
        );
        const quest = new LockQuest(chatRoom, hunter, targetNumber);

        mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
        try {
            assert.equal(quest.failCondition(new Map()), false);

            mock.timers.tick(20_000);
            assert.equal(questManager.getCatchMeTargetBlockReason(hunter, targetNumber, new Map()), null);

            mock.timers.tick(10_000);
            assert.equal(quest.failCondition(new Map()), true);
            assert.equal(questManager.getCatchMeTargetBlockReason(hunter, targetNumber, new Map()), "dev_room");
        } finally {
            mock.timers.reset();
            resetDevRoomPresence();
        }
    });

    it("restarts the delay after the player leaves the admin area", () => {
        const hunter = 11;
        const targetNumber = 12;
        const target = {
            MemberNumber: targetNumber,
            MapPos: { ...devRoomPos },
            Appearance: { InventoryGet: () => undefined },
            IsRestrained: () => false,
            IsLeashed: () => false,
            IsBot: () => false,
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === targetNumber ? target : undefined,
            characters: [target],
        } as unknown as API_Chatroom;
        const questManager = new QuestManager(
            chatRoom,
            { isPlayerSafe: new Map<number, boolean>([[hunter, false], [targetNumber, false]]) } as unknown as RPG,
            new TargetPriorityService(),
            undefined,
            fakePlayerService(),
        );
        const quest = new LockQuest(chatRoom, hunter, targetNumber);

        mock.timers.enable({ apis: ["Date"], now: 2_000_000 });
        try {
            assert.equal(quest.failCondition(new Map()), false);
            mock.timers.tick(20_000);
            target.MapPos = { X: 0, Y: 0 };
            assert.equal(quest.failCondition(new Map()), false);

            target.MapPos = { ...devRoomPos };
            assert.equal(questManager.getCatchMeTargetBlockReason(hunter, targetNumber, new Map()), null);
            mock.timers.tick(20_000);
            assert.equal(questManager.getCatchMeTargetBlockReason(hunter, targetNumber, new Map()), null);
            mock.timers.tick(10_000);
            assert.equal(questManager.getCatchMeTargetBlockReason(hunter, targetNumber, new Map()), "dev_room");
        } finally {
            mock.timers.reset();
            resetDevRoomPresence();
        }
    });
});

describe("AbstractQuest.failCondition forcedByTargetMe", () => {
    it("skips grace and dev room cancel when forced by targetme", () => {
        const target = {
            MemberNumber: 2,
            MapPos: {
                X: (mapRegions.DEV_ROOM_AREA.TopLeft.X + mapRegions.DEV_ROOM_AREA.BottomRight.X) / 2,
                Y: (mapRegions.DEV_ROOM_AREA.TopLeft.Y + mapRegions.DEV_ROOM_AREA.BottomRight.Y) / 2,
            },
            Appearance: { InventoryGet: () => undefined },
            IsRestrained: () => false,
            IsLeashed: () => false,
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === 2 ? target : undefined,
        } as unknown as API_Chatroom;

        const quest = new LockQuest(chatRoom, 1, 2, { forcedByTargetMe: true });
        const gracePeriods = new Map<number, number>([[2, Date.now() + 60_000]]);

        assert.equal(quest.failCondition(gracePeriods), false);
    });

    it("still fails grace for normal quests", () => {
        const target = {
            MemberNumber: 2,
            MapPos: { X: 0, Y: 0 },
            Appearance: { InventoryGet: () => undefined },
            IsRestrained: () => false,
            IsLeashed: () => false,
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === 2 ? target : undefined,
        } as unknown as API_Chatroom;

        const quest = new LockQuest(chatRoom, 1, 2);
        const gracePeriods = new Map<number, number>([[2, Date.now() + 60_000]]);

        assert.equal(quest.failCondition(gracePeriods), true);
    });
});

describe("AbstractQuest.deliveryRequirements", () => {
    it("completes when hunter is in the zone even if target map pos lags", () => {
        const boundMaid = {
            X: (mapRegions.BOUND_MAID_AREA.TopLeft.X + mapRegions.BOUND_MAID_AREA.BottomRight.X) / 2,
            Y: (mapRegions.BOUND_MAID_AREA.TopLeft.Y + mapRegions.BOUND_MAID_AREA.BottomRight.Y) / 2,
        };
        const owner = {
            MemberNumber: 1,
            MapPos: boundMaid,
        } as unknown as API_Character;
        const target = {
            MemberNumber: 2,
            MapPos: { X: 0, Y: 0 },
            IsLeashed: () => true,
            Appearance: {
                InventoryGet: (group: string) => group === "ItemArms"
                    ? { getData: () => ({ Property: { LockMemberNumber: 1 } }) }
                    : undefined,
            },
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === 1 ? owner : n === 2 ? target : undefined,
        } as unknown as API_Chatroom;

        const quest = new KidnapQuestBoundMaid(chatRoom, 1, 2);
        assert.equal(quest.successCondition(), true);
        assert.deepEqual(
            quest.requirements().map(r => ({ label: r.label, met: r.met })),
            [
                { label: "Arms locked by you", met: true },
                { label: "Leashed", met: true },
                { label: "In position", met: true },
            ],
        );
    });

    it("reports unmet delivery requirements separately", () => {
        const target = {
            MemberNumber: 2,
            MapPos: { X: 0, Y: 0 },
            IsLeashed: () => false,
            Appearance: {
                InventoryGet: (group: string) => group === "ItemArms"
                    ? { getData: () => ({ Property: { LockMemberNumber: 1 } }) }
                    : undefined,
            },
        } as unknown as API_Character;
        const chatRoom = {
            findMember: (n: number) => n === 2 ? target : undefined,
        } as unknown as API_Chatroom;

        const quest = new KidnapQuestBoundMaid(chatRoom, 1, 2);
        const requirements = quest.requirements();
        assert.equal(quest.successCondition(), false);
        assert.deepEqual(
            requirements.filter(r => r.met).map(r => r.label),
            ["Arms locked by you"],
        );
        assert.deepEqual(
            requirements.filter(r => !r.met).map(r => r.label),
            ["Leashed", "In position"],
        );
    });
});

describe("ClimaxQuest.requirements", () => {
    it("is unmet until orgasm count is positive", () => {
        const chatRoom = {
            findMember: () => undefined,
        } as unknown as API_Chatroom;
        const quest = new ClimaxQuest(chatRoom, 1, 2);
        assert.deepEqual(quest.requirements(), [{ label: "Target climaxed", met: false }]);
        assert.equal(quest.successCondition(), false);

        quest.additionalInfo["orgasms"] = 1;
        assert.deepEqual(quest.requirements(), [{ label: "Target climaxed", met: true }]);
        assert.equal(quest.successCondition(), true);
    });
});
