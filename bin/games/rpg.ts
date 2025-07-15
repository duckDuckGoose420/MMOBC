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

import { decompressFromBase64 } from "lz-string";
import { API_Connector, MessageEvent, makeDoorRegion, MapRegion, API_Character, AssetGet, BC_AppearanceItem, CommandParser, BC_Server_ChatRoomMessage } from "bc-bot";
import { remainingTimeString } from "../utils";
import { wait } from "../hub/utils";
import { QuestManager } from "./rpg/model/QuestManager";
import mapConfig from "./rpg/config/map.config.json";
import { PlayerService } from "./rpg/service/PlayerService";
import { Util } from "./rpg/util/Util";

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
const REROLL_CD = 3 * 60 * 1000;
const QUEST_CD = 10 * 60 * 1000;
const GRACE_PERIOD = 20 * 60 * 1000;
export class RPG {

    private isPlayerSafe: Map<number, boolean> = new Map<number, boolean>();
    private bounties: Map<number, number> = new Map<number, number>();
    private lastTargetBeforeReroll: Map<number, number> = new Map<number, number>();

    public static description = [
        "This is a WIP for a quest based bondage room.",
        "Commands:",
        "",
        "/bot help - Will show these commands",
        "/bot quest - Check the quest currently assigned to you",
        "/bot reroll - Cancel your current quest, you can use this every 3 mins",
        "/bot stats - Check your money and level",
        "/bot buy release - Cost: 1000 money, get freed from your arms and hands restraints",
        "/bot bounty [memberNumber] [bounty] - Example: /bot bounty 12345 500 to put a bounty of 500 money on the member 12345. The first person to lock the target's arms with a lock will earn the money.",
        "Tip: You have the option put a bounty on yourself and the first person who catches you will get the reward",
        "",
        "If you have any suggestion, advice, complaints, bug report, anything is very appreciated, and can be given to Irinoa if she's in the room. Just remember this is very early development so more kind of quests and mechanics are already planned, I don't need much a feedback about how there is yet a low amount of content, but suggestions on what specific content you would like to see.",
        "",
        "Developed with https://github.com/FriendsOfBC/ropeybot",
    ].join("\n");

    public static helpText = [
        "( /bot help - Will show these commands",
        "/bot quest - Check the quest currently assigned to you",
        "/bot reroll - Cancel your current quest, you can use this every 3 mins",
        "/bot stats - Check your money and level",
        "/bot buy release - Cost: 1000 money, get freed from your arms and hands restraints",
        "/bot bounty [memberNumber] [bounty] - Example: /bot bounty 12345 500 to put a bounty of 500 money on the member 12345. The first person to lock the target's arms with a lock will earn the money.",
    ].join("\n");

    private rerollCD = new Map<number, number>();    
    private questCD = new Map<number, number>();
    private gracePeriods = new Map<number, number>();
    private commandParser: CommandParser;
    private questManager: QuestManager;
    private playerService: PlayerService = new PlayerService();

    public constructor(private conn: API_Connector) { 
        this.commandParser = new CommandParser(this.conn);
        this.playerService = new PlayerService();
        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);

        conn.addListener("ServerLeave", this.onServerLeave);
        this.questManager = new QuestManager(conn.chatRoom, this.isPlayerSafe);
        
        this.commandParser.register("quest", this.onCommandQuest.bind(this));
        this.commandParser.register("reroll", this.onCommandReroll.bind(this));
        this.commandParser.register("stats", this.onCommandStats.bind(this));
        this.commandParser.register("buy", this.onCommandBuy.bind(this));
        this.commandParser.register("bounty", this.onCommandBounty.bind(this));
        this.commandParser.register("help", this.onCommandHelp.bind(this));
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
            this.onLeaveSafeArea.bind(this)
        );

        this.conn.chatRoom.map.addLeaveRegionTrigger
    };

    

    private onMessage = async (msg: MessageEvent) => {
        if (
            msg.message.Type === "Chat" &&
            !msg.message.Content.startsWith("(")
        ) {
            
        }
    };

    private onServerLeave() {
        this.questManager.cancelQuests();
    };

    private onCommandQuest = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const quest = this.questManager.playerHasQuestAssigned(sender.MemberNumber);
        if (quest) {
            this.conn.SendMessage("Whisper", "(" + quest.description() + ")", sender.MemberNumber);
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
        this.conn.SendMessage("Whisper", `(You are level ${player.level} and you have ${player.money} money)`, sender.MemberNumber);
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
        if (args.length != 2 || !Util.isValidIntegerString(args[0]) || !Util.isValidIntegerString(args[1])) {
            this.conn.SendMessage("Whisper", `(Incorrect usage of the command)`, sender.MemberNumber);
            return;
        }
        const target = Number(args[0]);
        let money = Number(args[1]);

        const player = this.playerService.get(sender.MemberNumber);
        if (player.money < money) {
            this.conn.SendMessage("Whisper", `(You don't have that much money to offer for a bounty)`, sender.MemberNumber);
            return;
        } else {
            const targetPlayer = this.conn.chatRoom.findMember(target);
            if (targetPlayer === undefined) {
                this.conn.SendMessage("Whisper", `(The target isn't in the room)`, sender.MemberNumber);
                return;
            }
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
        this.conn.SendMessage("Whisper", `(Welcome, this is a early WIP but functional room where you'll be given quests, at the moment just a basic one, that you can complete for money.
You're in a safe zone, being assigned and targeted by quests will start when you leave this building.
The bot has info about the commands, as usual.
            
The goal of the room is to give an opportunity to start plays and sessions with other people, if you tie up someone for a quest, try to make it fun for the both of you
instead of just leaving them immediately, it makes it more enjoyable for everyone involved.)`, character.MemberNumber
        );
    }

    private onEnterSafeArea(character: API_Character): void {
        this.isPlayerSafe.set(character.MemberNumber, true);
    }

    private onLeaveSafeArea(character: API_Character): void {
        if (this.isPlayerSafe.get(character.MemberNumber) == true) {
            this.isPlayerSafe.set(character.MemberNumber, false);
            this.conn.SendMessage("Whisper", `(You're leaving the safe area, you can now be the target of other people's quests)`, character.MemberNumber);
        }
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
            if (targetLock !== undefined) {
                
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
            this.gracePeriods.set(quest.owner, Date.now() + (GRACE_PERIOD));
            this.conn.SendMessage("Whisper", "(You've completed your quest! You have " + remainingTimeString(Date.now() + GRACE_PERIOD) + " free from being the target of quests to have some time to play with your target. Within this time you can access the private room with \"/bot private [partner]\" [TODO] )", quest.owner);
        }

        const failedQuests = this.questManager.cancelQuests(this.gracePeriods);
        for (const quest of failedQuests) {
            this.conn.SendMessage("Whisper", quest.failMessage, quest.owner);
            this.questCD.delete(quest.owner);
        }
        this.questManager.assignQuests(this.conn, this.questCD, this.gracePeriods, this.lastTargetBeforeReroll);

        this.checkBounties();
    }


}
