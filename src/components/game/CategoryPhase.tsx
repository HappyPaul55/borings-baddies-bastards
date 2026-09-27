import { useEffect, useRef, useState } from "react";
import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";
import { CATEGORY_MAX_LENGTH } from "../../lib/limits";

export function CategoryPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();
  const [category, setCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    void client.fetchWords(category);
  }

  const roundSuffix = snapshot.round > 1 ? ` (round ${snapshot.round})` : "";

  return (
    <section
      className="game-phase"
      data-phase="category"
      aria-labelledby="category-heading"
    >
      <div className="panel">
        <p className="turn-line">
          {`${snapshot.firstPlayerName} picks the category${roundSuffix}`}
        </p>
        <PhaseHeading id="category-heading" focus={false}>
          Pick a category
        </PhaseHeading>
        <p className="mt-2 text-[0.95rem] text-ink-soft">
          The first player names a topic. Keep it broad enough that plenty of
          words fit, because everyone will need to talk about it.
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <label className="field-label" htmlFor="category-input">
            Category
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="category-input"
              ref={inputRef}
              className="input"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              maxLength={CATEGORY_MAX_LENGTH}
              autoComplete="off"
              placeholder="e.g. Animals, Films, Cities"
              disabled={snapshot.loading}
            />
            <Button type="submit" variant="primary" disabled={snapshot.loading}>
              Get words
            </Button>
          </div>
        </form>

        {snapshot.loading && (
          <p className="mt-4 flex items-center gap-2 text-[0.9rem] text-ink-soft">
            <span className="spinner" aria-hidden="true" /> Fetching words…
          </p>
        )}

        {snapshot.wordError && (
          <div className="alert alert--error mt-4" role="alert">
            <p>{snapshot.wordError}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void client.fetchWords(category)}
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  client.dismissWordError();
                  setCategory("");
                  inputRef.current?.focus();
                }}
              >
                Different category
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
