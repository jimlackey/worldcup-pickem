import Link from "next/link";
import { CreatePoolForm } from "./create-pool-form";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin-constants";

export default function NewPoolPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link
          href="/super-admin/dashboard"
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-display font-bold mt-2">Create New Pool</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Sets up a new pool with default scoring and grants super-admin(s) admin access.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs text-[var(--color-text-secondary)]">
        <p className="font-medium text-[var(--color-text)] mb-1">
          On creation, we&apos;ll automatically:
        </p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Apply default scoring config (editable later in pool settings)</li>
          <li>
            Grant admin membership + whitelist entry to:{" "}
            <span className="font-mono">{SUPER_ADMIN_EMAILS.join(", ")}</span>
          </li>
          <li>
            Pre-fill default tournament dates (group lock, knockout open and
            lock). Override them per-pool in{" "}
            <span className="font-mono">/{`{slug}`}/admin/settings</span>.
          </li>
        </ul>
      </div>

      <CreatePoolForm />
    </div>
  );
}
