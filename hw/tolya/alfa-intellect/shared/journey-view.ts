import type { MvpApplication } from "./mvp2";

/** Restore presentation only within actions allowed by the persisted lifecycle. */
export function journeyView(
  a: Pick<
    MvpApplication,
    "id" | "lifecycle" | "decision" | "contract" | "error"
  >,
  position?: { applicationId?: string; view?: string },
): string {
  if (a.lifecycle === "ACTIVE") return "decision";
  if (["SUBMITTED", "PROCESSING"].includes(a.lifecycle)) return "processing";
  const saved = position?.applicationId === a.id ? position.view : undefined;
  if (a.error) return saved === "chat" ? "chat" : "decision";
  if (a.lifecycle === "DRAFT")
    return saved &&
      [
        "recommendation",
        "catalog",
        "intro",
        "questionnaire",
        "dossier",
      ].includes(saved)
      ? saved
      : "recommendation";
  if (saved === "chat" || saved === "decision") return saved;
  if (a.lifecycle === "SIGNED_DEMO")
    return saved === "contract" ? "contract" : "receive";
  if (saved === "dossier" && a.decision) return "dossier";
  if (a.decision === "ADDITIONAL_DATA_REQUIRED")
    return saved === "supplement" ? "supplement" : "decision";
  if (a.decision === "MANAGER_REVIEW_REQUIRED")
    return saved === "meeting" ? "meeting" : "decision";
  if (a.decision === "APPROVED") {
    if (a.contract) return "contract";
    if (saved === "details") return "details";
  }
  return "decision";
}

/** Autosaves carry answers; explicit committed navigation owns the form section. */
export function journeySection(
  id: string,
  position: { applicationId?: string; section?: number },
  buffer?: { section?: number } | null,
) {
  const section =
    position.applicationId === id
      ? (position.section ?? buffer?.section)
      : buffer?.section;
  return Number.isInteger(section) && section! >= 0 && section! <= 4
    ? section!
    : 0;
}
