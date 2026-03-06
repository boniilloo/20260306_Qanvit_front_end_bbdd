import React from "react";
import { getFaviconUrl } from "@/utils/logoUtils";

interface FaviconLogoProps {
  websiteUrl?: string | null;
  companyName: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses: Record<NonNullable<FaviconLogoProps["size"]>, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-20 h-20",
};

/**
 * Renders ONLY the supplier website favicon (no logo detection, no UI fallback).
 * If websiteUrl is missing/invalid, we render an empty box to keep layout stable.
 */
const FaviconLogo: React.FC<FaviconLogoProps> = ({
  websiteUrl,
  companyName,
  size = "md",
  className = "",
}) => {
  const faviconUrl = getFaviconUrl(websiteUrl);

  if (!faviconUrl) {
    return <div className={`${sizeClasses[size]} ${className}`} aria-hidden="true" />;
  }

  return (
    <img
      src={faviconUrl}
      alt={companyName}
      className={`${sizeClasses[size]} object-contain bg-white border border-gray-200 shadow-lg ${className}`}
    />
  );
};

export default FaviconLogo;












