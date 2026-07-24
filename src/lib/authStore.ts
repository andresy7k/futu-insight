import { create } from "zustand";

interface AuthUIState {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

export const useAuthUI = create<AuthUIState>((set) => ({
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
}));