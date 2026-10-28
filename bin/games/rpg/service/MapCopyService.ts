import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { compressToBase64 } from "lz-string";

const DEFAULT_MAP_PATH = resolve(__dirname, "../config/map.config.json");
const DEFAULT_ROLLBACK_LIMIT = 10;

export function mapCopyRollbackLimit(raw = process.env.MAPCOPY_ROLLBACK_LIMIT): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ROLLBACK_LIMIT;
}

export class MapCopyService {
    private rollbackEncoded: string[] = [];
    private rollbackLimit: number;

    constructor(
        private filePath: string = DEFAULT_MAP_PATH,
        rollbackLimit: number = mapCopyRollbackLimit(),
    ) {
        this.rollbackLimit = Number.isFinite(rollbackLimit) && rollbackLimit >= 0
            ? rollbackLimit
            : DEFAULT_ROLLBACK_LIMIT;
    }

    copy(mapData: object): boolean {
        if (!mapData) return false;

        const previous = this.readEncoded();
        this.writeEncoded(compressToBase64(JSON.stringify(mapData)));
        if (previous !== undefined) {
            this.rollbackEncoded.push(previous);
            if (this.rollbackEncoded.length > this.rollbackLimit) {
                this.rollbackEncoded.splice(0, this.rollbackEncoded.length - this.rollbackLimit);
            }
        }
        return true;
    }

    rollback(): string | null {
        const restored = this.rollbackEncoded.pop();
        if (restored === undefined) return null;

        this.writeEncoded(restored);
        return restored;
    }

    remainingRollbacks(): number {
        return this.rollbackEncoded.length;
    }

    private readEncoded(): string | undefined {
        if (!existsSync(this.filePath)) return undefined;

        const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as { EncodedMap?: string };
        return parsed.EncodedMap;
    }

    private writeEncoded(encodedMap: string): void {
        writeFileSync(this.filePath, `${JSON.stringify({ EncodedMap: encodedMap }, null, 2)}\n`);
    }
}
