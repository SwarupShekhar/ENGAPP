import React from "react";
import { useUIVariant } from "../../../context/UIVariantContext";
import FeedbackScreen from "./FeedbackScreen";
import FeedbackScreenV2 from "./FeedbackScreenV2";

export default function FeedbackScreenIndex() {
  const { variant } = useUIVariant();

  if (variant === "v2") {
    return <FeedbackScreenV2 />;
  }

  return <FeedbackScreen />;
}
