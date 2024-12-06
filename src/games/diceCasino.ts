import { API_Character } from "../apiCharacter";
import { API_Connector, MessageEvent } from "../apiConnector";
import { CommandParser } from "../commandParser";
import { wait } from "../hub/utils";

export class DiceCasino {
    requestDict = {};
    game = {
        status: "waiting",
        players: {},
        house: 0,
    };
    playerList = [];
    private commandParser: CommandParser;

    public constructor(private conn: API_Connector) {
        this.commandParser = new CommandParser(conn);
        this.conn.on("Message", this.onMessage);

        // this.commandParser.register("dare", this.onDare);
        // this.loadDares();
    }

    private startGame() {}

    private onMessage = async (msg: MessageEvent) => {
        if (
            msg.message.Content == "ServerEnter" &&
            msg.message.Type == "Action"
        ) {
            this.onPlayerJoin(msg);
        }
    };

    private onPlayerJoin = async (msg: MessageEvent) => {
        let sender = msg.sender;
        if (this.playerList.includes(sender.MemberNumber)) {
            console.log(`DiceCasino: Player ${sender} rejoined`);
        }else{
            console.log(`DiceCasino: Player ${sender} joined`);
            this.playerList.push(sender.MemberNumber);
            this.playerList[sender.MemberNumber].Money = 1000;
        }
    }

    private newPlayer = async (player: API_Character) => {
        this.playerList.push(player.MemberNumber);
        this.playerList[player.MemberNumber].name = player;
    }
}
