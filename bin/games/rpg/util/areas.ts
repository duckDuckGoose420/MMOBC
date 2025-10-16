/**
 * @typedef {Object} MapRegion
 * @property {Object} TopLeft
 * @property {number} TopLeft.X
 * @property {number} TopLeft.Y
 * @property {Object} BottomRight
 * @property {number} BottomRight.X
 * @property {number} BottomRight.Y
 */

const LEAVE_SAFE_AREA_1 = {
    TopLeft: { X: 1, Y: 24 },
    BottomRight: { X: 3, Y: 31 },
};

const ENTER_INTRODUCTION_AREA = {
    TopLeft: { X: 0, Y: 14 },
    BottomRight: { X: 4, Y: 23 },
};

const PRIVATE_ROOM_AREA = {
    TopLeft: { X: 18, Y: 1 },
    BottomRight: { X: 21, Y: 7 }
};

const KIDNAP_COLLECTION_AREA = {
    TopLeft: { X: 27, Y: 30 },
    BottomRight: { X: 35, Y: 35 }
};

const BOUND_MAID_AREA = {
    TopLeft: { X: 18, Y: 7 },
    BottomRight: { X: 27, Y: 17 }
};

const PRISON_INTAKE_AREA = {
    TopLeft: { X: 26, Y: 21 },
    BottomRight: { X: 35, Y: 25 }
};

const PRISON_ROOM = {
    TopLeft: { X: 22, Y: 26 },
    BottomRight: { X: 30, Y: 31 }
};

const PRISON_CELL_1 = {
    TopLeft: { X: 21, Y: 25 },
    BottomRight: { X: 24, Y: 29 }
};


export const mapRegions = {
    LEAVE_SAFE_AREA_1,
    ENTER_INTRODUCTION_AREA,
    PRIVATE_ROOM_AREA,
    KIDNAP_COLLECTION_AREA,
    BOUND_MAID_AREA,
    PRISON_INTAKE_AREA,
    PRISON_ROOM,
};
