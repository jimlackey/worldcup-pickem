"use client";

import { PoolContext } from "@/lib/pool/context";
import type { Pool, PoolSession } from "@/types/database";

interface PoolProviderProps {
  pool: Pool;
  session: PoolSession | null;
  children: React.ReactNode;
}

export function PoolProvider({ pool, session, children }: PoolProviderProps) {
  return (
    <PoolContext.Provider value={{ pool, session }}>
      {children}
    </PoolContext.Provider>
  );
}
