import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/clerk-expo";
import { getBridgeUser, updateLastActiveApp } from "../api/bridgeClient";

const STORAGE_KEY = "@super_app_mode";

export type AppMode = "ENGR" | "ENGLIVO";

interface SuperAppContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

const SuperAppContext = createContext<SuperAppContextType | undefined>(
  undefined,
);

export const SuperAppProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [mode, setModeState] = useState<AppMode>("ENGR");
  const { userId } = useAuth();

  const syncLastActiveApp = useCallback((next: AppMode) => {
    if (!userId) return;
    const bridgeApp = next === "ENGR" ? "PULSE" : "CORE";
    void updateLastActiveApp(userId, bridgeApp).catch(console.error);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // First priority: Bridge source of truth for last app mode.
        if (userId) {
          const bridgeUser = await getBridgeUser(userId);
          const lastActiveApp = bridgeUser?.last_active_app ?? bridgeUser?.lastActiveApp;
          if (alive) {
            if (lastActiveApp === "CORE") {
              setModeState("ENGLIVO");
              void AsyncStorage.setItem(STORAGE_KEY, "ENGLIVO");
              return;
            }
            if (lastActiveApp === "PULSE") {
              setModeState("ENGR");
              void AsyncStorage.setItem(STORAGE_KEY, "ENGR");
              return;
            }
          }
        }

        // Fallback to local persistence when bridge value is unavailable.
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;
        if (raw === "ENGLIVO" || raw === "ENGR") {
          setModeState(raw);
        }
      } catch (e) {
        console.warn("[SuperApp] Failed to load mode:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    syncLastActiveApp(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((e: unknown) =>
      console.warn("[SuperApp] Failed to persist mode:", e),
    );
  }, [syncLastActiveApp]);

  const toggleMode = useCallback(() => {
    setModeState((m) => {
      const next = m === "ENGR" ? "ENGLIVO" : "ENGR";
      syncLastActiveApp(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, [syncLastActiveApp]);

  return (
    <SuperAppContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </SuperAppContext.Provider>
  );
};

export const useSuperApp = () => {
  const ctx = useContext(SuperAppContext);
  if (!ctx) {
    throw new Error("useSuperApp must be used within SuperAppProvider");
  }
  return ctx;
};
