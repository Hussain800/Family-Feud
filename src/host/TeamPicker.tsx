import { useState } from "react";
import type { TeamId } from "../engine/types";
import { TEAM_COLORS, TEAM_PRESETS, teamLabel, type TeamColor } from "../teams";
import { Swatch } from "../ui/Swatch";
import { teamStyle } from "../ui/teamStyle";
import { ConfirmButton } from "./ConfirmButton";
import type { HostGame } from "./useHostGame";

export type Picks = Partial<Record<TeamId, TeamColor>>;
const TEAMS: TeamId[] = ["A", "B"];
const WHICH: Record<TeamId, string> = { A: "First team", B: "Second team" };

/**
 * Two labelled choices, six colours each. A colour the other team already has is greyed out, with the reason in plain words.
 * Native radios, so arrow keys and screen readers work. Picking only calls `onPick`; what that does is the caller's business.
 */
export function TeamPicker({ value, onPick, scope }: { value: Picks; onPick: (team: TeamId, color: TeamColor) => void; scope: string }) {
  return (
    <div className="picker">
      {TEAMS.map((t) => {
        const other = TEAMS.find((x) => x !== t)!;
        return (
          <fieldset key={t} className="picker__team">
            <legend className="field__label">{WHICH[t]}{value[t] ? <b className="picker__now"> · {teamLabel(value[t]!)}</b> : <span className="muted"> · not chosen yet</span>}</legend>
            <div className="picker__chips">
              {TEAM_COLORS.map((c) => {
                const taken = value[other] === c;
                return (
                  <label key={c} className={`chip ${value[t] === c ? "is-on" : ""} ${taken ? "is-taken" : ""}`} style={teamStyle(c)} title={taken ? `${teamLabel(c)} is already the ${WHICH[other].toLowerCase()}` : undefined}>
                    <input type="radio" name={`${scope}-${t}`} value={c} checked={value[t] === c} disabled={taken} onChange={() => onPick(t, c)} />
                    <i className="swatch" aria-hidden="true" />
                    <span>{TEAM_PRESETS[c].label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <p className="muted small picker__hint">Each team needs its own colour, so a colour the other team has is greyed out.</p>
    </div>
  );
}

/** The two teams' current colours, for the live game. Choosing renames the team on screen and changes nothing else. */
export function TeamIdentity({ g, scope }: { g: HostGame; scope: string }) {
  const { A, B } = g.state.teams;
  return <TeamPicker scope={scope} value={{ A: A.color, B: B.color }} onPick={(team, color) => g.act({ type: "SET_TEAM", team, color })} />;
}

/** Start the next game: pick the next two colours, then confirm. Scores and the round reset; the question set and used-question marks stay. */
export function NextTeams({ g, scope, outline = false }: { g: HostGame; scope: string; outline?: boolean }) {
  const [picks, setPicks] = useState<Picks>({});
  const both = picks.A && picks.B ? ({ A: picks.A, B: picks.B } as Record<TeamId, TeamColor>) : null;
  return (
    <div className="next-teams">
      <TeamPicker scope={scope} value={picks} onPick={(team, color) => setPicks({ ...picks, [team]: color })} />
      <div className="row">
        <ConfirmButton
          label={both ? `Start the next game: ${teamLabel(both.A)} vs ${teamLabel(both.B)}` : "Choose both teams to continue"}
          confirmLabel="new teams, scores to 0"
          disabled={!both}
          className={`bi-button host__btn host__btn--lg ${outline ? "bi-button--outline" : ""}`}
          onConfirm={() => {
            g.nextTeams(both!);
            setPicks({});
          }}
        />
      </div>
    </div>
  );
}

/** The team's written name with its colour badge. The words always come with the colour. */
export function TeamTag({ name, color }: { name: string; color: string | null | undefined }) {
  return <span className="team-tag"><Swatch color={color} />{name}</span>;
}
