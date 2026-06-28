// Shimmer placeholder shown while a list/card view loads.
export function SkeletonList({ rows = 5 }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton sk-row" style={{ width: i % 2 ? "55%" : "78%" }} />
      ))}
    </div>
  );
}
