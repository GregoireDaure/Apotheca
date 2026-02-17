import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { parseScanResult, type ScanResult } from "@/lib/gs1-parser";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraScannerProps {
  onScan: (result: ScanResult) => void;
  onClose: () => void;
  active: boolean;
}

export function CameraScanner({
  onScan,
  onClose,
  active,
}: Readonly<CameraScannerProps>) {
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
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

    let cancelled = false;

    const startScanner = async () => {
      try {
        // Configure ZXing with the barcode formats we care about
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 2000,
        });

        // Get camera stream ourselves — ensures playsinline + proper iOS handling
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Create video element with proper iOS attributes
        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.muted = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";

        const container = document.getElementById("scanner-viewport");
        if (container) {
          container.replaceChildren(video);
        }

        // Attach stream and play
        video.srcObject = stream;
        await video.play();

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (caps?.torch) setHasTorch(true);
        } catch {
          // not supported
        }

        // Start ZXing continuous scan on our video element.
        // Uses drawImage(video, 0, 0) internally — no broken ratio math.
        const controls = reader.scan(video, (result, _error) => {
          if (result && !cancelled) {
            handleScanSuccess(result.getText());
          }
          // error is normal (NotFoundException when no code in frame)
        });
        controlsRef.current = controls;

        setError(null);
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
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setHasTorch(false);
      setTorchOn(false);
    };
  }, [active, handleScanSuccess]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn(!torchOn);
    } catch {
      // torch toggle failed
    }
  };

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black" ref={containerRef}>
      {/* Scanner viewport — fill screen */}
      <div
        id="scanner-viewport"
        className="h-full w-full"
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
