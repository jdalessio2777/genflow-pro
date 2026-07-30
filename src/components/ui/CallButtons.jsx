import { Phone, PhoneCall } from "lucide-react";
import { toast } from "sonner";

/**
 * CallButtons — renders two side-by-side call buttons for a phone number.
 *
 * Button 1 (Call): native tel: link, green style.
 * Button 2 (Nextiva): copies number to clipboard, then opens nextiva://.
 *
 * Returns null when phone is falsy.
 */
export default function CallButtons({ phone }) {
  if (!phone) return null;

  function handleNextiva() {
    navigator.clipboard.writeText(phone).then(() => {
      window.location.href = "nextiva://";
      toast.success("Number copied — paste into NextivaONE dialer");
    }).catch(() => {
      window.location.href = "nextiva://";
      toast.warning("Open NextivaONE and dial " + phone);
    });
  }

  return (
    <div className="grid grid-cols-2 gap-1.5 w-full">
      <a href={`tel:${phone}`} className="min-w-0">
        <button className="w-full flex items-center justify-center gap-1 h-9 px-1.5 rounded-xl bg-green-50 border border-green-200 text-xs font-semibold text-green-700 hover:bg-green-100 active:scale-95 transition-all">
          <Phone className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Call</span>
        </button>
      </a>
      <button
        onClick={handleNextiva}
        className="min-w-0 w-full flex items-center justify-center gap-1 h-9 px-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all"
      >
        <PhoneCall className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Nextiva</span>
      </button>
    </div>
  );
}
