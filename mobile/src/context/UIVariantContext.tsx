import React, { createContext, useContext, useState } from 'react';

type UIVariant = 'v1' | 'v2';

interface UIVariantContextProps {
  variant: UIVariant;
  setVariant: (v: UIVariant) => void;
}

const UIVariantContext = createContext<UIVariantContextProps | undefined>(undefined);

export const UIVariantProvider = ({ children }: { children: React.ReactNode }) => {
  const [variant, setVariant] = useState<UIVariant>('v1');

  return (
    <UIVariantContext.Provider value={{ variant, setVariant }}>
      {children}
    </UIVariantContext.Provider>
  );
};

export const useUIVariant = () => {
  const context = useContext(UIVariantContext);
  if (!context) {
    throw new Error('useUIVariant must be used within a UIVariantProvider');
  }
  return context;
};