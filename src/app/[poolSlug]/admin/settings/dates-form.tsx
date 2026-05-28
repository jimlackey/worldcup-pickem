"use client";

import { useActionState, useEffect, useState } from "react";
import { updatePoolDateAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";
// The "Currently set: ..." label below the input now flows through the
// app-wide formatter so it matches every other date rendered in the app
// (DD/MM/YYYY HH:MM PT). The utcToPacificLocal helper below is a
// separate concern — it formats for the HTML <input type="datetime-local">
// which has its own required YYYY-MM-DDTHH:mm format and is not user-
// visible chrome.
import { formatPacificDateTime } from "@/lib/utils/dates";

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
 *
 * The output here is consumed by an HTML <input type="datetime-local">,
 * which requires the value to be in the literal format YYYY-MM-DDTHH:mm
 * with no timezone — there's no way around this; it's the input
 * element's spec. The user-visible "Currently set" line below the input
 * uses the app-wide formatPacificDateTime instead, so the readable
 * label stays consistent with the rest of the app.
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
 * Convert a datetime-local value (naive Pacific wall-clock) to a UTC ISO
 * string — independent of the browser's own timezone.
 *
 * The previous implementation did `new Date(localValue + ":00")`, which
 * parses the naive string in the *browser's* local zone. For any admin
 * not physically set to Pacific that produced the wrong instant (e.g. an
 * Eastern browser turned noon-PT into 23:00Z instead of 19:00Z), so the
 * saved time drifted by the difference between the admin's zone and
 * Pacific. This version never relies on the browser zone.
 *
 * Algorithm:
 *   1. Read the wall-clock parts (Y/M/D h:m) straight out of the string.
 *   2. Build a provisional instant by treating those parts as if they
 *      were UTC (Date.UTC) — this is a fixed, zone-independent number.
 *   3. Ask Intl what America/Los_Angeles wall-clock that provisional
 *      instant maps to, and measure how far it drifted from the parts we
 *      wanted. That drift IS the Pacific offset at this date (handles PST
 *      vs PDT automatically).
 *   4. Shift the provisional instant by that offset to get the true UTC
 *      instant whose Pacific wall-clock equals what the user typed.
 */
function pacificLocalToUtc(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Provisional instant: the typed wall-clock interpreted as UTC.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  // What Pacific wall-clock does that provisional instant fall on?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asUtc));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Intl can emit "24" for midnight; normalise to 0.
  const ptHour = get("hour") % 24;

  const ptAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    ptHour,
    get("minute"),
    get("second")
  );

  // Drift between the provisional UTC reading and the Pacific reading is
  // the zone offset. Add it back to land on the real instant.
  const offsetMs = asUtc - ptAsUtc;
  return new Date(asUtc + offsetMs).toISOString();
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

  // Convert stored UTC value to a Pacific-Time datetime-local string for
  // the input's initial value.
  const formatted = currentValue ? utcToPacificLocal(currentValue) : "";

  // Controlled input. The visible <input type="datetime-local"> holds a
  // naive Pacific wall-clock string (YYYY-MM-DDTHH:mm with no zone). We
  // track it in state so that on submit we can convert it to a true UTC
  // ISO string (with an explicit offset) BEFORE it reaches the server.
  //
  // Why this matters: the server action does `new Date(value)`, which is
  // run on Vercel where the runtime timezone is UTC. A naive string like
  // "2026-06-28T12:00" gets parsed as 12:00 UTC, not 12:00 Pacific — so
  // noon Pacific was being stored as noon UTC and then rendered back as
  // 05:00 PT (UTC-7 in June). Converting here, via the existing
  // pacificLocalToUtc helper, makes the stored value an unambiguous
  // instant regardless of where the server runs.
  //
  // We also resync from the server value after a successful save
  // (revalidatePath re-renders the parent with the new currentValue);
  // without the effect a controlled input keeps its stale local value
  // after the prop changes — the same uncontrolled→controlled fix used
  // elsewhere in the admin surface.
  const [localValue, setLocalValue] = useState(formatted);
  useEffect(() => {
    setLocalValue(formatted);
  }, [formatted]);

  // The UTC ISO string actually submitted. Empty input → empty string,
  // which the server action maps to a NULL date (clearing the field).
  const utcValue = localValue ? pacificLocalToUtc(localValue) : "";

  // Human-readable "Currently set" hint shown above the input — flows
  // through the same DD/MM/YYYY HH:MM PT formatter as every other
  // user-visible date in the app.
  const displayValue = formatPacificDateTime(currentValue);

  return (
    <form action={action} className="p-4 space-y-2">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="field" value={field} />
      {/* The value posted to the server is the UTC-converted instant, not
          the naive Pacific wall-clock the user typed. The visible input
          below intentionally has no `name` so only this hidden field is
          submitted. */}
      <input type="hidden" name="value" value={utcValue} />

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
            type="datetime-local"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
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
