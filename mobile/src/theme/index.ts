import { paodana, paoazur, paolumu } from "./families/purpleDream";
import { oceanic, abyss, aquasoft } from "./families/oceanDepth";
import { dawn, ember, inferno } from "./families/sunsetEnergy";
import { atlatitudeStandard, atlatitudeLight } from "./families/atlatitude";
import { blueSkyStandard, blueSkyLight, blueSkyDeep } from "./families/blueSky";
import { Theme } from "./types";

export const themes: Record<string, Theme> = {
  // Purple Dream Family
  "purple-light": paolumu,
  "purple-standard": paodana,
  "purple-fresh": paoazur,
  
  // Ocean Depth Family
  "ocean-light": aquasoft,
  "ocean-standard": oceanic,
  "ocean-deep": abyss,
  
  // Sunset Energy Family
  "sunset-light": dawn,
  "sunset-standard": ember,
  "sunset-deep": inferno,
  
  // Blue Sky Family
  "blue-sky-light": blueSkyLight,
  "blue-sky": blueSkyStandard,
  "blue-sky-deep": blueSkyDeep,
  
  // Atlatitude Family
  "atlatitude-light": atlatitudeLight,
  "atlatitude": atlatitudeStandard,
};

export const defaultTheme = blueSkyStandard;
export * from "./types";
