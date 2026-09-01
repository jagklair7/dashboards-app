import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const BRAND_ACCENT = '#7c1c2e' // matches klair.ca burgundy

export default function ChartWidget({ title, type = 'line', data }) {
  // data: [{ label: string, value: number }]
  const Chart = type === 'bar' ? BarChart : LineChart

  return (
    <div className="widget widget--chart">
      <div className="widget-title">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          {type === 'bar'
            ? <Bar dataKey="value" fill={BRAND_ACCENT} radius={[4, 4, 0, 0]} />
            : <Line type="monotone" dataKey="value" stroke={BRAND_ACCENT} strokeWidth={2} dot={false} />}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
