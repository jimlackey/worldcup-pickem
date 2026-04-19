"use client";

import { createContext, useContext } from "react";
import type { Pool, PoolSession } from "@/types/database";

export interface PoolContextValue {
  pool: Pool;
  session: PoolSession | null;
}

export const PoolContext = createContext<PoolContextValue | null>(null);

export function usePool(): PoolContextValue {
  const ctx = useContext(PoolContext);
  if (!ctx) {
    throw new Error("usePool must be used within a PoolContext.Provider");
  }
  return ctx;
}

export function usePoolSession(): PoolSession | null {
  const ctx = useContext(PoolContext);
  return ctx?.session ?? null;
}
