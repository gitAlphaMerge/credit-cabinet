export type FinancingForm = {
  purpose: string;
  amount: number;
  term: number;
  repayFrom: string;
  ownFunds: number;
  flow: string | number;
  existing: string | number;
};
export type FinancingDraft = {
  tab?: "new" | "history";
  step?: number;
  selected?: string | null;
  parentId?: string;
  form?: FinancingForm;
};
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "alfa:financing-draft:v1:";
const lifetime = 24 * 60 * 60 * 1000;

function validate(value: unknown): FinancingDraft {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid draft");
  const d = value as Record<string, unknown>;
  const text = (v: unknown, max = 160): string => {
    if (typeof v !== "string" || v.length > max)
      throw new Error("Invalid text");
    return v;
  };
  const number = (v: unknown): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e9)
      throw new Error("Invalid number");
    return v;
  };
  const input = (v: unknown): string | number => {
    if (typeof v === "string") {
      text(v, 32);
      if (v !== "" && !Number.isFinite(Number(v)))
        throw new Error("Invalid input");
      return v;
    }
    return number(v);
  };
  const result: FinancingDraft = {};
  if (d.tab !== undefined) {
    if (d.tab !== "new" && d.tab !== "history") throw new Error("Invalid tab");
    result.tab = d.tab;
  }
  if (d.step !== undefined) {
    if (!Number.isInteger(d.step) || Number(d.step) < -1 || Number(d.step) > 2)
      throw new Error("Invalid step");
    result.step = Number(d.step);
  }
  if (d.selected !== undefined)
    result.selected = d.selected === null ? null : text(d.selected, 128);
  if (d.parentId !== undefined) result.parentId = text(d.parentId, 128);
  if (d.form !== undefined) {
    if (!d.form || typeof d.form !== "object" || Array.isArray(d.form))
      throw new Error("Invalid form");
    const f = d.form as Record<string, unknown>;
    result.form = {
      purpose: text(f.purpose),
      amount: number(f.amount),
      term: number(f.term),
      repayFrom: text(f.repayFrom),
      ownFunds: number(f.ownFunds),
      flow: input(f.flow),
      existing: input(f.existing),
    };
  }
  return result;
}

// Tab-scoped only: no documents, messages, phone numbers or credentials.
// Storage is optional (private mode / quota), and never blocks the product.
export function readFinancingDraft(
  storage: DraftStorage,
  owner: string,
  now = Date.now(),
): FinancingDraft {
  try {
    const raw = storage.getItem(prefix + owner);
    if (!raw) return {};
    const envelope = JSON.parse(raw);
    if (
      envelope.version !== 1 ||
      !Number.isFinite(envelope.savedAt) ||
      envelope.savedAt > now ||
      now - envelope.savedAt > lifetime
    )
      throw new Error("Expired draft");
    return validate(envelope.draft);
  } catch {
    clearFinancingDraft(storage, owner);
    return {};
  }
}

export function writeFinancingDraft(
  storage: DraftStorage,
  owner: string,
  draft: FinancingDraft,
  now = Date.now(),
): boolean {
  try {
    storage.setItem(
      prefix + owner,
      JSON.stringify({ version: 1, savedAt: now, draft: validate(draft) }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearFinancingDraft(storage: DraftStorage, owner: string) {
  try {
    storage.removeItem(prefix + owner);
  } catch {
    // Storage may be unavailable; authentication does not depend on it.
  }
}
