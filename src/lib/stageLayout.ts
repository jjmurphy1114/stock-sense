type StageLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type StageLayout = {
  key: string;
  displayName: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ground: StageLine[];
  platforms: StageLine[];
};

const stageLayouts: Record<string, StageLayout> = {
  BATTLEFIELD: {
    key: "BATTLEFIELD",
    displayName: "Battlefield",
    minX: -95,
    maxX: 95,
    minY: -15,
    maxY: 75,
    ground: [{ x1: -68, y1: 0, x2: 68, y2: 0 }],
    platforms: [
      { x1: -52, y1: 25, x2: -18, y2: 25 },
      { x1: 18, y1: 25, x2: 52, y2: 25 },
      { x1: -16, y1: 48, x2: 16, y2: 48 },
    ],
  },
  FINAL_DESTINATION: {
    key: "FINAL_DESTINATION",
    displayName: "Final Destination",
    minX: -115,
    maxX: 115,
    minY: -15,
    maxY: 70,
    ground: [{ x1: -85, y1: 0, x2: 85, y2: 0 }],
    platforms: [],
  },
  DREAM_LAND_N64: {
    key: "DREAM_LAND_N64",
    displayName: "Dream Land",
    minX: -105,
    maxX: 105,
    minY: -15,
    maxY: 80,
    ground: [{ x1: -77, y1: 0, x2: 77, y2: 0 }],
    platforms: [
      { x1: -60, y1: 26, x2: -29, y2: 26 },
      { x1: 29, y1: 26, x2: 60, y2: 26 },
      { x1: -15, y1: 44, x2: 15, y2: 44 },
    ],
  },
  FOUNTAIN_OF_DREAMS: {
    key: "FOUNTAIN_OF_DREAMS",
    displayName: "Fountain of Dreams",
    minX: -96,
    maxX: 96,
    minY: -15,
    maxY: 78,
    ground: [{ x1: -64, y1: 0, x2: 64, y2: 0 }],
    platforms: [
      { x1: -49, y1: 24, x2: -18, y2: 24 },
      { x1: 18, y1: 24, x2: 49, y2: 24 },
    ],
  },
  POKEMON_STADIUM: {
    key: "POKEMON_STADIUM",
    displayName: "Pokemon Stadium",
    minX: -120,
    maxX: 120,
    minY: -15,
    maxY: 72,
    ground: [{ x1: -88, y1: 0, x2: 88, y2: 0 }],
    platforms: [
      { x1: -55, y1: 24, x2: -22, y2: 24 },
      { x1: 22, y1: 24, x2: 55, y2: 24 },
    ],
  },
  YOSHIS_STORY: {
    key: "YOSHIS_STORY",
    displayName: "Yoshi's Story",
    minX: -90,
    maxX: 90,
    minY: -15,
    maxY: 72,
    ground: [{ x1: -58, y1: 0, x2: 58, y2: 0 }],
    platforms: [
      { x1: -41, y1: 23, x2: -18, y2: 23 },
      { x1: 18, y1: 23, x2: 41, y2: 23 },
      { x1: -14, y1: 40, x2: 14, y2: 40 },
    ],
  },
};

const defaultStageLayout: StageLayout = {
  key: "DEFAULT",
  displayName: "Stage",
  minX: -110,
  maxX: 110,
  minY: -20,
  maxY: 80,
  ground: [{ x1: -80, y1: 0, x2: 80, y2: 0 }],
  platforms: [],
};

export function getStageLayout(stage?: string): StageLayout {
  if (!stage) {
    return defaultStageLayout;
  }

  return (
    stageLayouts[stage] ?? {
      ...defaultStageLayout,
      displayName: stage
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    }
  );
}
