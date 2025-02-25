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

import { Db } from "mongodb";
import { API_Connector } from "../apiConnector";
import { CommandParser } from "../commandParser";
import { RouletteBet, RouletteGame, ROULETTEHELP } from "./casino/roulette";
import { API_Character } from "../apiCharacter";
import { BC_Server_ChatRoomMessage, TBeepType } from "../logicEvent";
import { CasinoStore } from "./casino/casinostore";
import { ROULETTE_WHEEL } from "./casino/rouletteWheelBundle";
import { API_AppearanceItem, AssetGet, BC_AppearanceItem } from "../item";
import { wait } from "../hub/utils";
import { remainingTimeString } from "../util/time";
import { importBundle } from "../appearance";
import { FORFEITS, forfeitsString, restraintsRemoveString, SERVICES, servicesString } from "./casino/forfeits";

const FREE_CHIPS = 20;
const TIME_UNTIL_SPIN_MS = 60000;

function canBetForfeit(
    char: API_Character,
    items: BC_AppearanceItem[],
): boolean {
    return items.every(
        (item) => char.Appearance.InventoryGet(item.Group)?.Name === undefined,
    );
}

const makeBio = (leaderBoard: string) => `🎰🎰🎰 Welcome to the Casino! 🎰🎰🎰

All visitors will automatically ber awarded ${FREE_CHIPS} chips every day!
You can bet with either chips or forefeits. If you win when betting with a forfeit, you gain the corresponding
amount of chips in the forfeits table. If you lose, the forfeit is applied. You bet forfeits by
using the keyword in the table instead of a chip amount.

Examples:
/bot bet red 10
    bets 10 chips on red
/bot bet 15 legbinder
    bets the 'leg binder' forfeit (worth 7 chips) on number 15

ℹ️ How To Play
==============
${ROULETTEHELP}
🪢 Forfeit Table
================
${forfeitsString()}

🛒 Shop
=======
Restraint removal: /bot remove <name> (eg. /bot remove gag):
${restraintsRemoveString()}

Other:
${servicesString()}

(All services are subject to limits of the people involved, obviously)

🏆 Leaderboard
==============
${leaderBoard}

🍀🍀🍀 Good luck! 🍀🍀🍀

This bot is made with ropeybot, fixes and improvements welcome!
https://github.com/FriendsOfBC/ropeybot
`;

export class Casino {
    private rouletteGame: RouletteGame;
    private commandParser: CommandParser;
    private store: CasinoStore;
    private willSpinAt: number | undefined;
    private spinTimeout: NodeJS.Timeout | undefined;
    private resetTimeout: NodeJS.Timeout | undefined;

    public constructor(
        private conn: API_Connector,
        db: Db,
    ) {
        this.rouletteGame = new RouletteGame(conn);
        this.store = new CasinoStore(db);
        this.commandParser = new CommandParser(conn);

        conn.on("CharacterEntered", this.onCharacterEntered);
        conn.on("Beep", this.onBeep);

        this.commandParser.register("bet", this.onCommandBet);
        this.commandParser.register("odds", this.onCommandOdds);
        this.commandParser.register("chips", this.onCommandChips);
        this.commandParser.register("addfriend", this.onCommandAddFriend);
        this.commandParser.register("remove", this.onCommandRemove);
        this.commandParser.register("buy", this.onCommandBuy);
        this.commandParser.register("vouchers", this.onCommandVouchers);

        this.commandParser.register("wheel", (sender, msg, args) => {
            this.getWheel();
        });

        this.commandParser.register("sign", (sender, msg, args) => {
            const sign = this.getSign();

            sign.setProperty("OverridePriority", { Text: 63 });
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", "");
            this.setTextColor("#ffffff");
        });

        // hack because otherwise an account update goes through after this item update and clears the text out
        setTimeout(() => {
            const wheel = this.getWheel();
            wheel.setProperty("Texts", [" ", " ", " ", " ", " ", " ", " ", " "]);

            const sign = this.getSign();
            sign.setProperty("OverridePriority", { Text: 63 });
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", "");
            this.setTextColor("#ffffff");

            this.setBio().catch((e) => {
                console.error("Failed to set bio.", e);
            });

            this.conn.setScriptPermissions(true, false);

            const scriptItem = this.conn.Player.Appearance.AddItem(AssetGet("ItemScript", "Script"));
            scriptItem.setProperty("Hide", ['Height', 'BodyUpper', 'ArmsLeft', 'ArmsRight', 'HandsLeft', 'HandsRight', 'BodyLower', 'HairFront', 'HairBack', 'Eyebrows', 'Eyes', 'Eyes2', 'Mouth', 'Nipples', 'Pussy', 'Pronouns', 'Head', 'Blush', 'Fluids', 'Emoticon', 'ItemNeck', 'ItemHead', 'Cloth', 'Bra', 'Socks', 'Shoes', 'ClothAccessory', 'Necklace', 'ClothLower', 'Panties', 'Suit', 'Gloves']);
        }, 500);
    }

    private getSign(): API_AppearanceItem {
        let sign = this.conn.Player.Appearance.InventoryGet("ItemMisc");
        if (!sign) {
            sign = this.conn.Player.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "");
            sign.setProperty("Text2", "");
        }
        return sign;
    }

    private getWheel(): API_AppearanceItem {
        const wheel = this.conn.Player.Appearance.InventoryGet("ItemDevices");
        if (wheel) {
            return wheel;
        }
        this.conn.Player.Appearance.applyBundle(ROULETTE_WHEEL);
        return this.conn.Player.Appearance.InventoryGet("ItemDevices");
    }

    private setTextColor(color: string): void {
        this.getSign().SetColor(["Default", "Default", color]);
    }

    private async setBio(): Promise<void> {
        const topPlayers = await this.store.getTopPlayers(50);
        const unredeemed = await this.store.getUnredeemedPurchases();

        this.conn.setBotDescription(
            makeBio(
                topPlayers
                    .map((player, idx) => {
                        return `${idx + 1}. ${player.name} (${player.memberNumber}): ${player.score} chips won`;
                    })
                    .join("\n")
            ),
        );
    }

    private onCharacterEntered = async (character: API_Character) => {
        const player = await this.store.getPlayer(character.MemberNumber);
        player.name = character.toString();

        const nextFreeCreditsAt = player.lastFreeCredits + 23 * 60 * 60 * 1000;
        if (nextFreeCreditsAt < Date.now()) {
            player.credits += FREE_CHIPS;
            player.lastFreeCredits = Date.now();
            await this.store.savePlayer(player);
            character.Tell(
                "Whisper",
                `Welcome to the Casino, ${character}! Here are your ${FREE_CHIPS} free chips for today. Good luck!`,
            );
        } else {
            character.Tell(
                "Whisper",
                `Welcome back, ${character}. ${remainingTimeString(nextFreeCreditsAt)} until your next free chips.`,
            );
        }
    };

    private onBeep = (beep: TBeepType) => {
        try {
            if (beep.Message?.startsWith("outfit add")) {
                const parts = beep.Message.split(" ");
                if (parts.length < 4) {
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        null,
                        "Usage: outfit add <name> <code>",
                    );
                    return;
                }
                const code = parts[parts.length - 1];
                const name = parts.slice(2, parts.length - 1).join(" ");

                try {
                    const outfit = importBundle(code);
                    this.store.saveOutfit({
                        name,
                        addedBy: beep.MemberNumber,
                        addedByName: beep.MemberName,
                        items: outfit,
                    });
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        null,
                        `Outfit ${name} added, thank you!`,
                    );
                } catch (e) {
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        null,
                        "Invalid outfit code",
                    );
                    return;
                }
            } else {
                this.conn.AccountBeep(beep.MemberNumber, null, "Unknown command");
            }
        } catch (e) {
            console.error("Failed to process beep", e);
        }
    };

    private onCommandBet = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (this.resetTimeout !== undefined) {
            this.conn.reply(msg, "The next game hasn't started yet");
            return;
        }

        const bet = this.rouletteGame.parseBetCommand(sender, msg, args);
        if (bet === undefined) {
            return;
        }

        const player = await this.store.getPlayer(sender.MemberNumber);

        if (bet.stakeForfeit === undefined) {
            if (player.credits - bet.stake < 0) {
                this.conn.reply(msg, `You don't have enough chips.`);
                return;
            }

            player.credits -= bet.stake;
            await this.store.savePlayer(player);
        } else {
            if (!canBetForfeit(sender, FORFEITS[bet.stakeForfeit].items())) {
                this.conn.reply(
                    msg,
                    `Looks like you're not in a position to be betting that`,
                );
                return;
            }
        }

        this.rouletteGame.placeBet(bet);

        if (this.willSpinAt === undefined) {
            if (this.resetTimeout !== undefined) {
                clearTimeout(this.resetTimeout);
                this.resetTimeout = undefined;
            }

            this.willSpinAt = Date.now() + TIME_UNTIL_SPIN_MS;
            this.spinTimeout = setInterval(() => {
                this.onSpinTimeout();
            }, 1000);
        }
    };

    private onCommandOdds = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.conn.reply(msg, ROULETTEHELP);
    };

    private onCommandChips = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const player = await this.store.getPlayer(sender.MemberNumber);
        this.conn.reply(msg, `You have ${player.credits} chips.`);
    };

    private onCommandAddFriend = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (args.length < 1) {
            this.conn.reply(msg, "Please specify a member number.");
            return;
        }

        const toAdd = this.conn.chatRoom.findCharacter(args[0]);
        if (!toAdd) {
            this.conn.reply(msg, "I can't find that person");
            return;
        }

        this.conn.Player.FriendListAdd(toAdd.MemberNumber);

        this.conn.reply(msg, `I am now friends with ${toAdd}! I like friends!`);
    };

    private onCommandRemove = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.reply(msg, "Usage: /bot remove <restraint>");
            return;
        }

        const restraintName = args[0].toLowerCase();
        const restraint = FORFEITS[restraintName];
        if (!restraint) {
            this.conn.reply(msg, "Unknown restraint.");
            return;
        }

        const player = await this.store.getPlayer(sender.MemberNumber);
        if (player.credits < restraint.value * 4) {
            this.conn.reply(msg, "You don't have enough chips.");
            return;
        }

        if (!sender.Appearance.InventoryGet(restraint.items()[0].Group)) {
            this.conn.reply(msg, `It doesn't look like you're wearing ${restraint.name}.`);
            return;
        }

        player.credits -= restraint.value * 4;
        await this.store.savePlayer(player);

        sender.Appearance.RemoveItem(restraint.items()[0].Group);

        this.conn.reply(
            msg,
            `Restraint removed. Enjoy your freedom, while it lasts.`,
        );
    };

    private onCommandBuy = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.reply(msg, "Usage: buy <service>");
            return;
        }

        const serviceName = args[0].toLowerCase();
        const service = SERVICES[serviceName];
        if (service === undefined) {
            this.conn.reply(msg, "Unknown service.");
            return;
        }

        let target: API_Character | undefined;
        if (serviceName === "player") {
            if (args.length < 2) {
                this.conn.reply(msg, "Usage: buy player <name or member number>");
                return;
            }
            target = this.conn.chatRoom.findCharacter(args[1]);
            if (!target) {
                this.conn.reply(msg, "I can't find that person.");
                return;
            }

            if (target.MemberNumber === sender.MemberNumber) {
                this.conn.reply(msg, "You can't buy yourself.");
                return;
            }

            if (target.Appearance.InventoryGet("ItemDevices")?.Name !== "Kennel") {
                this.conn.reply(msg, "Sorry, that player is not for sale (yet...)");
                return;
            }
        }

        const player = await this.store.getPlayer(sender.MemberNumber);
        if (player.credits < service.value) {
            this.conn.reply(msg, "You don't have enough chips.");
            return;
        }
        player.credits -= service.value;
        await this.store.savePlayer(player);

        if (serviceName === "player") {
            target.Appearance.RemoveItem("ItemDevices");
            if (!target.Appearance.InventoryGet("ItemNeck")) {
                target.Appearance.AddItem(AssetGet("ItemNeck", "LeatherCollar"));
            }
            target.Appearance.AddItem(AssetGet("ItemNeckRestraints", "CollarLeash"));
            const sign = target.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "Property of");
            sign.setProperty("Text2", sender.toString());
            this.conn.reply(msg, `Thanks for your purchase, have fun!`);
            return;
        }

        await this.store.addPurchase({
            memberNumber: sender.MemberNumber,
            memberName: sender.toString(),
            time: Date.now(),
            service: serviceName,
            redeemed: false,
        });

        this.conn.reply(msg, `You've bought a voucher for ${service.name}! Please contact Ellie to redeem your service.`);
    };

    private onCommandVouchers = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        const purchases = await this.store.getUnredeemedPurchases();
        if (purchases.length === 0) {
            this.conn.reply(msg, "No vouchers outstanding");
            return;
        }

        this.conn.reply(
            msg,
            purchases.map((p) => `${p.memberName} (${p.memberNumber}): ${SERVICES[p.service].name}`).join("\n"),
        );
    };

    private onSpinTimeout(): void {
        if (!this.willSpinAt) return;

        const sign = this.getSign();

        const timeLeft = this.willSpinAt - Date.now();
        if (timeLeft <= 0) {
            sign.Extended.SetText("");
            sign.setProperty("Text2", "");

            clearInterval(this.spinTimeout);
            this.spinWheel().catch((e) => {
                console.error("Failed to spin wheel.", e);
            });
        } else {
            this.setTextColor("#ffffff");
            sign.setProperty("Text2", `${Math.ceil(timeLeft / 1000)}`);
        }
    }

    private async spinWheel(): Promise<void> {
        const wheel = this.getWheel();
        const prevAngle = wheel.getData().Property.TargetAngle;

        const winningNumber = this.rouletteGame.generateWinningNumber();

        const prevSection = Math.floor(prevAngle / (360 / 8));
        const targetSection =
            (prevSection + (prevSection % 2 === winningNumber % 2 ? 2 : 1)) % 8;
        const targetAngle = (targetSection * 45 + 67) % 360;

        console.log(`Winning number: ${winningNumber}`);
        console.log(`Prev angle: ${prevAngle}`);
        console.log(`Prev section: ${prevSection}`);
        console.log(`Target section: ${targetSection}`);
        console.log(`Target angle: ${targetAngle}`);
        console.log(`Spinning wheel from ${prevAngle} to ${targetAngle}`);

        wheel.setProperty("TargetAngle", targetAngle);

        await wait(10000);

        let message = `The winning number is ${this.rouletteGame.getWinningNumberText(winningNumber, true)}`;

        const sign = this.getSign();
        sign.setProperty(
            "Text",
            this.rouletteGame.getWinningNumberText(winningNumber),
        );
        sign.setProperty("Text2", "");

        await wait(2000);

        for (const bet of this.rouletteGame.getBets()) {
            const winnings = this.rouletteGame.getWinnings(winningNumber, bet);
            if (winnings > 0) {
                const winnerMemberData = await this.store.getPlayer(
                    bet.memberNumber,
                );
                winnerMemberData.credits += winnings;
                winnerMemberData.score += winnings;
                await this.store.savePlayer(winnerMemberData);

                message += `\n${bet.memberName} wins ${winnings} chips!`;
            } else if (bet.stakeForfeit) {
                this.applyForfeit(bet);
                message += `\n${bet.memberName} lost and gets: ${FORFEITS[bet.stakeForfeit].name}!`;
            }
            await wait(500);
        }

        this.conn.SendMessage("Chat", message);

        this.rouletteGame.clear();
        await this.setBio();

        this.resetTimeout = setTimeout(() => {
            sign.setProperty("Text", "Place bets!");
            this.willSpinAt = undefined;
            this.resetTimeout = undefined;
        }, 10000);
    }

    private applyForfeit(rouletteBet: RouletteBet): void {
        const char = this.conn.chatRoom.findMember(rouletteBet.memberNumber);
        if (!char) return;

        const items = FORFEITS[rouletteBet.stakeForfeit].items();
        if (items.length === 1) {
            const added = char.Appearance.AddItem(items[0]);
            added.SetDifficulty(20);
            added.SetCraft({
                Name: `Pixie Casino ${FORFEITS[rouletteBet.stakeForfeit].name}`,
                Description:
                    "This item is property of Pixie Casino. Better luck next time!",
                MemberName: this.conn.Player.toString(),
                MemberNumber: this.conn.Player.MemberNumber,
            });
            added.lock("ExclusivePadlock", this.conn.Player.MemberNumber, {});
        } else {
            char.Appearance.slowlyApplyBundle(items);
        }
    }
}
