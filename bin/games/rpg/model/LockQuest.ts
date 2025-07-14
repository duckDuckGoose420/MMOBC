import { AbstractQuest } from "./AbstractQuest";
export class LockQuest extends AbstractQuest {
    description(): string {
        const targetName = this.chatRoom.findMember(this.targetPlayer).toString();
        return `Your current quest is to bind with a lock ${targetName}'s arms(${this.targetPlayer})`;
    }
    prerequisite(): boolean {
        return !this.chatRoom.findMember(this.targetPlayer).IsRestrained();
    }

    // In short, if someone else locked the target's arms, 
    failCondition(): boolean {
        if (super.failCondition())
            return true;
        const lockOwner = this.chatRoom
            .findMember(this.targetPlayer)
            ?.Appearance
            ?.InventoryGet("ItemArms")
            ?.getData()
            ?.Property
            ?.LockMemberNumber;

        if (lockOwner && lockOwner.toString() !== this.owner.toString()) {
            this.failMessage = "Someone else locked your target before you, you'll be assigned a new quest";
            return true;
        } else {
            this.failMessage = "";
            return false;
        }   
    }
    successCondition(): boolean {
        return this.chatRoom
            .findMember(this.targetPlayer)
            ?.Appearance
            ?.InventoryGet("ItemArms")
            ?.getData()
            ?.Property
            ?.LockMemberNumber == this.owner;
    }

    bonus(): boolean {
        return false;
    }

}