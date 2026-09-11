import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FeedbackService } from "./FeedbackService";

describe("FeedbackService.appendFeedback", () => {
    let tmpDir: string;
    let filePath: string;
    let service: FeedbackService;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-test-"));
        filePath = path.join(tmpDir, "feedback.log");
        service = new FeedbackService(filePath);
    });

    it("does not save empty feedback", () => {
        assert.equal(service.appendFeedback("/bot feedback", 123, "Tester"), false);
        assert.equal(fs.existsSync(filePath), false);
    });

    it("does not save whitespace-only feedback", () => {
        assert.equal(service.appendFeedback("/bot feedback   ", 123, "Tester"), false);
        assert.equal(fs.existsSync(filePath), false);
    });

    it("saves non-empty feedback", () => {
        assert.equal(service.appendFeedback("/bot feedback please add a shop", 123, "Tester"), true);
        const content = fs.readFileSync(filePath, "utf8");
        assert.match(content, /Tester\[#123\] - please add a shop/);
    });
});
