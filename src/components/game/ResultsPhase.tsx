import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";
import { ScoreTable } from "./ScoreTable";

function pluralise(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ResultsPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();
  const results = snapshot.results ?? [];

  function newGame() {
    const confirmed = window.confirm(
      "Start a new game? Player names are kept but all scores reset to zero.",
    );
    if (confirmed) client.resetGame();
  }

  return (
    <section
      className="game-phase"
      data-phase="results"
      aria-labelledby="results-heading"
    >
      <div className="panel">
        <PhaseHeading id="results-heading">Round results</PhaseHeading>
        <p className="mt-1 font-mono text-[0.72rem] font-bold tracking-[0.1em] text-muted uppercase">
          category: <span className="text-ink">{snapshot.category}</span>
        </p>

        <div className="mt-5 grid gap-4">
          {results.map((result) => (
            <article
              key={result.name}
              className={`result-card role-${result.accent}`}
            >
              <h3 className={`result-card__player role-${result.accent}`}>
                {result.name}
              </h3>
              <p className="result-card__meta">
                Role: {result.roleName} · votes received:{" "}
                {result.votesReceived}
              </p>
              <p className="result-card__meta">
                Voted for:{" "}
                {result.votedFor.length ? result.votedFor.join(", ") : "no one"}
              </p>
              {result.breakdown.length > 0 && (
                <div className="result-card__breakdown">
                  {result.breakdown.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
              <p
                className={`result-card__score ${
                  result.roundScore >= 0 ? "delta-up" : "delta-down"
                }`}
              >
                Round score: {result.roundScore >= 0 ? "+" : ""}
                {result.roundScore}
              </p>
            </article>
          ))}

          {snapshot.summary && (
            <article className="result-card role-bastard">
              <h3 className="result-card__player role-bastard">
                Role counts revealed
              </h3>
              <p className="result-card__meta">
                {pluralise(
                  snapshot.summary.boringCount,
                  "Boring player",
                  "Boring players",
                )}{" "}
                · {pluralise(snapshot.summary.baddieCount, "Baddie", "Baddies")}{" "}
                ·{" "}
                {pluralise(
                  snapshot.summary.bastardCount,
                  "Bastard",
                  "Bastards",
                )}
              </p>
              {snapshot.summary.wasAdjusted && (
                <p className="result-card__breakdown">
                  The counts were trimmed so Boring players stayed in the
                  majority.
                </p>
              )}
            </article>
          )}
        </div>

        <h3 className="mt-8 font-display text-[1.15rem] font-bold">
          Running totals
        </h3>
        <ScoreTable rows={snapshot.scores} />

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="primary"
            onClick={() => client.nextRound()}
          >
            Next round
          </Button>
          <Button type="button" variant="outline" onClick={newGame}>
            New game
          </Button>
        </div>
      </div>
    </section>
  );
}
