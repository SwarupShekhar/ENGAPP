import React from "react";
import { useUIVariant } from "../../../context/UIVariantContext";
import CallPreferenceScreen from "./CallPreferenceScreen";
import CallPreferenceScreenV2 from "./CallPreferenceScreenV2";

export default function CallPreferenceScreenIndex() {
  const { variant } = useUIVariant();
  if (variant === "v2") return <CallPreferenceScreenV2 />;
  return <CallPreferenceScreen />;
}

