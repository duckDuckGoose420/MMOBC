import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toChatRoomAdminRoom } from "./chatRoomAdminRoom.ts";

describe("toChatRoomAdminRoom", () => {
    it("keeps Access/Visibility and drops deprecated Private/Locked", () => {
        const room = toChatRoomAdminRoom({
            Name: "BC RPG [BOT]",
            Private: false,
            Locked: false,
            Visibility: ["Admin", "Whitelist"],
            Access: ["All"],
            Limit: 20,
        });

        assert.deepEqual(room.Visibility, ["Admin", "Whitelist"]);
        assert.deepEqual(room.Access, ["All"]);
        assert.equal("Private" in room, false);
        assert.equal("Locked" in room, false);
        assert.equal(room.Limit, "20");
    });

    it("derives Visibility from Private when Visibility is missing", () => {
        const room = toChatRoomAdminRoom({ Private: true });
        assert.deepEqual(room.Visibility, ["Admin", "Whitelist"]);
        assert.equal("Private" in room, false);
    });

    it("derives public Access from Locked false", () => {
        const room = toChatRoomAdminRoom({ Locked: false });
        assert.deepEqual(room.Access, ["All"]);
        assert.equal("Locked" in room, false);
    });
});
