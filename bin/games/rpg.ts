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
import { PlayerIdentifier } from "./rpg/util/PlayerIdentifier";

const MAP = mapConfig.EncodedMap;
const botXPos = 2;
const botYPos = 18;

const LEAVE_SAFE_AREA_1: MapRegion = {
    TopLeft: { X: 1, Y: 24 },
    BottomRight: { X: 3, Y: 31 },
};

const ENTER_INTRODUCTION_AREA: MapRegion = {
    TopLeft: { X: 0, Y: 14 },
    BottomRight: { X: 4, Y: 23 },
};

const PRIVATE_ROOM_AREA: MapRegion = {
    TopLeft: { X: 18, Y: 1 },
    BottomRight: { X: 21, Y: 7 }
}

export const KIDNAP_COLLECTION_AREA: MapRegion = {
    TopLeft: { X: 27, Y: 30 },
    BottomRight: { X: 35, Y: 35 }
}

export const BOUND_MAID_AREA: MapRegion = {
    TopLeft: { X: 18, Y: 7 },
    BottomRight: { X: 27, Y: 17 }
}

const REROLL_CD = 3 * 60 * 1000;
const QUEST_CD = 10 * 60 * 1000;
const GRACE_PERIOD = 20 * 60 * 1000;
const PRIVATE_CONFIRMATION_DURATION = 2 * 60 * 1000;
const BOUNTY_EVENT_SUCCESS_CD = 60 * 60 * 1000;
const BOUNTY_EVENT_REATTEMPT_CD = 60 * 60 * 1000;

const PRIVATE_ROOM_COST = 100;
const PRIVATE_ROOM_SPAWN_1: ChatRoomMapPos = { X: 19, Y: 3 };
const PRIVATE_ROOM_SPAWN_2: ChatRoomMapPos = { X: 20, Y: 3 };



export class RPG {
    isPlayerSafe: Map<number, boolean> = new Map<number, boolean>();
    private bounties: Map<number, number> = new Map<number, number>();
    private lastTargetBeforeReroll: Map<number, number> = new Map<number, number>();
    private privatePlayRequests: Map<number, PrivateRequest> = new Map<number, PrivateRequest>();   // To note that the player who receives the request is used as key here
    private alreadyEnteredBoundMaid: Set<number> = new Set();

    private rerollCD = new Map<number, number>();
    private questCD = new Map<number, number>();
    private gracePeriods = new Map<number, number>();
    climaxTracker = new Map<number, number>();
    private commandParser: CommandParser;
    private questManager: QuestManager;
    playerService: PlayerService = new PlayerService();
    private feedbackService: FeedbackService = new FeedbackService();
    private targetPriorityService: TargetPriorityService = new TargetPriorityService();
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
        this.commandParser = new CommandParser(this.conn);
        this.playerService = new PlayerService();
        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);
        this.conn.on("Message", this.onMessage.bind(this));
        //this.conn.on("ServerLeave", this.onServerLeave);

        this.questManager = new QuestManager(conn.chatRoom, this, this.targetPriorityService);

        this.commandParser.register("quest", this.onCommandQuest.bind(this));
        this.commandParser.register("reroll", this.onCommandReroll.bind(this));
        this.commandParser.register("stats", this.onCommandStats.bind(this));
        this.commandParser.register("buy", this.onCommandBuy.bind(this));
        this.commandParser.register("bounty", this.onCommandBounty.bind(this));
        this.commandParser.register("help", this.onCommandHelp.bind(this));
        //this.commandParser.register("claim", this.onCommandClaim.bind(this));
        this.commandParser.register("private", this.onCommandPrivate.bind(this));
        this.commandParser.register("feedback", this.onCommandFeedback.bind(this));
        this.commandParser.register("settings", this.onCommandSettings.bind(this));
        this.commandParser.register("levelup", this.onCommandLevelUp.bind(this));
        this.commandParser.register("pay", this.onCommandPay.bind(this));

        // Admin Commands (invisible to non-admins)
        this.commandParser.register("debug", this.onCommandDebug.bind(this));
        this.commandParser.register("admin", this.onCommandAdmin.bind(this));
        this.commandParser.register("reset", this.onCommandReset.bind(this));
        this.commandParser.register("targetme", this.onCommandTargetMe.bind(this));
        this.commandParser.register("donttargetme", this.onCommandDontTargetMe.bind(this));

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
            ENTER_INTRODUCTION_AREA,
            this.onEnterIntroductionArea.bind(this)
        );

        this.conn.chatRoom.map.addEnterRegionTrigger(
            LEAVE_SAFE_AREA_1,
            this.onLeaveIntroductionArea.bind(this)
        );

        this.conn.chatRoom.map.addEnterRegionTrigger(
            PRIVATE_ROOM_AREA,
            this.onEnterSafeArea.bind(this)
        );
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            PRIVATE_ROOM_AREA,
            this.onLeaveSafeArea.bind(this)
        );

        this.conn.chatRoom.map.addEnterRegionTrigger(
            BOUND_MAID_AREA,
            this.onEnterBoundMaid.bind(this)
        );
        this.conn.chatRoom.map.addLeaveRegionTrigger(
            BOUND_MAID_AREA,
            this.onLeaveBoundMaid.bind(this)
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

    private onCommandQuest = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const quest = this.questManager.playerHasQuestAssigned(sender.MemberNumber);
        if (quest) {
            if (quest.description())
                this.conn.SendMessage("Whisper", "(" + quest.description() + ")", sender.MemberNumber);
            else
                this.conn.SendMessage("Whisper", "(Couldn't find the target of your quest, they might have just left the room)", sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", "(You currently don't have a quest assigned, you'll be assigned one automatically)", sender.MemberNumber);
        }
    };

    private onCommandReroll = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (this.canReroll(sender.MemberNumber)) {
            const currentQuest = this.questManager.playerHasQuestAssigned(sender.MemberNumber);
            if (currentQuest) {
                this.lastTargetBeforeReroll.set(sender.MemberNumber, currentQuest.targetPlayer);
            }
            this.questManager.cancelQuestForPlayer(sender.MemberNumber);
            this.rerollCD.set(sender.MemberNumber, Date.now() + (REROLL_CD));
            this.conn.SendMessage("Whisper", "(Your quest has been cancelled, you'll receive a new one in a short time)", sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You can reroll your quest again in ${remainingTimeString(this.rerollCD.get(sender.MemberNumber))})`, sender.MemberNumber);
        }
    };

    private onCommandStats = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        const player = this.playerService.get(sender.MemberNumber);
        this.conn.SendMessage("Whisper", `(You are level ${player.level} and you have ${player.money} money). `, sender.MemberNumber);
    }

    private onCommandLevelUp = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        const player = this.playerService.get(sender.MemberNumber);
        const toLevelUp = player.moneyNeededToLevelUp();
        if (args.length == 0) {
            this.conn.SendMessage("Whisper", `(You need ${toLevelUp} money to level up. If you have the money and you want to do so, use "/bot levelup confirm", or you can refund your last level up with "/bot levelup refund". Level decreases the likelyhood you are targeted by quests from lower level players than you are, mostly a stat for doms currently). `, sender.MemberNumber);
            return;
        }
        if (args[0] == "confirm") {
            if (player.canLevelUp()) {
                player.levelUp();
                this.playerService.save(player);
                this.conn.SendMessage("Whisper", `(You are now level ${player.level}!)`, sender.MemberNumber);
            } else {
                this.conn.SendMessage("Whisper", `(Not enough money to level up)`, sender.MemberNumber);
            }
        }

        if (args[0] == "refund") {
            if (player.moneyThatCanBeRefunded() > 0) {
                player.refundLevel();
                this.playerService.save(player);
                this.conn.SendMessage("Whisper", `(You got refunded one level)`, sender.MemberNumber);
            } else {
                this.conn.SendMessage("Whisper", `(You need to be at least level 2 to refund levels)`, sender.MemberNumber);
            }
        }
    }

    private onCommandBuy = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (args.length == 0) {
            this.conn.SendMessage("Whisper",
                `(Use one of these:
/bot buy release`, sender.MemberNumber);
            return;
        }
        switch (args[0]) {
            case 'release':
                const player = this.playerService.get(sender.MemberNumber);

                if (player.money < 1000) {
                    this.conn.SendMessage("Whisper", `(You need 1000 money to buy this service)`, sender.MemberNumber);
                } else {
                    Util.freeCharacter(sender);
                    this.conn.SendMessage("Chat", `(${sender.toString()} has paid to be released from their binds)`);
                    player.money -= 1000;
                    this.playerService.save(player);
                }
                break;

            default:
                this.conn.SendMessage("Whisper",
                    `(Use one of these:
/bot buy release`, sender.MemberNumber);
                break;

        }
    }

    private onCommandBounty = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (args.length != 2 || !Util.isValidIntegerString(args[1])) {
            this.conn.SendMessage("Whisper", `(Incorrect use of the command)`, sender.MemberNumber);
            return;
        }

        // Try to identify target (MemberNumber or Name)
        const targetIdentifier = args[0];
        const targetPlayer = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof targetPlayer === 'string') {
            this.conn.SendMessage("Whisper", `(${targetPlayer})`, sender.MemberNumber);
            return;
        }

        const target = targetPlayer.MemberNumber;
        let money = Number(args[1]);

        const player = this.playerService.get(sender.MemberNumber);
        if (player.money < money) {
            this.conn.SendMessage("Whisper", `(You don't have that much money to offer for a bounty)`, sender.MemberNumber);
            return;
        } else {
            player.money -= money;
            this.playerService.save(player);
            if (this.bounties.has(target))
                money += this.bounties.get(target);
            this.bounties.set(target, money);
            this.conn.SendMessage("Chat", "(A bounty has been placed on " + targetPlayer.toString() + "[#" + targetPlayer.MemberNumber + "]. The bounty is " + money + " money)");
        }
    }

    private onCommandHelp = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        this.conn.SendMessage("Whisper", RPG.helpText, sender.MemberNumber);
    }

    private onCommandPrivate = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        switch (args[0]) {
            case 'buy':
                if (args.length != 2) {
                    this.conn.SendMessage("Whisper", `(Incorrect use of the command)`, sender.MemberNumber);
                    return;
                }

                // Try to identify target (MemberNumber or Name)
                const buyTargetIdentifier = args[1];
                const buyTarget = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, buyTargetIdentifier);
                if (typeof buyTarget === 'string') {
                    this.conn.SendMessage("Whisper", `(${buyTarget})`, sender.MemberNumber);
                    return;
                }

                if (sender.MemberNumber == buyTarget.MemberNumber) {
                    this.conn.SendMessage("Whisper", `(No longer possible. Sorry!)`, sender.MemberNumber);
                    return;
                }
                this.handleBuyPrivateCommand(sender.MemberNumber, buyTarget.MemberNumber);
                break;

            case 'claim':
                if (args.length != 2) {
                    this.conn.SendMessage("Whisper", `(Incorrect use of the command)`, sender.MemberNumber);
                    return;
                }

                // Try to identify target (MemberNumber or Name)
                const claimTargetIdentifier = args[1];
                const claimTarget = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, claimTargetIdentifier);
                if (typeof claimTarget === 'string') {
                    this.conn.SendMessage("Whisper", `(${claimTarget})`, sender.MemberNumber);
                    return;
                }

                if (sender.MemberNumber == claimTarget.MemberNumber) {
                    this.conn.SendMessage("Whisper", `(No longer possible. Sorry!)`, sender.MemberNumber);
                    return;
                }
                this.handleClaimPrivateCommand(sender.MemberNumber, claimTarget.MemberNumber);
                break;

            case 'confirm':

                const request = this.privatePlayRequests.get(sender.MemberNumber);
                console.log(request);
                if (!this.privatePlayRequests.delete(sender.MemberNumber)) {
                    this.conn.SendMessage("Whisper", "(You don't have any private play offers yet)", sender.MemberNumber);
                }
                if (request.expiration < Date.now()) {
                    this.conn.SendMessage("Whisper", "(The request has expired)", sender.MemberNumber);
                }

                if (this.isPrivateRoomEmpty()) {
                    console.log("Private room is empty");
                    let requestingPlayer = this.playerService.get(request.requestingPlayer);
                    requestingPlayer.money -= request.cost;
                    this.playerService.save(requestingPlayer);

                    let quests = this.questManager.cancelQuestsByTarget(sender.MemberNumber);
                    for (const quest of quests) {
                        this.conn.SendMessage("Whisper", `(Your target went into the private room, you'll be assigned a new quest)`, quest.owner);
                    }
                    quests = this.questManager.cancelQuestsByTarget(request.requestingPlayer);
                    for (const quest of quests) {
                        this.conn.SendMessage("Whisper", `(Your target went into the private room, you'll be assigned a new quest)`, quest.owner);
                    }

                    this.startPrivatePlay(sender.MemberNumber, PRIVATE_ROOM_SPAWN_1);
                    this.startPrivatePlay(request.requestingPlayer, PRIVATE_ROOM_SPAWN_2);
                } else {
                    console.log("Private room is not empty");
                }
                break;

            case 'rescue':
                const player = this.conn.chatRoom.findMember(sender.MemberNumber);
                if (positionIsInRegion(player.MapPos, PRIVATE_ROOM_AREA))
                    player.mapTeleport({ X: 21, Y: 14 });
                else
                    this.conn.SendMessage("Whisper", `(Need to be in the private room to use this command)`, sender.MemberNumber);
                break;
            case 'check':
                if (this.isPrivateRoomEmpty()) {
                    this.conn.SendMessage("Whisper", "(Private room is empty)", sender.MemberNumber);
                } else {
                    this.conn.SendMessage("Whisper", "(Private room is currently in use)", sender.MemberNumber);
                }
                break;
        }
    }

    private onCommandFeedback = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        this.feedbackService.appendFeedback(msg.Content, sender.MemberNumber, sender.toString());
        this.conn.SendMessage("Whisper", `(Your message has been saved - I'll read it soon.

If I have any follow-up questions, I might contact you while you're in the room, when the timing is appropriate.
If you see me (subMe) around and want to reach out directly, feel free to do so.

Thanks for your feedback!)`, sender.MemberNumber);

    }

    private onCommandSettings = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (args.length == 0) {
            this.conn.SendMessage("Whisper", `(
/bot settings graceperiod - Check your current grace period setting
/bot settings graceperiod [0-20] - Set grace period in minutes (0 = disabled, 20 = maximum)`, sender.MemberNumber);
        }

        const player = this.playerService.get(sender.MemberNumber);
        switch (args[0]) {
            case 'graceperiod':
                if (args.length > 1) {
                    const minutes = parseInt(args[1]);
                    if (isNaN(minutes) || minutes < 0 || minutes > 20) {
                        this.conn.SendMessage("Whisper", "(Please enter a number between 0 and 20. Maximum grace period is 20 minutes)", sender.MemberNumber);
                        return;
                    }
                    try {
                        player.setGracePeriodMinutes(minutes);
                        this.playerService.save(player);

                        // Check if player is currently in a grace period
                        const currentGraceEnd = this.gracePeriods.get(sender.MemberNumber);
                        if (currentGraceEnd && currentGraceEnd > Date.now()) {
                            const remainingTime = currentGraceEnd - Date.now();
                            const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));

                            if (remainingMinutes > minutes) {
                                // Adjust current grace period to new setting
                                const newGraceEnd = Date.now() + (minutes * 60 * 1000);
                                this.gracePeriods.set(sender.MemberNumber, newGraceEnd);
                                this.conn.SendMessage("Whisper", `(Grace period set to ${minutes} minutes. Your current grace period has been adjusted to ${minutes} minutes)`, sender.MemberNumber);
                            } else {
                                this.conn.SendMessage("Whisper", `(Grace period set to ${minutes} minutes. Your current grace period remains unchanged)`, sender.MemberNumber);
                            }
                        } else {
                            this.conn.SendMessage("Whisper", `(Grace period set to ${minutes} minutes)`, sender.MemberNumber);
                        }
                    } catch (error) {
                        this.conn.SendMessage("Whisper", "(Invalid grace period value)", sender.MemberNumber);
                    }
                } else {
                    const currentMinutes = player.getGracePeriodMinutes();
                    if (currentMinutes === 0) {
                        this.conn.SendMessage("Whisper", "(Grace period is disabled. Note that this also disables the free access to the private room after a quest, but you can still buy it)", sender.MemberNumber);
                    } else {
                        this.conn.SendMessage("Whisper", `(You have currently ${currentMinutes} minutes of grace period after completing a quest)`, sender.MemberNumber);
                    }
                }
                break;
        }
    }

    private onCommandPay = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (args.length != 2 || !Util.isValidIntegerString(args[1])) {
            this.conn.SendMessage("Whisper", `(Incorrect use of the command)`, sender.MemberNumber);
            return;
        }

        // Try to identify target (MemberNumber or Name)
        const targetIdentifier = args[0];
        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof target === 'string') {
            this.conn.SendMessage("Whisper", `(${target})`, sender.MemberNumber);
            return;
        }

        var targetNumber = target.MemberNumber;
        var amount = Number(args[1]);

        // We know at this point the parameters are numbers and the target is a valid target, we are good
        // to send the money as long as the player has enough of them. And that they're not trying to be funny
        if (sender.MemberNumber == targetNumber) {
            this.conn.SendMessage("Whisper", `(*Takes the money from your hand and puts it in the other)`, sender.MemberNumber);
            return;
        }

        if (target.IsBot()) {
            this.conn.SendMessage("Whisper", `(You can keep them)`, sender.MemberNumber);
            return;
        }

        const player = this.playerService.get(sender.MemberNumber);
        if (player.money < amount) {
            this.conn.SendMessage("Whisper", `(You don't have that much money to give)`, sender.MemberNumber);
            return;
        }
        const targetPlayer = this.playerService.get(targetNumber);

        player.addMoney(-amount);
        targetPlayer.addMoney(amount);

        this.playerService.save(player);
        this.playerService.save(targetPlayer);

        this.conn.SendMessage("Chat", `(${sender.toString()} paid ${target.toString()} ${amount} money)`);
    }

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

    private canReroll(memberNumber: number): boolean {
        const cooldown = this.rerollCD.get(memberNumber);
        if (!cooldown)
            return true;
        else return cooldown < Date.now();
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
            this.conn.SendMessage("Whisper", `(You're leaving the safe area, you can now be the target of other people's quests)`, character.MemberNumber);
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
            if (positionIsInRegion(c.MapPos, PRIVATE_ROOM_AREA))
                return false;
        }
        return true;
    }

    startPrivatePlay(memberNumber: number, pos: ChatRoomMapPos) {
        //console.log(`Teleporting ${memberNumber} to {${pos.X}, ${pos.Y}}`);

        this.conn.chatRoom.findMember(memberNumber).mapTeleport(pos);
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

    private handleBuyPrivateCommand(player: number, partner: number) {
        const requesterPlayer = this.playerService.get(player);
        if (requesterPlayer.money < PRIVATE_ROOM_COST) {
            this.conn.SendMessage("Whisper", "(Not enough money)", player);
            return;
        }

        if (!this.isPrivateRoomEmpty()) {
            this.conn.SendMessage("Whisper", "(At this moment the private room is in use by someone, once it's empty another couple can get inside)", player);
            return;
        }

        // if all the conditions passes the player can start the process to go into the private room with their partner. We register the pair and ask the partner to accept
        this.privatePlayRequests.set(partner, { requestingPlayer: player, expiration: Date.now() + PRIVATE_CONFIRMATION_DURATION, cost: PRIVATE_ROOM_COST });
        const requester = this.conn.chatRoom.findMember(player);
        this.conn.SendMessage("Whisper", `(${requester.toString()} wants you to join them in the private room. If you want to take on the offer type "/bot private confirm", you'll be moved with them in it')`, partner);
        this.conn.SendMessage("Whisper", `(The offer has been sent, if they accept you'll both be brought in the private room)`, player);
    }

    private handleClaimPrivateCommand(player: number, partner: number) {
        if (!this.gracePeriods.get(player)) {
            this.conn.SendMessage("Whisper", "(You have to complete a quest and claim it within 20 minutes to access it for free. You can still go buy access with \"/bot private buy [player]\" for 100 coins, the member number is for the person you want to invite with you. They will have to confirm the offer.)", player);
            return;
        }
        if (this.gracePeriods.get(player) < Date.now()) {
            this.conn.SendMessage("Whisper", "(It's been too long since you completed your last quest to get access to the private room. You can still go buy access with \"/bot private buy [player]\" for 100 coins, the member number is for the person you want to invite with you. They will have to confirm the offer.)", player);
            return;
        }

        if (!this.isPrivateRoomEmpty()) {
            this.conn.SendMessage("Whisper", "(At this moment the private room is in use by someone, once it's empty another couple can get inside)", player);
            return;
        }

        // if all the conditions passes the player can start the process to go into the private room with their partner. We register the pair and ask the partner to accept
        this.privatePlayRequests.set(partner, { requestingPlayer: player, expiration: Date.now() + PRIVATE_CONFIRMATION_DURATION, cost: 0 });
        const requester = this.conn.chatRoom.findMember(player);
        this.conn.SendMessage("Whisper", `(${requester.toString()} wants you to join them in the private room. If you want to take on the offer type "/bot private confirm", you'll be moved with them in it')`, partner);
        this.conn.SendMessage("Whisper", `(The offer has been sent, if they accept you'll both be brought in the private room)`, player);
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

        this.checkBounties();
    }

    // ===== HELPER FUNCTIONS =====

    private getPlayersSearchingForQuest(): number {
        return this.conn.chatRoom.characters.filter(character => {
            if (character.IsBot()) return false;
            if (this.questManager.playerHasQuestAssigned(character.MemberNumber)) return false;
            if (this.isPlayerSafe.get(character.MemberNumber) === true) return false;
            if (this.questCD.get(character.MemberNumber) && this.questCD.get(character.MemberNumber)! > Date.now()) return false;
            return true;
        }).length;
    }

    private getHuntersForPlayer(targetNumber: number): number[] {
        const hunters: number[] = [];
        for (const quest of this.questManager.quests.getAll()) {
            if (quest.targetPlayer === targetNumber) {
                hunters.push(quest.owner);
            }
        }
        return hunters;
    }

    private getBountyForPlayer(targetNumber: number): number {
        return this.bounties.get(targetNumber) || 0;
    }

    private formatPlayerShortInfo(player: API_Character): string {
        const playerData = this.playerService.get(player.MemberNumber);
        const bounty = this.getBountyForPlayer(player.MemberNumber);
        const quest = this.questManager.playerHasQuestAssigned(player.MemberNumber);
        const hunters = this.getHuntersForPlayer(player.MemberNumber);

        let targetName = "-";
        if (quest) {
            const target = this.conn.chatRoom.findMember(quest.targetPlayer);
            if (target) targetName = target.toString();
        }

        return `${player.toString()} - Level ${playerData.level}, ${playerData.money} money, Bounty: ${bounty > 0 ? bounty : '-'}, Target: ${targetName}, Hunters: ${hunters.length}`;
    }

    private formatPlayerDetailedInfo(memberNumber: number): string {
        const player = this.conn.chatRoom.findMember(memberNumber);
        if (!player) return `Player #${memberNumber} not found in room`;

        const playerData = this.playerService.get(memberNumber);
        const quest = this.questManager.playerHasQuestAssigned(memberNumber);
        const hunters = this.getHuntersForPlayer(memberNumber);
        const isSafe = this.isPlayerSafe.get(memberNumber);
        const gracePeriod = this.gracePeriods.get(memberNumber);

        let info = `Player Debug - ${player.toString()}:\n`;
        info += `Level: ${playerData.level}\n`;
        info += `Money: ${playerData.money}\n`;
        info += `Safe: ${isSafe ? 'Yes' : 'No'}\n`;

        if (gracePeriod && gracePeriod > Date.now()) {
            info += `Grace Period: ${remainingTimeString(gracePeriod)}\n`;
        } else {
            info += `Grace Period: -\n`;
        }

        if (quest) {
            info += `Quest: ${quest.description()}\n`;
        } else {
            info += `Quest: None\n`;
        }

        if (hunters.length > 0) {
            const hunterNames = hunters.map(h => this.conn.chatRoom.findMember(h)?.toString()).filter(Boolean);
            info += `Hunters: ${hunterNames.join(', ')}\n`;
        } else {
            info += `Hunters: None\n`;
        }

        // Priority/Block status
        const priorityTargets = this.targetPriorityService.getPriorityTargets(memberNumber);
        const blockedBy = [];
        for (const [owner, targetMap] of this.targetPriorityService.getAllStatuses()) {
            if (targetMap.get(memberNumber) === 'blocked') {
                const ownerChar = this.conn.chatRoom.findMember(owner);
                if (ownerChar) blockedBy.push(ownerChar.toString());
            }
        }

        if (priorityTargets.length > 0) {
            const priorityNames = priorityTargets.map(t => this.conn.chatRoom.findMember(t)?.toString()).filter(Boolean);
            info += `Priority Targets: ${priorityNames.join(', ')}\n`;
        } else {
            info += `Priority Targets: None\n`;
        }

        if (blockedBy.length > 0) {
            info += `Blocked Targets: ${blockedBy.join(', ')}`;
        } else {
            info += `Blocked Targets: None`;
        }

        return info;
    }

    // ===== ADMIN COMMANDS =====
    // All admin commands start with admin check and silent fail for non-admins

    private onCommandDebug = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (!sender.IsRoomAdmin()) return;

        if (args.length === 0) {
            // General debug overview
            const playerCount = this.conn.chatRoom.characters.filter(c => !c.IsBot()).length;
            const questCount = this.questManager.quests.count();
            const searchingCount = this.getPlayersSearchingForQuest();
            const bountyCount = this.bounties.size;
            const privateRoomEmpty = this.isPrivateRoomEmpty();

            this.conn.SendMessage("Whisper", `(Debug Overview:
Players: ${playerCount}
Active Quests: ${questCount}
Searching for Quest: ${searchingCount}
Active Bounties: ${bountyCount}
Private Room: ${privateRoomEmpty ? 'Empty' : 'In Use'})`, sender.MemberNumber);
            return;
        }

        switch (args[0]) {
            case 'player':
                // List all players
                const players = this.conn.chatRoom.characters.filter(c => !c.IsBot());
                let playerList = "(Player List:\n";
                for (const player of players) {
                    playerList += this.formatPlayerShortInfo(player) + "\n";
                }
                playerList += ")";
                this.conn.SendMessage("Whisper", playerList, sender.MemberNumber);
                break;

            case 'room':
                const playerCount = this.conn.chatRoom.characters.filter(c => !c.IsBot()).length;
                const safeCount = this.conn.chatRoom.characters.filter(c => !c.IsBot() && this.isPlayerSafe.get(c.MemberNumber) === true).length;
                const questCount = this.questManager.quests.count();

                let roomInfo = "(Room Debug:\n";
                roomInfo += `Player count: ${playerCount}\n`;
                roomInfo += `Safe players: ${safeCount}\n`;
                roomInfo += `Active quests: ${questCount}\n`;

                if (this.bounties.size > 0) {
                    roomInfo += "Bounties:\n";
                    for (const [targetNumber, bounty] of this.bounties) {
                        const target = this.conn.chatRoom.findMember(targetNumber);
                        if (target) {
                            roomInfo += `  ${target.toString()}: ${bounty} money\n`;
                        }
                    }
                }

                if (this.gracePeriods.size > 0) {
                    roomInfo += "Grace Periods:\n";
                    for (const [memberNumber, endTime] of this.gracePeriods) {
                        const player = this.conn.chatRoom.findMember(memberNumber);
                        if (player) {
                            roomInfo += `  ${player.toString()}: ${remainingTimeString(endTime)}\n`;
                        }
                    }
                }

                roomInfo += `Private Room: ${this.isPrivateRoomEmpty() ? 'Empty' : 'In Use'})`;
                this.conn.SendMessage("Whisper", roomInfo, sender.MemberNumber);
                break;

            case 'quests':
                const allQuests = this.questManager.quests.getAll();
                let questInfo = "(Active Quests:\n";
                for (const quest of allQuests) {
                    const owner = this.conn.chatRoom.findMember(quest.owner);
                    const target = this.conn.chatRoom.findMember(quest.targetPlayer);
                    if (owner && target) {
                        questInfo += `${owner.toString()} → ${target.toString()}: ${quest.description()}\n`;
                    }
                }
                questInfo += ")";
                this.conn.SendMessage("Whisper", questInfo, sender.MemberNumber);
                break;

            default:
                // Check if it's a common typo first
                if (args[0] === 'players') {
                    this.conn.SendMessage("Whisper", "(Did you mean '/bot debug player'? Use 'player' not 'players')", sender.MemberNumber);
                    return;
                }

                // Handle as player names (Multi-Player Support)
                const results = [];
                for (const targetIdentifier of args) {
                    const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
                    if (typeof target === 'string') {
                        results.push(`(${target})`);
                    } else {
                        results.push(this.formatPlayerDetailedInfo(target.MemberNumber));
                    }
                }
                this.conn.SendMessage("Whisper", results.join("\n\n"), sender.MemberNumber);
        }
    }

    private onCommandAdmin = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (!sender.IsRoomAdmin()) return;

        if (args.length === 0 || args[0] === 'help') {
            this.conn.SendMessage("Whisper", `(Admin Commands:
/bot debug - General overview
/bot debug player - List all players
/bot debug [player] - Player details (multiple players supported)
/bot debug room - Room status
/bot debug quests - All active quests

/bot reset [player] - Reset player cooldowns and quest
/bot targetme [player] [player] ... - Set priority targets
/bot donttargetme [player] [player] ... - Remove priority or block targets

/bot admin help - This help)`, sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", "(Unknown admin subcommand. Use /bot admin help for available commands)", sender.MemberNumber);
        }
    }

    private onCommandReset = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (!sender.IsRoomAdmin()) return;

        if (args.length === 0) {
            this.conn.SendMessage("Whisper", "(Usage: /bot reset [player])", sender.MemberNumber);
            return;
        }

        const targetIdentifier = args.join(' ');
        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof target === 'string') {
            this.conn.SendMessage("Whisper", `(${target})`, sender.MemberNumber);
            return;
        }

        // Reset cooldowns
        this.questCD.delete(target.MemberNumber);
        this.rerollCD.delete(target.MemberNumber);
        this.gracePeriods.delete(target.MemberNumber);

        // Cancel current quest
        this.questManager.cancelQuestForPlayer(target.MemberNumber);

        // Clear priority/block status (as owner and target)
        this.targetPriorityService.clearPlayerStatuses(target.MemberNumber);

        this.conn.SendMessage("Whisper", `(${target.toString()} has been reset)`, sender.MemberNumber);
    }

    private onCommandTargetMe = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (!sender.IsRoomAdmin()) return;

        if (args.length === 0) {
            this.conn.SendMessage("Whisper", "(Usage: /bot targetMe [player] [player] ...)", sender.MemberNumber);
            return;
        }

        const successful = [];
        const failed = [];

        for (const targetIdentifier of args) {
            const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
            if (typeof target === 'string') {
                failed.push(targetIdentifier);
            } else {
                // Set as priority (don't toggle)
                this.targetPriorityService.setTargetStatus(sender.MemberNumber, target.MemberNumber, TargetStatus.PRIORITY);
                successful.push(target.toString());
            }
        }

        let response = "";
        if (successful.length > 0) {
            response += `Set as priority targets: ${successful.join(', ')}`;
        }
        if (failed.length > 0) {
            if (response) response += "\n";
            response += `Players not found: ${failed.join(', ')}`;
        }

        this.conn.SendMessage("Whisper", `(${response})`, sender.MemberNumber);
    }

    private onCommandDontTargetMe = async (sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) => {
        if (!sender.IsRoomAdmin()) return;

        if (args.length === 0) {
            this.conn.SendMessage("Whisper", "(Usage: /bot dontTargetMe [player] [player] ...)", sender.MemberNumber);
            return;
        }

        const results = [];
        for (const targetIdentifier of args) {
            const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
            if (typeof target === 'string') {
                results.push(`${targetIdentifier}: ${target}`);
            } else {
                const currentStatus = this.targetPriorityService.getTargetStatus(sender.MemberNumber, target.MemberNumber);
                let newStatus: string;

                if (currentStatus === 'priority') {
                    this.targetPriorityService.removePriority(sender.MemberNumber, target.MemberNumber);
                    newStatus = 'Removed from priority';
                } else if (currentStatus === 'blocked') {
                    this.targetPriorityService.toggleBlock(sender.MemberNumber, target.MemberNumber);
                    newStatus = 'Unblocked';
                } else {
                    this.targetPriorityService.toggleBlock(sender.MemberNumber, target.MemberNumber);
                    newStatus = 'Blocked';
                }

                results.push(`${target.toString()}: ${newStatus}`);
            }
        }

        this.conn.SendMessage("Whisper", `(${results.join('\n')})`, sender.MemberNumber);
    }


}
