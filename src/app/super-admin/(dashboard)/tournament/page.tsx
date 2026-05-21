import { redirect } from "next/navigation";

export default function TournamentIndexPage() {
  // No standalone landing — the nav surfaces Matches and Bracket as sibling
  // links, so visiting /super-admin/tournament directly should drop straight
  // into the matches view.
  redirect("/super-admin/tournament/matches");
}
