import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import * as React from "react";
import type { Workspace } from "../../src/context";
import { publicPreview } from "../../server/preview";

export function workspace(extra: Partial<Workspace> = {}): Workspace {
  return {
    state: publicPreview(),
    config: {},
    go() {},
    refresh: async () => {},
    act: async () => {},
    error() {},
    activeChatId: "",
    setActiveChatId() {},
    draft: "",
    setDraft() {},
    historyOpen: false,
    setHistoryOpen() {},
    upload: async () => {},
    uploading: false,
    reviewDocument() {},
    financingDraft: {},
    financingDraftStored: false,
    cacheFinancingDraft() {},
    chatVisible: false,
    setChatVisible() {},
    setSplit() {},
    sendMessage: async () => {},
    sending: null,
    ...extra,
  };
}
export function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}
export function textOf(node: any): string {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
// Execute the real component/event code with controlled hook state. This is not
// a DOM or effect scheduler: browser focus/layout checks belong to ui_smoke.mjs.
// Replacements are compiled in memory; production files are never written.
export function subject(
  path: string,
  options: {
    workspace?: Workspace;
    states?: Record<number, any>;
    replace?: [string, string];
    mocks?: Record<string, any>;
  } = {},
) {
  const url = new URL("../../" + path, import.meta.url);
  const require = createRequire(url);
  let source = readFileSync(url, "utf8");
  if (options.replace) {
    const [from, to] = options.replace;
    if (!source.includes(from))
      throw new Error("Mutation anchor missing: " + from);
    source = source.replace(from, to);
  }
  let cursor = 0,
    refCursor = 0;
  const states = new Map<number, any>(
    Object.entries(options.states ?? {}).map(([k, v]) => [+k, v]),
  );
  const refs = new Map<number, any>();
  const effects: (() => any)[] = [];
  const hooks = {
    ...React,
    useState(initial: any) {
      const index = cursor++;
      if (!states.has(index))
        states.set(index, typeof initial === "function" ? initial() : initial);
      return [
        states.get(index),
        (value: any) =>
          states.set(
            index,
            typeof value === "function" ? value(states.get(index)) : value,
          ),
      ];
    },
    useRef(initial: any) {
      const index = refCursor++;
      if (!refs.has(index)) refs.set(index, { current: initial });
      return refs.get(index);
    },
    useEffect(fn: () => any) {
      effects.push(fn);
    },
    useMemo(fn: () => any) {
      return fn();
    },
  };
  const code = transformSync(source, {
    sourcefile: fileURLToPath(url),
    loader: path.endsWith("tsx") ? "tsx" : "ts",
    format: "cjs",
    target: "es2023",
    jsx: "automatic",
  }).code;
  const mod = { exports: {} as any };
  const localRequire = (id: string) => {
    if (options.mocks && id in options.mocks) return options.mocks[id];
    if (id === "react") return hooks;
    if (id === "./context" && options.workspace)
      return { useWorkspace: () => options.workspace };
    if (id.endsWith(".css")) return {};
    return require(id);
  };
  new Function("require", "module", "exports", code)(
    localRequire,
    mod,
    mod.exports,
  );
  return {
    exports: mod.exports,
    states,
    effects,
    render(name: string, props: any = {}) {
      cursor = 0;
      refCursor = 0;
      effects.length = 0;
      return mod.exports[name](props);
    },
  };
}
