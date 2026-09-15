import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenInnerOocParens, splitMultilineChat } from "./chatMessage.ts";

describe("flattenInnerOocParens", () => {
    it("keeps money visible in /bot stats by converting nested XP parens", () => {
        const sent = "(You are level 2 (0/200 XP) and you have 60 money). ";
        assert.equal(
            flattenInnerOocParens(sent),
            "(You are level 2 [0/200 XP] and you have 60 money). ",
        );
    });

    it("leaves messages without a leading OOC paren unchanged", () => {
        assert.equal(flattenInnerOocParens("Hello (world)"), "Hello (world)");
    });

    it("leaves already-flat OOC messages unchanged", () => {
        assert.equal(
            flattenInnerOocParens("(You are level 2 and you have 60 money). "),
            "(You are level 2 and you have 60 money). ",
        );
    });

    it("keeps sibling OOC groups as parens", () => {
        assert.equal(flattenInnerOocParens("(foo) (bar)"), "(foo) (bar)");
    });

    it("flattens nested parens created by wrapping shop item lines", () => {
        const chunks = splitMultilineChat("(Shop:\nCatch me if you can (catchme)\n)");
        assert.deepEqual(chunks, [
            "(Shop:)\n(Catch me if you can (catchme))",
        ]);
        assert.equal(
            flattenInnerOocParens(chunks[0]),
            "(Shop:)\n(Catch me if you can [catchme])",
        );
    });
});
