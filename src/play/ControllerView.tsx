import { useAirJamController } from "@air-jam/sdk";
import { Link } from "react-router-dom";
import { useFeudStore } from "../game/store";

function Shell({ children, label, demo }: { children: React.ReactNode; label: string; demo: string | null }) {
  return (
    <div className="phone" data-theme="ice">
      {demo && <div className="demo-banner demo-banner--phone" role="status">{demo}</div>}
      <header className="phone__head">
        <p className="bi-label">GDG ON CAMPUS · UOBD</p>
        <p className="bi-label phone__state" role="status">{label}</p>
      </header>
      <main className="phone__main">{children}</main>
    </div>
  );
}

export function ControllerView() {
  const c = useAirJamController();
  const snap = useFeudStore((s) => s.snapshot);
  const demo = snap.demoLabel;

  if (!c.roomId) {
    return (
      <Shell label="NO ROOM" demo={demo}>
        <h1 className="phone__title">No room code</h1>
        <p className="phone__lead">Scan the QR code on the big screen, or enter the code.</p>
        <Link className="bi-button phone__btn" to="/join">Enter a code</Link>
      </Shell>
    );
  }
  if (c.connectionStatus !== "connected") {
    return (
      <Shell label="CONNECTING" demo={demo}>
        <h1 className="phone__title">Joining {c.roomId}…</h1>
      </Shell>
    );
  }
  return (
    <Shell label={`ROOM ${c.roomId}`} demo={demo}>
      <h1 className="phone__title">This game uses physical buzzers</h1>
      <p className="phone__lead">Nothing to do on your phone. Watch the big screen.</p>
    </Shell>
  );
}
