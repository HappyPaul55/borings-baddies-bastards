/**
 * Pure game logic for Boring, Baddie & Bastards.
 *
 * Nothing in this module touches the DOM or the network, so the rules that
 * drive the game are also the rules rendered on the /rules page. Keep it that
 * way: if the scoring changes here, it changes everywhere.
 */

export type RoleKey = "BORING" | "BADDIE" | "BASTARD";

export type RoleAccent = "boring" | "baddie" | "bastard";

export interface RoleDefinition {
  key: RoleKey;
  /** Display name, e.g. "Baddie". */
  name: string;
  /** CSS-friendly accent, used for `role-<accent>` classes. */
  accent: RoleAccent;
  /** Plural label for counts, e.g. "Baddies". */
  plural: string;
  /** Whether the role is shown the secret word. */
  seesWord: boolean;
  /** One line for the landing cards. */
  tagline: string;
  /** Shown on the reveal screen while passing the phone. */
  reveal: string;
  /** What the role is trying to achieve during the speaking phase. */
  goal: string;
}

export const ROLES: Record<RoleKey, RoleDefinition> = {
  BORING: {
    key: "BORING",
    name: "Boring",
    accent: "boring",
    plural: "Boring",
    seesWord: true,
    tagline: "You see the word. Hunt down the Baddies and Bastards.",
    reveal: "You can see the word. Find the Baddies and Bastards!",
    goal: "Find the Baddies and Bastards and vote for them.",
  },
  BADDIE: {
    key: "BADDIE",
    name: "Baddie",
    accent: "baddie",
    plural: "Baddies",
    seesWord: false,
    tagline: "You don't see the word. Blend in and don't get caught.",
    reveal: "You cannot see the word. Blend in with the Boring players!",
    goal: "Blend in, play it cool, and avoid being accused.",
  },
  BASTARD: {
    key: "BASTARD",
    name: "Bastard",
    accent: "bastard",
    plural: "Bastards",
    seesWord: true,
    tagline: "You see the word. Get yourself accused as a Baddie.",
    reveal: "You can see the word. Try to get accused as a Baddie!",
    goal: "Get yourself accused as if you were a Baddie.",
  },
};

export const ROLE_ORDER: RoleKey[] = ["BORING", "BADDIE", "BASTARD"];

/* ------------------------------------------------------------------
   Scoring (rendered on /rules and used by calculateRoundScores)
------------------------------------------------------------------ */

export interface ScoreRow {
  label: string;
  points: number;
}

export interface ScoreGroup {
  role: RoleKey;
  heading: string;
  rows: ScoreRow[];
}

export const SCORING: ScoreGroup[] = [
  {
    role: "BORING",
    heading: "If you are Boring",
    rows: [
      { label: "Vote for a Baddie", points: 5 },
      { label: "Vote for a Bastard", points: -5 },
      { label: "Vote for another Boring player", points: -1 },
      { label: "Leave a Boring player unvoted", points: 1 },
      { label: "Leave a Baddie unvoted", points: -2 },
      { label: "Leave a Bastard unvoted", points: 1 },
    ],
  },
  {
    role: "BADDIE",
    heading: "If you are a Baddie",
    rows: [
      { label: "Finish the round without being accused", points: 3 },
      { label: "Every vote you receive", points: -2 },
    ],
  },
  {
    role: "BASTARD",
    heading: "If you are a Bastard",
    rows: [
      { label: "Every vote you receive", points: 1 },
      { label: "Finish the round without being accused", points: 0 },
    ],
  },
];

/* ------------------------------------------------------------------
   Round flow (shared by the landing page and /rules)
------------------------------------------------------------------ */

export interface RoundStep {
  index: string;
  title: string;
  body: string;
}

export const ROUND_STEPS: RoundStep[] = [
  {
    index: "01",
    title: "Set up",
    body: "Add every player by name — 3 to 20 of them — then set how many Baddies and Bastards are allowed.",
  },
  {
    index: "02",
    title: "Pick a category",
    body: "The starting player names a topic, such as Animals or Films, and the game fetches a list of words to match.",
  },
  {
    index: "03",
    title: "Learn your role",
    body: "Pass the phone around the group. Each person privately checks their role and word, then passes it on.",
  },
  {
    index: "04",
    title: "Discuss",
    body: "Everyone talks about the category. Boring players hunt for fakes; Baddies bluff; Bastards try to look guilty.",
  },
  {
    index: "05",
    title: "Vote",
    body: "The phone goes round again. Each player privately votes for everyone they suspect of being a Baddie.",
  },
  {
    index: "06",
    title: "Score the round",
    body: "Roles and votes are revealed, points are awarded, and the running totals decide who plays first next round.",
  },
];

/* ------------------------------------------------------------------
   Randomness helpers (rng injectable so the logic is deterministic in tests)
------------------------------------------------------------------ */

export type Rng = () => number;

/** Fisher–Yates shuffle. Returns a new array; the input is untouched. */
export function shuffle<T>(input: readonly T[], rng: Rng = Math.random): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = output[i] as T;
    const b = output[j] as T;
    output[i] = b;
    output[j] = a;
  }
  return output;
}

/** Inclusive integer in [min, max]. Returns min when the range is empty. */
export function randomInt(min: number, max: number, rng: Rng = Math.random): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi < lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/* ------------------------------------------------------------------
   Role assignment
------------------------------------------------------------------ */

export interface RoleConfig {
  baddieMin: number;
  baddieMax: number;
  bastardMin: number;
  bastardMax: number;
}

export interface AssignmentSummary {
  baddieCount: number;
  bastardCount: number;
  boringCount: number;
  wasAdjusted: boolean;
}

export interface RoleAssignment {
  roles: Record<string, RoleKey>;
  summary: AssignmentSummary;
}

/** Coerce raw form values into a sane, non-negative config with max >= min. */
export function sanitiseRoleConfig(raw: Partial<RoleConfig>): RoleConfig {
  const int = (value: number | undefined, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const baddieMin = int(raw.baddieMin, 0);
  const bastardMin = int(raw.bastardMin, 0);
  const baddieMax = Math.max(baddieMin, int(raw.baddieMax, baddieMin));
  const bastardMax = Math.max(bastardMin, int(raw.bastardMax, bastardMin));
  return { baddieMin, baddieMax, bastardMin, bastardMax };
}

/**
 * Assign one role to every player.
 *
 * The configured counts are honoured where possible, but there is a hard rule:
 * Boring players must remain the strict majority, so the number of special
 * roles is capped at `floor((players - 1) / 2)`. Minimums are satisfied first,
 * then any remaining slots are split in proportion to how far above their
 * minimum each role was configured.
 */
export function assignRoles(
  players: readonly string[],
  config: RoleConfig,
  rng: Rng = Math.random,
): RoleAssignment {
  const playerCount = players.length;
  const maxSpecial = Math.max(0, Math.floor((playerCount - 1) / 2));

  const desiredBaddies = randomInt(config.baddieMin, config.baddieMax, rng);
  const desiredBastards = randomInt(config.bastardMin, config.bastardMax, rng);

  let baddieCount = desiredBaddies;
  let bastardCount = desiredBastards;
  let wasAdjusted = false;

  if (desiredBaddies + desiredBastards > maxSpecial) {
    wasAdjusted = true;
    let remaining = maxSpecial;

    const minBaddies = Math.min(config.baddieMin, remaining);
    remaining -= minBaddies;
    const minBastards = Math.min(config.bastardMin, remaining);
    remaining -= minBastards;

    const extraBaddies = desiredBaddies - minBaddies;
    const extraBastards = desiredBastards - minBastards;
    const totalExtra = extraBaddies + extraBastards;

    if (totalExtra > 0 && remaining > 0) {
      const baddieExtra = Math.floor((extraBaddies / totalExtra) * remaining);
      baddieCount = minBaddies + baddieExtra;
      bastardCount = minBastards + (remaining - baddieExtra);
    } else {
      baddieCount = minBaddies;
      bastardCount = minBastards;
    }
  }

  const special: RoleKey[] = [];
  for (let i = 0; i < baddieCount; i++) special.push("BADDIE");
  for (let i = 0; i < bastardCount; i++) special.push("BASTARD");
  while (special.length < playerCount) special.push("BORING");

  const shuffled = shuffle(special, rng);
  const roles: Record<string, RoleKey> = {};
  players.forEach((player, index) => {
    roles[player] = shuffled[index] as RoleKey;
  });

  return {
    roles,
    summary: {
      baddieCount,
      bastardCount,
      boringCount: playerCount - baddieCount - bastardCount,
      wasAdjusted,
    },
  };
}

/* ------------------------------------------------------------------
   Player order (used for both role reveals and voting)
------------------------------------------------------------------ */

/** Every player exactly once, starting at `firstIndex` and wrapping around. */
export function generatePlayerOrder(
  players: readonly string[],
  firstIndex: number,
): string[] {
  const total = players.length;
  if (total === 0) return [];
  const start = ((firstIndex % total) + total) % total;
  return Array.from({ length: total }, (_, offset) => {
    return players[(start + offset) % total] as string;
  });
}

/* ------------------------------------------------------------------
   Scoring
------------------------------------------------------------------ */

export interface PlayerDetail {
  role: RoleKey;
  votesReceived: number;
  breakdown: string[];
  roundScore: number;
}

export interface RoundResult {
  /** Player name -> points earned this round. */
  totals: Record<string, number>;
  /** Player name -> detail used by the results screen. */
  details: Record<string, PlayerDetail>;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * Score one round. Mirrors the rules on /rules exactly:
 *
 * - Boring players are judged on every vote decision (voted / not voted).
 * - Baddies lose 2 a vote but gain 3 if left alone.
 * - Bastards gain 1 per vote and nothing if ignored.
 */
export function calculateRoundScores(
  players: readonly string[],
  roles: Record<string, RoleKey>,
  votes: Record<string, string[]>,
): RoundResult {
  const totals: Record<string, number> = {};
  const details: Record<string, PlayerDetail> = {};

  const votesReceived: Record<string, number> = {};
  for (const targets of Object.values(votes)) {
    for (const target of targets) {
      votesReceived[target] = (votesReceived[target] ?? 0) + 1;
    }
  }

  for (const player of players) {
    const role = roles[player] as RoleKey;
    const breakdown: string[] = [];
    let score = 0;

    if (role === "BORING") {
      const targets = votes[player] ?? [];
      for (const other of players) {
        if (other === player) continue;
        const otherRole = roles[other] as RoleKey;
        const voted = targets.includes(other);
        let points: number;
        let text: string;

        if (voted) {
          if (otherRole === "BADDIE") {
            points = 5;
            text = `Voted for ${other} (Baddie): +5`;
          } else if (otherRole === "BASTARD") {
            points = -5;
            text = `Voted for ${other} (Bastard): −5`;
          } else {
            points = -1;
            text = `Voted for ${other} (Boring): −1`;
          }
        } else {
          if (otherRole === "BADDIE") {
            points = -2;
            text = `Did not vote for ${other} (Baddie): −2`;
          } else if (otherRole === "BASTARD") {
            points = 1;
            text = `Did not vote for ${other} (Bastard): +1`;
          } else {
            points = 1;
            text = `Did not vote for ${other} (Boring): +1`;
          }
        }

        score += points;
        breakdown.push(text);
      }
    } else if (role === "BADDIE") {
      const received = votesReceived[player] ?? 0;
      if (received === 0) {
        score += 3;
        breakdown.push("Not accused: +3");
      } else {
        score -= 2 * received;
        breakdown.push(
          `Accused ${received} time${received === 1 ? "" : "s"}: ${signed(-2 * received)}`,
        );
      }
    } else {
      const received = votesReceived[player] ?? 0;
      score += received;
      breakdown.push(
        received === 0
          ? "Not accused: 0 points"
          : `Accused ${received} time${received === 1 ? "" : "s"}: +${received}`,
      );
    }

    totals[player] = score;
    details[player] = {
      role,
      votesReceived: votesReceived[player] ?? 0,
      breakdown,
      roundScore: score,
    };
  }

  return { totals, details };
}

/** Sort a player list by total score, highest first. Ties keep input order. */
export function rankPlayers(
  players: readonly string[],
  scores: Record<string, number>,
): string[] {
  return [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
}
