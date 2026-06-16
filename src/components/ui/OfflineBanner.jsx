import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [visible, setVisible] = useState(!navigator.onLine);

  useEffect(() => {
    let backOnlineTimer = null;

    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      setVisible(true);
      backOnlineTimer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setShowBackOnline(false), 300);
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
      setVisible(true);
      if (backOnlineTimer) clearTimeout(backOnlineTimer);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (backOnlineTimer) clearTimeout(backOnlineTimer);
    };
  }, []);

  if (!visible) return null;

  if (showBackOnline) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "#D1FAE5",
          color: "#065F46",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "8px 16px",
          fontSize: "12px",
          fontWeight: 600,
          transform: visible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 0.3s ease",
        }}
      >
        <Wifi size={14} />
        Back online
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "#FEF3C7",
          color: "#B45309",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "8px 16px",
          fontSize: "12px",
          fontWeight: 600,
          transform: "translateY(0)",
          transition: "transform 0.3s ease",
        }}
      >
        <WifiOff size={14} />
        You&apos;re offline — data will sync when reconnected
      </div>
    );
  }

  return null;
}
