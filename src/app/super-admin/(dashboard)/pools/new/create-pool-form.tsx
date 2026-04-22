"use client";

import { useActionState, useState } from "react";
import { createPoolAction } from "../../../actions";
import type { SuperAdminActionResult } from "../../../actions";

const initial: SuperAdminActionResult = { success: false };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // strip non-slug chars
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreatePoolForm() {
  const [state, action, pending] = useActionState(createPoolAction, initial);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Live-slugify based on the name unless the user has manually edited the slug.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1.5">
          Pool name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          maxLength={100}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Lackey Family World Cup"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-1.5">
          URL slug
        </label>
        <div className="flex items-center gap-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden focus-within:ring-2 focus-within:ring-pitch-500/40 focus-within:border-pitch-500 transition-colors">
          <span className="pl-3 pr-1 text-sm text-[var(--color-text-muted)] select-none">
            /
          </span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength={3}
            maxLength={60}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="lackey-family-world-cup"
            className="flex-1 bg-transparent px-1 py-2.5 text-sm font-mono placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Lowercase letters, numbers, and hyphens only. Used in the pool URL.
        </p>
      </div>

      <div>
        <label htmlFor="maxPickSets" className="block text-sm font-medium mb-1.5">
          Max pick sets per player
        </label>
        <input
          id="maxPickSets"
          name="maxPickSets"
          type="number"
          min={1}
          max={10}
          defaultValue={5}
          className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          How many entries each player can submit in this pool.
        </p>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating..." : "Create Pool"}
        </button>
      </div>
    </form>
  );
}
