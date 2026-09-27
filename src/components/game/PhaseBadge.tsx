import { PHASE_LABELS, type Phase } from "../../lib/game-store";

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <div className="phase-badge">
      <span className="phase-badge__label">
        <span aria-hidden="true">//</span> current phase
      </span>
      <span className="phase-badge__value">{PHASE_LABELS[phase]}</span>
    </div>
  );
}
