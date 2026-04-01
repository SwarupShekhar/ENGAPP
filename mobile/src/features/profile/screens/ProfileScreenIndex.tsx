import React from "react";
import { useUIVariant } from "../../../context/UIVariantContext";
import ProfileScreen from "./ProfileScreen";
import ProfileScreenV2 from "./ProfileScreenV2";

export default function ProfileScreenIndex() {
  const { variant } = useUIVariant();
  if (variant === "v2") return <ProfileScreenV2 />;
  return <ProfileScreen />;
}

