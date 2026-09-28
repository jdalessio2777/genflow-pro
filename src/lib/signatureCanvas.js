// Shared by every signature pad (JobDetail SignatureCanvas, MembershipAgreement).
// Paints ONLY a white background and sets the pen style. The "Sign here →"
// hint and dashed baseline are a DOM overlay (SignatureGuideOverlay), never
// drawn on the canvas, so they can't end up in the exported signature PNG
// (and from there in the agreement PDF / invoice).
export const SIGNATURE_BASELINE_RATIO = 0.75;

export function initSignatureCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}
