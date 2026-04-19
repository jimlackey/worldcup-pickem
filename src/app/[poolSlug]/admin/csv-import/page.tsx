import { supabaseAdmin } from "@/lib/supabase/server";

interface CsvImportPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function CsvImportPage({ params }: CsvImportPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Upload a CSV file to bulk import picks for this pool.
        </p>
      </div>

      {/* CSV format */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <h3 className="text-sm font-semibold">CSV Format</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          The CSV file should have these columns in this order:
        </p>
        <pre className="text-xs bg-[var(--color-surface-raised)] rounded p-3 overflow-x-auto font-mono">
{`email,display_name,pick_set_name,match_number,pick
player@example.com,Jim Smith,Jim's Longshots,1,home
player@example.com,Jim Smith,Jim's Longshots,2,draw
player@example.com,Jim Smith,Jim's Amazing Picks,1,away`}
        </pre>
        <div className="text-xs text-[var(--color-text-muted)] space-y-1">
          <p>• <strong>pick</strong> values: home, draw, away (for group phase)</p>
          <p>• <strong>match_number</strong>: sequential match number (1–72 for group phase)</p>
          <p>• Emails must be on this pool&apos;s whitelist</p>
          <p>• Pick set names will be created if they don&apos;t exist (subject to pool limit)</p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          CSV upload with preview and validation coming soon.
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          For now, use the SQL editor or setup scripts to import picks.
        </p>
      </div>
    </div>
  );
}
