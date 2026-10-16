import { createContext, useContext } from "react";
import type { AppState, Doc } from "../shared/types";
export type Workspace = {
  state: AppState;
  config: any;
  go: (p: string) => void;
  refresh: () => Promise<void>;
  act: (path: string, body?: unknown, method?: string) => Promise<any>;
  error: (s: string) => void;
  activeChatId: string;
  setActiveChatId: (s: string) => void;
  draft: string;
  setDraft: (s: string) => void;
  historyOpen: boolean;
  setHistoryOpen: (v: boolean) => void;
  upload: (file: File, category?: string) => Promise<void>;
  uploading: boolean;
  reviewDocument: (doc: Doc) => void;
  financingDraft: Record<string, any>;
  cacheFinancingDraft: (draft: Record<string, any>) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  return useContext(WorkspaceContext)!;
}
export type { Doc };
