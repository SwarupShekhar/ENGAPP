import React, { createContext, useContext, useState } from "react";

type UIVariant = "default" | "compact";

interface UIVariantContextType {
  variant: UIVariant;
  setVariant: (v: UIVariant) => void;
}

const UIVariantContext = createContext<UIVariantContextType>({
  variant: "default",
  setVariant: () => {},
});

export const UIVariantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [variant, setVariant] = useState<UIVariant>("default");
  return (
    <UIVariantContext.Provider value={{ variant, setVariant }}>
      {children}
    </UIVariantContext.Provider>
  );
};

export const useUIVariant = () => useContext(UIVariantContext);
