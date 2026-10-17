import { useEffect, useRef, useState } from "react";
import { initSignatureCanvas } from "@/lib/signatureCanvas";
import SignatureGuideOverlay from "@/components/ui/SignatureGuideOverlay";
import { useSheetHistory } from "@/lib/sheetHistory";

// The ONE signature pad (full-screen canvas): used by the job's
// Collect Signature button (JobSignatureButton) and the membership agreement.
// onSave(dataUrl) runs after the slide-down; the caller saves it.
export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const hasInk = useRef(false);
  const [needInk, setNeedInk] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [slideClass, setSlideClass] = useState("translate-y-full");
  const isPortrait = typeof window !== "undefined" && window.innerWidth < window.innerHeight;
  // Full-screen pad = a sheet: a back swipe cancels it instead of leaving
  // the job (F-10). Only when it can be cancelled.
  useSheetHistory(!!onCancel, () => onCancel?.());

  // Slide-up animation on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideClass("translate-y-0"));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  // Background + pen only; the "Sign here" guide is a DOM overlay so it
  // never ends up in the exported PNG.
  const initCanvas = (canvas) => initSignatureCanvas(canvas);

  const canvasCallbackRef = (canvas) => {
    if (canvas && canvas !== canvasRef.current) {
      canvasRef.current = canvas;
      initCanvas(canvas);
    }
  };

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => { e.preventDefault(); isDrawing.current = true; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { e.preventDefault(); if (!isDrawing.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.lineTo(pos.x, pos.y); ctx.stroke(); hasInk.current = true; if (needInk) setNeedInk(false); };
  const stopDraw = (e) => { e.preventDefault(); isDrawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCanvas(canvas);
    hasInk.current = false;
  };

  const handleDone = () => {
    // A blank pad is not a signature.
    if (!hasInk.current) { setNeedInk(true); return; }
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setSlideClass("translate-y-full");
    setTimeout(() => {
      setDismissed(true);
      onSave(dataUrl);
    }, 300);
  };

  if (dismissed) return null;

  const cw = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.85) : 560;
  const ch = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.50) : 280;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
    >
      <div
        style={{ transition: "transform 0.3s ease-out" }}
        className={`transform ${slideClass} flex flex-col items-center gap-4 w-full px-4`}
      >
        {/* Label */}
        <p style={{ color: "#ffffff", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>Customer Signature</p>

        {/* Canvas */}
        <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
          <canvas
            ref={canvasCallbackRef}
            width={cw}
            height={ch}
            style={{ background: "#ffffff", borderRadius: "12px", display: "block", touchAction: "none" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
          />
          <SignatureGuideOverlay />
        </div>

        {needInk && (
          <p role="alert" style={{ color: "#fca5a5", fontSize: "0.85rem", fontWeight: 600 }}>Please sign first</p>
        )}

        {/* Portrait hint */}
        {isPortrait && (
          <p style={{ color: "#9ca3af", fontSize: "0.75rem" }}>Rotate device for more space</p>
        )}

        {/* Bottom action bar */}
        <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: `${cw}px` }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{ flex: 1, height: "44px", borderRadius: "12px", background: "transparent", color: "#d1d5db", fontWeight: 600, fontSize: "0.9rem", border: "1px solid #4b5563", cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={clear}
            style={{ flex: 1, height: "44px", borderRadius: "12px", background: "#374151", color: "#ffffff", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
          <button
            onClick={handleDone}
            style={{ flex: 1, height: "44px", borderRadius: "12px", background: "#D32C2C", color: "#ffffff", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
