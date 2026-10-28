import { mapRegions } from "../util/areas";
import { AbstractQuest } from "./AbstractQuest";
import { API_Character } from "bc-bot";

export class KidnapQuestBoundMaid extends AbstractQuest {
    description(): string {
        return `Your current quest is to kidnap ${this.targetName()}[#${this.targetPlayer}]. They have to have their arms restrained and locked by you, then leashed to the ` +
        `Bound Maid (in the center-top section of the map)`;
    }

    prerequisite(): boolean {
        return this.targetIsFree();
    }

    // In short, if someone else locked the target's arms,
    protected failConditionForTarget(target: API_Character): boolean {
        return this.failIfLockedByOther(target);
    }

    // Locked, leashed, and in the collection building
    protected successConditionForTarget(target: API_Character): boolean {
        return this.deliveredTo(target, mapRegions.BOUND_MAID_AREA);
    }

    bonus(): boolean {
        return false;
    }

}
