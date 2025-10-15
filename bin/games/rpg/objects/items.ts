import { API_AppearanceItem } from "bc-bot";
import { BC_AppearanceItem } from "bc-bot";
import { AssetFemale3DCG } from "bc-bot/bcdata/female3DCG";


export const PrisonItem: BC_AppearanceItem = {
  Name: "MetalCuffs",
  Group: "ItemArms",
  Difficulty: 1000,
  Property: {
    TypeRecord: {
      typed: 1,
    },
    OverridePriority: {
      Base: 0,
    },
    Effect: ["BlindTotal"],
    SelfUnlock: true,
    HideItem: ["ItemArms"],
    SetPose: ["Kneel"],
    // "AccessMode": "Public",
  },
};

export const PET_EARS: BC_AppearanceItem = {
  Name: "HarnessCatMask",
  Group: "ItemHood",
  Color: ["#202020", "#FF00FF", "#ADADAD"],
  Property: {
      TypeRecord: {
          typed: 1,
      },
      OverridePriority: {
          Base: 0,
      },
  },
};


// export const PrisonItem: API_AppearanceItem = {
//     Group: "Item",
//     Name: "PrisonItem",
//     Color: "White",
//     Difficulty: 1,
//     Craft: null,
//     Property: null,
// };
