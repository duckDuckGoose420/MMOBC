import { API_Character } from "bc-bot";

const dropOff = 0.2;
export class Util {
    
    static getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    /*  Used to randomly discard quests if the target level is higher than the player, so
        higher level players will be on average be targeted less and low level players be 
        targeted more. It's designed to have a rough 10% less chance for the target to be
        selected for each level increase in the difference between the two players but 
        without hard cutoffs at a difference of 10 levels */
    static questAssignmentProbability(playerLevel: number, targetLevel: number): number {
        const levelDiff = targetLevel - playerLevel;
        if (levelDiff <= 0) return 1;

        return Math.exp(-dropOff * levelDiff);
    }

    static freeCharacter(character: API_Character): void {
        character.Appearance.RemoveItem("ItemArms");
        character.Appearance.RemoveItem("ItemHands");
        
    }

    static isValidIntegerString(input: string): boolean {
        return /^\d+$/.test(input);
    }

}