export function toChatRoomAdminRoom(info: Record<string, any>): Record<string, any> {
    const room = { ...info };
    delete room.Character;

    if (!Array.isArray(room.Visibility) && typeof room.Private === "boolean") {
        room.Visibility = room.Private ? ["Admin", "Whitelist"] : ["All"];
    }
    if (!Array.isArray(room.Access) && typeof room.Locked === "boolean") {
        room.Access = room.Locked ? ["Admin", "Whitelist"] : ["All"];
    }

    delete room.Private;
    delete room.Locked;

    if (room.Limit !== undefined) room.Limit = room.Limit + "";
    return room;
}
