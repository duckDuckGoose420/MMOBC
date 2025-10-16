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

import { API_Character, API_Connector, BC_Server_ChatRoomMessage, CommandParser, MapRegion, MessageEvent, positionIsInRegion } from "bc-bot";
import { decompressFromBase64 } from "lz-string";
import { remainingTimeString } from "../utils";
import mapConfig from "./rpg/config/map.config.json";
import { QuestManager } from "./rpg/model/QuestManager";
import { PlayerService } from "./rpg/service/PlayerService";
import { Util } from "./rpg/util/Util";
import { PrivateRequest } from "./rpg/types/PrivateRequest";
import { FeedbackService } from "./rpg/service/FeedbackService";
import { TargetPriorityService, TargetStatus } from "./rpg/service/TargetPriorityService";
import { PrisonService } from "./rpg/service/PrisonService";
import { PlayerIdentifier } from "./rpg/util/PlayerIdentifier";
import { PlayerCommands } from "./rpg/util/commands";
import { mapRegions } from "./rpg/util/areas";
import { PET_EARS, PrisonItem } from "./rpg/objects/items";

const MAP = mapConfig.EncodedMap;
const botXPos = 2;
const botYPos = 18;



const REROLL_CD = 3 * 60 * 1000;
const QUEST_CD = 10 * 60 * 1000;
const GRACE_PERIOD = 20 * 60 * 1000;
const PRIVATE_CONFIRMATION_DURATION = 2 * 60 * 1000;
const BOUNTY_EVENT_SUCCESS_CD = 60 * 60 * 1000;
const BOUNTY_EVENT_REATTEMPT_CD = 60 * 60 * 1000;

const PRIVATE_ROOM_COST = 100;
const PRISON_DURATION = 5 * 60 * 1000; // 5 Minuten
const PRISON_RELEASE_COST = 250; // Kosten für Freikauf
const PRIVATE_ROOM_SPAWN_1: ChatRoomMapPos = { X: 19, Y: 3 };
const PRIVATE_ROOM_SPAWN_2: ChatRoomMapPos = { X: 20, Y: 3 };



export class RPG {
    isPlayerSafe: Map<number, boolean> = new Map<number, boolean>();
    private bounties: Map<number, number> = new Map<number, number>();
    private lastTargetBeforeReroll: Map<number, number> = new Map<number, number>();
    private privatePlayRequests: Map<number, PrivateRequest> = new Map<number, PrivateRequest>();   // To note that the player who receives the request is used as key here
    private alreadyEnteredBoundMaid: Set<number> = new Set();
    private processedPlayers: Set<number> = new Set();
    private rerollCD = new Map<number, number>();
    private questCD = new Map<number, number>();
    private gracePeriods = new Map<number, number>();
    climaxTracker = new Map<number, number>();
    private questManager: QuestManager;
    playerService: PlayerService = new PlayerService();
    private feedbackService: FeedbackService = new FeedbackService();
    private targetPriorityService: TargetPriorityService = new TargetPriorityService();
    private prisonService: PrisonService = new PrisonService();
    public commands: PlayerCommands;
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
        "/bot stats - Check your money and level",
        "/bot bounty [player] [bounty] - Example: /bot bounty 12345 500 to put a bounty of 500 money on the member 12345. The first person to lock the target's arms with a lock will earn the money.",
        "Tip: You have the option put a bounty on yourself and the first person who catches you will get the reward",
        "/bot levelup - Check how many money you need to level up, plus explanation for levels",
        "/bot buy release - Cost: 1000 money, get freed from your arms and hands restraints",
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

    public static helpText = [
        "(",
        "Commands:",
        "",
        "/bot help",
        "/bot quest",
        "/bot reroll",
        "/bot pay [player] [amount]",
        "/bot stats",
        "/bot bounty [player] [bounty]",
        "/bot levelup",
        "/bot buy release - Cost: 1000",
        "/bot buy prisonrelease - Cost: 250",
        "/bot prisontime - Check how much time you have left in prison",
        "",
        "Private room commands:",
        "/bot private buy [player] - Cost 100",
        "/bot private claim [player]",
        "/bot private confirm",
        "/bot private rescue - If you get stuck inside the private room for some reason, you can use this command to forcibly leave the room",
        "/bot private check",
        "",
        "/bot settings - Configure grace period (0-20 min)",
        "",
        "/bot feedback [your message]"
    ].join("\n");

    public constructor(private conn: API_Connector) {
        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);
        this.conn.on("Message", this.onMessage.bind(this));
        //this.conn.on("ServerLeave", this.onServerLeave);

        this.questManager = new QuestManager(conn.chatRoom, this, this.targetPriorityService);
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
            this.lastTargetBeforeReroll
        );

        setTimeout(this.bountyEvent.bind(this), BOUNTY_EVENT_SUCCESS_CD);
    }

    public async init(): Promise<void> {

        await this.setupRoom();
        await this.setupCharacter();
        setInterval(() => this.runLoop(), 10000);
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

        this.conn.chatRoom.map.addEnterRegionTrigger(
            mapRegions.LEAVE_SAFE_AREA_1,
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
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            mapRegions.BOUND_MAID_AREA,
            this.onLeaveBoundMaid.bind(this)
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
    };

    private onMessage = async (msg: MessageEvent) => {
        if (
            msg.message.Type === "Activity" &&
            /^Orgasm\d+$/.test(msg.message.Content)
        ) {
            for (let quest of this.questManager.quests.getAll()) {
                if (quest?.additionalInfo && quest.additionalInfo["orgasms"] !== undefined && quest.targetPlayer == msg.sender.MemberNumber) {
                    let orgasms = Number(quest.additionalInfo["orgasms"]) + 1;
                    quest.additionalInfo["orgasms"] = orgasms;
                    this.climaxTracker.set(quest.targetPlayer, Date.now());
                    console.log(quest.additionalInfo);
                }
            }
            console.log(msg);
            console.log(`${msg.sender.toString()} climaxed!`);
        }

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
            this.conn.SendMessage("Whisper", `(You're in the prison intake area. If you are leashed into a cell while restrained you will have you door-key confiscated until you either are released by a player, do your time or buy free.(/bot buy prisonrelease))`, character.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You're in the prison intake area. If you are leashed into a cell while restrained you will have you door-key confiscated until you either are released by a player, do your time or buy free.(/bot buy prisonrelease))`, character.MemberNumber);
        }
    }

    private onEnterPrisonRoom(character: API_Character): void {
        if (character.IsRestrained() && character.IsLeashed()) {
            this.conn.SendMessage("Whisper", `(You are now a prisoner. You will be released when you complete your time, buy your freedom or escape other wise (leashd out by another player). You can check your remaining time with /bot prisontime)`, character.MemberNumber);
            character.takeKey(["bronze"]);
            this.prisonService.imprisonPlayer(character);
        }
    }

    private onLeavePrisonRoom(character: API_Character): void {
        // character.giveKey(["bronze"]);
        this.prisonService.releasePlayer(character);
        // this.conn.SendMessage("Whisper", ``, character.MemberNumber);
        // character.Appearance.RemoveItem("ItemArms");
    }

    private onEnterIntroductionArea(character: API_Character): void {
        if (this.isPlayerSafe.get(character.MemberNumber) == true || this.questManager.playerHasQuestAssigned(character.MemberNumber)) {
            this.isPlayerSafe.set(character.MemberNumber, true);
            return;
        }

        this.isPlayerSafe.set(character.MemberNumber, true);
        this.conn.SendMessage("Whisper", `(Welcome, this is a WIP room where you'll be given quests that you can complete for money.
You're in a safe zone, being assigned and targeted by quests will start when you leave this building.
The bot has info about the commands and settings.

The goal of the room is to give an opportunity to start plays and sessions with other people, if you tie up someone for a quest, try to make it fun for the both of you
instead of just leaving them immediately, it makes it more enjoyable for everyone involved.)`, character.MemberNumber
        );
    }

    private onEnterSafeArea(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, true);
    }

    private onLeaveSafeArea(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, false);
    }

    private onLeaveIntroductionArea(character: API_Character): void {
        if (this.isPlayerSafe.get(character.MemberNumber) == true) {
            this.isPlayerSafe.set(character.MemberNumber, false);
            this.conn.SendMessage("Whisper", `(You're leaving the safe area, you can now be the target of other people's quests. Note that we gave you the keys to all doors!)`, character.MemberNumber);
            character.giveKey(["bronze","silver","gold"]);
        }
    }

    private onEnterBoundMaid(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, true);
        const memberId = character.MemberNumber;

        // If the player hasn't been welcomed before
        if (!this.alreadyEnteredBoundMaid.has(memberId)) {
            this.conn.SendMessage("Whisper", `(You entered the local BDSM club, the "Bound Maid". This is a public play area and considered a safe zone)`, character.MemberNumber);
            this.alreadyEnteredBoundMaid.add(memberId);
        }
    }

    private onLeaveBoundMaid(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, false);
    }

    isPrivateRoomEmpty(): boolean {
        for (const c of this.conn.chatRoom.characters) {
            if (positionIsInRegion(c.MapPos, mapRegions.PRIVATE_ROOM_AREA))
                return false;
        }
        return true;
    }



    private checkBounties() {
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
    }



    private runLoop() {

        const completedQuests = this.questManager.completeQuests();
        for (const quest of completedQuests) {
            let player = this.playerService.get(quest.owner);
            player.money += 100;
            this.playerService.save(player);
            this.questCD.set(quest.owner, Date.now() + (QUEST_CD));
            const gracePeriodMinutes = player.getGracePeriodMinutes();
            if (gracePeriodMinutes > 0) {
                const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
                this.gracePeriods.set(quest.owner, Date.now() + gracePeriodMs);
                this.conn.SendMessage("Whisper", "(You have completed your quest! You have " + remainingTimeString(Date.now() + gracePeriodMs + 5000) + " free from being the target of quests to have some time to play with your target. Within this time you can access the private room with \"/bot private claim [player]\")", quest.owner);
            } else {
                this.conn.SendMessage("Whisper", "(You have completed your quest!)", quest.owner);
            }
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
        const expiredPrisons = this.prisonService.checkExpiredPrisons(this.conn.chatRoom.characters.at(0));
        for (const memberNumber of expiredPrisons) {
            const character = this.conn.chatRoom.findMember(memberNumber);
            if (character) {
                character.giveKey(["bronze"]);
                // Also remove restraints like when manually leaving prison
                Util.freeCharacter(character);
                this.conn.SendMessage("Whisper", "(Your prison time is up, you are free to leave)", memberNumber);
            }
            this.prisonService.releasePlayer(character);
        }

        this.checkBounties();
    }

    /**
     * Handles players rejoining the room - checks prison status and gives keys
     */
    private handlePlayerRejoin(): void {
        const allCharacters = this.conn.chatRoom.characters;

        for (const character of allCharacters) {
            if (character.IsBot()) continue;

            // Only process players we haven't seen before
            if (!this.processedPlayers.has(character.MemberNumber)) {
                this.processedPlayers.add(character.MemberNumber);

                // Give all 3 keys to rejoining players
                character.giveKey(["gold", "silver", "bronze"]);

                // Check if player was imprisoned and handle their status
                if (this.prisonService.isImprisoned(character)) {
                    const remainingTime = this.prisonService.getRemainingTime(character);

                    if (remainingTime <= 0) {
                        // Time is up, release them
                        this.prisonService.releasePlayer(character);
                        this.conn.SendMessage("Whisper", "(Your prison time was up while you were away, you are now free)", character.MemberNumber);
                    } else {
                        // Still has time left, teleport back to prison and take bronze key
                        const prisonCenter = {
                            X: Math.floor((mapRegions.PRISON_ROOM.TopLeft.X + mapRegions.PRISON_ROOM.BottomRight.X) / 2),
                            Y: Math.floor((mapRegions.PRISON_ROOM.TopLeft.Y + mapRegions.PRISON_ROOM.BottomRight.Y) / 2)
                        };
                        character.mapTeleport(prisonCenter);
                        character.takeKey(["bronze"]);
                        this.conn.SendMessage("Whisper", `(You are still serving your prison sentence. ${remainingTimeString(Date.now() + remainingTime)} remaining)`, character.MemberNumber);
                    }
                }
            }
        }

        // Clean up processed players who are no longer in the room
        const currentPlayerNumbers = new Set(allCharacters.filter(c => !c.IsBot()).map(c => c.MemberNumber));
        for (const processedPlayer of this.processedPlayers) {
            if (!currentPlayerNumbers.has(processedPlayer)) {
                this.processedPlayers.delete(processedPlayer);
            }
        }
    }
}
