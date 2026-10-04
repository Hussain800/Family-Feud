import type { HostGame } from "./useHostGame";

/** Setup: which buzzers this event uses. Physical needs no phones and no network. */
export function BuzzerSetup({ g }: { g: HostGame }) {
  return (
    <section className="card" aria-labelledby="buzzers-h">
      <h2 className="card__h" id="buzzers-h">Buzzers</h2>
      <fieldset className="choice">
        <legend className="sr-only">Buzzer type</legend>
        <label className={`choice__opt ${g.buzzerMode === "physical" ? "is-on" : ""}`}>
          <input type="radio" name="buzzers" checked={g.buzzerMode === "physical"} onChange={() => g.setBuzzerMode("physical")} />
          <span><b>Physical buzzers</b> (default). The hosts say which buzzer went first; you tap that team. No phones, no QR code.</span>
        </label>
        <label className={`choice__opt ${g.buzzerMode === "phone" ? "is-on" : ""}`}>
          <input type="radio" name="buzzers" checked={g.buzzerMode === "phone"} onChange={() => g.setBuzzerMode("phone")} />
          <span><b>Phone buzzers</b> (optional, pending Rayyan's decision). One assigned phone per team.</span>
        </label>
      </fieldset>
    </section>
  );
}

/** Live face-off controls for phone buzzers. Filled in with the phone-buzzer work. */
export function PhoneFaceOff({ g }: { g: HostGame }) {
  return g.buzzerMode === "phone" ? <p className="muted small">Phone buzzers are not connected yet. Use the buttons below.</p> : null;
}
