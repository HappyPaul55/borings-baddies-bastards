import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  id: string;
  className?: string;
  /** Focus the heading on mount and whenever this value changes. */
  focusKey?: string | number;
  /** Set false when a control (e.g. a text input) should take focus instead. */
  focus?: boolean;
  children: ReactNode;
}

/**
 * A phase heading that takes focus. Pass `focusKey` for phases that cycle
 * through players so each new turn is announced and focused.
 */
export function PhaseHeading({
  id,
  className = "panel__title",
  focusKey,
  focus = true,
  children,
}: Props) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, focusKey]);

  return (
    <h2 id={id} ref={ref} tabIndex={-1} className={className}>
      {children}
    </h2>
  );
}
