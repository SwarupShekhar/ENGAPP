import React from "react";
import { useUIVariant } from "../../../context/UIVariantContext";
import ProgressScreen from "./ProgressScreen";
import ProgressScreenV2 from "./ProgressScreenV2";

export default function ProgressScreenIndex() {
  const { variant } = useUIVariant();
  if (variant === "v2") return <ProgressScreenV2 />;
  return <ProgressScreen />;
}

