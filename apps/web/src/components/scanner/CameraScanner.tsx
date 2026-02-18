import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { parseScanResult, parseGs1DataMatrix, type ScanResult } from "@/lib/gs1-parser";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";

const DEBUG = import.meta.env.VITE_DEBUG === "1";

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebug = useCallback((msg: string) => {
    if (!DEBUG) return;
    setDebugLog((prev) => [...prev.slice(-14), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Show first 6 char codes to detect hidden chars / FNC1 prefix
      const codes = [...decodedText].slice(0, 6).map((c) => c.charCodeAt(0));
      addDebug(`DECODE len=${decodedText.length} codes=[${codes.join(",")}]`);
      addDebug(`TEXT: "${decodedText.slice(0, 50)}"`);

      const now = Date.now();
      if (
        decodedText === lastScanRef.current &&
        now - lastScanTimeRef.current < 3000
      ) {
        addDebug("SKIP: debounce (same code <3s)");
        return;
      }

      // Detailed GS1 parse debug
      const gs1 = parseGs1DataMatrix(decodedText);
      addDebug(`GS1: isGs1=${gs1.isGs1} cip13=${gs1.cip13} gtin=${gs1.gtin} exp=${gs1.expiryDate} batch=${gs1.batchNumber}`);

      const result = parseScanResult(decodedText);
      if (result) {
        lastScanRef.current = decodedText;
        lastScanTimeRef.current = now;
        addDebug(`PARSED OK: cip13=${result.cip13} src=${result.source}`);

        if (navigator.vibrate) {
          navigator.vibrate(100);
        }

        onScan(result);
      } else {
        addDebug("PARSE FAIL: parseScanResult returned null");
      }
    },
    [onScan, addDebug]
  );

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setDebugLog([]);

    const startScanner = async () => {
      try {
        addDebug("1. Creating ZXing reader...");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 2000,
        });
        addDebug("2. Reader created OK");

        addDebug("3. Requesting getUserMedia...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        addDebug(`4. Got stream: ${stream.getVideoTracks().length} track(s)`);

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        addDebug(`5. Track: ${settings.width}x${settings.height} ${settings.facingMode ?? "?"}`);

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          addDebug("CANCELLED after stream");
          return;
        }

        streamRef.current = stream;

        addDebug("6. Creating <video> element...");
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
          addDebug("7. Video added to DOM");
        } else {
          addDebug("7. ERROR: #scanner-viewport not found!");
        }

        video.srcObject = stream;
        videoRef.current = video;
        addDebug("8. Calling video.play()...");
        await video.play();
        addDebug(`9. Video playing: ${video.videoWidth}x${video.videoHeight}, readyState=${video.readyState}`);

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          addDebug("CANCELLED after play");
          return;
        }

        // Check torch
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (caps?.torch) {
            setHasTorch(true);
            addDebug("10. Torch: available");
          } else {
            addDebug("10. Torch: not available");
          }
        } catch {
          addDebug("10. Torch: check failed");
        }

        addDebug("11. Starting ZXing scan loop...");
        let scanCallCount = 0;
        const controls = reader.scan(video, (result, _error) => {
          scanCallCount++;
          if (scanCallCount <= 3 || scanCallCount % 50 === 0) {
            addDebug(`scan cb #${scanCallCount}: result=${result ? "YES" : "no"} err=${_error ? _error.constructor.name : "none"}`);
          }
          if (result && !cancelled) {
            handleScanSuccess(result.getText());
          }
        });
        controlsRef.current = controls;
        addDebug("12. Scan loop started OK");

        setError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Camera access failed";
        const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : "";
        addDebug(`ERROR: ${message}`);
        if (stack) addDebug(`STACK: ${stack.slice(0, 120)}`);

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
      videoRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setHasTorch(false);
      setTorchOn(false);
    };
  }, [active, facingMode, handleScanSuccess, addDebug]);

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

  // Tap-to-refocus: briefly switch to manual focus then back to continuous
  const [focusAnim, setFocusAnim] = useState<{ x: number; y: number } | null>(null);
  const handleTapToFocus = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];

      // Show focus animation at tap point
      const rect = e.currentTarget.getBoundingClientRect();
      setFocusAnim({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTimeout(() => setFocusAnim(null), 600);

      try {
        const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        if (!caps?.focusMode?.includes("manual")) return;

        // Kick focus by switching to manual then back to continuous
        await track.applyConstraints({
          advanced: [{ focusMode: "manual" } as MediaTrackConstraintSet],
        });
        await new Promise((r) => setTimeout(r, 150));
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        });
        addDebug("Tap-to-focus triggered");
      } catch {
        // Focus control not supported — silent fail
      }
    },
    [addDebug],
  );

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black" ref={containerRef}>
      {/* Scanner viewport — fill screen, tap to refocus */}
      <div
        id="scanner-viewport"
        className="h-full w-full"
        onPointerDown={handleTapToFocus}
      />

      {/* Focus ring animation on tap */}
      {focusAnim && (
        <div
          className="pointer-events-none absolute z-40 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 animate-ping"
          style={{ left: focusAnim.x, top: focusAnim.y }}
        />
      )}

      {/* Debug overlay — only shown when VITE_DEBUG=1 */}
      {DEBUG && (
        <div className="absolute top-12 left-2 right-2 z-50 pointer-events-none">
          <div className="bg-black/70 rounded-lg p-2 max-h-[40vh] overflow-y-auto">
            <p className="text-[10px] font-mono text-green-400 mb-1">DEBUG ({debugLog.length} entries)</p>
            {debugLog.map((line, i) => (
              <p key={i} className="text-[9px] font-mono text-green-300 leading-tight">
                {line}
              </p>
            ))}
            {debugLog.length === 0 && (
              <p className="text-[9px] font-mono text-yellow-300">Waiting for scanner init...</p>
            )}
          </div>
        </div>
      )}

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

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              onClick={() => setFacingMode((m) => m === "environment" ? "user" : "environment")}
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>

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
              <div className="w-10" />
            )}
          </div>
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
