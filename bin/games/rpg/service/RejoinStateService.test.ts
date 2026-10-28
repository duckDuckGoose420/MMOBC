import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    arrayToSet,
    recordToBooleanMap,
    recordToMap,
    recordToPrivateRequests,
} from "./RejoinStateService";

describe("rejoin restore keeps the original collection instance", () => {
    it("fills number maps in place", () => {
        const target = new Map<number, number>([[1, 10]]);
        const result = recordToMap({ "222357": 100 }, target);

        assert.equal(result, target);
        assert.deepEqual([...target.entries()], [[222357, 100]]);
    });

    it("fills boolean maps in place", () => {
        const target = new Map<number, boolean>([[1, true]]);
        const result = recordToBooleanMap({ "222357": false }, target);

        assert.equal(result, target);
        assert.deepEqual([...target.entries()], [[222357, false]]);
    });

    it("fills private-request maps in place", () => {
        const target = new Map([[1, { requestingPlayer: 1, expiration: 1, cost: 1 }]]);
        const request = { requestingPlayer: 9, expiration: Date.now() + 60_000, cost: 100 };
        const result = recordToPrivateRequests({ "222357": request }, target);

        assert.equal(result, target);
        assert.deepEqual([...target.keys()], [222357]);
        assert.equal(target.get(222357)?.cost, 100);
    });

    it("fills sets in place", () => {
        const target = new Set<number>([1]);
        const result = arrayToSet([222357, 136698], target);

        assert.equal(result, target);
        assert.deepEqual([...target], [222357, 136698]);
    });
});
