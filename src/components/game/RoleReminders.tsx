import { ROLES, ROLE_ORDER } from "../../lib/game";

interface Props {
  variant?: "tagline" | "goal";
  title?: string;
}

export function RoleReminders({ variant = "goal", title = "Role reminders" }: Props) {
  return (
    <div className="mt-4 rounded-[6px] border border-line bg-paper p-4">
      <p className="font-mono text-[0.64rem] font-bold tracking-[0.14em] text-muted uppercase">
        {title}
      </p>
      <ul className="mt-2 grid gap-1.5 text-[0.92rem]">
        {ROLE_ORDER.map((key) => {
          const role = ROLES[key];
          return (
            <li key={key}>
              <strong className={`role-${role.accent}`}>{role.name}</strong>
              <span className="text-ink-soft">
                {" — "}
                {variant === "goal" ? role.goal : role.tagline.toLowerCase()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
