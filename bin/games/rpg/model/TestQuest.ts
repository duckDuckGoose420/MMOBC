import { AbstractQuest } from "./AbstractQuest";

export class TestQuest extends AbstractQuest {
    description(): string {
        const targetName = this.chatRoom.findMember(this.targetPlayer).toString();
        return `Your current quest is to grope ${targetName}(${this.targetPlayer})`;
    }
    prerequisite(): boolean {
        return true;
    }
    failCondition(): boolean {
        return false;
    }
    successCondition(): boolean {
        return false;
    }
    bonus(): boolean {
        return false;
    }

}