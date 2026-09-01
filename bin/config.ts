/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { type RoomDefinition } from "bc-bot";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface ConfigFile {
    user: string;
    password: string;
    env: "live" | "test";
    url?: string;
    game: string;
    superusers: number[];
    room: RoomDefinition;
    mongo_uri?: string;
    mongo_db?: string;
    members: number[];
    user2?: string;
    password2?: string;
}

function loadDotEnv(filePath = resolve(process.cwd(), ".env")): void {
    if (!existsSync(filePath)) return;

    const raw = readFileSync(filePath, "utf-8");
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function envString(key: string): string | undefined {
    const value = process.env[key];
    if (value === undefined || value === "") return undefined;
    return value;
}

function envBool(key: string): boolean | undefined {
    const value = envString(key);
    if (value === undefined) return undefined;
    return value.toLowerCase() === "true" || value === "1";
}

function envInt(key: string): number | undefined {
    const value = envString(key);
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function envNumberList(key: string): number[] | undefined {
    const value = envString(key);
    if (value === undefined) return undefined;
    return value
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((n) => Number.isFinite(n));
}

function envStringList(key: string): string[] | undefined {
    const value = envString(key);
    if (value === undefined) return undefined;
    if (value.length === 0) return [];
    return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function readJsonConfig(cfgFile: string): Partial<ConfigFile> {
    if (!existsSync(cfgFile)) return {};
    return JSON.parse(readFileSync(cfgFile, "utf-8")) as Partial<ConfigFile>;
}

export function loadConfig(cfgFile = process.argv[2] ?? "./config.json"): ConfigFile {
    loadDotEnv();

    const fileConfig = readJsonConfig(cfgFile);
    const fileRoom = (fileConfig.room ?? {}) as Partial<RoomDefinition> & {
        MapData?: { Fog?: boolean };
    };

    const env = (envString("BOT_ENV") ?? fileConfig.env) as ConfigFile["env"] | undefined;
    const user = envString("BOT_USER") ?? fileConfig.user;
    const password = envString("BOT_PASSWORD") ?? fileConfig.password;
    const game = envString("BOT_GAME") ?? fileConfig.game;

    if (!user || !password) {
        console.error("BOT_USER and BOT_PASSWORD must be set in .env");
        process.exit(1);
    }

    if (env !== "live" && env !== "test") {
        console.error("BOT_ENV must be live or test");
        process.exit(1);
    }

    if (!game) {
        console.error("BOT_GAME must be set in .env or config.json");
        process.exit(1);
    }

    const roomName = envString("ROOM_NAME") ?? fileRoom.Name;
    if (!roomName) {
        console.error("ROOM_NAME must be set in .env or config.json");
        process.exit(1);
    }

    const fog = envBool("ROOM_FOG") ?? fileRoom.MapData?.Fog ?? true;

    const room: RoomDefinition = {
        ...fileRoom,
        Name: roomName,
        Description: envString("ROOM_DESCRIPTION") ?? fileRoom.Description ?? "",
        Background: envString("ROOM_BACKGROUND") ?? fileRoom.Background ?? "",
        Private: envBool("ROOM_PRIVATE") ?? fileRoom.Private ?? false,
        Locked: envBool("ROOM_LOCKED") ?? fileRoom.Locked ?? false,
        Space: envString("ROOM_SPACE") ?? fileRoom.Space ?? "X",
        Ban: envNumberList("ROOM_BAN") ?? fileRoom.Ban ?? [],
        Limit: envInt("ROOM_LIMIT") ?? fileRoom.Limit ?? 20,
        BlockCategory: envStringList("ROOM_BLOCK_CATEGORY") ?? fileRoom.BlockCategory ?? [],
        Game: envString("ROOM_GAME") ?? fileRoom.Game ?? "",
        Language: envString("ROOM_LANGUAGE") ?? fileRoom.Language ?? "EN",
        Admin: envNumberList("ROOM_ADMIN") ?? fileRoom.Admin ?? [],
        MapData: { Fog: fog },
    } as RoomDefinition;

    return {
        user,
        password,
        env,
        url: envString("BOT_URL") ?? fileConfig.url,
        game,
        superusers: envNumberList("BOT_SUPERUSERS") ?? fileConfig.superusers ?? [],
        members: envNumberList("BOT_MEMBERS") ?? fileConfig.members ?? [],
        room,
        mongo_uri: envString("MONGO_URI") ?? fileConfig.mongo_uri,
        mongo_db: envString("MONGO_DB") ?? fileConfig.mongo_db,
        user2: envString("BOT_USER_2") ?? fileConfig.user2,
        password2: envString("BOT_PASSWORD_2") ?? fileConfig.password2,
    };
}
