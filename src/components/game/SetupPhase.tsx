import { useEffect, useRef, useState } from "react";
import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

interface ConfigFieldProps {
  legend: string;
  minValue: number;
  maxValue: number;
  ceiling: number;
  onMin: (value: number) => void;
  onMax: (value: number) => void;
}

function RoleConfigField({
  legend,
  minValue,
  maxValue,
  ceiling,
  onMin,
  onMax,
}: ConfigFieldProps) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[0.9rem]">
          Min
          <input
            className="input input--num"
            type="number"
            min={0}
            max={ceiling}
            step={1}
            value={minValue}
            aria-label={`Minimum ${legend}`}
            onChange={(event) => onMin(toCount(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-[0.9rem]">
          Max
          <input
            className="input input--num"
            type="number"
            min={0}
            max={ceiling}
            step={1}
            value={maxValue}
            aria-label={`Maximum ${legend}`}
            onChange={(event) => onMax(toCount(event.target.value))}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function SetupPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the name field when returning to setup (after a reset), but not on
  // the very first page load — that would steal focus unexpectedly.
  useEffect(() => {
    if (snapshot.players.length > 0) inputRef.current?.focus();
  }, []);

  function submit() {
    if (client.addPlayer(name)) {
      setName("");
    }
    inputRef.current?.focus();
  }

  const ceiling = Math.max(snapshot.players.length, 1);
  const countNote = `${snapshot.players.length} of ${snapshot.playerMax} players added${
    snapshot.canStart ? "" : ` · add at least ${snapshot.playerMin}`
  }`;

  return (
    <section className="game-phase" data-phase="setup" aria-labelledby="setup-heading">
      <div className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="setup-heading" tabIndex={-1} className="panel__title">
            Players
          </h2>
          <p className="font-mono text-[0.66rem] font-bold tracking-[0.1em] text-muted uppercase">
            {countNote}
          </p>
        </div>
        <p className="mt-2 text-[0.95rem] text-ink-soft">
          Add {snapshot.playerMin}–{snapshot.playerMax} players, one name at a
          time.
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <label className="field-label" htmlFor="player-name">
            Player name
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="player-name"
              ref={inputRef}
              className="input"
              type="text"
              name="player"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="words"
              placeholder="e.g. Alex"
            />
            <Button type="submit" variant="primary">
              Add player
            </Button>
          </div>
        </form>

        <ul className="player-list">
          {snapshot.players.map((player) => (
            <li key={player.name} className="player-row">
              <span className="player-row__name">{player.name}</span>
              {player.isFirst && (
                <span className="player-row__badge">First</span>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${player.name}`}
                onClick={() => client.removePlayer(player.name)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {snapshot.canStart && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-display text-[1.05rem] font-bold">
              Role configuration
            </h3>
            <p className="mt-2 text-[0.92rem] text-ink-soft">
              Set the minimum and maximum number of Baddies and Bastards. The
              game always keeps Boring players in the majority.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <RoleConfigField
                legend="Baddies (blind)"
                minValue={snapshot.config.baddieMin}
                maxValue={snapshot.config.baddieMax}
                ceiling={ceiling}
                onMin={(value) =>
                  client.setConfig({ ...snapshot.config, baddieMin: value })
                }
                onMax={(value) =>
                  client.setConfig({ ...snapshot.config, baddieMax: value })
                }
              />
              <RoleConfigField
                legend="Bastards (see the word)"
                minValue={snapshot.config.bastardMin}
                maxValue={snapshot.config.bastardMax}
                ceiling={ceiling}
                onMin={(value) =>
                  client.setConfig({ ...snapshot.config, bastardMin: value })
                }
                onMax={(value) =>
                  client.setConfig({ ...snapshot.config, bastardMax: value })
                }
              />
            </div>
            <Button
              type="button"
              variant="primary"
              className="mt-6 w-full"
              onClick={() => client.start()}
            >
              Start game
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
