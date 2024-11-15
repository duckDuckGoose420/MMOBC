import { decompressFromBase64 } from "lz-string";
import { API_Connector } from "../apiConnector";
import { CommandParser } from "../commandParser";
import { API_Character } from "../apiCharacter";
import { BC_Server_ChatRoomMessage } from "../logicEvent";
import { ConfigFile } from "../config";

const MAP =
    "N4IgKgngDgpiBcICCAbA7gQwgZxAGnAEsUZdEAlga4AfLz6HGnmXWrK62vvmPOeBXGv0GimfMZMYSpU4WIAmS5StVLpHZoAvgQFgge/Xq1rjKjSPpa+VykZMnptbdb627as0+c23xj010G+lrBIQAe4RHuDPL+ACHxCfFaESkpUfQyjFqJicmpqens5uTZOUn5BaoOlABncWWxeRXhhXw1dQylZVqAT8B9zelW5O2dDY3NkVUZjvQjJWNNA1PsjO11IRthE6GFzGvbB7t7NQcTi+Hc7afN56HafT2xPZvhm28b+cyPudcVtxEMbq/fK3QAL4ODATkHs9AJfAcPhcK08Pe4XBaNGC2oWOxWNcriUeTREIsY0aOJxeNUySJxPmmPJuOU+IU1JpDG+DS0DMZBKpoRpoMh9IZMKZfIFQs53OoKmZrKJGKl3Mpsv5bJJwvJKqZqIVFhCCU2uK5xoJeK0AHWrRb0fRrfaHY6nc7rYKXe6PZ6vd6fb6/Vb8CAAPIAIwAVjAAMYAFzIIB8akAH+CqZMp4yp1SAVfAkwpADZA+YUmczgDcgYzZlSp8sV5QZvPKXMJxvKKv1hSAIyAa52TOXawmG0p+yZe123Nnk/nB02E8Op7OTIAD6AUgACYVQAIKU67U68AJ+CznoqfQbo9btQtucKVeb4yX6sqTMz8+PhSAevgVIu1IA0CC/36fG4AafuCiABwgCiAEhAa6XqBH4blev7KIAJCBbtBq4ADEoVeVYAHZKC2gA/wKogBgIIhSjESoq7QResF2A+qikco5HntmgEHgogC18HYFFuNgjbYDoyiAAKAxicXeCaADSAah8XBTaAHXwyjgYxUkJj2hY0XOgB6gAogB34JpSjaaej5qYZakAF+GXYZ4KIAa9AfoAPTDKIAQ9AqI5SjOS5qiAFxAgAMQAoXnGD0oSAGyACilnB7lKGFn6Uauf6KW4yHqFZgDV8MogAz0MlrnKO+r5TleoGAH+ACgFWhYFKD0gl6I+/GXlRCgoUo2CAAtADUKIJv6taogBb4LFahVTe1VKBpNXwXRTbxZu658YN3XITeF7KFN3VzeNxgxcoAAFi0CUoAXkJRCgAEVST+Khfkox2nQox2APfgV1ToAQBCFnBN03XeGaqUoD0qJ9iZjioL0KBmn0KHdyYg0ovYzkDf3A9Wd1nkDn1VomQPJspSggAAvkAA";

const SECRETARY_POSITION = { X: 21, Y: 14 };

export class Lillypad {
    public static description = [
        "Welcome to the Lillypad!",
        "I am Sara, Lilly's secretary.",
        "Please forward any inquiries about this place to her.",
        "Enjoy your stay and don't do anything silly!",
        "",
        "You can use the following commands:",
        "/bot guestinvite <id> - generates temporary access for a guest (4 hours)",
        "/bot listinvites - lists all active guest invites",
        "",
        "The following commands are only available to staff:",
        "/bot addmember <id> - generates permanent access for a user",
        "/bot removemember <id> - removes a user's access",
        "/bot deleteinvite <id> - deletes a guest invite",
        "/bot togglePrivate - toggles the room being private",
        "/bot toggleMap - enables/disables map view",
    ].join("\n");
    private commandParser: CommandParser;
    private guestInvites: Map<number, number> = new Map();
    private staffList: number[] = [];
    private config: ConfigFile;

    public constructor(private conn: API_Connector, config: ConfigFile) {
        this.config = config;

        this.staffList = this.config.superusers;
        this.commandParser = new CommandParser(this.conn);

        this.commandParser.register("guestinvite", this.createGuestInviteCommand);
        this.commandParser.register("listinvites", this.listGuestInviteCommand);

        this.commandParser.register("addmember", this.addMemberCommand);
        this.commandParser.register("removemember", this.removeMemberCommand);
        this.commandParser.register("deleteinvite", this.deleteGuestInviteCommand);
        this.commandParser.register("toggleprivate", this.togglePrivateCommand);
        this.commandParser.register("togglemap", this.toggleMapCommand);

        //this.conn.on("connect", this.reconnect);
    }



    public async init(): Promise<void> {
        await this.setupRoom();
        await this.setupCharacter();
    }

    private setupRoom = async () => {
        try {
            this.conn.chatRoom.map.setMapFromData(
                JSON.parse(decompressFromBase64(MAP)),
            );
        } catch (e) {
            console.log("Map data not loaded", e);
        }
        this.conn.ChatRoomUpdate({ Admin: this.config.members });
    };

    private setupCharacter = async () => {
        this.conn.moveOnMap(SECRETARY_POSITION.X, SECRETARY_POSITION.Y);
    };

    private async reconnect() {
        setTimeout(
            () => this.setupRoom,
            10000,
        );
    }

    createGuestInviteCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*Usage: /bot guestinvite <id>", senderCharacter.MemberNumber);
            return;
        }

        const id = +args[0];
        console.log("Creating guest invite for ", id);
        this.guestInvites.set(id, Date.now() + /*4 * 60 **/ 60 * 1000);
        let admins = [...this.conn.chatRoom.Admin];
        admins.push(id);
        this.conn.ChatRoomUpdate({ Admin: admins });
        this.conn.SendMessage(
            "Emote",
            `*Guest invite created for ${id}. Valid until ${new Date(this.guestInvites.get(id)!).toLocaleString()}`,
        );
        setTimeout(
            () => this.deleteGuestInvite(id),
            this.guestInvites.get(id) - Date.now(),
        );
    };

    deleteGuestInviteCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*Usage: /bot deleteinvite <id>", senderCharacter.MemberNumber);
            return;
        }else if(!this.staffList.includes(senderCharacter.MemberNumber)){
            this.conn.SendMessage("Emote", "*You don't have permission to do that.", senderCharacter.MemberNumber);
            return;
        }

        const id = +args[0];
        this.deleteGuestInvite(id);
    }

    listGuestInviteCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if(this.guestInvites.size === 0){
            this.conn.SendMessage("Emote", "*No active guest invites.", senderCharacter.MemberNumber);
            return;
        }

        var inviteList = [];

        for (let [key, value] of this.guestInvites) {
            inviteList.push(`${key} (valid until ${new Date(value).toLocaleString()})`);
        }

        this.conn.SendMessage("Emote", `*Active guest invites:\n${inviteList.join("\n")}`, senderCharacter.MemberNumber);
    }

    addMemberCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*Usage: /bot addmember <id>", senderCharacter.MemberNumber);
            return;
        }else if(!this.staffList.includes(senderCharacter.MemberNumber)){
            this.conn.SendMessage("Emote", "*You don't have permission to do that.", senderCharacter.MemberNumber);
            return;
        }

        const id = +args[0];
        let admins = [...this.conn.chatRoom.Admin];
        if(admins.includes(id)){
            this.conn.SendMessage("Emote", "*User is already a member.", senderCharacter.MemberNumber);
            return;
        }

        admins.push(id);
        this.conn.ChatRoomUpdate({ Admin: admins });
        this.conn.SendMessage("Emote", `*User ${id} added as a member - Keep in mind that that is reversed on a bot restart unless you tell Lilly`, senderCharacter.MemberNumber);
    }

    removeMemberCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*Usage: /bot removemember <id>", senderCharacter.MemberNumber);
            return;
        }else if(!this.staffList.includes(senderCharacter.MemberNumber)){
            this.conn.SendMessage("Emote", "*You don't have permission to do that.", senderCharacter.MemberNumber);
            return;
        }

        const id = +args[0];
        let admins = [...this.conn.chatRoom.Admin];
        if(!admins.includes(id)){
            this.conn.SendMessage("Emote", "*User is not a member.", senderCharacter.MemberNumber);
            return;
        }

        admins = admins.filter((a) => a !== id);
        this.conn.ChatRoomUpdate({ Admin: admins });
        this.conn.SendMessage("Emote", `*User ${id} removed as a member - Keep in mind that that is reversed on a bot restart unless you tell Lilly`, senderCharacter.MemberNumber);
    }

    togglePrivateCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if(!this.staffList.includes(senderCharacter.MemberNumber)){
            this.conn.SendMessage("Emote", "*You don't have permission to do that.", senderCharacter.MemberNumber);
            return;
        }

        if(this.conn.chatRoom.Private){
            this.conn.ChatRoomUpdate({ Private: false });
            this.conn.SendMessage("Emote", "*Room is now public.", senderCharacter.MemberNumber);
        }else{
            this.conn.ChatRoomUpdate({ Private: true });
            this.conn.SendMessage("Emote", "*Room is now private.", senderCharacter.MemberNumber);
        }
    }

    toggleMapCommand = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if(!this.staffList.includes(senderCharacter.MemberNumber)){
            this.conn.SendMessage("Emote", "*You don't have permission to do that.", senderCharacter.MemberNumber);
            return;
        }

        if(this.conn.chatRoom.usesMaps()){
            this.conn.chatRoom.useMap(false);
            this.conn.SendMessage("Emote", "*Map view disabled.", senderCharacter.MemberNumber);
        }else{
            this.conn.chatRoom.useMap(true);
            this.conn.SendMessage("Emote", "*Map view enabled.", senderCharacter.MemberNumber);
        }
    }

    private deleteGuestInvite(id: number) {
        if(!this.guestInvites.has(id)) return;
        console.log("Deleting guest invite for ", id);
        this.conn.SendMessage(
            "Emote",
            `*Guest invite for ${id} expired.`,
        );
        this.guestInvites.delete(id);
        let admins = [...this.conn.chatRoom.Admin];
        admins = admins.filter((a) => a !== id);
        this.conn.ChatRoomUpdate({ Admin: admins });
    }
}
