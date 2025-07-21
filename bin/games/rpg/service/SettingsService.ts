import Storage from 'node-storage';
import { Settings } from "../model/Settings";

export class SettingsService {
    private settingsStorage = new Storage("./bin/games/rpg/data/settings");
    
    save(memberNumber: number, settings: Settings): void {
        this.settingsStorage.put(memberNumber.toString(), settings.toJSON());
    }

    get(memberNumber: number): Settings {
        const rawSettings = this.settingsStorage.get(memberNumber.toString());
        const settings = rawSettings ? Settings.fromRaw(rawSettings) : new Settings();
        if (!rawSettings)
            this.save(memberNumber, settings);
        return settings;
    }
}