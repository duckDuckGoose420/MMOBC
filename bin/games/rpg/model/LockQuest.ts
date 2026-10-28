import { API_Character } from "bc-bot";
import { AbstractQuest } from "./AbstractQuest";

export class LockQuest extends AbstractQuest {
    description(): string {
        return `Your current quest is to bind with a lock ${this.targetName()}'s arms[#${this.targetPlayer}]`;
    }
    prerequisite(): boolean {
        return this.targetIsFree();
    }

    // In short, if someone else locked the target's arms,
    protected failConditionForTarget(target: API_Character): boolean {
        return this.failIfLockedByOther(target);
    }

    protected successConditionForTarget(target: API_Character): boolean {
        return this.armsLockedByOwner(target);
    }

    bonus(): boolean {
        return false;
    }

}
