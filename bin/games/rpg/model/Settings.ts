export interface SettingsData {
    gracePeriodEnabled?: boolean;
}

export class Settings {
    private gracePeriodEnabled: boolean;

    constructor(gracePeriodEnabled: boolean = true) {
        this.gracePeriodEnabled = gracePeriodEnabled;
    }

    static fromRaw(raw: Partial<SettingsData> = {}): Settings {
        return new Settings(
            raw.gracePeriodEnabled ?? true
        );
    }

    isGracePeriodEnabled(): boolean {
        return this.gracePeriodEnabled;
    }

    setGracePeriodEnabled(gracePeriodEnabled: boolean) {
        this.gracePeriodEnabled = gracePeriodEnabled;
    }

    toJSON(): SettingsData {
        return { gracePeriodEnabled: this.gracePeriodEnabled };
    }
}