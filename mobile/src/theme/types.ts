export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  deep: string;
  background: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    light: string;
    accent: string;
  };
  error: string;
  success: string;
  warning: string;
  border: string;
  skill: {
    grammar: string;
    pronunciation: string;
    fluency: string;
    vocabulary: string;
  };
}

export interface ThemeGradients {
  primary: string[];
  secondary: string[];
  surface: string[];
  premium: string[];
  card: string[];
}

export interface ThemeShadows {
  sm: any;
  md: any;
  lg: any;
  xl: any;
}

export interface Theme {
  id: string;
  name: string;
  family: "purpleDream" | "oceanDepth" | "sunsetEnergy" | "blueSky";
  variation: "light" | "standard" | "deep";
  colors: ThemeColors;
  gradients: ThemeGradients;
  shadows: ThemeShadows;
  spacing: {
    xs: number;
    s: number;
    m: number;
    l: number;
    xl: number;
    xxl: number;
  };
  borderRadius: {
    s: number;
    m: number;
    l: number;
    xl: number;
    circle: number;
  };
  typography: {
    sizes: {
      xs: number;
      s: number;
      m: number;
      l: number;
      xl: number;
      xxl: number;
    };
    weights: {
      regular: string;
      medium: string;
      semibold: string;
      bold: string;
      heavy: string;
      black: string;
    };
  };
}
