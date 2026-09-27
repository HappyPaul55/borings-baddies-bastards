import type { ScoreRowView } from "../../lib/game-store";

export function ScoreTable({ rows }: { rows: ScoreRowView[] }) {
  return (
    <table className="score-table">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>{row.name}</td>
            <td className="score-table__total">{row.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
