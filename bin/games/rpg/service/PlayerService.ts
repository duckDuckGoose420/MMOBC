import Storage from 'node-storage';
import { IPlayer } from "../types/IPlayer";
import { Player } from "../model/Player";
import { PerformanceMonitorService } from "./PerformanceMonitorService";
import { VIRTUAL_ITEMS } from "../objects/virtualItems";

export class PlayerService {
    private playerStorage = new Storage("./bin/games/rpg/data/players");
    private settingsStorage = new Storage("./bin/games/rpg/data/settings");
    private performanceMonitor: PerformanceMonitorService;
    private pendingCatchMeTargets = new Map<number, number>();

    constructor(performanceMonitor?: PerformanceMonitorService) {
        this.performanceMonitor = performanceMonitor || new PerformanceMonitorService();
    }

    save(player: IPlayer): void {
        // Performance monitoring: Track file system writes
        this.performanceMonitor.incrementCounter('playerService_save_calls');
        this.syncPendingCatchMe(player);
        this.playerStorage.put(player.memberNumber.toString(), {
            memberNumber: player.memberNumber,
            money: player.money,
            level: player.level,
            xp: player.xp,
            blockedPlayers: player.blockedPlayers,
            gracePeriodMinutes: player.gracePeriodMinutes,
            isDominant: player.isDominant,
            inventory: player.inventory,
        });
    }

    get(memberNumber: number): IPlayer {
        // Performance monitoring: Track file system reads
        this.performanceMonitor.incrementCounter('playerService_get_calls');

        let playerData = this.playerStorage.get(memberNumber.toString());

        if (!playerData) {
            const player = new Player(memberNumber);
            this.applyPendingCatchMe(player);
            return player;
        } else {
            let player: Player = new Player(memberNumber);
            this.applyPendingCatchMe(player);
            player.money = playerData.money;
            player.level = playerData.level;
            player.xp = typeof playerData.xp === 'number' ? playerData.xp : 0;

            if (Array.isArray(playerData.blockedPlayers)) {
                player.blockedPlayers = playerData.blockedPlayers.filter((n: unknown) => typeof n === 'number');
            }

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

            player.inventory = this.loadInventory(playerData.inventory);

            return player;
        }
    }

    serializePendingCatchMe(): Record<string, number> {
        const record: Record<string, number> = {};
        for (const [memberNumber, target] of this.pendingCatchMeTargets) {
            record[memberNumber.toString()] = target;
        }
        return record;
    }

    restorePendingCatchMe(record: Record<string, number>): void {
        this.pendingCatchMeTargets.clear();
        for (const [memberNumber, target] of Object.entries(record)) {
            if (typeof target === 'number') {
                this.pendingCatchMeTargets.set(Number(memberNumber), target);
            }
        }
    }

    private syncPendingCatchMe(player: IPlayer): void {
        if (player.pendingCatchMeTarget === null) {
            this.pendingCatchMeTargets.delete(player.memberNumber);
        } else {
            this.pendingCatchMeTargets.set(player.memberNumber, player.pendingCatchMeTarget);
        }
    }

    private applyPendingCatchMe(player: Player): void {
        player.pendingCatchMeTarget = this.pendingCatchMeTargets.get(player.memberNumber) ?? null;
    }

    getLevel(memberNumber: number): number {
        const player = this.get(memberNumber);
        return player.level;
    }

    remove(memberNumber: number): void {
        this.playerStorage.remove(memberNumber.toString());
    }

    private loadInventory(raw: unknown): Record<string, number> {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

        const inventory: Record<string, number> = {};
        for (const [itemId, count] of Object.entries(raw as Record<string, unknown>)) {
            if (!VIRTUAL_ITEMS[itemId]) continue;
            if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) continue;
            inventory[itemId] = count;
        }
        return inventory;
    }
}
