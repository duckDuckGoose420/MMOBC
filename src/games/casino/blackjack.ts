import { API_Character } from "../../apiCharacter";
import { API_Connector } from "../../apiConnector";
import { BC_Server_ChatRoomMessage } from "../../logicEvent";
import { FORFEITS } from "./forfeits";
import { Card, createDeck, shuffleDeck } from "./pokerCards";

export const BLACKJACKHELP = `
Blackjack is a card game where the goal is to get as close to 21 as possible without going over.
Each player is dealt two cards, and can choose to "hit" (take another card) or "stand" (keep their current hand).
The dealer also has a hand, and must hit until they reach 17 or higher.
Blackjack (21 with two cards) pays 3:2.

Blackjack bets:
/bot bet <amount> - Bet on the current hand. Odds: 1:1.
/bot hit - Take another card from the deck.
/bot stand - Keep your current hand
/bot cancel - Cancel your bet. Only available before any cards are dealt.
/bot chips - Show your current chip balance.
/bot give <name or member number> <amount> - Give chips to another player.
/bot help - Show this help
`;

export interface BlackjackBet {
    memberNumber: number;
    memberName: string;
    stake: number;
    stakeForfeit: string;
}

type Hand = Card[];

export class BlackjackGame {
    private deck: Card[] = [];
    private dealerHand: Hand = [];
    private playerHands: Hand[] = [];
    private bets: BlackjackBet[] = [];
    private gameState: "waiting" | "betting" | "dealing" | "playing" =
        "waiting";

    public constructor(private conn: API_Connector) {}

    public parseBetCommand(
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): BlackjackBet | undefined {
        if (args.length !== 1) {
            this.conn.reply(msg, "Usage: /bot bet <amount>");
            return;
        }

        if (
            this.bets.find(
                (b) => b.memberNumber === senderCharacter.MemberNumber,
            )
        ) {
            this.conn.reply(
                msg,
                "You already placed a bet for this round. Use /bot cancel to cancel it.",
            );
            return;
        }

        const stake = args[0];
        let stakeValue: number;
        let stakeForfeit: string;

        if (FORFEITS[stake] !== undefined) {
            stakeValue = FORFEITS[stake].value;
            stakeForfeit = stake;
        } else {
            if (!/^\d+$/.test(stake)) {
                this.conn.reply(msg, "Invalid stake.");
                return;
            }
            stakeValue = parseInt(stake, 10);
            if (isNaN(stakeValue) || stakeValue < 1) {
                this.conn.reply(msg, "Invalid stake.");
                return;
            }
        }
        return {
            memberNumber: senderCharacter.MemberNumber,
            memberName: senderCharacter.toString(),
            stake: stakeValue,
            stakeForfeit,
        };
    }

    public parseHitCommand(): void {
        // Implement the hit logic here
    }

    public parseStandCommand(): void {
        // Implement the stand logic here
    }

    private calculateHandValue(hand: Hand): number {
        let value = 0;
        let aces = 0;

        for (const card of hand) {
            if (card.value === "A") {
                aces++;
                value += 11;
            } else if (["J", "Q", "K"].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }

        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }

        return value;
    }
}
