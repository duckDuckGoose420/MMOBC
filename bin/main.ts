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

import { API_Connector } from "bc-bot";
import { readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { ConfigFile, loadConfig } from "./config";
import { Db, MongoClient } from "mongodb";
import { RPG } from "./games/rpg";
import { REJOIN_EXIT_CODE } from "./rejoin-exit-code";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

const BOT_PID_FILE = ".bot.pid";

export interface RopeyBot {
    connector: API_Connector;
    config: ConfigFile;
    db?: Db;
    game: string;
    rpg?: RPG;
}

let activeBot: RopeyBot | null = null;
let shuttingDown = false;

async function writePidFile(): Promise<void> {
    await writeFile(join(process.cwd(), BOT_PID_FILE), String(process.pid));
}

async function removePidFile(): Promise<void> {
    try {
        await unlink(join(process.cwd(), BOT_PID_FILE));
    } catch {
        // ignore
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function ensureSingleBotInstance(): Promise<void> {
    const pidPath = join(process.cwd(), BOT_PID_FILE);
    try {
        const previousPid = Number.parseInt(await readFile(pidPath, "utf-8"), 10);
        if (Number.isFinite(previousPid) && previousPid !== process.pid && isProcessAlive(previousPid)) {
            try {
                process.kill(previousPid, "SIGTERM");
            } catch {
                // ignore
            }
            await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
        }
    } catch {
        // no pid file yet
    }

    await writePidFile();
}

async function runShutdown(forRestart: boolean): Promise<void> {
    if (activeBot?.rpg) {
        await activeBot.rpg.shutdown(forRestart);
    }
    if (activeBot?.connector) {
        await activeBot.connector.gracefulDisconnect();
    }
    if (!forRestart) {
        await removePidFile();
    }
}

async function gracefulShutdown(signal: string, forRestart = false): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);

    try {
        await runShutdown(forRestart);
    } catch (e) {
        console.error("Error during shutdown:", e);
    }

    if (!forRestart) {
        process.exit(0);
    }
}

async function connectBot(config: ConfigFile): Promise<RopeyBot> {
    const serverUrl = config.url ?? SERVER_URL[config.env];

    if (!serverUrl) {
        console.log("env must be live or test");
        process.exit(1);
    }

    let db;
    if (config.mongo_uri && config.mongo_db) {
        const mongoClient = new MongoClient(config.mongo_uri, {
            ssl: true,
            tls: true,
        });
        console.log("Connecting to mongo...");
        await mongoClient.connect();
        console.log("...connected!");
        db = mongoClient.db(config.mongo_db);
        await db.command({ ping: 1 });
        console.log("...ping successful!");
    }

    const connector = new API_Connector(
        serverUrl,
        config.user,
        config.password,
        config.env,
    );
    await connector.joinOrCreateRoom(config.room);

    switch (config.game) {
        case undefined:
            break;
        case "rpg":
            console.log("Starting game: RPG");
            const rpgGame = new RPG(connector, requestRestart);
            await rpgGame.init();
            connector.setBotDescription(RPG.description);
            return {
                connector,
                config,
                db,
                game: config.game,
                rpg: rpgGame,
            };
        default:
            console.log("No such game " + config.game);
            process.exit(1);
    }

    return {
        connector,
        config,
        db,
        game: config.game,
    };
}

export async function requestRestart(): Promise<void> {
    if (shuttingDown) return;

    await gracefulShutdown("REJOIN", true);
    await removePidFile();
    process.exit(REJOIN_EXIT_CODE);
}

export async function startBot(): Promise<RopeyBot> {
    process.on("SIGINT", () => {
        void gracefulShutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
        void gracefulShutdown("SIGTERM");
    });

    await ensureSingleBotInstance();

    const config = loadConfig();
    const bot = await connectBot(config);
    activeBot = bot;
    return bot;
}

async function main() {
    const { game } = await startBot();

    if (!game) {
        console.error("No game specified!");
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
