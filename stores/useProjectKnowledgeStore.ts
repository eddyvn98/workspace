import { create } from "zustand";

export interface DifyFileRef {
  type: string;
  transfer_method: string;
  upload_file_id: string;
  url: string;
}

interface ProjectKnowledgeState {
  pendingImageFiles: DifyFileRef[];
  setPendingImageFiles: (files: DifyFileRef[]) => void;
  clearPendingImageFiles: () => void;
}

export const useProjectKnowledgeStore = create<ProjectKnowledgeState>((set) => ({
  pendingImageFiles: [],
  setPendingImageFiles: (files) => set({ pendingImageFiles: files }),
  clearPendingImageFiles: () => set({ pendingImageFiles: [] }),
}));
