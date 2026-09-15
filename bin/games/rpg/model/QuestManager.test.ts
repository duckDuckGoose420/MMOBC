import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { API_Chatroom } from "bc-bot";
import { QuestManager } from "./QuestManager";
import { IQuest } from "../types/IQuest";

function stubQuest(owner: number, targetPlayer: number): IQuest {
    return {
        owner,
        targetPlayer,
        additionalInfo: null,
        failMessage: "",
        chatRoom: {} as API_Chatroom,
        prerequisite: () => true,
        failCondition: () => false,
        successCondition: () => false,
        bonus: () => false,
        description: () => "stub",
    };
}

describe("QuestManager.completeQuestForPlayer", () => {
    it("removes the player's quest and returns it", () => {
        const questManager = new QuestManager({} as API_Chatroom, {} as ConstructorParameters<typeof QuestManager>[1]);
        const quest = stubQuest(123, 456);
        questManager.quests.add(quest);

        const completed = questManager.completeQuestForPlayer(123);

        assert.equal(completed, quest);
        assert.equal(questManager.playerHasQuestAssigned(123), null);
        assert.equal(questManager.quests.count(), 0);
    });

    it("returns null when the player has no quest", () => {
        const questManager = new QuestManager({} as API_Chatroom, {} as ConstructorParameters<typeof QuestManager>[1]);
        questManager.quests.add(stubQuest(123, 456));

        assert.equal(questManager.completeQuestForPlayer(999), null);
        assert.ok(questManager.playerHasQuestAssigned(123));
        assert.equal(questManager.quests.count(), 1);
    });
});
