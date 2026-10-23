// Independent document oracle. No production imports and no implementation table copies.
export type ModelRole = "client" | "manager" | "system";
export const statuses = [
  "draft",
  "queued",
  "info_requested",
  "underwriting",
  "approved",
  "offered",
  "signed",
  "disbursed",
  "rejected",
  "expired",
  "withdrawn",
] as const;
export type ModelStatus = (typeof statuses)[number];
export type Rule = {
  from: readonly (ModelStatus | null)[];
  event: string;
  callers: readonly ModelRole[];
  outcomes: readonly ModelStatus[];
  journal: ModelRole;
};
export const rules: readonly Rule[] = [
  // docs/application-states.md:117: "create | none | client | draft".
  {
    from: [null],
    event: "create",
    callers: ["client"],
    outcomes: ["draft"],
    journal: "client",
  },
  // docs/v2-contract.md:38: "submit | draft | client/system"; application-states.md:118,139: "all system".
  {
    from: ["draft"],
    event: "submit",
    callers: ["client", "system"],
    outcomes: ["underwriting", "info_requested", "rejected"],
    journal: "system",
  },
  // docs/v2-contract.md:39: "client_update | info_requested | client/system".
  {
    from: ["info_requested"],
    event: "client_update",
    callers: ["client", "system"],
    outcomes: ["underwriting", "info_requested", "rejected"],
    journal: "system",
  },
  // docs/v2-contract.md:40: "accept_alternative | info_requested, queued | client"; application-states.md:99-101: "system".
  {
    from: ["info_requested", "queued"],
    event: "accept_alternative",
    callers: ["client"],
    outcomes: ["underwriting", "info_requested", "rejected"],
    journal: "system",
  },
  // docs/v2-contract.md:41: "agent_nudge | info_requested | system | info_requested".
  {
    from: ["info_requested"],
    event: "agent_nudge",
    callers: ["system"],
    outcomes: ["info_requested"],
    journal: "system",
  },
  // docs/v2-contract.md:42: "escalate_silent | info_requested | system | queued".
  {
    from: ["info_requested"],
    event: "escalate_silent",
    callers: ["system"],
    outcomes: ["queued"],
    journal: "system",
  },
  // docs/v2-contract.md:43: "escalate_disagreed | info_requested | system | queued".
  {
    from: ["info_requested"],
    event: "escalate_disagreed",
    callers: ["system"],
    outcomes: ["queued"],
    journal: "system",
  },
  // docs/v2-contract.md:44: "request_info | queued | manager | info_requested".
  {
    from: ["queued"],
    event: "request_info",
    callers: ["manager"],
    outcomes: ["info_requested"],
    journal: "manager",
  },
  // docs/v2-contract.md:45: "send_to_underwriting | queued | manager | underwriting".
  {
    from: ["queued"],
    event: "send_to_underwriting",
    callers: ["manager"],
    outcomes: ["underwriting"],
    journal: "manager",
  },
  // docs/v2-contract.md:46: "reject | queued | manager | rejected".
  {
    from: ["queued"],
    event: "reject",
    callers: ["manager"],
    outcomes: ["rejected"],
    journal: "manager",
  },
  // docs/application-states.md:127: "underwriter_approve | underwriting | system | approved".
  {
    from: ["underwriting"],
    event: "underwriter_approve",
    callers: ["system"],
    outcomes: ["approved"],
    journal: "system",
  },
  // docs/application-states.md:128: "make_offer | approved | system | offered".
  {
    from: ["approved"],
    event: "make_offer",
    callers: ["system"],
    outcomes: ["offered"],
    journal: "system",
  },
  // docs/application-states.md:129: "sign | offered | client | signed".
  {
    from: ["offered"],
    event: "sign",
    callers: ["client"],
    outcomes: ["signed"],
    journal: "client",
  },
  // docs/application-states.md:130: "disburse | signed | system | disbursed".
  {
    from: ["signed"],
    event: "disburse",
    callers: ["system"],
    outcomes: ["disbursed"],
    journal: "system",
  },
  // docs/application-states.md:131: "expire | offered | system | expired".
  {
    from: ["offered"],
    event: "expire",
    callers: ["system"],
    outcomes: ["expired"],
    journal: "system",
  },
  // docs/application-states.md:132: "withdraw | draft, queued, info_requested, underwriting, approved, offered | client".
  {
    from: [
      "draft",
      "queued",
      "info_requested",
      "underwriting",
      "approved",
      "offered",
    ],
    event: "withdraw",
    callers: ["client"],
    outcomes: ["withdrawn"],
    journal: "client",
  },
];
export const delegated = [
  "agent_nudge",
  "escalate_silent",
  "escalate_disagreed",
];
export const terminals: readonly ModelStatus[] = [
  "disbursed",
  "rejected",
  "expired",
  "withdrawn",
];
export const roles: readonly ModelRole[] = ["client", "manager", "system"];
export const events = rules
  .filter((r) => r.event !== "create")
  .map((r) => r.event);
export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Delta debugging followed by single-deletion fixed point: 1-minimal, not globally shortest.
export async function minimize<T>(
  input: readonly T[],
  fails: (items: T[]) => Promise<boolean>,
): Promise<T[]> {
  let result = [...input],
    size = Math.max(1, Math.floor(result.length / 2));
  while (size >= 1) {
    let reduced = false;
    for (let i = 0; i < result.length; i += size) {
      const candidate = result.slice(0, i).concat(result.slice(i + size));
      if (candidate.length && (await fails(candidate))) {
        result = candidate;
        reduced = true;
        break;
      }
    }
    if (!reduced) size = Math.floor(size / 2);
  }
  return result;
}
