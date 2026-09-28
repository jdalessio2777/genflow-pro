import { SIGNATURE_BASELINE_RATIO } from "@/lib/signatureCanvas";

// Visual-only "Sign here →" hint + dashed baseline laid over a signature
// canvas. pointer-events: none so touches reach the canvas; it is plain DOM,
// so canvas.toDataURL() never includes it. Parent must be position: relative
// and sized to the canvas.
export default function SignatureGuideOverlay() {
  const top = `${SIGNATURE_BASELINE_RATIO * 100}%`;
  return (
    <div aria-hidden="true" data-testid="signature-guide" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 20, right: 20, top, borderTop: "1px dashed #d1d5db" }} />
      <span
        style={{
          position: "absolute", left: 22, top: `calc(${top} - 6px)`, transform: "translateY(-100%)",
          color: "#9ca3af", fontSize: 14, fontFamily: "sans-serif", lineHeight: 1, userSelect: "none",
        }}
      >
        Sign here →
      </span>
    </div>
  );
}
