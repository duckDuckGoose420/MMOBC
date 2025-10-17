import Storage from 'node-storage';
import { IPlayer } from "../types/IPlayer";
import { Player } from "../model/Player";
import { PerformanceMonitorService } from "./PerformanceMonitorService";

export class PlayerService {
    private playerStorage = new Storage("./bin/games/rpg/data/players");
    private settingsStorage = new Storage("./bin/games/rpg/data/settings");
    private performanceMonitor: PerformanceMonitorService;

    constructor(performanceMonitor?: PerformanceMonitorService) {
        this.performanceMonitor = performanceMonitor || new PerformanceMonitorService();
    }

    save(player: IPlayer): void {
        // Performance monitoring: Track file system writes
        this.performanceMonitor.incrementCounter('playerService_save_calls');
        this.playerStorage.put(player.memberNumber.toString(), player);
    }

    get(memberNumber: number): IPlayer {
        // Performance monitoring: Track file system reads
        this.performanceMonitor.incrementCounter('playerService_get_calls');

        let playerData = this.playerStorage.get(memberNumber.toString());

        if (!playerData) {
            return new Player(memberNumber);
        } else {
            let player: Player = new Player(memberNumber);
            player.money = playerData.money;
            player.level = playerData.level;

            // Check if gracePeriodMinutes exists in player data (new format)
            if (playerData.gracePeriodMinutes !== undefined) {
                player.gracePeriodMinutes = playerData.gracePeriodMinutes;
            } else {
                // Migration: Load from old settings file
                const settingsData = this.settingsStorage.get(memberNumber.toString());
                if (settingsData && settingsData.gracePeriodEnabled !== undefined) {
                    // Convert old boolean to minutes: true = 20, false = 0
                    player.gracePeriodMinutes = settingsData.gracePeriodEnabled ? 20 : 0;
                    // Save migrated data
                    this.save(player);
                }
            }

            // Check if isDominant exists in player data (new format)
            if (playerData.isDominant !== undefined) {
                player.isDominant = playerData.isDominant;
            } else {
                // Migration: Default to false for existing players
                player.isDominant = false;
                // Save migrated data
                this.save(player);
            }

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
