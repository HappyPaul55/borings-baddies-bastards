/**
 * The game session.
 *
 * `Game` owns all mutable state for one table of players and exposes it as an
 * immutable snapshot. The UI never mutates anything directly; it reads the
 * snapshot and calls intent methods. That is the whole point: swapping this
 * class for a WebSocket-backed room client later should not require touching the
 * React components, as long as both satisfy `GameClient`.
 *
 * The rules themselves live in `./game` and are pure. This file is the stateful
 * wrapper around them: player list, phase machine, vote tallying and history.
 */
import {
  ROLES,
  assignRoles,
  calculateRoundScores,
  generatePlayerOrder,
  rankPlayers,
  sanitiseRoleConfig,
  shuffle,
  type AssignmentSummary,
  type PlayerDetail,
  type RoleAccent,
  type RoleConfig,
  type RoleKey,
} from "./game";
import { WordApiError, fetchWords } from "./words";

export type Phase =
  | "setup"
  | "category"
  | "assignment"
  | "passing"
  | "speaking"
  | "voting"
  | "results";

export const PHASE_LABELS: Record<Phase, string> = {
  setup: "Setup",
  category: "Category",
  assignment: "Roles assigned",
  passing: "Pass the phone",
  speaking: "Discussion",
  voting: "Voting",
  results: "Results",
};

export interface PlayerView {
  name: string;
  isFirst: boolean;
}

export interface PassingView {
  name: string;
  /** 1-based position in the pass order. */
  position: number;
  total: number;
}

export interface VotingView {
  voter: string;
  position: number;
  total: number;
  /** The names this voter may choose between. */
  options: string[];
}

export interface RevealView {
  roleName: string;
  accent: RoleAccent;
  /** The secret word, or null for a role that cannot see it. */
  word: string | null;
  description: string;
}

export interface ResultPlayerView {
  name: string;
  roleName: string;
  accent: RoleAccent;
  votesReceived: number;
  votedFor: string[];
  breakdown: string[];
  roundScore: number;
}

export interface ScoreRowView {
  name: string;
  total: number;
}

export interface GameSnapshot {
  phase: Phase;
  round: number;
  players: PlayerView[];
  playerMin: number;
  playerMax: number;
  config: RoleConfig;
  canStart: boolean;
  firstPlayerName: string;
  category: string;
  passing: PassingView | null;
  voting: VotingView | null;
  reveal: RevealView | null;
  results: ResultPlayerView[] | null;
  summary: AssignmentSummary | null;
  scores: ScoreRowView[];
  loading: boolean;
  /** A general message shown near the top of the panel. */
  error: string | null;
  /** A word-service failure, shown with retry / change-category actions. */
  wordError: string | null;
}

/** The contract the UI depends on. A multiplayer room client will implement this too. */
export interface GameClient {
  subscribe(listener: () => void): () => void;
  getSnapshot(): GameSnapshot;
  getServerSnapshot(): GameSnapshot;
  /** Returns false (and sets `error`) when the name is empty, a duplicate or over the limit. */
  addPlayer(name: string): boolean;
  removePlayer(name: string): void;
  setConfig(config: RoleConfig): void;
  start(): void;
  fetchWords(category: string): void;
  dismissWordError(): void;
  beginPassing(): void;
  reveal(): void;
  advancePassing(): void;
  beginVoting(): void;
  submitVotes(names: string[]): void;
  nextRound(): void;
  resetGame(): void;
  dismissError(): void;
}

export interface GameOptions {
  playerMin: number;
  playerMax: number;
}

const DEFAULT_CONFIG: RoleConfig = {
  baddieMin: 0,
  baddieMax: 1,
  bastardMin: 0,
  bastardMax: 1,
};

export class Game implements GameClient {
  private readonly playerMin: number;
  private readonly playerMax: number;

  private players: string[] = [];
  private scores: Record<string, number> = {};
  private phase: Phase = "setup";
  private round = 1;
  private firstPlayerIndex = 0;
  private config: RoleConfig = { ...DEFAULT_CONFIG };
  private category = "";
  private selectedWord = "";
  private roles: Record<string, RoleKey> = {};
  private votes: Record<string, string[]> = {};
  private passingOrder: string[] = [];
  private passingIndex = 0;
  private votingIndex = 0;
  private revealView: RevealView | null = null;
  private resultDetails: Record<string, PlayerDetail> | null = null;
  private summary: AssignmentSummary | null = null;
  private loading = false;
  private error: string | null = null;
  private wordError: string | null = null;

  private readonly listeners = new Set<() => void>();
  private snapshot: GameSnapshot;

  /** Guards against an older word request overwriting a newer one. */
  private wordRequest = 0;

  constructor(options: GameOptions) {
    this.playerMin = options.playerMin;
    this.playerMax = options.playerMax;
    this.snapshot = this.buildSnapshot();
  }

  /* ----------------------------------------------------------------
     Subscription (useSyncExternalStore)
  ---------------------------------------------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  getServerSnapshot = (): GameSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): GameSnapshot {
    const details = this.resultDetails;

    return {
      phase: this.phase,
      round: this.round,
      players: this.players.map((name, index) => ({
        name,
        isFirst: this.round > 1 && index === this.firstPlayerIndex,
      })),
      playerMin: this.playerMin,
      playerMax: this.playerMax,
      config: this.config,
      canStart: this.players.length >= this.playerMin,
      firstPlayerName: this.players[this.firstPlayerIndex] ?? "",
      category: this.category,
      passing:
        this.phase === "passing" && this.passingOrder.length > 0
          ? {
              name: this.passingOrder[this.passingIndex] ?? "",
              position: this.passingIndex + 1,
              total: this.passingOrder.length,
            }
          : null,
      voting:
        this.phase === "voting" && this.passingOrder.length > 0
          ? {
              voter: this.passingOrder[this.votingIndex] ?? "",
              position: this.votingIndex + 1,
              total: this.passingOrder.length,
              options: this.players.filter(
                (name) => name !== (this.passingOrder[this.votingIndex] ?? ""),
              ),
            }
          : null,
      reveal: this.revealView,
      results:
        this.phase === "results" && details
          ? this.players.map((name) => {
              const detail = details[name] as PlayerDetail;
              const role = ROLES[detail.role];
              return {
                name,
                roleName: role.name,
                accent: role.accent,
                votesReceived: detail.votesReceived,
                votedFor: this.votes[name] ?? [],
                breakdown: detail.breakdown,
                roundScore: detail.roundScore,
              };
            })
          : null,
      summary: this.summary,
      scores: rankPlayers(this.players, this.scores).map((name) => ({
        name,
        total: this.scores[name] ?? 0,
      })),
      loading: this.loading,
      error: this.error,
      wordError: this.wordError,
    };
  }

  /* ----------------------------------------------------------------
     Setup
  ---------------------------------------------------------------- */

  addPlayer(rawName: string): boolean {
    const name = rawName.trim();

    if (!name) {
      this.error = "Enter a player name first.";
      this.emit();
      return false;
    }
    if (this.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      this.error = `“${name}” is already playing.`;
      this.emit();
      return false;
    }
    if (this.players.length >= this.playerMax) {
      this.error = `You can have at most ${this.playerMax} players.`;
      this.emit();
      return false;
    }

    this.players.push(name);
    this.scores[name] = 0;
    this.error = null;
    this.emit();
    return true;
  }

  removePlayer(name: string): void {
    this.players = this.players.filter((p) => p !== name);
    delete this.scores[name];
    if (this.firstPlayerIndex >= this.players.length) this.firstPlayerIndex = 0;
    this.error = null;
    this.emit();
  }

  setConfig(config: RoleConfig): void {
    this.config = config;
    this.emit();
  }

  start(): void {
    if (this.players.length < this.playerMin) {
      this.error = `You need at least ${this.playerMin} players to start.`;
      this.emit();
      return;
    }

    this.config = sanitiseRoleConfig(this.config);
    this.beginCategoryRound();
  }

  /* ----------------------------------------------------------------
     Category
  ---------------------------------------------------------------- */

  private beginCategoryRound(): void {
    this.phase = "category";
    this.category = "";
    this.selectedWord = "";
    this.roles = {};
    this.revealView = null;
    this.wordError = null;
    this.loading = false;
    this.error = null;
    this.emit();
  }

  async fetchWords(rawCategory: string): Promise<void> {
    const category = rawCategory.trim();
    if (!category) {
      this.error = "Please enter a category.";
      this.emit();
      return;
    }

    const request = ++this.wordRequest;
    this.error = null;
    this.wordError = null;
    this.loading = true;
    this.emit();

    try {
      const words = await fetchWords(category);
      if (request !== this.wordRequest) return; // superseded

      this.category = category;
      this.selectedWord = shuffle(words)[0] as string;
      this.loading = false;
      this.assignAndReveal();
    } catch (error) {
      if (request !== this.wordRequest) return;
      this.loading = false;
      this.wordError =
        error instanceof WordApiError
          ? error.message
          : "Something went wrong fetching words. Please try again.";
      this.emit();
    }
  }

  dismissWordError(): void {
    this.wordError = null;
    this.emit();
  }

  private assignAndReveal(): void {
    const { roles, summary } = assignRoles(this.players, this.config);
    this.roles = roles;
    this.summary = summary;
    this.phase = "assignment";
    this.error = null;
    this.emit();
  }

  /* ----------------------------------------------------------------
     Phone passing
  ---------------------------------------------------------------- */

  beginPassing(): void {
    this.passingOrder = generatePlayerOrder(this.players, this.firstPlayerIndex);
    this.passingIndex = 0;
    this.revealView = null;
    this.phase = "passing";
    this.error = null;
    this.emit();
  }

  reveal(): void {
    const name = this.passingOrder[this.passingIndex] ?? "";
    const role = this.roles[name] as RoleKey;
    const definition = ROLES[role];

    this.revealView = {
      roleName: definition.name,
      accent: definition.accent,
      word: definition.seesWord ? this.selectedWord : null,
      description: definition.reveal,
    };
    this.emit();
  }

  advancePassing(): void {
    this.passingIndex += 1;
    this.revealView = null;

    if (this.passingIndex >= this.passingOrder.length) {
      this.phase = "speaking";
    }
    this.emit();
  }

  /* ----------------------------------------------------------------
     Voting
  ---------------------------------------------------------------- */

  beginVoting(): void {
    this.votingIndex = 0;
    this.votes = {};
    this.phase = "voting";
    this.error = null;
    this.emit();
  }

  submitVotes(names: string[]): void {
    const voter = this.passingOrder[this.votingIndex] ?? "";
    this.votes[voter] = [...names];
    this.votingIndex += 1;

    if (this.votingIndex >= this.passingOrder.length) {
      this.showResults();
    } else {
      this.emit();
    }
  }

  private showResults(): void {
    const { totals, details } = calculateRoundScores(
      this.players,
      this.roles,
      this.votes,
    );

    for (const player of this.players) {
      this.scores[player] = (this.scores[player] ?? 0) + (totals[player] ?? 0);
    }

    this.resultDetails = details;
    this.phase = "results";
    this.error = null;
    this.emit();
  }

  nextRound(): void {
    this.round += 1;
    this.firstPlayerIndex = (this.firstPlayerIndex + 1) % this.players.length;
    this.category = "";
    this.selectedWord = "";
    this.roles = {};
    this.votes = {};
    this.passingOrder = [];
    this.passingIndex = 0;
    this.votingIndex = 0;
    this.revealView = null;
    this.resultDetails = null;
    this.summary = null;
    this.beginCategoryRound();
  }

  resetGame(): void {
    const players = [...this.players];
    this.players = players;
    this.scores = {};
    for (const player of players) this.scores[player] = 0;

    this.phase = "setup";
    this.round = 1;
    this.firstPlayerIndex = 0;
    this.category = "";
    this.selectedWord = "";
    this.roles = {};
    this.votes = {};
    this.passingOrder = [];
    this.passingIndex = 0;
    this.votingIndex = 0;
    this.revealView = null;
    this.resultDetails = null;
    this.summary = null;
    this.error = null;
    this.wordError = null;
    this.loading = false;
    this.emit();
  }

  dismissError(): void {
    this.error = null;
    this.emit();
  }
}
