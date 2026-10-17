import { createContext, useContext } from "react";
import type { AppState, Doc } from "../shared/types";
import type { FinancingDraft } from "./financing-draft";
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
  financingDraft: FinancingDraft;
  financingDraftStored: boolean;
  cacheFinancingDraft: (draft: FinancingDraft) => void;
  chatVisible: boolean;
  setChatVisible: (v: boolean) => void;
  setSplit: (v: number) => void;
  sendMessage: (text?: string) => Promise<void>;
  sending: { chatId: string; text: string } | null;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  return useContext(WorkspaceContext)!;
}
export type { Doc };
