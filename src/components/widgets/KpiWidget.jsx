export default function KpiWidget({ title, value, unit, trend }) {
  const formatted = typeof value === 'number' ? value.toLocaleString('en-CA') : value

  return (
    <div className="widget widget--kpi">
      <div className="widget-title">{title}</div>
      <div className="widget-kpi-value">
        {unit === 'currency' ? '$' : ''}{formatted}{unit && unit !== 'currency' ? ` ${unit}` : ''}
      </div>
      {trend != null && (
        <div className={`widget-kpi-trend ${trend >= 0 ? 'is-up' : 'is-down'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}
