import { paodana, paoazur } from "./families/purpleDream";
import { oceanic, abyss } from "./families/oceanDepth";
import { ember } from "./families/sunsetEnergy";
import { atlatitudeStandard } from "./families/atlatitude";
import { blueSkyStandard, blueSkyLight, blueSkyDeep } from "./families/blueSky";
import { Theme } from "./types";

export const themes: Record<string, Theme> = {
  "purple-standard": paodana,
  "purple-fresh": paoazur,
  "ocean-standard": oceanic,
  "ocean-deep": abyss,
  "sunset-standard": ember,
  "blue-sky-light": blueSkyLight,
  "blue-sky": blueSkyStandard,
  "blue-sky-deep": blueSkyDeep,
  "blueSky-light": blueSkyLight,
  "blueSky-standard": blueSkyStandard,
  "blueSky-deep": blueSkyDeep,
  atlatitude: atlatitudeStandard,
};

export const defaultTheme = blueSkyStandard;
export * from "./types";
