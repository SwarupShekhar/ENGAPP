import React from 'react';
import { useUIVariant } from '../../../context/UIVariantContext';
import HomeScreenV1 from './HomeScreenV1';
import HomeScreenV2 from './HomeScreenV2';

export default function HomeScreenIndex() {
  const { variant } = useUIVariant();

  if (variant === 'v2') {
    return <HomeScreenV2 />;
  }

  return <HomeScreenV1 />;
}
