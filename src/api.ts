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

type LogLevel =
    | "verbose"
    | "debug"
    | "info"
    | "warning"
    | "error"
    | "fatal"
    | "alert";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    verbose: 0,
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    fatal: 5,
    alert: 6,
};

function parseLogLevel(value: string | undefined): LogLevel {
    if (!value) return "info";
    const normalized = value.toLowerCase().trim();
    if (normalized === "warn") return "warning";
    if (normalized in LOG_LEVEL_ORDER) return normalized as LogLevel;
    return "info";
}

function currentLogLevel(): LogLevel {
    return parseLogLevel(process.env.LOG_LEVEL);
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLogLevel()];
}

function writeLog(level: LogLevel, args: any[]): void {
    if (!shouldLog(level)) return;
    const prefix = `[${level.toUpperCase()}]`;
    if (level === "warning") {
        console.warn(prefix, ...args);
    } else if (level === "error" || level === "fatal" || level === "alert") {
        console.error(prefix, ...args);
    } else {
        console.log(prefix, ...args);
    }
}

class Logger {
    public verbose(...args: any[]) {
        writeLog("verbose", args);
    }

    public debug(...args: any[]) {
        writeLog("debug", args);
    }

    public info(...args: any[]) {
        writeLog("info", args);
    }

    public warning(...args: any[]) {
        writeLog("warning", args);
    }

    public error(...args: any[]) {
        writeLog("error", args);
    }

    public fatal(...args: any[]) {
        writeLog("fatal", args);
    }

    public alert(...args: any[]) {
        writeLog("alert", args);
    }
}

export const logger = new Logger();

export function shouldLogOutboundMessages(): boolean {
    const value = process.env.LOG_OUTBOUND_MESSAGES;
    if (value === undefined || value === "") return false;
    return value.toLowerCase() === "true" || value === "1";
}

export const BC_PermissionLevel = [
    "Everyone, no exceptions",
    "Everyone, except blacklist",
    "Owner, Lover, whitelist & Dominants",
    "Owner, Lover and whitelist only",
    "Owner and Lover only",
    "Owner only",
];
