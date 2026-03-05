import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themes, defaultTheme, Theme } from "./index";

interface ThemeContextType {
  theme: Theme;
  setTheme: (themeId: string) => Promise<void>;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedThemeId = await AsyncStorage.getItem("@user_theme_id");
        if (savedThemeId && themes[savedThemeId]) {
          setCurrentTheme(themes[savedThemeId]);
        }
      } catch (e) {
        console.warn("Failed to load theme preference:", e);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (themeId: string) => {
    if (themes[themeId]) {
      setCurrentTheme(themes[themeId]);
      try {
        await AsyncStorage.setItem("@user_theme_id", themeId);
      } catch (e) {
        console.warn("Failed to save theme preference:", e);
      }
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: currentTheme,
        setTheme,
        availableThemes: Object.values(themes),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
