import { API_Character, BC_Server_ChatRoomMessage, API_Connector, positionIsInRegion, CommandParser, MessageEvent } from "bc-bot";
import { PlayerService } from "../service/PlayerService";
import { CatchMeBlockReason, QuestManager } from "../model/QuestManager";
import { IQuest } from "../types/IQuest";
import { XP_PER_QUEST } from "../model/Player";
import { FeedbackService } from "../service/FeedbackService";
import { TargetPriorityService, TargetStatus } from "../service/TargetPriorityService";
import { PrisonService } from "../service/PrisonService";
import { PerformanceMonitorService } from "../service/PerformanceMonitorService";
import { AutoMessageService } from "../service/AutoMessageService";
import { MapCopyService } from "../service/MapCopyService";
import { Util } from "./Util";
import { mapRegions } from "./areas";
import { PlayerIdentifier } from "./PlayerIdentifier";
import { PrivateRequest } from "../types/PrivateRequest";
import { remainingTimeString } from "../../../utils";
import { ITEM_CATCHME, ITEM_RELEASE, getVirtualItem, getAllVirtualItems } from "../objects/virtualItems";

const REROLL_CD = 3 * 60 * 1000;
const QUEST_CD = 10 * 60 * 1000;
const PRIVATE_CONFIRMATION_DURATION = 2 * 60 * 1000;
const PRIVATE_ROOM_COST = 100;
const PRISON_RELEASE_COST = 250;

export class PlayerCommands {
    private commandParser: CommandParser;
    private mapCopyService = new MapCopyService();

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
        private performanceMonitor: PerformanceMonitorService,
        private autoMessageService: AutoMessageService,
        private superusers: number[] = [],
        private requestRestart?: () => Promise<void>,
    ) {
        this.commandParser = new CommandParser(this.conn);
        this.registerAllCommands();
        this.conn.on("Message", this.onIncomingFriendRequest);
    }

    private onIncomingFriendRequest = (ev: MessageEvent) => {
        if (ev.message.Type !== "Hidden" || ev.message.Content !== "ChatRoomFriendRequestAdd") return;
        if (!ev.sender || ev.sender.IsBot()) return;
        this.sendFriendRequest(ev.sender.MemberNumber);
    };

    private sendFriendRequest(memberNumber: number): boolean {
        const added = this.conn.Player.FriendListAdd(memberNumber);
        if (added) {
            this.conn.SendMessage("Hidden", "ChatRoomFriendRequestAdd", memberNumber);
        }
        return added;
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
            this.questManager.cancelQuestForPlayer(sender.MemberNumber, this.conn);
            this.rerollCD.set(sender.MemberNumber, Date.now() + (REROLL_CD));
            this.conn.SendMessage("Whisper", "(Your quest has been cancelled, you'll receive a new one in a short time)", sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You can reroll your quest again in ${remainingTimeString(this.rerollCD.get(sender.MemberNumber))})`, sender.MemberNumber);
        }
    }

    public async onCommandStats(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);
        this.conn.SendMessage("Whisper", `(You are level ${player.level} (${player.xp}/${player.xpNeededToLevelUp()} XP) and you have ${player.money} money). `, sender.MemberNumber);
    }

    public async onCommandLevelUp(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);
        const needed = player.xpNeededToLevelUp();
        const remaining = needed - player.xp;
        this.conn.SendMessage("Whisper", `(You are level ${player.level} (${player.xp}/${needed} XP). You level up automatically by completing quests. ${remaining} more XP until the next level. Each level up currently gives you Catch me if you can.)`, sender.MemberNumber);
    }

    public async onCommandBuy(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args[0] === "prisonrelease") {
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
                if (positionIsInRegion(sender.MapPos, mapRegions.PRISON_ROOM)) {
                    this.prisonService.holdReleaseUntilLeave(sender.MemberNumber);
                }
                this.conn.SendMessage("Chat", `(${sender.toString()} has paid to be released from prison)`);
                prisonPlayer.money -= PRISON_RELEASE_COST;
                this.playerService.save(prisonPlayer);
            }
            return;
        }

        if (!positionIsInRegion(sender.MapPos, mapRegions.SHOP_AREA)) {
            this.conn.SendMessage("Whisper", "(You need to be in the shop to buy items.)", sender.MemberNumber);
            return;
        }

        if (args.length === 0) {
            this.sendShopMenu(sender);
            return;
        }

        this.handleShopBuy(sender, args);
    }

    public async onCommandSell(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!positionIsInRegion(sender.MapPos, mapRegions.SHOP_AREA)) {
            this.conn.SendMessage("Whisper", "(You need to be in the shop to sell items.)", sender.MemberNumber);
            return;
        }

        if (args.length === 0) {
            this.sendShopMenu(sender);
            return;
        }

        this.handleShopSell(sender, args);
    }

    public async onCommandBounty(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args.length === 0) {
            this.sendBountyList(sender.MemberNumber);
            return;
        }

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

    private sendBountyList(memberNumber: number): void {
        if (this.bounties.size === 0) {
            this.conn.SendMessage("Whisper", "(There are currently no active bounties)", memberNumber);
            return;
        }

        const lines = ["(Active Bounties:"];
        for (const [targetNumber, bounty] of this.bounties) {
            const target = this.conn.chatRoom.findMember(targetNumber);
            const name = target
                ? `${target.toString()}[#${target.MemberNumber}]`
                : `Player #${targetNumber}`;
            lines.push(`${name}: ${bounty} money`);
        }
        lines.push(")");
        this.conn.SendMessage("Whisper", lines.join("\n"), memberNumber);
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
            "/bot give [player] [item] [count] - Give an inventory item (count defaults to 1)",
            "/bot stats",
            "/bot inventory - List your virtual items",
            "/bot use [item] [player] - Use an item from your inventory. Player is optional for release",
            "/bot shop - Open the shop (only in the shop area)",
            "/bot buy [item] [count]",
            "/bot sell [item] [count]",
            "/bot bounty - List active bounties",
            "/bot bounty [player] [bounty]",
            "/bot levelup",
            "/bot buy prisonrelease - Cost: 250",
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
            "/bot block [player] - Toggle blocking a player (you won't be matched as quest targets). Use Member Number if they are not in the room",
            "/bot friend - Send a friend request so you can see when the bot is online",
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
                if (!request || !this.privatePlayRequests.delete(sender.MemberNumber)) {
                    this.conn.SendMessage("Whisper", "(You don't have any private play offers yet)", sender.MemberNumber);
                    return;
                }
                if (request.expiration < Date.now()) {
                    this.conn.SendMessage("Whisper", "(The request has expired)", sender.MemberNumber);
                    return;
                }

                if (this.isPrivateRoomEmpty()) {
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
                    this.conn.SendMessage("Whisper", "(At this moment the private room is in use by someone, once it's empty another couple can get inside)", sender.MemberNumber);
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
        if (!this.feedbackService.appendFeedback(msg.Content, sender.MemberNumber, sender.toString())) {
            this.conn.SendMessage("Whisper", `(/bot feedback [your message])`, sender.MemberNumber);
            return;
        }
        this.conn.SendMessage("Whisper", `(Your message has been saved - I'll read it soon.

If I have any follow-up questions, I might contact you while you're in the room, when the timing is appropriate.
If you see me (subMe) around and want to reach out directly, feel free to do so.

Thanks for your feedback!)`, sender.MemberNumber);
    }

    public async onCommandSettings(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args.length == 0) {
            this.conn.SendMessage("Whisper", `(
/bot settings graceperiod - Check your current grace period setting
/bot settings graceperiod [0-20] - Set grace period in minutes (0 = disabled, 20 = maximum)
/bot settings dominant - Check your current dominant status
/bot dominant - Toggle dominant status (prevents being targeted by quests)
/bot block [player] - Toggle blocking a player (you won't be matched as quest targets). Use Member Number if they are not in the room)`, sender.MemberNumber);
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
            case 'dominant':
                if (player.getIsDominant()) {
                    this.conn.SendMessage("Whisper", "(You are currently a Dominant and won't be targeted by others' quests. Use /bot dominant to toggle.)", sender.MemberNumber);
                } else {
                    this.conn.SendMessage("Whisper", "(You are currently not a Dominant and can be targeted by others' quests. Use /bot dominant to toggle.)", sender.MemberNumber);
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

    private sendAdminWhisper(memberNumber: number, text: string): void {
        this.conn.SendMessage("Whisper", text.startsWith("(") ? text : `(${text})`, memberNumber);
    }

    private isSuperuser(sender: API_Character): boolean {
        return this.superusers.includes(sender.MemberNumber);
    }

    // ===== ADMIN COMMANDS =====
    // All admin commands start with superuser check and silent fail for others

    public async onCommandDebug(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            // General debug overview
            const playerCount = this.conn.chatRoom.characters.filter(c => !c.IsBot()).length;
            const questCount = this.questManager.quests.count();
            const searchingCount = this.getPlayersSearchingForQuest();
            const bountyCount = this.bounties.size;
            const privateRoomEmpty = this.isPrivateRoomEmpty();

            this.sendAdminWhisper(sender.MemberNumber, `(Debug Overview:
Players: ${playerCount}
Active Quests: ${questCount}
Searching for Quest: ${searchingCount}
Active Bounties: ${bountyCount}
Private Room: ${privateRoomEmpty ? 'Empty' : 'In Use'})`);
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
                this.sendAdminWhisper(sender.MemberNumber, playerList);
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
                this.sendAdminWhisper(sender.MemberNumber, roomInfo);
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
                this.sendAdminWhisper(sender.MemberNumber, questInfo);
                break;

            case 'dominant':
                const dominantPlayers = this.conn.chatRoom.characters.filter(c =>
                    !c.IsBot() && this.playerService.get(c.MemberNumber).getIsDominant()
                );
                let dominantInfo = `(Dominant Players: ${dominantPlayers.length}\n`;
                for (const player of dominantPlayers) {
                    dominantInfo += this.formatPlayerShortInfo(player) + "\n";
                }
                dominantInfo += ")";
                this.sendAdminWhisper(sender.MemberNumber, dominantInfo);
                break;

            case 'bounties':
            case 'bounty':
                let bountyInfo = `(Active Bounties: ${this.bounties.size}\n`;
                for (const [targetNumber, bounty] of this.bounties) {
                    const target = this.conn.chatRoom.findMember(targetNumber);
                    if (target) {
                        bountyInfo += this.formatPlayerShortInfo(target) + "\n";
                    } else {
                        bountyInfo += `Player #${targetNumber} (not in room) - Bounty: ${bounty}\n`;
                    }
                }
                bountyInfo += ")";
                this.sendAdminWhisper(sender.MemberNumber, bountyInfo);
                break;

            case 'automessages':
            case 'automessage':
                this.autoMessageService.previewTo(sender.MemberNumber);
                break;

            case 'prison':
            case 'prisoners':
                const prisoners = this.prisonService.getAllPrisoners(sender);
                let prisonInfo = `(Prisoners: ${prisoners.size}\n`;
                for (const [memberNumber] of prisoners) {
                    const target = this.conn.chatRoom.findMember(memberNumber);
                    if (target) {
                        const remaining = this.prisonService.getRemainingTime(target);
                        const remainingStr = remaining > 0 ? remainingTimeString(Date.now() + remaining) : 'up';
                        prisonInfo += `${this.formatPlayerShortInfo(target)} - Remaining: ${remainingStr}\n`;
                    } else {
                        prisonInfo += `Player #${memberNumber} (not in room)\n`;
                    }
                }
                prisonInfo += ")";
                this.sendAdminWhisper(sender.MemberNumber, prisonInfo);
                break;

            default:
                // Check if it's a common typo first
                if (args[0] === 'players') {
                    this.sendAdminWhisper(sender.MemberNumber, "(Did you mean '/bot debug player'? Use 'player' not 'players')");
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
                this.sendAdminWhisper(sender.MemberNumber, results.join("\n\n"));
        }
    }

    public async onCommandAdmin(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0 || args[0] === 'help') {
            this.sendAdminWhisper(sender.MemberNumber, `(Admin Commands:
/bot debug - General overview
/bot debug player - List all players
/bot debug [player] - Player details (multiple players supported)
/bot debug room - Room status
/bot debug quests - All active quests
/bot debug dominant - List dominant players
/bot debug bounties - List active bounties
/bot debug prison - List imprisoned players
/bot debug automessages - Whisper all auto messages once

/bot reset [player] - Reset player cooldowns and quest
/bot complete [player] - Force complete a player's quest
/bot targetme [player] [player] ... - Make players prioritize targeting you
/bot donttargetme [player] [player] ... - Remove priority or block you as their target
/bot giveitem [player] [item] [count] - Give an inventory item (count defaults to 1)
/bot say [message] - Send a public chat message as the bot
/bot rejoin - Restart the bot and reload code changes
/bot mapcopy - Save the current room map
/bot mapcopy rollback - Restore the previous map (in memory, lost after restart)

/bot admin help - This help)`);
            return;
        }

        this.sendAdminWhisper(sender.MemberNumber, "(Unknown admin subcommand. Use /bot admin help for available commands)");
    }

    public async onCommandGive(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const parsed = this.parseGiveTargetItemCount(args);
        if (!parsed) {
            this.conn.SendMessage("Whisper", "(Usage: /bot give [player] [item] [count])", sender.MemberNumber);
            return;
        }

        if (parsed.count < 1) {
            this.conn.SendMessage("Whisper", "(Count must be at least 1)", sender.MemberNumber);
            return;
        }

        const item = getVirtualItem(parsed.itemId);
        if (!item) {
            this.conn.SendMessage("Whisper", "(Unknown item. Use /bot inventory to see what you have.)", sender.MemberNumber);
            return;
        }

        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, parsed.targetIdentifier);
        if (typeof target === 'string') {
            this.conn.SendMessage("Whisper", `(${target})`, sender.MemberNumber);
            return;
        }

        if (sender.MemberNumber == target.MemberNumber) {
            this.conn.SendMessage("Whisper", `(*Takes the item from your hand and puts it in the other)`, sender.MemberNumber);
            return;
        }

        if (target.IsBot()) {
            this.conn.SendMessage("Whisper", "(You cannot give items to the bot)", sender.MemberNumber);
            return;
        }

        const player = this.playerService.get(sender.MemberNumber);
        if (!player.removeItem(item.id, parsed.count)) {
            this.conn.SendMessage("Whisper", `(You don't have that many ${item.name} to give)`, sender.MemberNumber);
            return;
        }

        const targetPlayer = this.playerService.get(target.MemberNumber);
        targetPlayer.addItem(item.id, parsed.count);

        this.playerService.save(player);
        this.playerService.save(targetPlayer);

        this.conn.SendMessage("Chat", `(${sender.toString()} gave ${target.toString()} ${parsed.count}x ${item.name})`);
    }

    public async onCommandGiveItem(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        const parsed = this.parseGiveTargetItemCount(args);
        if (!parsed) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot giveitem [player] [item] [count])");
            return;
        }

        if (parsed.count < 1) {
            this.sendAdminWhisper(sender.MemberNumber, "(Count must be at least 1)");
            return;
        }

        const item = getVirtualItem(parsed.itemId);
        if (!item) {
            this.sendAdminWhisper(sender.MemberNumber, "(Unknown item)");
            return;
        }

        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, parsed.targetIdentifier);
        if (typeof target === 'string') {
            this.sendAdminWhisper(sender.MemberNumber, `(${target})`);
            return;
        }

        if (target.IsBot()) {
            this.sendAdminWhisper(sender.MemberNumber, "(You cannot give items to the bot)");
            return;
        }

        const player = this.playerService.get(target.MemberNumber);
        player.addItem(item.id, parsed.count);
        this.playerService.save(player);

        this.sendAdminWhisper(sender.MemberNumber, `(Gave ${target.toString()} ${parsed.count}x ${item.name})`);
        this.conn.SendMessage("Whisper", `(You received ${parsed.count}x ${item.name}. Check /bot inventory)`, target.MemberNumber);
    }

    public async onCommandReset(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot reset [player])");
            return;
        }

        const targetIdentifier = args.join(' ');
        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof target === 'string') {
            this.sendAdminWhisper(sender.MemberNumber, `(${target})`);
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

        const resetPlayer = this.playerService.get(target.MemberNumber);
        if (resetPlayer.getPendingCatchMeTarget() !== null) {
            resetPlayer.setPendingCatchMeTarget(null);
            this.playerService.save(resetPlayer);
        }

        this.sendAdminWhisper(sender.MemberNumber, `(${target.toString()} has been reset)`);
    }

    public async onCommandComplete(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot complete [player])");
            return;
        }

        const targetIdentifier = args.join(' ');
        const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof target === 'string') {
            this.sendAdminWhisper(sender.MemberNumber, `(${target})`);
            return;
        }

        const quest = this.questManager.completeQuestForPlayer(target.MemberNumber);
        if (!quest) {
            this.sendAdminWhisper(sender.MemberNumber, `(${target.toString()} has no active quest)`);
            return;
        }

        this.rewardCompletedQuest(quest);
        this.sendAdminWhisper(sender.MemberNumber, `(Force completed quest for ${target.toString()})`);
    }

    public rewardCompletedQuest(quest: IQuest): void {
        const player = this.playerService.get(quest.owner);
        player.money += 100;
        const levelsGained = player.addXp(XP_PER_QUEST);
        if (levelsGained > 0) {
            player.addItem(ITEM_CATCHME, levelsGained);
        }
        this.playerService.save(player);
        this.questCD.set(quest.owner, Date.now() + (QUEST_CD));
        const gracePeriodMinutes = player.getGracePeriodMinutes();
        let levelUpText = "";
        if (levelsGained > 0) {
            const item = getVirtualItem(ITEM_CATCHME);
            levelUpText = ` You reached level ${player.level} and received ${levelsGained}x ${item?.name ?? "Catch me if you can"}.`;
        }
        if (gracePeriodMinutes > 0) {
            const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
            this.gracePeriods.set(quest.owner, Date.now() + gracePeriodMs);
            this.conn.SendMessage("Whisper", "(You have completed your quest!" + levelUpText + " You have " + remainingTimeString(Date.now() + gracePeriodMs + 5000) + " free from being the target of quests to have some time to play with your target. Within this time you can access the private room with \"/bot private claim [player]\")", quest.owner);
        } else {
            this.conn.SendMessage("Whisper", "(You have completed your quest!" + levelUpText + ")", quest.owner);
        }
    }

    public async onCommandTargetMe(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot targetme [player] [player] ...)");
            return;
        }

        const successful = [];
        const failed = [];

        for (const targetIdentifier of args) {
            const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
            if (typeof target === 'string') {
                failed.push(targetIdentifier);
            } else {
                // Player prioritizes admin as quest target (don't toggle)
                this.targetPriorityService.setTargetStatus(target.MemberNumber, sender.MemberNumber, TargetStatus.PRIORITY);
                successful.push(target.toString());
            }
        }

        let response = "";
        if (successful.length > 0) {
            response += `Will prioritize targeting you: ${successful.join(', ')}`;
        }
        if (failed.length > 0) {
            if (response) response += "\n";
            response += `Players not found: ${failed.join(', ')}`;
        }

        this.sendAdminWhisper(sender.MemberNumber, `(${response})`);
    }

    public async onCommandDontTargetMe(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot donttargetme [player] [player] ...)");
            return;
        }

        const results = [];
        for (const targetIdentifier of args) {
            const target = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
            if (typeof target === 'string') {
                results.push(`${targetIdentifier}: ${target}`);
            } else {
                const currentStatus = this.targetPriorityService.getTargetStatus(target.MemberNumber, sender.MemberNumber);
                let newStatus: string;

                if (currentStatus === 'priority') {
                    this.targetPriorityService.removePriority(target.MemberNumber, sender.MemberNumber);
                    newStatus = 'Removed from priority';
                } else if (currentStatus === 'blocked') {
                    this.targetPriorityService.toggleBlock(target.MemberNumber, sender.MemberNumber);
                    newStatus = 'Unblocked';
                } else {
                    this.targetPriorityService.toggleBlock(target.MemberNumber, sender.MemberNumber);
                    newStatus = 'Blocked';
                }

                results.push(`${target.toString()}: ${newStatus}`);
            }
        }

        this.sendAdminWhisper(sender.MemberNumber, `(${results.join('\n')})`);
    }

    public async onCommandSay(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args.length === 0) {
            this.sendAdminWhisper(sender.MemberNumber, "(Usage: /bot say [message])");
            return;
        }

        this.conn.SendMessage("Chat", args.join(' '));
    }

    public async onCommandMapCopy(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (args[0] === "rollback") {
            const restored = this.mapCopyService.rollback();
            if (!restored) {
                this.sendAdminWhisper(sender.MemberNumber, "(No map rollback available)");
                return;
            }
            this.conn.chatRoom.map.setMapFromString(restored);
            this.sendAdminWhisper(sender.MemberNumber, `(Map rollback applied. ${this.mapCopyService.remainingRollbacks()} remaining.)`);
            return;
        }

        const mapData = this.conn.chatRoom.map.mapData;
        if (!mapData) {
            this.sendAdminWhisper(sender.MemberNumber, "(No map data to copy)");
            return;
        }

        this.mapCopyService.copy(mapData);
        this.sendAdminWhisper(sender.MemberNumber, `(Map saved. ${this.mapCopyService.remainingRollbacks()} rollback(s) available until restart.)`);
    }

    public async onCommandRejoin(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!this.isSuperuser(sender)) return;

        if (!this.requestRestart) {
            this.sendAdminWhisper(sender.MemberNumber, "(Restart is not available)");
            return;
        }

        this.conn.SendMessage("Chat", "(Bot is restarting...)");
        this.conn.SendMessage("Chat", "(Please wait, the bot will disconnect briefly.)");
        this.conn.SendMessage("Chat", "(The bot should reconnect in a few seconds.)");
        void this.requestRestart();
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

    public async onCommandBlock(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);

        if (args.length === 0) {
            const blocked = player.getBlockedPlayers();
            let list = "None";
            if (blocked.length > 0) {
                list = blocked.map(n => {
                    const character = this.conn.chatRoom.findMember(n);
                    return character ? `${character.toString()} [#${n}]` : `#${n}`;
                }).join(', ');
            }
            this.conn.SendMessage("Whisper", `(Usage: /bot block [player] - Toggle blocking a player so you are not assigned as quest targets for each other.\nUse Member Number if they are not in the room.\nCurrently blocked: ${list})`, sender.MemberNumber);
            return;
        }

        const targetIdentifier = args.join(' ');
        const resolved = this.resolveBlockTarget(sender, player, targetIdentifier);
        if (typeof resolved === 'string') {
            this.conn.SendMessage("Whisper", `(${resolved})`, sender.MemberNumber);
            return;
        }

        const nowBlocked = player.toggleBlocked(resolved.memberNumber);
        this.playerService.save(player);

        if (nowBlocked) {
            const senderQuest = this.questManager.playerHasQuestAssigned(sender.MemberNumber);
            if (senderQuest && senderQuest.targetPlayer === resolved.memberNumber) {
                this.questManager.cancelQuestForPlayer(sender.MemberNumber);
            }
            const targetQuest = this.questManager.playerHasQuestAssigned(resolved.memberNumber);
            if (targetQuest && targetQuest.targetPlayer === sender.MemberNumber) {
                this.questManager.cancelQuestForPlayer(resolved.memberNumber);
            }
            this.conn.SendMessage("Whisper", `(You blocked ${resolved.label}. You will no longer be assigned as quest targets for each other.)`, sender.MemberNumber);
        } else {
            this.conn.SendMessage("Whisper", `(You unblocked ${resolved.label})`, sender.MemberNumber);
        }
    }

    private resolveBlockTarget(
        sender: API_Character,
        player: ReturnType<PlayerService["get"]>,
        targetIdentifier: string,
    ): { memberNumber: number; label: string } | string {
        const inRoom = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
        if (typeof inRoom !== 'string') {
            if (sender.MemberNumber === inRoom.MemberNumber) return "You cannot block yourself";
            if (inRoom.IsBot()) return "You cannot block the bot";
            return { memberNumber: inRoom.MemberNumber, label: inRoom.toString() };
        }

        const memberNumber = PlayerIdentifier.parseMemberNumber(targetIdentifier);
        if (memberNumber === null) {
            if (inRoom.includes("not found")) {
                return `${inRoom}. Use Member Number to block a saved player who is not in the room.`;
            }
            return inRoom;
        }

        if (sender.MemberNumber === memberNumber) return "You cannot block yourself";
        if (this.conn.Player.MemberNumber === memberNumber) return "You cannot block the bot";
        if (!player.hasBlocked(memberNumber) && !this.playerService.has(memberNumber)) {
            return `Could not find player #${memberNumber} in the room or saved players`;
        }

        return { memberNumber, label: `#${memberNumber}` };
    }

    public async onCommandFriend(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (sender.IsBot()) return;

        const added = this.sendFriendRequest(sender.MemberNumber);
        if (added) {
            this.conn.SendMessage(
                "Whisper",
                `(Friend request sent. Accept it to see when I'm online in your friend list.)`,
                sender.MemberNumber,
            );
        } else {
            this.conn.SendMessage(
                "Whisper",
                `(We're already friends. If I don't show as online, add me back from my profile.)`,
                sender.MemberNumber,
            );
        }
    }

    public async onCommandInventory(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        const player = this.playerService.get(sender.MemberNumber);
        const entries = Object.entries(player.inventory);
        if (entries.length === 0) {
            this.conn.SendMessage("Whisper", "(Your inventory is empty)", sender.MemberNumber);
            return;
        }

        const lines = ["(Inventory:"];
        for (const [itemId, count] of entries) {
            const item = getVirtualItem(itemId);
            if (!item) continue;
            const targetHint = item.id === ITEM_RELEASE ? "" : " [player]";
            lines.push(`${item.name} x${count} - /bot use ${item.id}${targetHint}`);
        }
        lines.push(")");
        this.conn.SendMessage("Whisper", lines.join("\n"), sender.MemberNumber);
    }

    public async onCommandUse(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (args.length < 1) {
            this.conn.SendMessage("Whisper", "(Usage: /bot use [item] [player]. Player is optional for release. Check /bot inventory for what you have and how each item works.)", sender.MemberNumber);
            return;
        }

        const itemId = args[0];
        const item = getVirtualItem(itemId);
        if (!item) {
            this.conn.SendMessage("Whisper", "(Unknown item. Use /bot inventory to see what you have.)", sender.MemberNumber);
            return;
        }

        const targetIdentifier = args.slice(1).join(' ').trim();
        let target: API_Character;
        if (!targetIdentifier) {
            if (itemId !== ITEM_RELEASE) {
                this.conn.SendMessage("Whisper", "(Usage: /bot use [item] [player]. Check /bot inventory for what you have and how each item works.)", sender.MemberNumber);
                return;
            }
            target = sender;
        } else {
            const identified = PlayerIdentifier.identifyPlayerInRoom(this.conn.chatRoom, targetIdentifier);
            if (typeof identified === 'string') {
                this.conn.SendMessage("Whisper", `(${identified})`, sender.MemberNumber);
                return;
            }
            target = identified;
        }

        if (target.IsBot()) {
            this.conn.SendMessage("Whisper", "(You cannot use that on the bot)", sender.MemberNumber);
            return;
        }

        const player = this.playerService.get(sender.MemberNumber);
        if (player.getItemCount(itemId) < 1) {
            this.conn.SendMessage("Whisper", "(You don't have that item)", sender.MemberNumber);
            return;
        }

        if (itemId === ITEM_CATCHME) {
            if (sender.MemberNumber === target.MemberNumber) {
                this.conn.SendMessage("Whisper", "(You cannot use that on yourself)", sender.MemberNumber);
                return;
            }

            const hunter = this.playerService.get(target.MemberNumber);
            if (hunter.getPendingCatchMeTarget() !== null) {
                this.conn.SendMessage("Whisper", "(That player already has a pending Catch me if you can. The item was not used.)", sender.MemberNumber);
                return;
            }

            const blockReason = this.questManager.getCatchMeTargetBlockReason(
                target.MemberNumber,
                sender.MemberNumber,
                this.gracePeriods,
            );
            if (blockReason) {
                this.conn.SendMessage("Whisper", `(${this.catchMeBlockMessage(blockReason)})`, sender.MemberNumber);
                return;
            }

            player.removeItem(ITEM_CATCHME, 1);
            hunter.setPendingCatchMeTarget(sender.MemberNumber);
            this.playerService.save(player);
            this.playerService.save(hunter);

            this.conn.SendMessage("Whisper", `(You used ${item.name} on ${target.toString()}. ${item.warning})`, sender.MemberNumber);
            return;
        }

        if (itemId === ITEM_RELEASE) {
            player.removeItem(ITEM_RELEASE, 1);
            this.playerService.save(player);
            await Util.freeCharacter(target);
            if (sender.MemberNumber === target.MemberNumber) {
                this.conn.SendMessage("Chat", `(${sender.toString()} has used a release item to be freed from their binds)`);
            } else {
                this.conn.SendMessage("Chat", `(${sender.toString()} has used a release item to free ${target.toString()} from their binds)`);
            }
            this.conn.SendMessage("Whisper", `(You used ${item.name} on ${target.toString()}. ${item.warning})`, sender.MemberNumber);
            return;
        }

        this.conn.SendMessage("Whisper", `(You cannot use ${item.name} yet)`, sender.MemberNumber);
    }

    public async onCommandShop(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
        if (!positionIsInRegion(sender.MapPos, mapRegions.SHOP_AREA)) {
            this.conn.SendMessage("Whisper", "(You need to be in the shop to buy or sell items.)", sender.MemberNumber);
            return;
        }

        if (args[0] === "buy") {
            this.conn.SendMessage("Whisper", "(Use /bot buy [item] [count] to buy items.)", sender.MemberNumber);
            return;
        }
        if (args[0] === "sell") {
            this.conn.SendMessage("Whisper", "(Use /bot sell [item] [count] to sell items.)", sender.MemberNumber);
            return;
        }

        this.sendShopMenu(sender);
    }

    private sendShopMenu(sender: API_Character): void {
        const player = this.playerService.get(sender.MemberNumber);
        const lines = [`(Shop: ${player.money} money, level ${player.level}`];

        for (const item of getAllVirtualItems()) {
            if (!item.isPurchaseable && !item.isSellable) continue;
            lines.push("");
            lines.push(`${item.name} (${item.id})`);
            if (item.isPurchaseable) {
                const levelNote = item.levelRequirement > 1 ? `, requires level ${item.levelRequirement}` : "";
                lines.push(`    Buy: ${item.price} money${levelNote} - /bot buy ${item.id}`);
            }
            if (item.isSellable) {
                lines.push(`    Sell: ${item.sellPrice} money - /bot sell ${item.id}`);
            }
            lines.push(`    ${item.warning}`);
        }

        lines.push(")");
        this.conn.SendMessage("Whisper", lines.join("\n"), sender.MemberNumber);
    }

    private handleShopBuy(sender: API_Character, args: string[]): void {
        const parsed = this.parseItemAndCount(args);
        if (!parsed) {
            this.conn.SendMessage("Whisper", "(Usage: /bot buy [item] [count])", sender.MemberNumber);
            return;
        }
        if (parsed.count < 1) {
            this.conn.SendMessage("Whisper", "(Count must be at least 1)", sender.MemberNumber);
            return;
        }

        const item = getVirtualItem(parsed.itemId);
        if (!item) {
            this.conn.SendMessage("Whisper", "(Unknown item. Use /bot shop to see what is for sale.)", sender.MemberNumber);
            return;
        }
        if (!item.isPurchaseable) {
            this.conn.SendMessage("Whisper", `(${item.name} cannot be bought.)`, sender.MemberNumber);
            return;
        }

        const player = this.playerService.get(sender.MemberNumber);
        if (player.level < item.levelRequirement) {
            this.conn.SendMessage("Whisper", `(You need to be level ${item.levelRequirement} to buy ${item.name}.)`, sender.MemberNumber);
            return;
        }

        const totalCost = item.price * parsed.count;
        if (player.money < totalCost) {
            this.conn.SendMessage("Whisper", `(You need ${totalCost} money to buy ${parsed.count}x ${item.name}.)`, sender.MemberNumber);
            return;
        }

        player.money -= totalCost;
        player.addItem(item.id, parsed.count);
        this.playerService.save(player);
        this.conn.SendMessage("Whisper", `(You bought ${parsed.count}x ${item.name} for ${totalCost} money.)`, sender.MemberNumber);
    }

    private handleShopSell(sender: API_Character, args: string[]): void {
        const parsed = this.parseItemAndCount(args);
        if (!parsed) {
            this.conn.SendMessage("Whisper", "(Usage: /bot sell [item] [count])", sender.MemberNumber);
            return;
        }
        if (parsed.count < 1) {
            this.conn.SendMessage("Whisper", "(Count must be at least 1)", sender.MemberNumber);
            return;
        }

        const item = getVirtualItem(parsed.itemId);
        if (!item) {
            this.conn.SendMessage("Whisper", "(Unknown item. Use /bot shop to see what you can sell.)", sender.MemberNumber);
            return;
        }
        if (!item.isSellable) {
            this.conn.SendMessage("Whisper", `(${item.name} cannot be sold.)`, sender.MemberNumber);
            return;
        }

        const player = this.playerService.get(sender.MemberNumber);
        if (player.getItemCount(item.id) < parsed.count) {
            this.conn.SendMessage("Whisper", `(You don't have ${parsed.count}x ${item.name}.)`, sender.MemberNumber);
            return;
        }

        const totalValue = item.sellPrice * parsed.count;
        player.removeItem(item.id, parsed.count);
        player.money += totalValue;
        this.playerService.save(player);
        this.conn.SendMessage("Whisper", `(You sold ${parsed.count}x ${item.name} for ${totalValue} money.)`, sender.MemberNumber);
    }

    private parseItemAndCount(args: string[]): { itemId: string, count: number } | null {
        if (args.length === 0) return null;
        if (args.length >= 2 && Util.isValidIntegerString(args[args.length - 1])) {
            return { itemId: args.slice(0, -1).join(" "), count: Number(args[args.length - 1]) };
        }
        return { itemId: args.join(" "), count: 1 };
    }

    private parseGiveTargetItemCount(args: string[]): { targetIdentifier: string, itemId: string, count: number } | null {
        if (args.length < 2) return null;
        const parts = [...args];
        let count = 1;
        if (parts.length >= 3 && Util.isValidIntegerString(parts[parts.length - 1])) {
            count = Number(parts.pop());
        }
        const itemId = parts.pop()!;
        const targetIdentifier = parts.join(" ");
        if (!targetIdentifier) return null;
        return { targetIdentifier, itemId, count };
    }

    private catchMeBlockMessage(reason: CatchMeBlockReason): string {
        switch (reason) {
            case "dominant":
                return "You are currently a Dominant and cannot be targeted by quests. Use /bot dominant to toggle. The item was not used.";
            case "blocked":
                return "You cannot currently use that on that player. The item was not used.";
            case "grace":
                return "You are in a grace period and cannot currently be targeted by quests. The item was not used.";
            case "safe":
                return "You cannot currently be targeted while in a safe area. The item was not used.";
            case "dev_room":
                return "You cannot currently be targeted in this area. The item was not used.";
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
        info += `XP: ${playerData.xp}/${playerData.xpNeededToLevelUp()}\n`;
        info += `Money: ${playerData.money}\n`;
        info += `Dominant: ${playerData.getIsDominant() ? 'Yes' : 'No'}\n`;

        const blockedPlayers = playerData.getBlockedPlayers();
        if (blockedPlayers.length > 0) {
            const blockedNames = blockedPlayers.map(n => this.conn.chatRoom.findMember(n)?.toString() || `#${n}`);
            info += `Blocked Players: ${blockedNames.join(', ')}\n`;
        } else {
            info += `Blocked Players: None\n`;
        }

        const inventoryEntries = Object.entries(playerData.inventory);
        if (inventoryEntries.length > 0) {
            const names = inventoryEntries.map(([id, count]) => {
                const item = getVirtualItem(id);
                return `${item?.name ?? id} x${count}`;
            });
            info += `Inventory: ${names.join(', ')}\n`;
        } else {
            info += `Inventory: Empty\n`;
        }

        const pendingCatchMe = playerData.getPendingCatchMeTarget();
        if (pendingCatchMe !== null) {
            const pendingChar = this.conn.chatRoom.findMember(pendingCatchMe);
            info += `Pending Catch me if you can: ${pendingChar ? pendingChar.toString() : '#' + pendingCatchMe}\n`;
        } else {
            info += `Pending Catch me if you can: None\n`;
        }
        info += `Safe: ${isSafe ? 'Yes' : 'No'}\n`;

        if (this.prisonService.isImprisoned(player)) {
            const remaining = this.prisonService.getRemainingTime(player);
            info += `Imprisoned: ${remaining > 0 ? remainingTimeString(Date.now() + remaining) : 'up'}\n`;
        } else {
            info += `Imprisoned: No\n`;
        }

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
        this.commandParser.register("sell", this.onCommandSell.bind(this));
        this.commandParser.register("bounty", this.onCommandBounty.bind(this));
        this.commandParser.register("help", this.onCommandHelp.bind(this));
        //this.commandParser.register("claim", this.onCommandClaim.bind(this));
        this.commandParser.register("private", this.onCommandPrivate.bind(this));
        this.commandParser.register("feedback", this.onCommandFeedback.bind(this));
        this.commandParser.register("settings", this.onCommandSettings.bind(this));
        this.commandParser.register("levelup", this.onCommandLevelUp.bind(this));
        this.commandParser.register("pay", this.onCommandPay.bind(this));
        this.commandParser.register("give", this.onCommandGive.bind(this));
        this.commandParser.register("prisontime", this.onCommandPrisonTime.bind(this));
        this.commandParser.register("performance", this.onCommandPerformance.bind(this));
        this.commandParser.register("dominant", this.onCommandDominant.bind(this));
        this.commandParser.register("block", this.onCommandBlock.bind(this));
        this.commandParser.register("friend", this.onCommandFriend.bind(this));
        this.commandParser.register("inventory", this.onCommandInventory.bind(this));
        this.commandParser.register("use", this.onCommandUse.bind(this));
        this.commandParser.register("shop", this.onCommandShop.bind(this));

        // Admin Commands (invisible to non-admins)
        this.commandParser.register("debug", this.onCommandDebug.bind(this));
        this.commandParser.register("admin", this.onCommandAdmin.bind(this));
        this.commandParser.register("reset", this.onCommandReset.bind(this));
        this.commandParser.register("complete", this.onCommandComplete.bind(this));
        this.commandParser.register("giveitem", this.onCommandGiveItem.bind(this));
        this.commandParser.register("targetme", this.onCommandTargetMe.bind(this));
        this.commandParser.register("donttargetme", this.onCommandDontTargetMe.bind(this));
        this.commandParser.register("say", this.onCommandSay.bind(this));
        this.commandParser.register("rejoin", this.onCommandRejoin.bind(this));
        this.commandParser.register("mapcopy", this.onCommandMapCopy.bind(this));
    }
}
