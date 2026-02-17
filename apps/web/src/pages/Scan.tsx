import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  CircleCheck,
  ArrowUp,
  ArrowDown,
  Camera,
  Keyboard,
  PenLine,
  Layers,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { BulkScanList } from "@/components/scanner/BulkScanList";
import { useBulkScanStore, type ScanDirection } from "@/stores/bulk-scan.store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/gs1-parser";

interface BdpmMedicine {
  cis: string;
  denomination: string;
  pharmaceuticalForm: string;
  status: string;
}

interface InventoryFormData {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

interface CreateResult {
  item: {
    id: string;
    quantity: number;
  };
  incremented: boolean;
}

interface ManualFormData {
  denomination: string;
  pharmaceuticalForm: string;
  expiryDate: string;
  quantity: number;
  batchNumber: string;
}

type ScanMode = "idle" | "camera" | "manual";
type ScanStep =
  | "choose" // Pick mode (camera or manual)
  | "scanning" // Camera active
  | "looking-up" // API lookup in progress
  | "confirm" // Medicine found, confirm/edit details
  | "results" // Search results displayed
  | "manual-entry" // Fully manual entry form (no DB match) — FR8
  | "success" // Added successfully
  | "bulk"; // Bulk scan mode active

export default function Scan() {
  // -- State --
  const [mode, setMode] = useState<ScanMode>("idle");
  const [step, setStep] = useState<ScanStep>("choose");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<BdpmMedicine | null>(
    null
  );
  const [successResult, setSuccessResult] = useState<{
    medicine: BdpmMedicine;
    result: CreateResult;
  } | null>(null);
  const [formData, setFormData] = useState<InventoryFormData>({
    batchNumber: "",
    expiryDate: "",
    quantity: 1,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualFormData>({
    denomination: "",
    pharmaceuticalForm: "",
    expiryDate: "",
    quantity: 1,
    batchNumber: "",
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // -- Bulk scan store --
  const bulkStore = useBulkScanStore();
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);

  // -- Queries --
  const manualSearch = useQuery<BdpmMedicine[]>({
    queryKey: ["bdpm", "search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      if (/^\d{13}$/.test(debouncedSearch)) {
        try {
          const res = await api.get(`/bdpm/lookup/${debouncedSearch}`);
          return [res.data];
        } catch {
          return [];
        }
      }
      const res = await api.get("/bdpm/search", {
        params: { q: debouncedSearch },
      });
      return res.data;
    },
    enabled: debouncedSearch.length > 2,
  });

  // -- Mutations --
  const addMutation = useMutation<
    CreateResult,
    Error,
    InventoryFormData & { cis: string }
  >({
    mutationFn: async (d) => {
      const payload = {
        ...d,
        expiryDate: d.expiryDate
          ? new Date(d.expiryDate).toISOString()
          : null,
      };
      const res = await api.post("/inventory", payload);
      return res.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      if (selectedMedicine) {
        setSuccessResult({ medicine: selectedMedicine, result });
      }

      setSelectedMedicine(null);
      setScanResult(null);
      setFormData({ batchNumber: "", expiryDate: "", quantity: 1 });
      setStep("success");
    },
    onError: (error) => {
      console.error("Failed to add to inventory:", error);
    },
  });

  // Manual entry mutation (FR8 — no DB match)
  const manualMutation = useMutation<
    CreateResult,
    Error,
    ManualFormData
  >({
    mutationFn: async (d) => {
      const payload = {
        ...d,
        expiryDate: d.expiryDate
          ? new Date(d.expiryDate).toISOString()
          : null,
      };
      const res = await api.post("/inventory/manual", payload);
      return res.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      setSuccessResult({
        medicine: {
          cis: "",
          denomination: manualForm.denomination,
          pharmaceuticalForm: manualForm.pharmaceuticalForm,
          status: "manual",
        },
        result,
      });

      setManualForm({
        denomination: "",
        pharmaceuticalForm: "",
        expiryDate: "",
        quantity: 1,
        batchNumber: "",
      });
      setStep("success");
    },
    onError: (error) => {
      console.error("Failed to add manual entry:", error);
    },
  });

  // -- Handlers --

  /** Camera scanned a code successfully */
  const handleCameraScan = useCallback(
    async (result: ScanResult) => {
      setScanResult(result);
      setMode("idle");
      setStep("looking-up");
      setLookupError(null);

      // Pre-fill form data from DataMatrix
      if (result.expiryDate) {
        setFormData((prev) => ({ ...prev, expiryDate: result.expiryDate! }));
      }
      if (result.batchNumber) {
        setFormData((prev) => ({
          ...prev,
          batchNumber: result.batchNumber!,
        }));
      }

      // Auto-lookup the CIP13
      try {
        const res = await api.get(`/bdpm/lookup/${result.cip13}`);
        const medicine: BdpmMedicine = res.data;
        setSelectedMedicine(medicine);

        // If DataMatrix gave us expiry → auto-add immediately
        if (result.source === "datamatrix" && result.expiryDate) {
          addMutation.mutate({
            cis: medicine.cis,
            expiryDate: result.expiryDate,
            batchNumber: result.batchNumber ?? "",
            quantity: 1,
          });
        } else {
          // Barcode only — need user to enter expiry
          setStep("confirm");
        }
      } catch {
        setLookupError(
          `Medicine not found for CIP13: ${result.cip13}. Try manual search.`
        );
        setStep("confirm");
      }
    },
    [addMutation]
  );

  const handleStartCamera = () => {
    setMode("camera");
    setStep("scanning");
    setSuccessResult(null);
    setLookupError(null);
  };

  const handleStartManual = () => {
    setMode("manual");
    setStep("results");
    setSuccessResult(null);
    setSearchTerm("");
    setDebouncedSearch("");
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(searchTerm);
  };

  const handleSelectMedicine = (medicine: BdpmMedicine) => {
    setSelectedMedicine(medicine);
    setStep("confirm");
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedicine) return;
    addMutation.mutate({
      cis: selectedMedicine.cis,
      ...formData,
    });
  };

  const handleScanAnother = () => {
    setSuccessResult(null);
    setScanResult(null);
    setSelectedMedicine(null);
    setLookupError(null);
    setFormData({ batchNumber: "", expiryDate: "", quantity: 1 });
    setStep("choose");
    setMode("idle");
  };

  const handleBackToChoose = () => {
    setMode("idle");
    setStep("choose");
    setSelectedMedicine(null);
    setScanResult(null);
    setLookupError(null);
  };

  const handleStartManualEntry = () => {
    // Pre-fill name from search term if available
    setManualForm((prev) => ({
      ...prev,
      denomination: searchTerm || "",
    }));
    setStep("manual-entry");
  };

  const handleManualEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.denomination.trim()) return;
    manualMutation.mutate(manualForm);
  };

  // -- Bulk scan handlers --

  const handleStartBulkScan = (direction: ScanDirection = "add") => {
    bulkStore.startSession(direction);
    setStep("bulk");
    setMode("camera");
    setSuccessResult(null);
  };

  const handleBulkCameraScan = useCallback(
    async (result: ScanResult) => {
      // Don't close camera — keep scanning in bulk mode
      try {
        const res = await api.get(`/bdpm/lookup/${result.cip13}`);
        const medicine: BdpmMedicine = res.data;

        // Check if already in inventory
        let alreadyInInventory = false;
        try {
          const invRes = await api.get("/inventory");
          const inventory = invRes.data as Array<{ cis: string }>;
          alreadyInInventory = inventory.some((i) => i.cis === medicine.cis);
        } catch {
          // Ignore — not critical for staging
        }

        bulkStore.addItem({
          cis: medicine.cis,
          denomination: medicine.denomination,
          pharmaceuticalForm: medicine.pharmaceuticalForm,
          expiryDate: result.expiryDate ?? null,
          batchNumber: result.batchNumber ?? null,
          alreadyInInventory,
        });

        toast.success(medicine.denomination, {
          description: alreadyInInventory ? "Already in inventory — qty +1" : "New medicine staged",
          duration: 2000,
        });
      } catch {
        toast.error(`Not found: CIP13 ${result.cip13}`, {
          description: "Medicine not in database",
          duration: 3000,
        });
      }
    },
    [bulkStore]
  );

  const handleBulkConfirmAll = async () => {
    const pendingItems = bulkStore.items.filter((i) => i.status === "pending");
    if (pendingItems.length === 0) return;

    setIsConfirmingBulk(true);

    try {
      if (bulkStore.direction === "add") {
        const { data } = await api.post("/inventory/bulk-add", {
          items: pendingItems.map((i) => ({
            cis: i.cis,
            expiryDate: i.expiryDate ? new Date(i.expiryDate).toISOString() : null,
            batchNumber: i.batchNumber ?? "",
            quantity: 1,
          })),
        });

        for (const result of data.results) {
          const item = pendingItems.find((i) => i.cis === result.cis);
          if (!item) continue;
          if (result.success) {
            bulkStore.markConfirmed(item.id);
          } else {
            bulkStore.markError(item.id, result.error ?? "Failed to add");
          }
        }

        const successCount = data.results.filter((r: { success: boolean }) => r.success).length;
        toast.success(`${successCount} medicine${successCount > 1 ? "s" : ""} added to inventory`);
      } else {
        const { data } = await api.post("/inventory/bulk-remove", {
          items: pendingItems.map((i) => ({
            cis: i.cis,
            quantity: 1,
          })),
        });

        for (const result of data.results) {
          const item = pendingItems.find((i) => i.cis === result.cis);
          if (!item) continue;
          if (result.success) {
            bulkStore.markConfirmed(item.id);
          } else {
            bulkStore.markError(item.id, result.error ?? "Failed to remove");
          }
        }

        const successCount = data.results.filter((r: { success: boolean }) => r.success).length;
        toast.success(`${successCount} medicine${successCount > 1 ? "s" : ""} removed from inventory`);
      }

      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      toast.error("Bulk operation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConfirmingBulk(false);
    }
  };

  const handleBulkDone = () => {
    bulkStore.endSession();
    setStep("choose");
    setMode("idle");
  };

  // -- Render --
  return (
    <div className="space-y-6">
      {/* Camera Scanner overlay */}
      <CameraScanner
        active={mode === "camera"}
        onScan={step === "bulk" ? handleBulkCameraScan : handleCameraScan}
        onClose={() => {
          setMode("idle");
          if (step === "bulk") {
            // Stay in bulk step — just stop camera
          } else {
            setStep("choose");
          }
        }}
      />

      {/* Header */}
      <div>
        <h1 className="text-heading-1 text-foreground">Add Medicine</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Scan a barcode or search by name.
        </p>
      </div>

      {/* Success feedback */}
      {step === "success" && successResult && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-card shadow-card">
            {successResult.result.incremented ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-info-bg">
                  <ArrowUp className="h-5 w-5 text-status-info" />
                </div>
                <div className="flex-1">
                  <p className="text-body font-medium text-foreground">
                    Already in inventory
                  </p>
                  <p className="text-body-small text-muted-foreground">
                    {successResult.medicine.denomination} — quantity updated to{" "}
                    {successResult.result.item.quantity}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-clear-bg">
                  <CircleCheck className="h-5 w-5 text-status-clear" />
                </div>
                <div className="flex-1">
                  <p className="text-body font-medium text-foreground">
                    Added to inventory
                  </p>
                  <p className="text-body-small text-muted-foreground">
                    {successResult.medicine.denomination}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                navigate(`/medicine/${successResult.result.item.id}`)
              }
            >
              View Details
            </Button>
            <Button className="flex-1" onClick={handleScanAnother}>
              Scan Another
            </Button>
          </div>
        </div>
      )}

      {/* Choose mode */}
      {step === "choose" && (
        <div className="space-y-3">
          <button
            onClick={handleStartCamera}
            className="flex w-full items-center gap-4 rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-primary/30 active:bg-accent/50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-body font-medium text-foreground">
                Scan Barcode
              </p>
              <p className="text-body-small text-muted-foreground">
                Point camera at the barcode or DataMatrix
              </p>
            </div>
          </button>

          <button
            onClick={handleStartManual}
            className="flex w-full items-center gap-4 rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-primary/30 active:bg-accent/50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Keyboard className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="text-body font-medium text-foreground">
                Search by Name
              </p>
              <p className="text-body-small text-muted-foreground">
                Type medicine name or CIP13 code
              </p>
            </div>
          </button>

          {/* Bulk scan options */}
          <div className="pt-2">
            <p className="mb-2 text-body-small font-medium text-muted-foreground uppercase tracking-wide">
              Rapid Scan
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleStartBulkScan("add")}
                className="flex flex-1 items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-status-clear/30 active:bg-accent/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-clear-bg">
                  <Layers className="h-5 w-5 text-status-clear" />
                </div>
                <div className="text-left">
                  <p className="text-body font-medium text-foreground">
                    Bulk Add
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pharmacy bag unload
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleStartBulkScan("remove")}
                className="flex flex-1 items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-status-danger/30 active:bg-accent/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-danger-bg">
                  <ArrowDown className="h-5 w-5 text-status-danger" />
                </div>
                <div className="text-left">
                  <p className="text-body font-medium text-foreground">
                    Bulk Remove
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Scan to decrement
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Looking up after scan */}
      {step === "looking-up" && (
        <div className="flex flex-col items-center gap-3 py-12 animate-slide-up">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-body text-muted-foreground">
            Looking up medicine...
          </p>
          {scanResult && (
            <Badge variant="secondary" className="mt-2">
              CIP13: {scanResult.cip13}
            </Badge>
          )}
        </div>
      )}

      {/* Confirm / edit details */}
      {step === "confirm" && (
        <div className="space-y-4 animate-slide-up">
          {lookupError && (
            <div className="rounded-lg bg-status-danger-bg p-4">
              <p className="text-body text-status-danger">{lookupError}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartManual}
                >
                  Search Manually
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartManualEntry}
                >
                  <PenLine className="mr-1 h-3.5 w-3.5" />
                  Enter Manually
                </Button>
              </div>
            </div>
          )}

          {selectedMedicine && (
            <div className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-heading-3 text-foreground">
                    {selectedMedicine.denomination}
                  </h2>
                  <p className="text-body-small text-muted-foreground">
                    {selectedMedicine.pharmaceuticalForm}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToChoose}
                >
                  Change
                </Button>
              </div>

              {scanResult && (
                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary">CIP13: {scanResult.cip13}</Badge>
                  <Badge
                    variant={
                      scanResult.source === "datamatrix" ? "success" : "info"
                    }
                  >
                    {scanResult.source === "datamatrix"
                      ? "DataMatrix"
                      : "Barcode"}
                  </Badge>
                </div>
              )}

              <form onSubmit={handleConfirmSubmit} className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="expiry" className="text-body-small">
                    Expiry Date
                    {scanResult?.source === "datamatrix" &&
                      formData.expiryDate && (
                        <Badge variant="success" className="ml-2">
                          Auto-filled
                        </Badge>
                      )}
                  </Label>
                  <Input
                    id="expiry"
                    type="date"
                    className="mt-1"
                    value={formData.expiryDate}
                    onChange={(e) =>
                      setFormData({ ...formData, expiryDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="quantity" className="text-body-small">
                    Quantity (boxes)
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    className="mt-1"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: Number.parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="batch" className="text-body-small">
                    Batch Number (optional)
                    {scanResult?.batchNumber && (
                      <Badge variant="success" className="ml-2">
                        Auto-filled
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="batch"
                    className="mt-1"
                    value={formData.batchNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, batchNumber: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12"
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add to Inventory
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Manual search mode */}
      {step === "results" && (
        <div className="space-y-4 animate-slide-up">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Doliprane, Spasfon, or 13-digit code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-12"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12"
              disabled={!searchTerm}
            >
              {manualSearch.isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Search"
              )}
            </Button>
          </form>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToChoose}
            className="text-muted-foreground"
          >
            ← Back to scan options
          </Button>

          {/* Search results */}
          <div className="space-y-3">
            {manualSearch.isLoading && (
              <div className="py-8 text-center text-body text-muted-foreground">
                Searching...
              </div>
            )}

            {manualSearch.isError && (
              <div className="py-8 text-center text-body text-destructive">
                Search failed. Is the backend running?
              </div>
            )}

            {manualSearch.data?.length === 0 &&
              debouncedSearch &&
              !manualSearch.isLoading && (
                <div className="py-8 text-center">
                  <p className="text-body text-muted-foreground">
                    No medicines found for &ldquo;{debouncedSearch}&rdquo;
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={handleStartManualEntry}
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    Add manually
                  </Button>
                </div>
              )}

            {manualSearch.data?.map((medicine) => (
              <button
                key={medicine.cis}
                onClick={() => handleSelectMedicine(medicine)}
                className="flex w-full items-center justify-between rounded-lg border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/30 active:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-foreground">
                    {medicine.denomination}
                  </p>
                  <p className="text-body-small text-muted-foreground">
                    {medicine.pharmaceuticalForm}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-3 shrink-0">
                  CIS {medicine.cis}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual entry form (FR8 — no database match) */}
      {step === "manual-entry" && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center gap-2 rounded-lg bg-status-info-bg px-4 py-3">
            <PenLine className="h-4 w-4 text-status-info" />
            <span className="text-body-small text-status-info">
              Adding medicine manually — no database match required
            </span>
          </div>

          <form onSubmit={handleManualEntrySubmit} className="rounded-xl border bg-card p-5 shadow-card space-y-4">
            <div>
              <Label htmlFor="manual-name" className="text-body-small">
                Medicine Name *
              </Label>
              <Input
                id="manual-name"
                className="mt-1"
                value={manualForm.denomination}
                onChange={(e) =>
                  setManualForm({ ...manualForm, denomination: e.target.value })
                }
                placeholder="e.g. Voltarène Emulgel 1%"
                autoFocus
                required
              />
            </div>
            <div>
              <Label htmlFor="manual-form" className="text-body-small">
                Form (optional)
              </Label>
              <Input
                id="manual-form"
                className="mt-1"
                value={manualForm.pharmaceuticalForm}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    pharmaceuticalForm: e.target.value,
                  })
                }
                placeholder="e.g. gel, comprimé, sirop"
              />
            </div>
            <div>
              <Label htmlFor="manual-expiry" className="text-body-small">
                Expiry Date
              </Label>
              <Input
                id="manual-expiry"
                type="date"
                className="mt-1"
                value={manualForm.expiryDate}
                onChange={(e) =>
                  setManualForm({ ...manualForm, expiryDate: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="manual-qty" className="text-body-small">
                Quantity (boxes)
              </Label>
              <Input
                id="manual-qty"
                type="number"
                min="1"
                className="mt-1"
                value={manualForm.quantity}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    quantity: Number.parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleBackToChoose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 h-12"
                disabled={
                  manualMutation.isPending || !manualForm.denomination.trim()
                }
              >
                {manualMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add to Inventory
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk scan mode */}
      {step === "bulk" && (
        <div className="space-y-4 animate-slide-up">
          {/* Direction indicator + scan toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  bulkStore.direction === "add"
                    ? "bg-status-clear-bg"
                    : "bg-status-danger-bg"
                )}
              >
                {bulkStore.direction === "add" ? (
                  <ArrowUp className="h-4 w-4 text-status-clear" />
                ) : (
                  <ArrowDown className="h-4 w-4 text-status-danger" />
                )}
              </div>
              <div>
                <h2 className="text-heading-3 text-foreground">
                  {bulkStore.direction === "add"
                    ? "Bulk Add"
                    : "Bulk Remove"}
                </h2>
                <p className="text-body-small text-muted-foreground">
                  {bulkStore.direction === "add"
                    ? "Scan medicines to stage for adding"
                    : "Scan medicines to decrement"}
                </p>
              </div>
            </div>

            {/* Direction toggle */}
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-body-small font-medium transition-colors",
                bulkStore.direction === "add"
                  ? "bg-status-danger-bg text-status-danger hover:bg-status-danger/20"
                  : "bg-status-clear-bg text-status-clear hover:bg-status-clear/20"
              )}
              onClick={() =>
                bulkStore.setDirection(
                  bulkStore.direction === "add" ? "remove" : "add"
                )
              }
            >
              Switch to {bulkStore.direction === "add" ? "Remove" : "Add"}
            </button>
          </div>

          {/* Camera toggle button */}
          <Button
            className="w-full h-12"
            variant={mode === "camera" ? "outline" : "default"}
            onClick={() => {
              if (mode === "camera") {
                setMode("idle");
              } else {
                setMode("camera");
              }
            }}
          >
            <Camera className="mr-2 h-5 w-5" />
            {mode === "camera" ? "Pause Scanner" : "Open Scanner"}
          </Button>

          {/* Live bulk scan list */}
          <BulkScanList
            onConfirmAll={handleBulkConfirmAll}
            isConfirming={isConfirmingBulk}
          />

          {/* Done button — only show when all items confirmed or list is empty */}
          {bulkStore.items.length > 0 &&
            bulkStore.items.every((i) => i.status !== "pending") && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBulkDone}
              >
                Done — Back to Scan
              </Button>
            )}
        </div>
      )}
    </div>
  );
}
