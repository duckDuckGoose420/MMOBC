import Storage from 'node-storage';
import { IPlayer } from "../types/IPlayer";
import { Player } from "../model/Player";

export class PlayerService {
    private playerStorage = new Storage("./bin/games/rpg/data/players");
    
    save(player: IPlayer): void {
        this.playerStorage.put(player.memberNumber.toString(), player);
    }

    get(memberNumber: number): IPlayer {
        let playerData = this.playerStorage.get(memberNumber.toString());
        
        if (!playerData)
            return new Player(memberNumber);
        else {
            let player: Player = new Player(memberNumber);
            player.money = playerData.money;
            player.level = playerData.level;
            return player;
        }
    }

    getLevel(memberNumber: number): number {
        const player = this.get(memberNumber);
        return player.level;
    }

    remove(memberNumber: number): void {
        this.playerStorage.remove(memberNumber.toString());
    }
}