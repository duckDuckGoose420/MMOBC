import { API_Character, API_Chatroom } from "bc-bot";

export class PlayerIdentifier {
    static parseMemberNumber(identifier: string): number | null {
        const digits = identifier.startsWith("#") ? identifier.slice(1) : identifier;
        if (!/^[0-9]+$/.test(digits)) return null;
        return Number.parseInt(digits, 10);
    }

    /**
     * Identifies a player in the room by MemberNumber or Name
     * @param room The chat room to search in
     * @param identifier The identifier (MemberNumber as string or player name)
     * @returns API_Character if found, error message string if not found
     */
    static identifyPlayerInRoom(room: API_Chatroom, identifier: string): API_Character | string {
        const MemberNumber = PlayerIdentifier.parseMemberNumber(identifier);
        if (MemberNumber !== null) {
            const target = room.characters.find(c => c.MemberNumber === MemberNumber);
            if (!target) {
                return `Could not find player #${MemberNumber} in room`;
            }
            return target;
        }

        let targets = room.characters.filter(c => c.Name === identifier);
        if (targets.length === 0)
            targets = room.characters.filter(c => c.Name.toLocaleLowerCase() === identifier.toLocaleLowerCase());
        if (targets.length === 0)
            targets = room.characters.filter(c => c.Name.toLocaleLowerCase().startsWith(identifier.toLocaleLowerCase()));

        if (targets.length === 1) {
            return targets[0];
        } else if (targets.length === 0) {
            return `Player "${identifier}" not found in room`;
        } else {
            return `Multiple players match "${identifier}". Please use Member Number instead.`;
        }
    }
}

