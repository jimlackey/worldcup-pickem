"use client";

import { useActionState } from "react";
import { updatePoolDateAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

interface DatesFormProps {
  pool: Pool;
}

const initial: AdminActionResult = { success: false };

const dateFields = [
  {
    field: "group_lock_at" as const,
    label: "Group Phase Picks Lock",
    description: "Players cannot submit or edit group picks after this time",
  },
  {
    field: "knockout_open_at" as const,
    label: "Knockout Phase Opens",
    description: "Players can start submitting knockout bracket picks",
  },
  {
    field: "knockout_lock_at" as const,
    label: "Knockout Picks Lock",
    description: "Players cannot submit or edit knockout picks after this time",
  },
];

export function DatesForm({ pool }: DatesFormProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
      {dateFields.map((df) => (
        <DateFieldRow
          key={df.field}
          pool={pool}
          field={df.field}
          label={df.label}
          description={df.description}
          currentValue={(pool as Record<string, unknown>)[df.field] as string | null}
        />
      ))}
    </div>
  );
}

function DateFieldRow({
  pool,
  field,
  label,
  description,
  currentValue,
}: {
  pool: Pool;
  field: string;
  label: string;
  description: string;
  currentValue: string | null;
}) {
  const [state, action, pending] = useActionState(updatePoolDateAction, initial);

  // Format datetime-local value
  const formatted = currentValue
    ? new Date(currentValue).toISOString().slice(0, 16)
    : "";

  return (
    <form action={action} className="p-4 space-y-2">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="field" value={field} />

      <div>
        <label className="block text-sm font-medium">{label}</label>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>

      <div className="flex gap-2 items-end">
        <input
          name="value"
          type="datetime-local"
          defaultValue={formatted}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-3 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : "Set"}
        </button>
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600">{state.message}</p>}
    </form>
  );
}
