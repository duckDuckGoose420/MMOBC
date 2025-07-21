import Storage from 'node-storage';
import { IPlayer } from "../types/IPlayer";
import { Player } from "../model/Player";

export class PlayerService {
    private playerStorage = new Storage("./bin/games/rpg/data/players");
    
    save(player: IPlayer): void {
        this.playerStorage.put(player.memberNumber.toString(), player);
    }

    get(memberNumber: number): IPlayer {
        let player = this.playerStorage.get(memberNumber.toString());
        if (!player)
            player = new Player(memberNumber);
        return player;
    }

    getLevel(memberNumber: number): number {
        return this.playerStorage.get(memberNumber.toString() + ".level");
    }

    remove(memberNumber: number): void {
        this.playerStorage.remove(memberNumber.toString());
    }
}