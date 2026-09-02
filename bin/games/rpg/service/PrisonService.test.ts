import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_Character } from "bc-bot";
import {
    PRISON_DURATION,
    PrisonService,
    shouldImprison,
} from "./PrisonService";

function fakeCharacter(memberNumber: number): API_Character {
    return {
        MemberNumber: memberNumber,
        giveKey() {},
        takeKey() {},
    } as unknown as API_Character;
}

describe("shouldImprison", () => {
    const eligible = {
        inPrisonRoom: true,
        restrained: true,
        leashed: true,
        dominant: false,
        imprisoned: false,
        releaseHold: false,
    };

    it("imprisons when restrained, leashed and already in the cell", () => {
        assert.equal(shouldImprison(eligible), true);
    });

    it("does not imprison when the player is not in the prison room", () => {
        assert.equal(shouldImprison({ ...eligible, inPrisonRoom: false }), false);
    });

    it("does not imprison dominants", () => {
        assert.equal(shouldImprison({ ...eligible, dominant: true }), false);
    });

    it("does not reset an existing sentence", () => {
        assert.equal(shouldImprison({ ...eligible, imprisoned: true }), false);
    });

    it("does not re-imprison after a release until the player leaves the cell", () => {
        assert.equal(shouldImprison({ ...eligible, releaseHold: true }), false);
    });
});

describe("PrisonService.checkExpiredPrisons", () => {
    let tmpDir: string;
    let service: PrisonService;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prison-test-"));
        service = new PrisonService(path.join(tmpDir, "prison"));
    });

    it("returns the expired prisoner ids, not the bystander's", () => {
        const prisoner = fakeCharacter(111);
        const bystander = fakeCharacter(999);
        service.imprisonPlayer(prisoner);
        (service as unknown as { prisoners: Map<number, number> }).prisoners.set(
            111,
            Date.now() - PRISON_DURATION - 1
        );

        const expired = service.checkExpiredPrisons();

        assert.deepEqual(expired, [111]);
        assert.equal(expired.includes(bystander.MemberNumber), false);
        assert.equal(service.isImprisoned(prisoner), false);
    });

    it("returns every expired prisoner", () => {
        service.imprisonPlayer(fakeCharacter(111));
        service.imprisonPlayer(fakeCharacter(222));
        const prisoners = (service as unknown as { prisoners: Map<number, number> }).prisoners;
        prisoners.set(111, Date.now() - PRISON_DURATION - 1);
        prisoners.set(222, Date.now() - PRISON_DURATION - 1);

        assert.deepEqual(service.checkExpiredPrisons().sort(), [111, 222]);
    });

    it("does not expire a sentence that is still running", () => {
        service.imprisonPlayer(fakeCharacter(111));
        assert.deepEqual(service.checkExpiredPrisons(), []);
        assert.equal(service.isImprisoned(fakeCharacter(111)), true);
    });
});
