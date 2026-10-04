/**
 * Routes.
 *   /host              moderator console (the only Air Jam host)
 *   /screen/:roomCode  projector, fed by the moderator window over BroadcastChannel
 *   /join              manual room-code entry
 *   /play/:roomCode    alias that lands on the SDK controller route
 *   /controller        the SDK's controller route; the join QR points here
 */
import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { airjam } from "./airjam.config";
import { JoinPage, PlayRedirect } from "./play/JoinPage";
import { ScreenPage } from "./screen/ScreenPage";

const HostConsole = lazy(async () => ({ default: (await import("./host/HostConsole")).HostConsole }));
const ControllerView = lazy(async () => ({ default: (await import("./play/ControllerView")).ControllerView }));

const Loading = () => <div className="boot" data-theme="ice"><p className="bi-label">LOADING</p></div>;

function Home() {
  return (
    <div className="boot" data-theme="ice">
      <p className="bi-label">GDG ON CAMPUS · UOBD</p>
      <h1 className="phone__title">hello, world! &lt;FAMILY FEUD&gt;</h1>
      <p className="phone__lead">Organiser: open the moderator console. Players need nothing; with phone buzzers on, one player per team pairs a phone.</p>
      <div className="row">
        <Link className="bi-button" to="/host">Moderator console</Link>
        <Link className="bi-button bi-button--outline" to="/join">Pair a buzzer phone</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/host"
          element={
            <airjam.Host>
              <HostConsole />
            </airjam.Host>
          }
        />
        <Route path="/screen/:roomCode" element={<ScreenPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play/:roomCode" element={<PlayRedirect />} />
        <Route
          path={airjam.paths.controller}
          element={
            <airjam.Controller>
              <ControllerView />
            </airjam.Controller>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
