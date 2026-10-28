import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { API_Chatroom } from "./apiChatroom.ts";
import { API_Character, API_Character_Data } from "./apiCharacter.ts";

function characterData(memberNumber: number, lockMember?: number): API_Character_Data {
    const appearance: any[] = [{ Group: "Cloth", Name: "Shirt" }];
    if (lockMember !== undefined) {
        appearance.push({
            Group: "ItemArms",
            Name: "HempRope",
            Property: { LockMemberNumber: lockMember, Effect: ["Block"] },
        });
    }
    return {
        ID: "x",
        Name: `P${memberNumber}`,
        Nickname: "",
        Description: "",
        Appearance: appearance,
        MemberNumber: memberNumber,
        ActivePose: [],
        WhiteList: [],
        BlackList: [],
        Reputation: [],
        OnlineSharedSettings: {} as any,
        ItemPermission: 0,
        FriendList: [],
        MapData: { Pos: { X: 1, Y: 1 }, PrivateState: {} } as any,
        BlockItems: {},
        LimitedItems: {},
    };
}

function createRoom(members: number[]) {
    const conn: any = { Player: { MemberNumber: 999 }, getBot: () => undefined, emit() {} };
    const bot = new API_Character(characterData(999), conn);
    const room = new API_Chatroom(
        { Name: "r", Character: members.map((m) => characterData(m)), Admin: [], Ban: [], Limit: 10 } as any,
        conn,
        bot,
    );
    return room;
}

function lockOwner(char: API_Character | undefined): number | undefined {
    return char?.Appearance.InventoryGet("ItemArms")?.getData()?.Property?.LockMemberNumber;
}

describe("API_Chatroom character cache", () => {
    it("returns the same character object across reads", () => {
        const room = createRoom([1, 2]);
        assert.equal(room.findMember(1), room.findMember(1));
        assert.equal(room.characters[1], room.findMember(2));
    });

    it("rebuilds appearance after a room sync replaces character data", () => {
        const room = createRoom([1, 2]);
        const before = room.findMember(1)!;

        room.update({ Character: [characterData(1, 2), characterData(2)] });

        const after = room.findMember(1)!;
        assert.equal(after, before);
        assert.equal(lockOwner(after), 2);
        assert.equal(after.IsRestrained(), true);
    });

    it("keeps a character sync after a preceding room sync", () => {
        const room = createRoom([1, 2]);
        room.findMember(1);
        room.update({ Character: [characterData(1), characterData(2)] });

        room.characterSync(1, characterData(1, 5), 2);

        assert.equal(lockOwner(room.findMember(1)), 5);
        assert.equal(lockOwner(room.characters[0]), 5);
    });

    it("keeps a character sync after the member rejoined", () => {
        const room = createRoom([1, 2]);
        room.findMember(1);
        room.memberLeft(1);
        room.memberJoined(characterData(1));

        room.characterSync(1, characterData(1, 7), 2);

        assert.equal(lockOwner(room.findMember(1)), 7);
    });

    it("reflects single item updates", () => {
        const room = createRoom([1]);
        room.update({ Character: [characterData(1, 2)] });

        room.characterItemUpdate({ Target: 1, Group: "ItemArms", Name: undefined } as any);

        assert.equal(room.findMember(1)!.IsRestrained(), false);
    });
});
