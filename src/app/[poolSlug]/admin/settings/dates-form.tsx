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
    description: "Players cannot submit or edit group picks after this time (Pacific Time)",
  },
  {
    field: "knockout_open_at" as const,
    label: "Knockout Phase Opens",
    description: "Players can start submitting knockout bracket picks (Pacific Time)",
  },
  {
    field: "knockout_lock_at" as const,
    label: "Knockout Picks Lock",
    description: "Players cannot submit or edit knockout picks after this time (Pacific Time)",
  },
];

/**
 * Convert a UTC ISO string to a datetime-local value in Pacific Time.
 */
function utcToPacificLocal(utcString: string): string {
  const date = new Date(utcString);
  // Format in America/Los_Angeles timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Convert a datetime-local value (assumed Pacific Time) to UTC ISO string.
 */
function pacificLocalToUtc(localValue: string): string {
  // Create a date string with the Pacific timezone
  const ptDate = new Date(localValue + ":00");
  // Get the offset for Pacific Time at this date
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  });
  const formatted = formatter.format(ptDate);
  // Extract offset like "GMT-7" or "GMT-8"
  const match = formatted.match(/GMT([+-]\d+)/);
  const offsetHours = match ? parseInt(match[1]) : -8;

  // Adjust to UTC
  const utcDate = new Date(ptDate.getTime() - offsetHours * 60 * 60 * 1000);
  return utcDate.toISOString();
}

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
          currentValue={pool[df.field] as string | null}
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

  // Convert stored UTC value to Pacific Time for the input
  const formatted = currentValue ? utcToPacificLocal(currentValue) : "";

  // Display current value in readable Pacific Time
  const displayValue = currentValue
    ? new Date(currentValue).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " PT"
    : null;

  return (
    <form action={action} className="p-4 space-y-2">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="field" value={field} />

      <div>
        <label className="block text-sm font-medium">{label}</label>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
        {displayValue && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Currently set: {displayValue}
          </p>
        )}
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <input
            name="value"
            type="datetime-local"
            defaultValue={formatted}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
        </div>
        <span className="text-xs text-[var(--color-text-muted)] pb-2.5 shrink-0">PT</span>
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
