"use client";

import { useState } from "react";
import { getFlagUrl, FLAG_DIMENSIONS } from "@/lib/utils/flags";
import { cn } from "@/lib/utils/cn";

type FlagSize = "16x12" | "24x18" | "32x24" | "48x36" | "64x48";

interface TeamFlagProps {
  flagCode: string;
  teamName: string;
  shortCode: string;
  size?: FlagSize;
  className?: string;
}

export function TeamFlag({
  flagCode,
  teamName,
  shortCode,
  size = "32x24",
  className,
}: TeamFlagProps) {
  const [failed, setFailed] = useState(false);
  const dims = FLAG_DIMENSIONS[size];

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-sm bg-gray-200 text-gray-600 font-mono font-semibold",
          size === "16x12" && "text-2xs px-0.5",
          size === "24x18" && "text-2xs px-1",
          size === "32x24" && "text-xs px-1",
          size === "48x36" && "text-xs px-1.5",
          size === "64x48" && "text-sm px-2",
          className
        )}
        style={{ width: dims.width, height: dims.height }}
        title={teamName}
      >
        {shortCode}
      </span>
    );
  }

  return (
    <img
      src={getFlagUrl(flagCode, size)}
      alt={teamName}
      width={dims.width}
      height={dims.height}
      onError={() => setFailed(true)}
      className={cn(
        "inline-block align-middle rounded-sm object-cover",
        className
      )}
      loading="lazy"
    />
  );
}
