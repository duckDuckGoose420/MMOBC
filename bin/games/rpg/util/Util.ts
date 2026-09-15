import { API_Character } from "bc-bot";

export class Util {
    
    static getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    static async freeCharacter(character: API_Character): Promise<void> {
        await character.Appearance.slowlyStripBulk({ item: true }, true);
    }

    static isValidIntegerString(input: string): boolean {
        return /^\d+$/.test(input);
    }

}