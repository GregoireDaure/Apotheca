import { create } from "zustand";

export type ScanDirection = "add" | "remove";

export interface BulkScanItem {
  /** Unique key for this staged entry (index-based or scan timestamp) */
  id: string;
  /** CIS code from BDPM */
  cis: string;
  /** Medicine display name */
  denomination: string;
  /** Pharmaceutical form */
  pharmaceuticalForm: string;
  /** Expiry date (from DataMatrix or manual input) */
  expiryDate: string | null;
  /** Batch number (from DataMatrix) */
  batchNumber: string | null;
  /** Whether the item was already in inventory when scanned */
  alreadyInInventory: boolean;
  /** Status of this staged item */
  status: "pending" | "confirmed" | "error";
  /** Error message if status is "error" */
  errorMessage?: string;
}

interface BulkScanState {
  /** Whether bulk scan mode is active */
  active: boolean;
  /** Scan direction: add or remove */
  direction: ScanDirection;
  /** Items staged during this bulk scan session */
  items: BulkScanItem[];
  /** Whether the camera is actively scanning */
  scanning: boolean;

  // Actions
  startSession: (direction?: ScanDirection) => void;
  endSession: () => void;
  setDirection: (direction: ScanDirection) => void;
  addItem: (item: Omit<BulkScanItem, "id" | "status">) => void;
  removeItem: (id: string) => void;
  markConfirmed: (id: string) => void;
  markError: (id: string, message: string) => void;
  markAllConfirmed: () => void;
  clearConfirmed: () => void;
  setScanning: (scanning: boolean) => void;
}

export const useBulkScanStore = create<BulkScanState>((set) => ({
  active: false,
  direction: "add",
  items: [],
  scanning: false,

  startSession: (direction = "add") =>
    set({ active: true, direction, items: [], scanning: false }),

  endSession: () =>
    set({ active: false, items: [], scanning: false, direction: "add" }),

  setDirection: (direction) => set({ direction }),

  addItem: (item) =>
    set((state) => {
      // Deduplicate: if same CIS already staged & pending, just update it
      const existingIdx = state.items.findIndex(
        (i) => i.cis === item.cis && i.status === "pending"
      );
      if (existingIdx >= 0) {
        // Already staged — skip duplicate
        return state;
      }
      const newItem: BulkScanItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: "pending",
      };
      return { items: [newItem, ...state.items] };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    })),

  markConfirmed: (id) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, status: "confirmed" as const } : i
      ),
    })),

  markError: (id, message) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id
          ? { ...i, status: "error" as const, errorMessage: message }
          : i
      ),
    })),

  markAllConfirmed: () =>
    set((state) => ({
      items: state.items.map((i) =>
        i.status === "pending" ? { ...i, status: "confirmed" as const } : i
      ),
    })),

  clearConfirmed: () =>
    set((state) => ({
      items: state.items.filter((i) => i.status !== "confirmed"),
    })),

  setScanning: (scanning) => set({ scanning }),
}));
