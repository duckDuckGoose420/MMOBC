import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { REJOIN_EXIT_CODE } from "./rejoin-exit-code";

const mainScript = join(__dirname, "main.ts");
const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");
const botArgs = process.argv.slice(2);

let child: ChildProcess | null = null;
let exiting = false;

function stopChild(signal: NodeJS.Signals): void {
    if (!child?.pid) return;
    try {
        child.kill(signal);
    } catch {
        // ignore
    }
}

function runBot(): Promise<number | null> {
    return new Promise((resolvePromise) => {
        child = spawn(tsxBin, [mainScript, ...botArgs], {
            stdio: "inherit",
            cwd: process.cwd(),
            env: process.env,
        });

        child.on("exit", (code, signal) => {
            child = null;
            if (signal && exiting) {
                resolvePromise(130);
                return;
            }
            resolvePromise(code);
        });

        child.on("error", (err) => {
            console.error("Failed to start bot:", err);
            resolvePromise(1);
        });
    });
}

async function main(): Promise<void> {
    process.on("SIGINT", () => {
        exiting = true;
        stopChild("SIGINT");
    });

    process.on("SIGTERM", () => {
        exiting = true;
        stopChild("SIGTERM");
    });

    while (!exiting) {
        const code = await runBot();
        if (exiting) {
            process.exit(typeof code === "number" ? code : 0);
        }
        if (code === REJOIN_EXIT_CODE) {
            continue;
        }
        process.exit(code ?? 0);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
