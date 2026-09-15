export const CHAT_MESSAGE_MAX_LENGTH = 1000;

function parensAreBalanced(text: string): boolean {
    let depth = 0;
    for (const ch of text) {
        if (ch === "(") depth++;
        else if (ch === ")") {
            depth--;
            if (depth < 0) return false;
        }
    }
    return depth === 0;
}

export function wrapOocLine(line: string): string {
    if (line.startsWith("(") && parensAreBalanced(line)) return line;
    if (line.startsWith("(")) line = line.replace(/^\(+/, "");
    return `(${line})`;
}

export function flattenInnerOocParens(msg: string): string {
    if (!msg.trimStart().startsWith("(")) return msg;

    let depth = 0;
    let result = "";
    for (const ch of msg) {
        if (ch === "(") {
            result += depth === 0 ? "(" : "[";
            depth++;
        } else if (ch === ")") {
            if (depth <= 0) {
                result += ")";
                continue;
            }
            depth--;
            result += depth === 0 ? ")" : "]";
        } else {
            result += ch;
        }
    }
    return result;
}

export function splitMultilineChat(msg: string): string[] {
    const wasOoc = msg.trimStart().startsWith("(");
    const lines = msg
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== "(" && line !== ")")
        .map((line) => (wasOoc ? wrapOocLine(line) : line));

    const chunks: string[] = [];
    let current = "";
    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > CHAT_MESSAGE_MAX_LENGTH) {
            if (current) chunks.push(current);
            current = line.length > CHAT_MESSAGE_MAX_LENGTH ? line.slice(0, CHAT_MESSAGE_MAX_LENGTH) : line;
            if (line.length > CHAT_MESSAGE_MAX_LENGTH) {
                chunks.push(current);
                current = "";
            }
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
