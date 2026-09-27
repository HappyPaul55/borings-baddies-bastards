import { createContext, useContext, useSyncExternalStore } from "react";
import type { GameClient, GameSnapshot } from "../../lib/game-store";

export const GameClientContext = createContext<GameClient | null>(null);

export function useGameClient(): GameClient {
  const client = useContext(GameClientContext);
  if (!client) {
    throw new Error("useGameClient must be used within <GameApp>.");
  }
  return client;
}

export function useGameSnapshot(): GameSnapshot {
  const client = useGameClient();
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
}
