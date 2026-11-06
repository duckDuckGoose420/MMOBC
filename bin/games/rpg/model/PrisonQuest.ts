import { mapRegions } from "../util/areas";
import { AbstractQuest } from "./AbstractQuest";
import { API_Character } from "bc-bot";
import { QuestRequirement } from "../types/IQuest";

export class PrisonQuest extends AbstractQuest {
    description(): string {
        return `Your current quest is to put ${this.targetName()}[#${this.targetPlayer}] in prison. They have to have their arms restrained and locked by you, then leashed to the ` +
        `prison`;
    }

    prerequisite(): boolean {
        return this.targetIsFree();
    }

    // In short, if someone else locked the target's arms,
    protected failConditionForTarget(target: API_Character): boolean {
        return this.failIfLockedByOther(target);
    }

    requirements(): QuestRequirement[] {
        return this.deliveryRequirements(this.findTarget(), mapRegions.PRISON_ROOM);
    }

    bonus(): boolean {
        return false;
    }

}
