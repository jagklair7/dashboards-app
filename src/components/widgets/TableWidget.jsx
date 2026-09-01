export default function TableWidget({ title, columns, rows }) {
  return (
    <div className="widget widget--table">
      <div className="widget-title">{title}</div>
      <table className="widget-table">
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="widget-table-empty">No data yet</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i}>{columns.map(c => <td key={c.key}>{row[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
