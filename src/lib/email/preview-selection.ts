// ---------------------------------------------------------------------------
// Preview participant selection.
//
// The email composer's preview pane wants to show "this is what a real
// recipient would see," not a hand-fabricated sample. To do that we have
// to pick ONE participant whose data to render. The selection rules are:
//
//   1. Prefer participants with 2 or more active pick sets — those make a
//      richer preview because the standings widget renders multiple blocks
//      side-by-side, which is the case the user's spec actually shows.
//
//   2. If nobody in the pool has more than one pick set, fall back to a
//      random participant who has at least ONE pick set.
//
//   3. If nobody has any pick sets, return null. The caller renders an
//      empty-state preview in that case.
//
// "Random" here is plain Math.random — the preview is informational, so
// different page loads showing different players is fine (it's actually
// useful: an admin clicking refresh sees how the format looks for
// different roster types). No seeding.
// ---------------------------------------------------------------------------

export interface PreviewCandidate {
  participantId: string;
  pickSetCount: number;
}

/**
 * Pick a participant ID to use as the preview recipient.
 *
 * @param candidates  One entry per (active) participant with at least one
 *                    pick set. Participants with zero pick sets must NOT
 *                    appear in this list — they can't drive a meaningful
 *                    preview.
 *
 * @returns  The chosen participant id, or null when no candidate exists.
 */
export function pickPreviewParticipantId(
  candidates: PreviewCandidate[]
): string | null {
  if (candidates.length === 0) return null;

  const withMultiple = candidates.filter((c) => c.pickSetCount > 1);
  if (withMultiple.length > 0) {
    return pickRandom(withMultiple).participantId;
  }
  return pickRandom(candidates).participantId;
}

function pickRandom<T>(items: T[]): T {
  // Math.random() is fine here — see header comment.
  const i = Math.floor(Math.random() * items.length);
  return items[i];
}
