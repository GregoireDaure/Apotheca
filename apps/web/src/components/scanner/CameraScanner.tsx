import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { parseScanResult, type ScanResult } from "@/lib/gs1-parser";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraScannerProps {
  /** Called when a valid medicine code is detected */
  onScan: (result: ScanResult) => void;
  /** Called when the user dismisses the scanner */
  onClose: () => void;
  /** Whether the scanner is currently active */
  active: boolean;
}

// html5-qrcode formats (fallback path)
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.QR_CODE,
];

// Native BarcodeDetector formats
const NATIVE_FORMATS = ["ean_13", "data_matrix", "qr_code"];

export function CameraScanner({
  onScan,
  onClose,
  active,
}: Readonly<CameraScannerProps>) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Debounce: ignore same code scanned within 3 seconds
      const now = Date.now();
      if (
        decodedText === lastScanRef.current &&
        now - lastScanTimeRef.current < 3000
      ) {
        return;
      }

      const result = parseScanResult(decodedText);
      if (result) {
        lastScanRef.current = decodedText;
        lastScanTimeRef.current = now;

        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }

        onScan(result);
      }
    },
    [onScan]
  );

  useEffect(() => {
    if (!active) return;

    const elementId = "scanner-viewport";
    let cancelled = false;
    let animFrameId: number | undefined;
    let html5Qrcode: Html5Qrcode | null = null;

    /**
     * Native BarcodeDetector path — used on iOS Safari 17.2+ and Chrome 83+.
     * Bypasses html5-qrcode entirely to avoid its scan-region cropping bugs on iOS.
     */
    const startNativeScanner = async (): Promise<boolean> => {
      if (typeof BarcodeDetector === "undefined") return false;

      const supported = await BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;

      const detector = new BarcodeDetector({ formats });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return true;
      }

      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.setAttribute("autoplay", "");
      video.muted = true;
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "cover";

      const container = document.getElementById(elementId);
      if (container) {
        container.replaceChildren(video);
      }

      await video.play();

      // Check torch
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        if (caps?.torch) setHasTorch(true);
      } catch {
        // torch check unsupported
      }

      // Scan loop — self-throttled: waits for detect() + next rAF
      const scanLoop = async () => {
        while (!cancelled) {
          await new Promise<void>((resolve) => {
            animFrameId = requestAnimationFrame(() => resolve());
          });
          if (cancelled) break;

          try {
            if (video.readyState >= video.HAVE_ENOUGH_DATA) {
              const barcodes = await detector.detect(video);
              for (const barcode of barcodes) {
                if (!cancelled) handleScanSuccess(barcode.rawValue);
              }
            }
          } catch {
            // Detection error on this frame — continue
          }
        }
      };
      scanLoop();

      return true;
    };

    /**
     * html5-qrcode fallback — used on browsers without native BarcodeDetector.
     */
    const startHtml5QrcodeScanner = async () => {
      html5Qrcode = new Html5Qrcode(elementId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = html5Qrcode;

      await html5Qrcode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.max(
              Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8),
              100
            );
            return { width: size, height: size };
          },
        },
        handleScanSuccess,
        () => {}
      );

      // Check if torch is available
      try {
        const capabilities =
          html5Qrcode.getRunningTrackCameraCapabilities();
        if (capabilities.torchFeature().isSupported()) {
          setHasTorch(true);
        }
      } catch {
        // torch check failed
      }
    };

    const startScanner = async () => {
      try {
        let usedNative = false;
        try {
          usedNative = await startNativeScanner();
        } catch {
          usedNative = false;
        }

        if (!usedNative && !cancelled) {
          await startHtml5QrcodeScanner();
        }

        if (!cancelled) setError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Camera access failed";

        if (
          message.includes("NotAllowedError") ||
          message.includes("Permission")
        ) {
          setError(
            "Camera permission denied. Please allow camera access in your browser settings."
          );
        } else if (message.includes("NotFoundError")) {
          setError("No camera found on this device.");
        } else {
          setError(`Camera error: ${message}`);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (animFrameId !== undefined) cancelAnimationFrame(animFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (html5Qrcode) {
        html5Qrcode
          .stop()
          .then(() => html5Qrcode?.clear())
          .catch(() => {});
        scannerRef.current = null;
      }
      setHasTorch(false);
      setTorchOn(false);
    };
  }, [active, handleScanSuccess]);

  const toggleTorch = async () => {
    // Native scanner path — use stream directly
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
      } catch {
        // torch toggle failed
      }
      return;
    }

    // html5-qrcode fallback path
    if (!scannerRef.current) return;
    try {
      const capabilities = scannerRef.current.getRunningTrackCameraCapabilities();
      const torch = capabilities.torchFeature();
      if (torch.isSupported()) {
        const newState = !torchOn;
        await torch.apply(newState);
        setTorchOn(newState);
      }
    } catch {
      // torch toggle failed
    }
  };

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black" ref={containerRef}>
      {/* Scanner viewport — fill screen, hide html5-qrcode's built-in scan region */}
      <div
        id="scanner-viewport"
        className="h-full w-full [&_#qr-shaded-region]:!hidden"
      />

      {/* Overlay UI */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top bar */}
        <div className="pointer-events-auto flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>

          <span className="text-body font-medium text-white/90">
            Scan Barcode
          </span>

          {hasTorch ? (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-10 w-10 rounded-full hover:text-white",
                torchOn
                  ? "bg-yellow-500/80 text-white hover:bg-yellow-500/60"
                  : "bg-black/40 text-white hover:bg-black/60"
              )}
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
            >
              {torchOn ? (
                <Zap className="h-5 w-5" />
              ) : (
                <ZapOff className="h-5 w-5" />
              )}
            </Button>
          ) : (
            <div className="w-10" /> // spacer
          )}
        </div>

        {/* Center viewfinder guide — responsive sizing */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-[70vmin] h-[70vmin] max-w-[320px] max-h-[320px]">
            {/* Corner brackets */}
            <div className="absolute left-0 top-0 h-8 w-8 border-l-[3px] border-t-[3px] border-white/90 rounded-tl-lg" />
            <div className="absolute right-0 top-0 h-8 w-8 border-r-[3px] border-t-[3px] border-white/90 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-[3px] border-l-[3px] border-white/90 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-[3px] border-r-[3px] border-white/90 rounded-br-lg" />

            {/* Scan line animation */}
            <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
          </div>
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto bg-gradient-to-t from-black/60 to-transparent p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <p className="text-center text-body text-white/80">
            Point at the barcode or DataMatrix on the medicine box
          </p>
          {error && (
            <div className="mt-3 rounded-lg bg-status-danger/20 p-3 text-center">
              <p className="text-body-small text-white">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-white/30 text-white hover:bg-white/10 hover:text-white"
                onClick={onClose}
              >
                Use Manual Search
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
