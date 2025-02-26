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

import { API_Character } from "../../apiCharacter";
import { AssetGet, BC_AppearanceItem } from "../../item";
import { generatePassword } from "../../util/string";
import { PET_EARS } from "../petspa";

interface Forfeit {
    name: string;
    value: number;
    items: () => BC_AppearanceItem[];
    applyItems?: (char: API_Character, lockMemberNumber: number) => void;
}

export const FORFEITS: Record<string, Forfeit> = {
    boots: {
        name: "Boots",
        value: 5,
        items: () => [AssetGet("ItemBoots", "BalletHeels")],
    },
    legbinder: {
        name: "Leg binder",
        value: 7,
        items: () => [AssetGet("ItemLegs", "ShinyLegBinder")],
    },
    gag: {
        name: "Gag",
        value: 7,
        items: () => {
            const gag = AssetGet("ItemMouth", "HarnessBallGag");
            gag.Property = { TypeRecord: { typed: 2 } };
            return [gag];
        },
    },
    armbinder: {
        name: "Armbinder",
        value: 10,
        items: () => [AssetGet("ItemArms", "ShinyArmbinder")],
    },
    yoke: {
        name: "Yoke",
        value: 10,
        items: () => [AssetGet("ItemArms", "Yoke")],
    },
    cage: {
        name: "Cage",
        value: 20,
        items: () => {
            const cage = AssetGet("ItemDevices", "Kennel");
            cage.Property = { TypeRecord: { d: 1, p: 1 } };
            return [cage];
        },
    },
    pet: { name: "Pet", value: 12, items: () => [AssetGet("ItemArms", "ShinyPetSuit")], applyItems: makePet.bind(null, 0) },
    pet1hour: { name: "Pet: 1 hour", value: 15, items: () => [AssetGet("ItemArms", "ShinyPetSuit")], applyItems: makePet.bind(null, 1) },
    pet2hours: { name: "Pet: 2 hours", value: 20, items: () => [AssetGet("ItemArms", "ShinyPetSuit")], applyItems: makePet.bind(null, 2) },
    pet3hours: { name: "Pet: 3 hours", value: 25, items: () => [AssetGet("ItemArms", "ShinyPetSuit")], applyItems: makePet.bind(null, 3) },
    pet4hours: { name: "Pet: 4 hours", value: 30, items: () => [AssetGet("ItemArms", "ShinyPetSuit")], applyItems: makePet.bind(null, 4) },
    outfit: { name: "Outfit", value: 15, items: () => OUTFIT_HOUSE },
};

interface Service {
    name: string;
    description: string;
    value: number;
}

export const SERVICES: Record<string, Service> = {
    "player": {
        name: "Buy a caged player",
        description: "Why waste their misfortune?",
        value: 200,
    },
    "massage": {
        name: "Pixie Massage",
        description: "Let Miss Ellie melt away those tensions with a soothing massage.",
        value: 800,
    },
    "session": {
        name: "Session with Miss Ellie",
        description: "Name your fantasy and let Miss Ellie take you to the depths of your subby desires.",
        value: 1000,
    },
    "kidnap": {
        name: "Kidnapping Service",
        description: "Tell Ellie your target as well as where and when they can be found.",
        value: 1500,
    },
    "rent-a-pixie": {
        name: "Rent-a-pixie™️",
        description: "Ellie is at your service for up to 60 mins. Skills include bar work, pet walking and casino management.",
        value: 2000,
    },
    "modelling": {
        name: "Modelling",
        description: "Ellie will wear an outfit of your choice (clothes only) for a full 24 hours. No nudity!",
        value: 5000,
    },
    "pixiepet": {
        name: "Pixie Pet",
        description: "Your very own personal pet for 2 hours.",
        value: 10000,
    },
};

function makePet(hours: number, character: API_Character, lockMemberNumber: number): void {
    const characterHairColor =
        character.Appearance.InventoryGet("HairFront").GetColor();

    const petSuitItem = character.Appearance.AddItem(
        AssetGet("ItemArms", "ShinyPetSuit"),
    );
    petSuitItem.SetCraft({
        Name: `Pixie Casino Pet Suit`,
        Description:
            `A bold but unfortunate bet from ${character} means that are now an official Pixie Casino Pet, ` +
            `here to be adorable and helpless for all our patrons. Please enjoy their helplessness!`,
    });
    petSuitItem.SetColor(characterHairColor);
    petSuitItem.Extended.SetType("Classic");
    if (hours > 0) {
        petSuitItem.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Better luck next time!",
            RemoveItem: true,
            RemoveTimer: Date.now() + hours * 60 * 60 * 1000,
            ShowTimer: true,
            LockSet: true,
        });
    }

    if (!character.Appearance.InventoryGet("HairAccessory2")) {
        const ears = character.Appearance.AddItem(PET_EARS);
        ears.SetColor(
            character.Appearance.InventoryGet("HairFront").GetColor(),
        );
    }

    if (!character.Appearance.InventoryGet("TailStraps")) {
        const tail = character.Appearance.AddItem(
            AssetGet("TailStraps", "PuppyTailStrap"),
        );
        tail.SetColor(
            character.Appearance.InventoryGet("HairFront").GetColor(),
        );
    }

    if (!character.Appearance.InventoryGet("ItemNeck")) {
        const collar = character.Appearance.AddItem(
            AssetGet("ItemNeck", "PetCollar"),
        );
        collar.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Better luck next time!",
            RemoveItem: true,
            RemoveTimer: Date.now() + hours * 60 * 60 * 1000,
            ShowTimer: true,
            LockSet: true,
        });
        collar.SetCraft({
            Name: `Pixie Casino Pet Collar`,
            Description:
                `A bold but unfortunate bet from ${character} means that are now an official Pixie Casino Pet. ` +
                `This collar will remind them of their place until their time is up.`,
        });
    }
};

export const OUTFIT_HOUSE: BC_AppearanceItem[] = [
    {
        Group: "ItemVulva",
        Name: "VibratingEgg",
        Color: ["Default"],
        Property: {
            TypeRecord: {
                vibrating: 9,
            },
            Mode: "Edge",
            Intensity: 0,
            Effect: ["Egged", "Vibrating", "Edged"],
        },
    },
    {
        Group: "ItemVulvaPiercings",
        Name: "TapedClitEgg",
        Color: ["Default", "Default"],
        Property: {
            TypeRecord: {
                vibrating: 9,
            },
            Mode: "Edge",
            Intensity: 0,
            Effect: ["Egged", "Vibrating", "Edged"],
        },
    },
    {
        Group: "ItemFeet",
        Name: "HighStyleSteelAnkleCuffs",
        Color: ["#A37B17", "#A37B17", "#A37B17"],
        Property: {
            TypeRecord: {
                typed: 2,
            },
            Difficulty: 0,
            Effect: ["Slow"],
            OverridePriority: 26,
        },
    },
    {
        Group: "ItemNipples",
        Name: "NippleTape",
        Color: ["#A37B17"],
        Property: {},
    },
    {
        Group: "ItemNipplesPiercings",
        Name: "VibeHeartPiercings",
        Color: ["Default", "Default"],
        Property: {
            TypeRecord: {
                vibrating: 4,
            },
            Mode: "Maximum",
            Intensity: 3,
            Effect: ["Egged", "Vibrating"],
        },
    },
    {
        Group: "ItemEars",
        Name: "FuturisticEarphones",
        Color: ["#A37B17", "#222", "Default"],
        Property: {
            TypeRecord: {
                typed: 0,
            },
            Effect: [],
        },
    },
    {
        Group: "ItemTorso2",
        Name: "ClassicLatexCorset",
        Color: ["#222", "#A37B17", "Default"],
        Property: {
            OverridePriority: 25,
        },
    },
    {
        Group: "ItemTorso",
        Name: "FuturisticHarness",
        Color: ["#222", "#A37B17", "#889FA7", "Default"],
        Property: {
            TypeRecord: {
                typed: 0,
            },
            Difficulty: 2,
        },
    },
    {
        Group: "ItemBoots",
        Name: "MonoHeel",
        Color: ["#A37B17", "#A37B17", "#999"],
        Property: {
            TypeRecord: {
                typed: 1,
            },
            Difficulty: 0,
            OverridePriority: 25,
        },
    },
    {
        Group: "ItemMouth",
        Name: "FuturisticHarnessBallGag",
        Color: ["#A37B17", "#A37B17", "#222", "#A37B17", "Default"],
        Property: {
            TypeRecord: {
                g: 1,
                p: 3,
                t: 1,
            },
            Difficulty: 0,
            ShowText: true,
            OriginalSetting: 0,
            BlinkState: false,
            AutoPunishUndoTime: 0,
            Block: [],
            Effect: ["BlockMouth", "UseRemote", "GagMedium"],
            Hide: ["Mouth"],
            HideItem: [],
            AllowActivity: [],
            Attribute: ["FuturisticRecolor"],
            AutoPunish: 3,
            AutoPunishUndoTimeSetting: 300000,
        },
    },
    {
        Group: "ItemHead",
        Name: "LeatherBlindfold",
        Color: ["#222"],
        Property: {
            OverridePriority: 35,
        },
    },
    {
        Group: "ItemLegs",
        Name: "SeamlessHobbleSkirt",
        Color: ["#222222"],
        Property: {},
    },
    {
        Group: "ItemHands",
        Name: "FuturisticMittens",
        Color: ["#A37B17", "#1A1A1A", "#EAC873", "Default"],
        Property: {
            TypeRecord: {
                typed: 0,
            },
            Difficulty: 8,
            SelfUnlock: false,
            Effect: ["Block", "BlockWardrobe", "MergedFingers"],
            Block: ["ItemHandheld"],
            Hide: ["ItemHandheld"],
            HideItemExclude: [
                "ItemHandheldFoxPlush",
                "ItemHandheldBunPlush",
                "ItemHandheldKarl",
                "ItemHandheldShark",
                "ItemHandheldPetPotato",
            ],
        },
    },
    {
        Group: "ItemPelvis",
        Name: "SciFiPleasurePanties",
        Color: [
            "#A37B17",
            "#202020",
            "#A37B17",
            "#202020",
            "#A37B17",
            "#A37B17",
            "Default",
        ],
        Property: {
            TypeRecord: {
                c: 3,
                i: 0,
                o: 1,
                s: 0,
            },
            Difficulty: 0,
            ShowText: true,
            Block: ["ItemVulva", "ItemVulvaPiercings", "ItemButt"],
            Effect: [
                "UseRemote",
                "Egged",
                "UseRemote",
                "Chaste",
                "ButtChaste",
                "DenialMode",
            ],
            Hide: ["Pussy"],
            HideItem: [
                "ItemButtAnalBeads2",
                "ItemVulvaVibratingDildo",
                "ItemVulvaClitSuctionCup",
                "ItemVulvaInflatableVibeDildo",
                "ItemVulvaHeavyWeightClamp",
                "ItemVulvaPenisDildo",
                "ItemVulvaShockDildo",
                "ItemVulvaPiercingsVibeHeartClitPiercing",
                "ItemVulvaPiercingsClitRing",
                "ItemVulvaPiercingsChastityClitShield",
                "ItemVulvaPiercingsHighSecurityVulvaShield",
                "ItemVulvaPlasticChastityCage1",
                "ItemVulvaPlasticChastityCage2",
                "ItemVulvaTechnoChastityCage",
                "ItemVulvaFlatChastityCage",
                "ItemVulvaVibeEggPenisBase",
            ],
            AllowActivity: [],
            Attribute: ["GenitaliaCover", "FuturisticRecolor"],
            Intensity: -1,
            ShockLevel: 0,
            OverridePriority: 26,
        },
    },
    {
        Group: "ItemArms",
        Name: "StraitLeotard",
        Color: ["#222", "#222", "#222"],
        Property: {
            TypeRecord: {
                cl: 1,
                co: 1,
                np: 1,
                vp: 1,
            },
            Difficulty: 0,
            Block: [
                "ItemNipples",
                "ItemNipplesPiercings",
                "ItemVulva",
                "ItemVulvaPiercings",
                "ItemButt",
                "ItemPelvis",
                "ItemTorso",
                "ItemTorso2",
                "ItemBreast",
                "ItemHands",
                "ItemHandheld",
            ],
            Effect: ["Block", "BlockWardrobe"],
            Hide: ["HandAccessoryLeft", "HandAccessoryRight"],
            HideItem: [
                "ItemButtAnalBeads2",
                "ItemVulvaVibratingDildo",
                "ItemVulvaInflatableVibeDildo",
                "ItemVulvaClitSuctionCup",
                "ItemNipplesLactationPump",
            ],
            AllowActivity: [],
            Attribute: [],
        },
    },
    {
        Group: "Cloth",
        Name: "LeatherCorsetTop1",
        Color: ["#A37B17"],
        Property: {},
    },
    {
        Group: "ClothAccessory",
        Name: "CatsuitCollar",
        Color: ["#222"],
        Property: {},
    },
    {
        Group: "Necklace",
        Name: "BodyChainNecklace",
        Color: ["#A37B17", "Default"],
        Property: {},
    },
    {
        Group: "ClothLower",
        Name: "BondageSkirt",
        Color: ["#141414", "#A37B17", "#A37B17"],
        Property: {
            OverridePriority: 26,
        },
    },
    {
        Group: "Hat",
        Name: "Band1",
        Color: ["#A37B17"],
        Property: {},
    },
    {
        Group: "HairAccessory3",
        Name: "HairFlower1",
        Color: ["Default"],
        Property: {},
    },
    {
        Group: "HairAccessory1",
        Name: "Ribbons4",
        Color: ["#222"],
        Property: {},
    },
    {
        Group: "Mask",
        Name: "FaceVeil",
        Color: ["#222", "#A37B17"],
        Property: {},
    },
];

export function forfeitsString(): string {
    return Object.entries(FORFEITS)
        .map(([name, f]) => `${name}: ${f.value} chips`)
        .join("\n");
}

export function restraintsRemoveString(): string {
    return Object.entries(FORFEITS)
        .filter(([name]) => name !== "outfit")
        .map(([name, forfeit]) => `${forfeit.name}: ${forfeit.value * 4} chips`)
        .join("\n");
}

function commandForService(name: string): string {
    return `/bot buy ${name}` + (name === "player" ? " <name or member number>" : "");
}

export function servicesString(): string {
    return Object.entries(SERVICES)
        .map(([name, s]) => `${s.name}: ${s.value} chips\n${s.description}\n${commandForService(name)}\n`)
        .join("\n");
}