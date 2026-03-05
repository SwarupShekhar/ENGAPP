import { paodana, paoazur } from "./families/purpleDream";
import { oceanic, abyss } from "./families/oceanDepth";
import { ember } from "./families/sunsetEnergy";
import { atlatitudeStandard } from "./families/atlatitude";
import { Theme } from "./types";

export const themes: Record<string, Theme> = {
  "purple-standard": paodana,
  "purple-fresh": paoazur,
  "ocean-standard": oceanic,
  "ocean-deep": abyss,
  "sunset-standard": ember,
  atlatitude: atlatitudeStandard,
};

export const defaultTheme = atlatitudeStandard;
export * from "./types";
