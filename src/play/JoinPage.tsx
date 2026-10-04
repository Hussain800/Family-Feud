import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { roomUrl } from "../public/url";

const CODE = /^[A-HJ-NP-Z2-9]{4}$/; // the server's room-code alphabet has no I, O, 0 or 1

/** /play/:roomCode lands on the SDK's controller route. */
export function PlayRedirect() {
  const { roomCode = "" } = useParams();
  return <Navigate to={roomUrl(roomCode.toUpperCase())} replace />;
}

/** /join: manual room-code entry. A prefilled ?room= goes straight in. */
export function JoinPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const prefill = (params.get("room") ?? "").toUpperCase();
  const [code, setCode] = useState(prefill);
  const [error, setError] = useState("");
  if (CODE.test(prefill)) return <Navigate to={roomUrl(prefill)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!CODE.test(c)) return setError("Room codes are 4 letters or numbers, like K7XQ.");
    nav(roomUrl(c));
  };
  return (
    <div className="phone" data-theme="ice">
      <main className="phone__main">
        <p className="bi-label">GDG ON CAMPUS · UOBD</p>
        <h1 className="phone__title">hello, world!</h1>
        <p className="phone__lead">Enter the room code from the big screen.</p>
        <form onSubmit={submit} className="phone__form">
          <label className="bi-label" htmlFor="room">ROOM CODE</label>
          <input
            id="room"
            className="phone__input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4));
              setError("");
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4}
            aria-describedby="room-err"
          />
          <p id="room-err" className="phone__error" role="alert">{error}</p>
          <button className="bi-button phone__btn" type="submit">Join</button>
        </form>
      </main>
    </div>
  );
}
