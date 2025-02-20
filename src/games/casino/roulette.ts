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

import { API_Character } from "../../apiCharacter";
import { API_Connector } from "../../apiConnector";
import { BC_Server_ChatRoomMessage } from "../../logicEvent";
import { FORFEITS } from "./forfeits";

export const ROULETTEHELP = `Roulette bets:
/bot bet red <amount> - Bet on red. Odds: 1:1.
/bot bet black <amount> - Bet on black. Odds: 1:1.
/bot bet even <amount> - Bet on even. Odds: 1:1.
/bot bet odd <amount> - Bet on odd. Odds: 1:1.
/bot bet 1-18 <amount> - Bet on 1 - 18. Odds: 1:1.
/bot bet 19-36 <amount> - Bet on 19 - 36. Odds: 1:1.
/bot bet 1-12 <amount> - Bet on 1 - 12. Odds: 2:1.
/bot bet 13-24 <amount> - Bet on 13 - 24. Odds: 2:1.
/bot bet 25-36 <amount> - Bet on 25 - 36. Odds: 2:1.
/bot bet <number> <amount> - Bet on a single number. Odds: 35:1.
/bot chips - Show your current chip balance.
/bot odds - Show this help
`;

type RouletteBetKind =
    | "single"
    | "red"
    | "black"
    | "even"
    | "odd"
    | "1-18"
    | "19-36"
    | "1-12"
    | "13-24"
    | "25-36";

export interface RouletteBet {
    memberNumber: number;
    memberName: string;
    stake: number;
    stakeForfeit: string;
    kind: RouletteBetKind;
    number?: number;
}

export class RouletteGame {
    private bets: RouletteBet[] = [];

    public constructor(private conn: API_Connector) {}

    public parseBetCommand(
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): RouletteBet | undefined {
        if (args.length < 2) {
            this.conn.reply(msg, ROULETTEHELP);
            return;
        }

        if (this.bets.find((b) => b.memberNumber === senderCharacter.MemberNumber)) {
            senderCharacter.Tell("Whisper", "You already placed a bet.");
            return;
        }

        const betKind = args[0].toLowerCase();

        const stake = args[1];
        let stakeValue: number;
        let stakeForfeit: string;
        if (FORFEITS[stake] !== undefined) {
            stakeValue = FORFEITS[stake].value;
            stakeForfeit = stake;
        } else {
            stakeValue = parseInt(args[1], 10);
            if (isNaN(stakeValue) || stakeValue < 1 || stakeValue > 100) {
                senderCharacter.Tell("Whisper", "Invalid stake.");
                return;
            }
        }

        switch (betKind) {
            case "red":
            case "black":
            case "even":
            case "odd":
            case "1-18":
            case "19-36":
            case "1-12":
            case "13-24":
            case "25-36":
                return {
                    memberNumber: senderCharacter.MemberNumber,
                    memberName: senderCharacter.toString(),
                    stake: stakeValue,
                    stakeForfeit,
                    kind: betKind,
                };
                break;
            default:
                const betNumber = parseInt(betKind, 10);
                if (isNaN(betNumber) || betNumber < 0 || betNumber > 36) {
                    senderCharacter.Tell("Whisper", "Invalid bet.");
                    return;
                }
                return {
                    memberNumber: senderCharacter.MemberNumber,
                    memberName: senderCharacter.toString(),
                    stake: stakeValue,
                    stakeForfeit,
                    kind: "single",
                    number: betNumber,
                };
        }
    }

    public placeBet(bet: RouletteBet): void {
        this.bets.push(bet);
        if (bet.stakeForfeit) {
            if (bet.kind === "single") {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${FORFEITS[bet.stakeForfeit].name} for ${bet.stake} chips on ${bet.number}`,
                );
            } else {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${FORFEITS[bet.stakeForfeit].name} for ${bet.stake} credits on ${bet.kind}`,
                );
            }
        } else {
            if (bet.kind === "single") {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${bet.stake} chips on ${bet.number}`,
                );
            } else {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${bet.stake} chips on ${bet.kind}`,
                );
            }
        }
    }

    public textForBet(bet: RouletteBet): string {
        if (bet.kind === "single") {
            return "" + bet.number;
        } else {
            return bet.kind;
        }
    }

    public generateWinningNumber(): number {
        return Math.floor(Math.random() * 37);
    }

    public getWinningNumberText(winningNumber: number, emoji = false): string {
        let text = `${winningNumber}`;
        if (winningNumber === 0) {
            if (emoji) text += " 🟩";
        } else {
            text += winningNumber % 2 ? " black" : " red";
            if (emoji) {
                text += winningNumber % 2 ? " ⬛" : " 🟥";
            }
        }

        return text;
    }

    public getBets(): RouletteBet[] {
        return this.bets;
    }

    public getWinnings(winningNumber: number, bet: RouletteBet): number {
        if (bet.kind === "single" && bet.number === winningNumber) {
            return bet.stake * 36;
        } else if (
            (bet.kind === "red" &&
                winningNumber !== 0 &&
                winningNumber % 2 === 0) ||
            (bet.kind === "black" && winningNumber % 2 === 1) ||
            (bet.kind === "even" &&
                winningNumber !== 0 &&
                winningNumber % 2 === 0) ||
            (bet.kind === "odd" && winningNumber % 2 === 1) ||
            (bet.kind === "1-18" &&
                winningNumber >= 1 &&
                winningNumber <= 18) ||
            (bet.kind === "19-36" && winningNumber >= 19 && winningNumber <= 36)
        ) {
            return bet.stake * 2;
        } else if (
            (bet.kind === "1-12" &&
                winningNumber >= 1 &&
                winningNumber <= 12) ||
            (bet.kind === "13-24" &&
                winningNumber >= 13 &&
                winningNumber <= 24) ||
            (bet.kind === "25-36" && winningNumber >= 25 && winningNumber <= 36)
        ) {
            return bet.stake * 3;
        }
    }

    public clear(): void {
        this.bets = [];
    }
}
