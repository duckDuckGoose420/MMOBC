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

// dummy definitions so the below can be copied from BC as verbatim as possible
const Player = {
	MapData: {
		PrivateState: {
			HasKeyBronze: false,
			HasKeySilver: false,
			HasKeyGold: false,
		},
	},
	CanInteract: () => true,
};

const ChatRoomPlayerIsAdmin = () => false;

// Taken from BC (with just conversion into TS syntax)
export const ChatRoomMapViewTileList: ChatRoomMapTile[] = [

	{ ID: 100, Type: "Floor", Style: "OakWood" },
	{ ID: 110, Type: "Floor", Style: "Stone" },
	{ ID: 115, Type: "Floor", Style: "Pavement" },
	{ ID: 120, Type: "Floor", Style: "Ceramic" },
	{ ID: 130, Type: "Floor", Style: "CarpetPink" },
	{ ID: 131, Type: "Floor", Style: "CarpetBlue" },
	{ ID: 132, Type: "Floor", Style: "CarpetRed" },
	{ ID: 140, Type: "Floor", Style: "Padded" },

	{ ID: 200, Type: "FloorExterior", Style: "Dirt" },
	{ ID: 210, Type: "FloorExterior", Style: "Grass" },
	{ ID: 215, Type: "FloorExterior", Style: "LongGrass" },
	{ ID: 220, Type: "FloorExterior", Style: "Sand" },
	{ ID: 230, Type: "FloorExterior", Style: "Gravel" },
	{ ID: 235, Type: "FloorExterior", Style: "Asphalt" },
	{ ID: 240, Type: "FloorExterior", Style: "Snow" },
	{ ID: 250, Type: "FloorExterior", Style: "StoneSquareGray" },

	{ ID: 1000, Type: "Wall", Style: "MixedWood", BlockVision: true },
	{ ID: 1001, Type: "Wall", Style: "CedarWood", BlockVision: true },
	{ ID: 1010, Type: "Wall", Style: "Log", BlockVision: true },
	{ ID: 1020, Type: "Wall", Style: "Japanese", BlockVision: true },
	{ ID: 1030, Type: "Wall", Style: "Stone", BlockVision: true },
	{ ID: 1040, Type: "Wall", Style: "Brick", BlockVision: true },
	{ ID: 1050, Type: "Wall", Style: "Dungeon", BlockVision: true },
	{ ID: 1060, Type: "Wall", Style: "Square", BlockVision: true, BlockHearing: true },
	{ ID: 1070, Type: "Wall", Style: "Steel", BlockVision: true, BlockHearing: true },
	{ ID: 1080, Type: "Wall", Style: "Padded", BlockVision: true, BlockHearing: true },

	{ ID: 2000, Type: "Water", Style: "Pool", Transparency: 0.5, TransparencyCutoutHeight: 0.45 },
	{ ID: 2010, Type: "Water", Style: "Sea", Transparency: 0.5, TransparencyCutoutHeight: 0.45 },
	{ ID: 2020, Type: "Water", Style: "Ocean", Transparency: 0.5, TransparencyCutoutHeight: 0.3 },
	{ ID: 2025, Type: "Water", Style: "OceanCyan", Transparency: 0.5, TransparencyCutoutHeight: 0.3 },

];

export const ChatRoomMapViewObjectList: ChatRoomMapObject[] = [

	{ ID: 100, Type: "FloorDecoration", Style: "Blank" },
	{ ID: 110, Type: "FloorDecoration", Style: "EntryFlag", Top: -0.125, Exit: true, Unique: true },
	{ ID: 115, Type: "FloorDecoration", Style: "ExitFlag", Top: -0.125, Exit: true },
	{ ID: 120, Type: "FloorDecoration", Style: "BedTeal", Top: -0.25 },
	{ ID: 130, Type: "FloorDecoration", Style: "PillowPink" },
	{ ID: 140, Type: "FloorDecoration", Style: "TableBrown" },
	{ ID: 151, Type: "FloorDecoration", Style: "ChairWood", Top: -0.5, Height: 1.5 },
	{ ID: 150, Type: "FloorDecoration", Style: "ThroneRed", Top: -1, Height: 2 },
	{ ID: 160, Type: "FloorDecoration", Style: "KeyBronze", OnEnter: function(){ Player.MapData.PrivateState.HasKeyBronze = true; }, IsVisible: function(){ return !Player.MapData.PrivateState.HasKeyBronze; } },
	{ ID: 162, Type: "FloorDecoration", Style: "KeySilver", OnEnter: function(){ Player.MapData.PrivateState.HasKeySilver = true; }, IsVisible: function(){ return !Player.MapData.PrivateState.HasKeySilver; } },
	{ ID: 164, Type: "FloorDecoration", Style: "KeyGold" , OnEnter: function(){ Player.MapData.PrivateState.HasKeyGold = true; }, IsVisible: function(){ return !Player.MapData.PrivateState.HasKeyGold; } },

	{ ID: 200, Type: "FloorDecorationThemed", Style: "Blank" },
	{ ID: 210, Type: "FloorDecorationThemed", Style: "TeacherDesk", Top: -0.25 },
	{ ID: 220, Type: "FloorDecorationThemed", Style: "StudentDesk", Top: -0.1 },
	{ ID: 250, Type: "FloorDecorationThemed", Style: "SinkDishes", Top: -0.35 },
	{ ID: 260, Type: "FloorDecorationThemed", Style: "LaundryMachine", Top: -0.55, Height: 1.25 },
	{ ID: 270, Type: "FloorDecorationThemed", Style: "IroningBoard", Top: -0.35 },
	{ ID: 300, Type: "FloorDecorationThemed", Style: "ShibariFrame", Top: -1, Height: 2 },
	{ ID: 310, Type: "FloorDecorationThemed", Style: "JapaneseTable", Top: -0.1 },
	{ ID: 320, Type: "FloorDecorationThemed", Style: "BanzaiTree", Top: -0.1 },
	{ ID: 350, Type: "FloorDecorationThemed", Style: "MedicalDesk", Top: -0.15 },

	{ ID: 500, Type: "FloorDecorationParty", Style: "Blank" },
	{ ID: 510, Type: "FloorDecorationParty", Style: "BalloonFiveColor", Top: -0.6, Height: 1.5 },
	{ ID: 511, Type: "FloorDecorationParty", Style: "BalloonTwoHeart", Top: -0.15 },
	{ ID: 520, Type: "FloorDecorationParty", Style: "WeddingCake", Top: -1, Height: 2 },
	{ ID: 521, Type: "FloorDecorationParty", Style: "WeddingArch", Top: -1, Height: 2 },
	{ ID: 530, Type: "FloorDecorationParty", Style: "FlowerVasePink", Top: -0.33 },
	{ ID: 560, Type: "FloorDecorationParty", Style: "BeachUmbrellaStripe", Top: -1.1, Height: 2 },
	{ ID: 570, Type: "FloorDecorationParty", Style: "BeachTowelStripe" },

	{ ID: 600, Type: "FloorDecorationCamping", Style: "Blank" },
	{ ID: 610, Type: "FloorDecorationCamping", Style: "LogFire", Top: -0.35 },
	{ ID: 620, Type: "FloorDecorationCamping", Style: "LogSingle", Top: -0.2 },
	{ ID: 630, Type: "FloorDecorationCamping", Style: "TentBlue", Top: -0.3 },
	{ ID: 640, Type: "FloorDecorationCamping", Style: "SleepingBagBlue" },
	{ ID: 650, Type: "FloorDecorationCamping", Style: "ChairRed", Top: -0.35 },
	{ ID: 660, Type: "FloorDecorationCamping", Style: "Hurdle1",},
	{ ID: 670, Type: "FloorDecorationCamping", Style: "Hurdle2",},
	{ ID: 680, Type: "FloorDecorationCamping", Style: "Hurdle3",},

	{ ID: 1000, Type: "FloorItem", Style: "Blank" },
	{ ID: 1010, Type: "FloorItem", Style: "Kennel", Top: -1, Height: 2, AssetName: "Kennel", AssetGroup: "ItemDevices" },
	{ ID: 1020, Type: "FloorItem", Style: "X-Cross", Top: -1, Height: 2, AssetName: "X-Cross", AssetGroup: "ItemDevices" },
	{ ID: 1030, Type: "FloorItem", Style: "BondageBench", Top: -1, Height: 2, AssetName: "BondageBench", AssetGroup: "ItemDevices" },
	{ ID: 1040, Type: "FloorItem", Style: "Trolley", Top: -1, Height: 2, AssetName: "Trolley", AssetGroup: "ItemDevices" },
	{ ID: 1050, Type: "FloorItem", Style: "Locker", Top: -1, Height: 2, AssetName: "Locker", AssetGroup: "ItemDevices" },
	{ ID: 1060, Type: "FloorItem", Style: "WoodenBox", Top: -1, Height: 2, AssetName: "WoodenBox", AssetGroup: "ItemDevices" },
	{ ID: 1070, Type: "FloorItem", Style: "Coffin", Top: -1.2, Height: 1.85, AssetName: "Coffin", AssetGroup: "ItemDevices" },
	{ ID: 1080, Type: "FloorItem", Style: "TheDisplayFrame", Top: -1, Height: 2, AssetName: "TheDisplayFrame", AssetGroup: "ItemDevices" },

	{ ID: 2000, Type: "FloorObstacle", Style: "Blank" },
	{ ID: 2005, Type: "FloorObstacle", Style: "Rocks", Top: -0.125, Height: 1.125 },
	{ ID: 2010, Type: "FloorObstacle", Style: "Statue", Top: -1, Height: 2 },
	{ ID: 2020, Type: "FloorObstacle", Style: "Barrel", Top: -0.5, Height: 1.5 },
	{ ID: 2030, Type: "FloorObstacle", Style: "IronBars", Top: -1, Height: 2 },
	{ ID: 2031, Type: "FloorObstacle", Style: "BarbFence", Top: -1, Height: 2 },
	{ ID: 2040, Type: "FloorObstacle", Style: "OakTree", Left: -0.25, Top: -1.5, Width: 1.5, Height: 2.5 },
	{ ID: 2050, Type: "FloorObstacle", Style: "PineTree", Top: -1, Height: 2 },
	{ ID: 2055, Type: "FloorObstacle", Style: "PalmTree", Left: -0.30, Top: -1.5, Width: 1.65, Height: 2.5 },
	{ ID: 2060, Type: "FloorObstacle", Style: "ChristmasTree", Top: -1, Height: 2 },
	{ ID: 2070, Type: "FloorObstacle", Style: "Window", Top: -0.5, Height: 1.5 },

	{ ID: 3000, Type: "WallDecoration", Style: "Blank" },
	{ ID: 3010, Type: "WallDecoration", Style: "Painting" },
	{ ID: 3020, Type: "WallDecoration", Style: "Mirror" },
	{ ID: 3030, Type: "WallDecoration", Style: "Candelabra" },
	{ ID: 3040, Type: "WallDecoration", Style: "Whip" },
	{ ID: 3050, Type: "WallDecoration", Style: "Fireplace" },
	{ ID: 3100, Type: "WallDecoration", Style: "SilverShield" },
	{ ID: 3110, Type: "WallDecoration", Style: "CrossedSabers" },
	{ ID: 3200, Type: "WallDecoration", Style: "SchoolBoard" },
	{ ID: 3250, Type: "WallDecoration", Style: "FirstAidKit" },
	{ ID: 3260, Type: "WallDecoration", Style: "EyeTest" },

	{ ID: 4000, Type: "WallPath", Style: "Blank", CanEnter: function() { return false; } },
	{ ID: 4010, Type: "WallPath", Style: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return true; } },
	{ ID: 4011, Type: "WallPath", Style: "WoodClosed", OccupiedStyle: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return Player.CanInteract(); } },
	{ ID: 4012, Type: "WallPath", Style: "WoodLocked", OccupiedStyle: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return Player.CanInteract() && ChatRoomPlayerIsAdmin(); } },
	{ ID: 4013, Type: "WallPath", Style: "WoodLockedBronze", OccupiedStyle: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return Player.MapData.PrivateState.HasKeyBronze == true; } },
	{ ID: 4014, Type: "WallPath", Style: "WoodLockedSilver", OccupiedStyle: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return Player.MapData.PrivateState.HasKeySilver == true; } },
	{ ID: 4015, Type: "WallPath", Style: "WoodLockedGold", OccupiedStyle: "WoodOpen", Top: -1, Height: 2, CanEnter: function() { return Player.MapData.PrivateState.HasKeyGold == true; } },
	{ ID: 4020, Type: "WallPath", Style: "Metal", OccupiedStyle: "MetalOpen", Top: -1, Height: 2, CanEnter: function() { return true; } },
	{ ID: 4021, Type: "WallPath", Style: "MetalUp", OccupiedStyle: "MetalOpen", Top: -1, Height: 2, CanEnter: function(Direction) { return Direction === "U" || Direction === "";  } },
	{ ID: 4022, Type: "WallPath", Style: "MetalDown", OccupiedStyle: "MetalOpen", Top: -1, Height: 2, CanEnter: function(Direction) { return Direction === "D" || Direction === ""; } },

];