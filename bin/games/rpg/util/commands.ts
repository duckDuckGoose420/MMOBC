import { API_Character, BC_Server_ChatRoomMessage, API_Connector, positionIsInRegion, CommandParser } from "bc-bot";
import { PlayerService } from "../service/PlayerService";
import { QuestManager } from "../model/QuestManager";
import { FeedbackService } from "../service/FeedbackService";
import { TargetPriorityService, TargetStatus } from "../service/TargetPriorityService";
import { PrisonService } from "../service/PrisonService";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";
import { Util } from "./Util";
import { PlayerIdentifier } from "./PlayerIdentifier";
import { PrivateRequest } from "../types/PrivateRequest";
import { remainingTimeString } from "../../../utils";

const REROLL_CD = 3 * 60 * 1000;
const QUEST_CD = 10 * 60 * 1000;
const PRIVATE_CONFIRMATION_DURATION = 2 * 60 * 1000;
const PRIVATE_ROOM_COST = 100;
const PRISON_RELEASE_COST = 250;

export class PlayerCommands {
    private commandParser: CommandParser;

    constructor(
        private conn: API_Connector,
        private playerService: PlayerService,
        private questManager: QuestManager,
        private feedbackService: FeedbackService,
        private targetPriorityService: TargetPriorityService,
        private prisonService: PrisonService,
        private isPlayerSafe: Map<number, boolean>,
        private rerollCD: Map<number, number>,
        private questCD: Map<number, number>,
        private gracePeriods: Map<number, number>,
        private bounties: Map<number, number>,
        private privatePlayRequests: Map<number, PrivateRequest>,
        private lastTargetBeforeReroll: Map<number, number>,
        private performanceMonitor: PerformanceMonitorService
    ) {
        this.commandParser = new CommandParser(this.conn);
        this.registerAllCommands();
    }

    public async onCommandQuest(
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) {
        const quest = this.questManager.playerHasQuestAssigned(sender.MemberNumber);
        if (quest) {
            if (quest.description())
                this.conn.SendMessage("Whisper", "(" + quest.description() + ")", sender.MemberNumber);
            else
                this.conn.SendMessage("Whisper", "(Couldn't find the target of your quest, they might have just left the room)", sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", "(You currently don't have a quest assigned, you'll be assigned one automatically)", sender.MemberNumber);
        }
    }

    public async onCommandReroll(
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) {
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
    }

    public async onCommandStats(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);
        this.conn.SendMessage("Whisper", `(You are level ${player.level} and you have ${player.money} money). `, sender.MemberNumber);
    }

    public async onCommandLevelUp(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandBuy(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args.length == 0) {
            this.conn.SendMessage("Whisper",
                `(Use one of these:
/bot buy release
/bot buy prisonrelease`, sender.MemberNumber);
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

            case 'prisonrelease':
                const prisonPlayer = this.playerService.get(sender.MemberNumber);

                if (!this.prisonService.isImprisoned(sender)) {
                    this.conn.SendMessage("Whisper", `(You are not currently imprisoned)`, sender.MemberNumber);
                    return;
                }

                if (prisonPlayer.money < PRISON_RELEASE_COST) {
                    this.conn.SendMessage("Whisper", `(You need ${PRISON_RELEASE_COST} money to buy your freedom from prison)`, sender.MemberNumber);
                } else {
                    sender.giveKey(["bronze"]);
                    this.prisonService.releasePlayer(sender);
                    this.conn.SendMessage("Chat", `(${sender.toString()} has paid to be released from prison)`);
                    prisonPlayer.money -= PRISON_RELEASE_COST;
                    this.playerService.save(prisonPlayer);
                }
                break;

            default:
                this.conn.SendMessage("Whisper",
                    `(Use one of these:
/bot buy release
/bot buy prisonrelease`, sender.MemberNumber);
                break;

        }
    }

    public async onCommandBounty(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

        // Validate bounty amount - must be positive
        if (money <= 0) {
            this.conn.SendMessage("Whisper", `(Bounty amount must be greater than 0)`, sender.MemberNumber);
            return;
        }

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

    public async onCommandHelp(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const helpText = [
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
            "/bot dominant - Toggle dominant status (prevents being targeted by quests)",
            "",
            "/bot feedback [your message]"
        ].join("\n");

        this.conn.SendMessage("Whisper", helpText, sender.MemberNumber);
    }

    public async onCommandPrivate(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

                    this.startPrivatePlay(sender.MemberNumber, { X: 19, Y: 3 });
                    this.startPrivatePlay(request.requestingPlayer, { X: 20, Y: 3 });
                } else {
                    console.log("Private room is not empty");
                }
                break;

            case 'rescue':
                const player = this.conn.chatRoom.findMember(sender.MemberNumber);
                if (this.positionIsInRegion(player.MapPos, { TopLeft: { X: 18, Y: 1 }, BottomRight: { X: 21, Y: 7 } }))
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

    public async onCommandFeedback(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        this.feedbackService.appendFeedback(msg.Content, sender.MemberNumber, sender.toString());
        this.conn.SendMessage("Whisper", `(Your message has been saved - I'll read it soon.

If I have any follow-up questions, I might contact you while you're in the room, when the timing is appropriate.
If you see me (subMe) around and want to reach out directly, feel free to do so.

Thanks for your feedback!)`, sender.MemberNumber);
    }

    public async onCommandSettings(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandPay(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandPrisonTime(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.prisonService.isImprisoned(sender)) {
            this.conn.SendMessage("Whisper", `(You are not currently imprisoned)`, sender.MemberNumber);
            return;
        }

        const remainingTime = this.prisonService.getRemainingTime(sender);
        if (remainingTime <= 0) {
            this.conn.SendMessage("Whisper", `(Your prison time is up, you should be released soon)`, sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You have ${remainingTimeString(Date.now() + remainingTime)} left in prison)`, sender.MemberNumber);
        }
    }

    public async onCommandPerformance(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args.length === 0) {
            // Show current performance stats
            const stats = this.performanceMonitor.getFormattedStats();
            this.conn.SendMessage("Whisper", `(Performance Statistics:\n${stats})`, sender.MemberNumber);
        } else if (args[0] === "save") {
            // Save stats to file
            this.performanceMonitor.saveToFile();
            this.conn.SendMessage("Whisper", `(Performance statistics saved to file)`, sender.MemberNumber);
        } else if (args[0] === "reset") {
            // Reset stats
            this.performanceMonitor.reset();
            this.conn.SendMessage("Whisper", `(Performance statistics reset)`, sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(Usage: /bot performance [save|reset] - Show stats, save to file, or reset)`, sender.MemberNumber);
        }
    }

    // Helper methods
    private canReroll(memberNumber: number): boolean {
        const cooldown = this.rerollCD.get(memberNumber);
        if (!cooldown)
            return true;
        else return cooldown < Date.now();
    }

    private isPrivateRoomEmpty(): boolean {
        for (const c of this.conn.chatRoom.characters) {
            if (this.positionIsInRegion(c.MapPos, { TopLeft: { X: 18, Y: 1 }, BottomRight: { X: 21, Y: 7 } }))
                return false;
        }
        return true;
    }

    private startPrivatePlay(memberNumber: number, pos: { X: number, Y: number }) {
        this.conn.chatRoom.findMember(memberNumber).mapTeleport(pos);
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

    private positionIsInRegion(pos: { X: number, Y: number }, region: { TopLeft: { X: number, Y: number }, BottomRight: { X: number, Y: number } }): boolean {
        return pos.X >= region.TopLeft.X && pos.X <= region.BottomRight.X &&
               pos.Y >= region.TopLeft.Y && pos.Y <= region.BottomRight.Y;
    }

    // ===== ADMIN COMMANDS =====
    // All admin commands start with admin check and silent fail for non-admins

    public async onCommandDebug(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandAdmin(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandReset(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandTargetMe(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandDontTargetMe(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
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

    public async onCommandDominant(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);
        const wasDominant = player.getIsDominant();

        // Toggle dominant status
        player.setIsDominant(!wasDominant);
        this.playerService.save(player);

        if (!wasDominant) {
            // Player became dominant - cancel any quests targeting them
            const cancelledQuests = this.questManager.cancelQuestsByTarget(sender.MemberNumber);

            // Notify quest owners that their quests were cancelled
            for (const quest of cancelledQuests) {
                this.conn.SendMessage("Whisper",
                    "(Your quest target became a Dominant and is no longer available as a target. You'll be assigned a new quest.)",
                    quest.owner
                );
            }

            this.conn.SendMessage("Whisper",
                "(You are now a Dominant and wont be targetet by others quests. Do it again to revert you action.)",
                sender.MemberNumber
            );
        } else {
            // Player is no longer dominant
            this.conn.SendMessage("Whisper",
                "(You are now not a Dominant anymore and can be targetet by others quests.)",
                sender.MemberNumber
            );
        }
    }

    // ===== HELPER FUNCTIONS FOR ADMIN COMMANDS =====

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

    // ===== COMMAND REGISTRATION =====

    private registerAllCommands(): void {
        // Player Commands
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
        this.commandParser.register("prisontime", this.onCommandPrisonTime.bind(this));
        this.commandParser.register("performance", this.onCommandPerformance.bind(this));
        this.commandParser.register("dominant", this.onCommandDominant.bind(this));

        // Admin Commands (invisible to non-admins)
        this.commandParser.register("debug", this.onCommandDebug.bind(this));
        this.commandParser.register("admin", this.onCommandAdmin.bind(this));
        this.commandParser.register("reset", this.onCommandReset.bind(this));
        this.commandParser.register("targetme", this.onCommandTargetMe.bind(this));
        this.commandParser.register("donttargetme", this.onCommandDontTargetMe.bind(this));
    }
}
