/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { API_Character, API_Connector, API_Message, BC_Server_ChatRoomMessage, CommandParser, ItemPermissionLevel, MapRegion, positionIsInRegion } from "bc-bot";
import { decompressFromBase64 } from "lz-string";
import { remainingTimeString } from "../utils";
import mapConfig from "./rpg/config/map.config.json";
import { QuestManager } from "./rpg/model/QuestManager";
import { PlayerService } from "./rpg/service/PlayerService";
import { Util } from "./rpg/util/Util";
import { PrivateRequest } from "./rpg/types/PrivateRequest";
import { FeedbackService } from "./rpg/service/FeedbackService";
import { TargetPriorityService, TargetStatus } from "./rpg/service/TargetPriorityService";
import { PrisonService, shouldImprison } from "./rpg/service/PrisonService";
import { PlayerIdentifier } from "./rpg/util/PlayerIdentifier";
import { PlayerCommands } from "./rpg/util/commands";
import { mapRegions } from "./rpg/util/areas";
import { PET_EARS, PrisonItem } from "./rpg/objects/items";
import { PerformanceMonitorService } from "./rpg/service/PerformanceMonitorService";
import { AutoMessageService } from "./rpg/service/AutoMessageService";
import { RejoinStateService, mapToRecord, recordToMap, setToArray, arrayToSet, booleanMapToRecord, recordToBooleanMap, privateRequestsToRecord, recordToPrivateRequests } from "./rpg/service/RejoinStateService";

const MAP = mapConfig.EncodedMap;
const botXPos = 2;
const botYPos = 18;



const REROLL_CD = 3 * 60 * 1000;
const GRACE_PERIOD = 20 * 60 * 1000;
const PRIVATE_CONFIRMATION_DURATION = 2 * 60 * 1000;
const BOUNTY_EVENT_SUCCESS_CD = 60 * 60 * 1000;
const BOUNTY_EVENT_REATTEMPT_CD = 60 * 60 * 1000;

const PRIVATE_ROOM_COST = 100;
const PRISON_DURATION = 5 * 60 * 1000; // 5 Minuten
const PRISON_RELEASE_COST = 250; // Kosten für Freikauf
const PRIVATE_ROOM_SPAWN_1: ChatRoomMapPos = { X: 19, Y: 3 };
const PRIVATE_ROOM_SPAWN_2: ChatRoomMapPos = { X: 20, Y: 3 };
const DEV_ROOM_KICK_POS: ChatRoomMapPos = { X: 4, Y: 16 };
const PLAYER_INIT_DELAY_MS = 750;



export class RPG {
    isPlayerSafe: Map<number, boolean> = new Map<number, boolean>();
    private bounties: Map<number, number> = new Map<number, number>();
    private lastTargetBeforeReroll: Map<number, number> = new Map<number, number>();
    private privatePlayRequests: Map<number, PrivateRequest> = new Map<number, PrivateRequest>();   // To note that the player who receives the request is used as key here
    private alreadyEnteredBoundMaid: Set<number> = new Set();
    private alreadyEnteredIntroduction: Set<number> = new Set();
    private hasLeftSpawnSafeArea: Set<number> = new Set();
    private processedPlayers: Set<number> = new Set();
    private closedPermissionNotifiedPlayers: Set<number> = new Set();
    private playerInitInProgress = false;
    private rerollCD = new Map<number, number>();
    private questCD = new Map<number, number>();
    private gracePeriods = new Map<number, number>();
    climaxTracker = new Map<number, number>();
    private questManager: QuestManager;
    playerService: PlayerService;
    private feedbackService: FeedbackService = new FeedbackService();
    private targetPriorityService: TargetPriorityService = new TargetPriorityService();
    private prisonService: PrisonService = new PrisonService();
    private rejoinStateService: RejoinStateService = new RejoinStateService();
    private performanceMonitor: PerformanceMonitorService = new PerformanceMonitorService();
    private autoMessageService: AutoMessageService;
    public commands: PlayerCommands;
    private runLoopInterval?: ReturnType<typeof setInterval>;
    private performanceSaveInterval?: ReturnType<typeof setInterval>;
    private shuttingDown = false;
    public static description = [
        "This is a WIP for a quest based bondage room.",
        "","",
        "CURRENTLY LOOKING FOR MAP DESIGNERS! - contact subMe or use the /bot feedback function if you want to help out!",
        "","",
        "Commands:",
        "",
        "/bot help - Will show these commands",
        "/bot quest - Check the quest currently assigned to you",
        "/bot reroll - Cancel your current quest, you can use this every 3 mins",
        "/bot pay [player] [amount] - Example /bot pay 12345 200 will transfer 200 money from you to player 12345",
        "/bot stats - Check your money, XP and level",
        "/bot inventory - List your virtual items",
        "/bot use [item] [player] - Use an item from your inventory. Player is optional for release",
        "/bot shop - Open the shop (only in the shop area)",
        "/bot buy [item] [count] - Buy an item from the shop",
        "/bot sell [item] [count] - Sell an item to the shop",
        "/bot bounty - List all active bounties",
        "/bot bounty [player] [bounty] - Example: /bot bounty 12345 500 to put a bounty of 500 money on the member 12345. The first person to lock the target's arms with a lock will earn the money.",
        "Tip: You have the option put a bounty on yourself and the first person who catches you will get the reward",
        "/bot levelup - Check your XP progress and how leveling works",
        "/bot buy prisonrelease - Cost: 250 money, buy your freedom from prison",
        "/bot prisontime - Check how much time you have left in prison",
        "",
        "Private room commands:",
        "/bot private buy [player]t 100: Buy access to the private room so you can play with someone without interference from other players",
        "/bot private claim [player]d a quest recently, you can access the private room for free with this command instead",
        "/bot private confirm - When someone offers you to join them in the private room you'll be prompted to insert this command to accept",
        "/bot private rescue - If you get stuck inside the private room for some reason, you can use this command to forcibly leave the room",
        "/bot private check - It will tell you if the private room is empty, in case you want to use it",
        "",
        "/bot settings - Configure your grace period (0-20 minutes, max 20) after completing quests",
        "/bot block [player] - Toggle blocking a player so you are not assigned as quest targets for each other. Use Member Number if they are not in the room",
        "/bot friend - Send a friend request so you can see when the bot is online",
        "",
        "/bot feedback [your message] - ",
        "Use this command to send suggestions, advice, complaints, bug reports, or anything else you'd like me to see. I'll read every message as soon as possible. Constructive criticism is welcome and helpful - just keep it polite.",
        "Important: Your current name and member number will be saved with your message for context. If that's not something you're comfortable with, feel free to skip leaving feedback.",
        "",
        "",
        "Things on my todo list:",
        "Asylum",
        "",
        "Developed with https://github.com/FriendsOfBC/ropeybot",
        "",
        "Code available at: https://github.com/duckDuckGoose420/MMOBC",
        "Feedback reviews: https://github.com/duckDuckGoose420/MMOBC/issues",
        "Huge credits to the original creator on whos project im expanding this on: https://github.com/BufaloAcquatico/MMOBC"
    ].join("\n");

    public constructor(
        private conn: API_Connector,
        private requestRestart?: () => Promise<void>,
        private superusers: number[] = [],
    ) {
        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);
        this.conn.on("Message", this.onMessage.bind(this));
        this.conn.on("CharacterLeft", this.onCharacterLeft);
        //this.conn.on("ServerLeave", this.onServerLeave);

        this.playerService = new PlayerService(this.performanceMonitor);
        this.autoMessageService = new AutoMessageService(this.conn);
        this.questManager = new QuestManager(conn.chatRoom!, this, this.targetPriorityService, this.performanceMonitor, this.playerService);
        this.commands = new PlayerCommands(
            this.conn,
            this.playerService,
            this.questManager,
            this.feedbackService,
            this.targetPriorityService,
            this.prisonService,
            this.isPlayerSafe,
            this.rerollCD,
            this.questCD,
            this.gracePeriods,
            this.bounties,
            this.privatePlayRequests,
            this.lastTargetBeforeReroll,
            this.performanceMonitor,
            this.autoMessageService,
            this.superusers,
            this.requestRestart,
        );

        setTimeout(this.bountyEvent.bind(this), BOUNTY_EVENT_SUCCESS_CD);
    }

    public async init(): Promise<void> {

        await this.setupRoom();
        await this.setupCharacter();
        this.restoreRejoinState();
        this.runLoopInterval = setInterval(() => this.runLoop(), 10000);

        this.performanceSaveInterval = setInterval(() => {
            this.performanceMonitor.saveToFile();
        }, 5 * 60 * 1000);

        this.autoMessageService.start();
    }

    public async shutdown(forRestart = false): Promise<void> {
        if (this.shuttingDown) return;
        this.shuttingDown = true;

        if (this.runLoopInterval) clearInterval(this.runLoopInterval);
        if (this.performanceSaveInterval) clearInterval(this.performanceSaveInterval);
        this.autoMessageService.stop();

        if (forRestart) {
            this.saveRejoinState();
        } else {
            this.rejoinStateService.clear();
        }

        for (const character of this.conn.chatRoom.characters) {
            if (character.IsBot()) continue;
            character.giveKey(["gold", "silver", "bronze"]);
        }

        this.prisonService.save();
        await this.updateMapOnShutdown();

        if (!forRestart) {
            this.unlistRoomOnShutdown();
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private unlistRoomOnShutdown(): void {
        this.conn.ChatRoomUpdate({
            Visibility: ["Admin", "Whitelist"],
        });
        const offlineNotice = "(The bot is now offline and the room is private.)";
        for (let i = 0; i < 3; i++) {
            this.conn.SendMessage("Chat", offlineNotice);
        }
    }

    private async updateMapOnShutdown(): Promise<void> {
        // placeholder - map update on shutdown not yet implemented
    }

    private saveRejoinState(): void {
        this.rejoinStateService.save({
            quests: this.questManager.serializeQuests(),
            gracePeriods: mapToRecord(this.gracePeriods),
            questCD: mapToRecord(this.questCD),
            climaxTracker: mapToRecord(this.climaxTracker),
            bounties: mapToRecord(this.bounties),
            rerollCD: mapToRecord(this.rerollCD),
            lastTargetBeforeReroll: mapToRecord(this.lastTargetBeforeReroll),
            isPlayerSafe: booleanMapToRecord(this.isPlayerSafe),
            targetPriorities: this.targetPriorityService.serialize(),
            pendingCatchMeTargets: this.playerService.serializePendingCatchMe(),
            privatePlayRequests: privateRequestsToRecord(this.privatePlayRequests),
            alreadyEnteredBoundMaid: setToArray(this.alreadyEnteredBoundMaid),
            alreadyEnteredIntroduction: setToArray(this.alreadyEnteredIntroduction),
            hasLeftSpawnSafeArea: setToArray(this.hasLeftSpawnSafeArea),
            processedPlayers: setToArray(this.processedPlayers),
            closedPermissionNotifiedPlayers: setToArray(this.closedPermissionNotifiedPlayers),
        });
    }

    private restoreRejoinState(): void {
        const state = this.rejoinStateService.load();
        if (!state) return;

        this.questManager.restoreQuests(state.quests);
        recordToMap(state.gracePeriods ?? {}, this.gracePeriods);
        recordToMap(state.questCD ?? {}, this.questCD);
        recordToMap(state.climaxTracker ?? {}, this.climaxTracker);
        recordToMap(state.bounties ?? {}, this.bounties);
        recordToMap(state.rerollCD ?? {}, this.rerollCD);
        recordToMap(state.lastTargetBeforeReroll ?? {}, this.lastTargetBeforeReroll);
        recordToBooleanMap(state.isPlayerSafe ?? {}, this.isPlayerSafe);
        this.targetPriorityService.restore(state.targetPriorities ?? {});
        this.playerService.restorePendingCatchMe(state.pendingCatchMeTargets ?? {});
        recordToPrivateRequests(state.privatePlayRequests ?? {}, this.privatePlayRequests);
        arrayToSet(state.alreadyEnteredBoundMaid ?? [], this.alreadyEnteredBoundMaid);
        arrayToSet(state.alreadyEnteredIntroduction ?? [], this.alreadyEnteredIntroduction);
        arrayToSet(state.hasLeftSpawnSafeArea ?? [], this.hasLeftSpawnSafeArea);
        arrayToSet(state.processedPlayers ?? [], this.processedPlayers);
        arrayToSet(state.closedPermissionNotifiedPlayers ?? [], this.closedPermissionNotifiedPlayers);
        this.rejoinStateService.clear();
    }

    private onChatRoomCreated = async () => {
        await this.setupRoom();
        await this.setupCharacter();
    };

    private onChatRoomJoined = async () => {
        await this.setupCharacter();
    };
    private setupCharacter = async () => {
        this.conn.moveOnMap(botXPos, botYPos);
    };

    private setupRoom = async () => {
        try {
            this.conn.chatRoom.map.mapData.Fog = true;
            this.conn.chatRoom.map.setMapFromData(
                JSON.parse(decompressFromBase64(MAP)),
            );

        } catch (e) {
            console.log("Map data not loaded", e);
        }

        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.ENTER_INTRODUCTION_AREA,
            this.onEnterIntroductionArea.bind(this)
        );
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            mapRegions.ENTER_INTRODUCTION_AREA,
            this.onLeaveIntroductionArea.bind(this)
        );

        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.PRIVATE_ROOM_AREA,
            this.onEnterSafeArea.bind(this)
        );
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            mapRegions.PRIVATE_ROOM_AREA,
            this.onLeaveSafeArea.bind(this)
        );

        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.BOUND_MAID_AREA,
            this.onEnterBoundMaid.bind(this)
        );
        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.PRISON_INTAKE_AREA,
            this.onEnterPrisonIntakeArea.bind(this)
        );
        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.PRISON_ROOM,
            this.onEnterPrisonRoom.bind(this)
        );
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            mapRegions.PRISON_ROOM,
            this.onLeavePrisonRoom.bind(this)
        );
        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.DEV_ROOM_AREA,
            this.onEnterDevRoom.bind(this)
        );
        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.SHOP_AREA,
            this.onEnterShopArea.bind(this)
        );
    };

    private onMessage = async (msg: API_Message) => {
        const startTime = this.performanceMonitor.startTimer();

        if (
            msg.message.Type === "Activity" &&
            /^Orgasm\d+$/.test(msg.message.Content)
        ) {
            for (let quest of this.questManager.quests.getAll()) {
                if (quest?.additionalInfo && quest.additionalInfo["orgasms"] !== undefined && quest.targetPlayer == msg.sender.MemberNumber) {
                    let orgasms = Number(quest.additionalInfo["orgasms"]) + 1;
                    quest.additionalInfo["orgasms"] = orgasms;
                    this.climaxTracker.set(quest.targetPlayer, Date.now());
                }
            }
            console.log(`${msg.sender.toString()} climaxed!`);
        }

        this.performanceMonitor.endTimer('onMessage', startTime);
    };

    private onCharacterLeft = (
        _sourceMemberNumber: number,
        character: API_Character,
    ) => {
        if (!character) return;
        this.questManager.cancelQuestForPlayer(
            character.MemberNumber,
            this.conn,
            character.toString(),
        );
    };

    private onServerLeave = async () => {
        this.questManager.cancelQuests(this.gracePeriods);
    };

    private bountyEvent() {
        const candidateList = this.conn.chatRoom.characters.filter(
            c => !c.IsBot() && this.isPlayerSafe.get(c.MemberNumber) == false && !c.IsRestrained()
        );

        if (candidateList.length == 0) {
            setTimeout(this.bountyEvent.bind(this), BOUNTY_EVENT_REATTEMPT_CD);
        } else {
            let bountyTarget = candidateList.at(Util.getRandomInt(candidateList.length));
            const bountyLevel = this.playerService.getLevel(bountyTarget.MemberNumber);
            let bounty = 50 * bountyLevel;
            if (this.bounties.has(bountyTarget.MemberNumber))
                bounty += this.bounties.get(bountyTarget.MemberNumber);
            this.bounties.set(bountyTarget.MemberNumber, bounty);
            this.conn.SendMessage("Chat", "(Bounty event! The kidnappers league has put a bounty on " + bountyTarget.toString() + "[#" + bountyTarget.MemberNumber + "]! The bounty is " + bounty + " money)");
            setTimeout(this.bountyEvent.bind(this), BOUNTY_EVENT_SUCCESS_CD);
        }
    }

    private onEnterPrisonIntakeArea(character: API_Character): void {
        const isRestrained = character.IsRestrained();
        if (!isRestrained) {
            // this.conn.SendMessage("Whisper", `(The prison area is currently under construction! Changes to it will come the next days!)`, character.MemberNumber);
            this.conn.SendMessage("Whisper", `(You're in the prison intake area. If you are leashed into a cell while restrained you will have you door-key confiscated until you either are released by a player, do your time or buy free (/bot buy prisonrelease))`, character.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You're in the prison intake area. If you are leashed into a cell while restrained you will have you door-key confiscated until you either are released by a player, do your time or buy free (/bot buy prisonrelease))`, character.MemberNumber);
        }
    }

    private onEnterPrisonRoom(character: API_Character): void {
        if (character.IsRestrained() && character.IsLeashed()) {
            if (this.playerService.get(character.MemberNumber).getIsDominant()) {
                this.conn.SendMessage("Whisper", "(Dominants cannot be imprisoned.)", character.MemberNumber);
                return;
            }
        }
        this.tryImprison(character);
    }

    private onLeavePrisonRoom(character: API_Character): void {
        const wasImprisoned = this.prisonService.isImprisoned(character);
        if (wasImprisoned) {
            this.conn.SendMessage("Whisper", "(You have been released from prison.)", character.MemberNumber);
        }
        this.prisonService.releasePlayer(character);
        this.prisonService.clearReleaseHold(character.MemberNumber);
        character.giveKey(["bronze"]);
    }

    private tryImprison(character: API_Character): void {
        if (character.IsBot()) return;
        if (!shouldImprison({
            inPrisonRoom: positionIsInRegion(character.MapPos, mapRegions.PRISON_ROOM),
            restrained: Boolean(character.Appearance.InventoryGet("ItemArms")),
            leashed: character.IsLeashed(),
            dominant: this.playerService.get(character.MemberNumber).getIsDominant(),
            imprisoned: this.prisonService.isImprisoned(character),
            releaseHold: this.prisonService.hasReleaseHold(character.MemberNumber),
        })) {
            return;
        }
        this.conn.SendMessage("Whisper", `(You are now a prisoner. You will be released when you complete your time, buy your freedom or escape other wise (leashd out by another player). You can check your remaining time with /bot prisontime)`, character.MemberNumber);
        this.conn.SendMessage("Chat", `(${character.toString()} has been imprisoned)`);
        this.notifyCaptorPrisonKeyTaken(character);
        character.takeKey(["bronze"]);
        this.prisonService.imprisonPlayer(character);
    }

    private notifyCaptorPrisonKeyTaken(character: API_Character): void {
        const message = `(You can release them now, don't worry, we have taken their key)`;
        const recipients = new Set<number>();
        const lockOwner = character.Appearance.InventoryGet("ItemArms")?.getData()?.Property?.LockMemberNumber;
        if (lockOwner && lockOwner !== character.MemberNumber) {
            recipients.add(Number(lockOwner));
        }
        for (const other of this.conn.chatRoom.characters) {
            if (
                other.IsBot()
                || other.MemberNumber === character.MemberNumber
                || !positionIsInRegion(other.MapPos, mapRegions.PRISON_ROOM)
                || this.prisonService.isImprisoned(other)
            ) {
                continue;
            }
            recipients.add(other.MemberNumber);
        }
        if (recipients.size === 0) {
            this.conn.SendMessage("Chat", message);
            return;
        }
        for (const memberNumber of recipients) {
            this.conn.SendMessage("Whisper", message, memberNumber);
        }
    }

    private onEnterIntroductionArea(character: API_Character): void {
        if (this.hasLeftSpawnSafeArea.has(character.MemberNumber)) {
            return;
        }

        this.isPlayerSafe.set(character.MemberNumber, true);
        const memberId = character.MemberNumber;

        if (!this.alreadyEnteredIntroduction.has(memberId)) {
            this.conn.SendMessage("Whisper", `(Welcome, this is a WIP room where you'll be given quests that you can complete for money.
You're in a safe zone, being assigned and targeted by quests will start when you leave this building.
The bot has info about the commands and settings.

The goal of the room is to give an opportunity to start plays and sessions with other people, if you tie up someone for a quest, try to make it fun for the both of you
instead of just leaving them immediately, it makes it more enjoyable for everyone involved.)`, memberId
            );
            this.alreadyEnteredIntroduction.add(memberId);
        }
    }

    private onEnterSafeArea(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, true);
    }

    private onLeaveSafeArea(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, false);
    }

    private onLeaveIntroductionArea(character: API_Character): void {
        this.hasLeftSpawnSafeArea.add(character.MemberNumber);
        if (this.isPlayerSafe.get(character.MemberNumber) == true) {
            this.isPlayerSafe.set(character.MemberNumber, false);
            this.conn.SendMessage("Whisper", `(You're leaving the safe area, you can now be the target of other people's quests. Note that we gave you the keys to all doors!)`, character.MemberNumber);
            character.giveKey(["bronze","silver","gold"]);
        }
    }

    private onEnterBoundMaid(character: API_Character): void {
        const memberId = character.MemberNumber;

        // If the player hasn't been welcomed before
        if (!this.alreadyEnteredBoundMaid.has(memberId)) {
            this.conn.SendMessage("Whisper", `(You entered the local BDSM club, the "Bound Maid". This is a public play area.)`, character.MemberNumber);
            this.alreadyEnteredBoundMaid.add(memberId);
        }
    }

    private onEnterDevRoom(character: API_Character): void {
        if (character.IsBot()) return;

        if (!character.IsRoomAdmin()) {
            character.mapTeleport(DEV_ROOM_KICK_POS);
            this.conn.SendMessage("Whisper", "(This area is restricted to developers.)", character.MemberNumber);
        }
    }

    private onEnterShopArea(character: API_Character): void {
        this.conn.SendMessage("Whisper", `(This is the local BDSM shop. Here you can buy and sell items. Use /bot shop to open the shop menu.)`, character.MemberNumber);
    }

    isPrivateRoomEmpty(): boolean {
        for (const c of this.conn.chatRoom.characters) {
            if (positionIsInRegion(c.MapPos, mapRegions.PRIVATE_ROOM_AREA))
                return false;
        }
        return true;
    }



    private checkBounties() {
        const startTime = this.performanceMonitor.startTimer();

        for (const [key] of this.bounties) {
            let target = this.conn.chatRoom.findMember(key);
            let targetLock;
            if (target)
                targetLock = target
                    ?.Appearance
                    ?.InventoryGet("ItemArms")
                    ?.getData()
                    ?.Property
                    ?.LockMemberNumber;
            if (targetLock !== undefined && targetLock != key) {

                let bountyWinner = this.playerService.get(Number(targetLock));
                bountyWinner.money += this.bounties.get(key);
                this.playerService.save(bountyWinner);
                this.bounties.delete(key);
                this.conn.SendMessage("Chat", `(The bounty on ${target.toString()} has been claimed)`);
            }
        }

        this.performanceMonitor.endTimer('checkBounties', startTime);
    }



    private runLoop() {
        const startTime = this.performanceMonitor.startTimer();

        const completedQuests = this.questManager.completeQuests();
        for (const quest of completedQuests) {
            this.commands.rewardCompletedQuest(quest);
        }

        const failedQuests = this.questManager.cancelQuests(this.gracePeriods);
        for (const quest of failedQuests) {
            this.conn.SendMessage("Whisper", quest.failMessage, quest.owner);
            this.questCD.delete(quest.owner);
        }
        this.questManager.assignQuests(this.conn, this.questCD, this.gracePeriods, this.lastTargetBeforeReroll);

        // Handle player rejoins and prison status
        this.handlePlayerRejoin();

        // Check for expired prison sentences
        const prisonStartTime = this.performanceMonitor.startTimer();
        const expiredPrisons = this.prisonService.checkExpiredPrisons();
        for (const memberNumber of expiredPrisons) {
            const character = this.conn.chatRoom.findMember(memberNumber);
            if (character) {
                character.giveKey(["bronze"]);
                character.Appearance.RemoveItem("ItemArms");
                character.Appearance.RemoveItem("ItemHands");
                this.conn.SendMessage("Whisper", "(Your prison time is up, you are free to leave)", memberNumber);
                this.prisonService.releasePlayer(character);
                this.prisonService.holdReleaseUntilLeave(character.MemberNumber);
            }
        }

        for (const character of this.conn.chatRoom.characters) {
            this.tryImprison(character);
        }
        this.performanceMonitor.endTimer('prisonSweep', prisonStartTime);

        this.checkBounties();

        this.performanceMonitor.endTimer('runLoop', startTime);
    }

    /**
     * Handles players rejoining the room - checks prison status and gives keys
     */
    private handlePlayerRejoin(): void {
        const startTime = this.performanceMonitor.startTimer();

        const allCharacters = this.conn.chatRoom.characters;

        // Clean up processed players who are no longer in the room
        const currentPlayerNumbers = new Set(allCharacters.filter(c => !c.IsBot()).map(c => c.MemberNumber));
        for (const processedPlayer of this.processedPlayers) {
            if (!currentPlayerNumbers.has(processedPlayer)) {
                this.processedPlayers.delete(processedPlayer);
                this.closedPermissionNotifiedPlayers.delete(processedPlayer);
            }
        }

        this.schedulePlayerInit();

        this.performanceMonitor.endTimer('handlePlayerRejoin', startTime);
    }

    private schedulePlayerInit(): void {
        if (this.playerInitInProgress) return;
        this.playerInitInProgress = true;
        this.processNextPlayerInit();
    }

    private processNextPlayerInit(): void {
        const allCharacters = this.conn.chatRoom.characters;
        const character = allCharacters.find(
            c => !c.IsBot() && !this.processedPlayers.has(c.MemberNumber)
        );

        if (!character) {
            this.playerInitInProgress = false;
            return;
        }

        this.processedPlayers.add(character.MemberNumber);

        if (
            !this.closedPermissionNotifiedPlayers.has(character.MemberNumber) &&
            character.ItemPermission > ItemPermissionLevel.EveryoneExceptBlacklist
        ) {
            this.closedPermissionNotifiedPlayers.add(character.MemberNumber);
            this.conn.SendMessage(
                "Whisper",
                "(please open permissions to at least everyone except blacklist. If this is not what you want, this room is probably not for you. Only love <3)",
                character.MemberNumber
            );
        }

        const inDevRoom = positionIsInRegion(character.MapPos, mapRegions.DEV_ROOM_AREA);
        if (inDevRoom && !character.IsRoomAdmin()) {
            character.mapTeleport(DEV_ROOM_KICK_POS);
            this.conn.SendMessage("Whisper", "(This area is restricted to developers.)", character.MemberNumber);
            this.isPlayerSafe.set(character.MemberNumber, true);
        } else {
            const inPrivateRoom = positionIsInRegion(character.MapPos, mapRegions.PRIVATE_ROOM_AREA);
            const inSpawnSafeArea = positionIsInRegion(character.MapPos, mapRegions.ENTER_INTRODUCTION_AREA)
                && !this.hasLeftSpawnSafeArea.has(character.MemberNumber);
            this.isPlayerSafe.set(character.MemberNumber, inPrivateRoom || inSpawnSafeArea);
        }

        if (this.prisonService.isImprisoned(character)) {
            const remainingTime = this.prisonService.getRemainingTime(character);

            if (remainingTime <= 0) {
                this.prisonService.releasePlayer(character);
                if (positionIsInRegion(character.MapPos, mapRegions.PRISON_ROOM)) {
                    this.prisonService.holdReleaseUntilLeave(character.MemberNumber);
                }
                this.conn.SendMessage("Whisper", "(Your prison time was up while you were away, you are now free)", character.MemberNumber);
                character.giveKey(["gold", "silver", "bronze"]);
            } else {
                const prisonCenter = {
                    X: Math.floor((mapRegions.PRISON_ROOM.TopLeft.X + mapRegions.PRISON_ROOM.BottomRight.X) / 2),
                    Y: Math.floor((mapRegions.PRISON_ROOM.TopLeft.Y + mapRegions.PRISON_ROOM.BottomRight.Y) / 2)
                };
                character.mapTeleport(prisonCenter);
                character.changeKeys(["gold", "silver"], ["bronze"]);
                this.conn.SendMessage("Whisper", `(You are still serving your prison sentence. ${remainingTimeString(Date.now() + remainingTime)} remaining)`, character.MemberNumber);
            }
        } else {
            character.giveKey(["gold", "silver", "bronze"]);
        }

        setTimeout(() => this.processNextPlayerInit(), PLAYER_INIT_DELAY_MS);
    }
}
