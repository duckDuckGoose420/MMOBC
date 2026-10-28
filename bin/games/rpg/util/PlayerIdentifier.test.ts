import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PlayerIdentifier } from "./PlayerIdentifier";

describe("PlayerIdentifier.parseMemberNumber", () => {
    it("parses a member number", () => {
        assert.equal(PlayerIdentifier.parseMemberNumber("185871"), 185871);
    });

    it("rejects names", () => {
        assert.equal(PlayerIdentifier.parseMemberNumber("Alice"), null);
    });

    it("parses hashed member numbers", () => {
        assert.equal(PlayerIdentifier.parseMemberNumber("#185871"), 185871);
    });
});
