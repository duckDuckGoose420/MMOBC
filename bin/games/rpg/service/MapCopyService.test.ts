import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decompressFromBase64 } from "lz-string";
import { MapCopyService, mapCopyRollbackLimit } from "./MapCopyService";

const mapA = { Tiles: "aaa", Objects: "111", Fog: true };
const mapB = { Tiles: "bbb", Objects: "222", Fog: false };

describe("MapCopyService", () => {
    let tmpDir: string;
    let filePath: string;
    let service: MapCopyService;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapcopy-test-"));
        filePath = path.join(tmpDir, "map.config.json");
        fs.writeFileSync(filePath, JSON.stringify({ EncodedMap: "old-map" }));
        service = new MapCopyService(filePath);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("overwrites the saved map with the encoded live map", () => {
        assert.equal(service.copy(mapB), true);

        const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
        assert.deepEqual(JSON.parse(decompressFromBase64(saved.EncodedMap)), mapB);
    });

    it("restores the previous saved map from memory", () => {
        service.copy(mapA);
        service.copy(mapB);

        const restored = service.rollback();
        assert.ok(restored);

        const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
        assert.equal(saved.EncodedMap, restored);
        assert.deepEqual(JSON.parse(decompressFromBase64(saved.EncodedMap)), mapA);
    });

    it("returns null when there is no rollback", () => {
        assert.equal(service.rollback(), null);
    });

    it("keeps multiple rollbacks in order", () => {
        const mapC = { Tiles: "ccc", Objects: "333", Fog: true };
        service.copy(mapA);
        service.copy(mapB);
        service.copy(mapC);

        const first = service.rollback();
        const second = service.rollback();
        assert.ok(first);
        assert.ok(second);
        assert.deepEqual(JSON.parse(decompressFromBase64(first)), mapB);
        assert.deepEqual(JSON.parse(decompressFromBase64(second)), mapA);
        assert.equal(service.remainingRollbacks(), 1);
    });

    it("drops the oldest rollback when the limit is reached", () => {
        service = new MapCopyService(filePath, 2);
        service.copy(mapA);
        service.copy(mapB);
        service.copy({ Tiles: "ccc", Objects: "333", Fog: true });

        assert.ok(service.rollback());
        assert.ok(service.rollback());
        assert.equal(service.rollback(), null);
    });
});

describe("mapCopyRollbackLimit", () => {
    it("defaults to 10", () => {
        assert.equal(mapCopyRollbackLimit(undefined), 10);
        assert.equal(mapCopyRollbackLimit(""), 10);
        assert.equal(mapCopyRollbackLimit("nope"), 10);
    });

    it("reads a non-negative integer", () => {
        assert.equal(mapCopyRollbackLimit("3"), 3);
        assert.equal(mapCopyRollbackLimit("0"), 0);
    });
});
