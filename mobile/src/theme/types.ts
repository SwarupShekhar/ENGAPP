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
}

export interface ThemeGradients {
  primary: string[];
  secondary: string[];
  surface: string[];
  premium: string[];
  card: string[];
}

export interface Theme {
  id: string;
  name: string;
  family: "purpleDream" | "oceanDepth" | "sunsetEnergy";
  variation: "light" | "standard" | "deep";
  colors: ThemeColors;
  gradients: ThemeGradients;
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
      bold: string;
      black: string;
    };
  };
}
