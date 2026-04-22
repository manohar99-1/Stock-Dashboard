import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const API = import.meta.env.VITE_API_URL || ''

export default function App() {
  const [companies, setCompanies] = useState([])
  const [selected, setSelected] = useState(null)
  const [stockData, setStockData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [gainers, setGainers] = useState(null)
  const [compare, setCompare] = useState({ s1: '', s2: '', result: null })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('chart')
  const [range, setRange] = useState(30)

  useEffect(() => {
    axios.get(`${API}/companies`).then(r => setCompanies(r.data))
    axios.get(`${API}/gainers-losers`).then(r => setGainers(r.data))
  }, [])

  const selectCompany = async (sym) => {
    setSelected(sym)
    setLoading(true)
    setStockData(null); setSummary(null); setPrediction(null)
    try {
      const [d, s, p] = await Promise.all([
        axios.get(`${API}/data/${sym}`),
        axios.get(`${API}/summary/${sym}`),
        axios.get(`${API}/predict/${sym}`),
      ])
      setStockData(d.data)
      setSummary(s.data)
      setPrediction(p.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const doCompare = async () => {
    if (!compare.s1 || !compare.s2) return
    setLoading(true)
    try {
      const r = await axios.get(`${API}/compare?symbol1=${compare.s1}&symbol2=${compare.s2}`)
      setCompare(prev => ({ ...prev, result: r.data }))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const chartData = () => {
    if (!stockData) return null
    const rows = stockData.data.slice(-range)
    const predicted = prediction?.predictions || []
    return {
      labels: [
        ...rows.map(r => r.date),
        ...predicted.map(p => p.date),
      ],
      datasets: [
        {
          label: 'Close Price',
          data: [...rows.map(r => r.close), ...Array(predicted.length).fill(null)],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: '7-Day MA',
          data: [...rows.map(r => r.ma7), ...Array(predicted.length).fill(null)],
          borderColor: '#f59e0b',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: 'Prediction',
          data: [...Array(rows.length).fill(null), ...predicted.map(p => p.predicted_close)],
          borderColor: '#10b981',
          borderDash: [3, 3],
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    }
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
      title: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    },
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: '#1e293b', padding: '24px 16px',
        borderRight: '1px solid #334155', flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6', marginBottom: 16 }}>
          📈 StockIQ
        </div>
        {companies.map(c => (
          <button key={c.symbol} onClick={() => selectCompany(c.symbol)}
            style={{
              background: selected === c.symbol ? '#3b82f6' : '#0f172a',
              color: selected === c.symbol ? '#fff' : '#94a3b8',
              border: '1px solid #334155', borderRadius: 8,
              padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
              fontWeight: selected === c.symbol ? 600 : 400, fontSize: 14,
              transition: 'all 0.2s',
            }}>
            {c.symbol}
          </button>
        ))}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* Gainers / Losers */}
        {gainers && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <GainerCard title="🚀 Top Gainers" items={gainers.top_gainers} color="#10b981" />
            <GainerCard title="📉 Top Losers" items={gainers.top_losers} color="#ef4444" />
          </div>
        )}

        {!selected && (
          <div style={{ color: '#475569', textAlign: 'center', marginTop: 80, fontSize: 18 }}>
            ← Select a company to view its data
          </div>
        )}

        {selected && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>{selected}</h1>
              {summary && (
                <>
                  <Chip label={`₹${summary.latest_close}`} color="#3b82f6" />
                  <Chip label={`52W H: ₹${summary.week52_high}`} color="#10b981" />
                  <Chip label={`52W L: ₹${summary.week52_low}`} color="#ef4444" />
                  <Chip label={`Vol: ${summary.volatility_score}`} color="#f59e0b" />
                  {prediction && (
                    <Chip
                      label={prediction.trend === 'bullish' ? '📈 Bullish' : '📉 Bearish'}
                      color={prediction.trend === 'bullish' ? '#10b981' : '#ef4444'}
                    />
                  )}
                </>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['chart', 'table', 'compare'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: activeTab === tab ? '#3b82f6' : '#1e293b',
                    color: activeTab === tab ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 14,
                  }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
              {activeTab === 'chart' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {[7, 14, 30].map(d => (
                    <button key={d} onClick={() => setRange(d)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: range === d ? '#334155' : 'transparent',
                        color: range === d ? '#fff' : '#64748b', fontSize: 13,
                      }}>
                      {d}D
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading && <div style={{ color: '#3b82f6' }}>Loading data...</div>}

            {/* Chart Tab */}
            {!loading && activeTab === 'chart' && stockData && (
              <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
                <Line data={chartData()} options={chartOptions} />
              </div>
            )}

            {/* Table Tab */}
            {!loading && activeTab === 'table' && stockData && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#1e293b' }}>
                      {['Date','Open','High','Low','Close','Return%','MA7'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', color: '#64748b', textAlign: 'right', borderBottom: '1px solid #334155' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...stockData.data].reverse().map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '8px 14px', color: '#94a3b8' }}>{row.date}</td>
                        {[row.open, row.high, row.low, row.close].map((v, j) => (
                          <td key={j} style={{ padding: '8px 14px', textAlign: 'right' }}>₹{v}</td>
                        ))}
                        <td style={{ padding: '8px 14px', textAlign: 'right',
                          color: row.daily_return > 0 ? '#10b981' : '#ef4444' }}>
                          {row.daily_return != null ? `${row.daily_return > 0 ? '+' : ''}${row.daily_return.toFixed(2)}%` : '-'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#f59e0b' }}>
                          {row.ma7 ? `₹${row.ma7}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Compare Tab */}
            {activeTab === 'compare' && (
              <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  <select value={compare.s1} onChange={e => setCompare(p => ({ ...p, s1: e.target.value, result: null }))}
                    style={{ padding: '10px 14px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>
                    <option value="">Stock 1</option>
                    {companies.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                  </select>
                  <select value={compare.s2} onChange={e => setCompare(p => ({ ...p, s2: e.target.value, result: null }))}
                    style={{ padding: '10px 14px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>
                    <option value="">Stock 2</option>
                    {companies.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                  </select>
                  <button onClick={doCompare}
                    style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    Compare
                  </button>
                </div>
                {compare.result && <CompareResult data={compare.result} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Chip({ label, color }) {
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
      {label}
    </span>
  )
}

function GainerCard({ title, items, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: 16,
      border: `1px solid ${color}33`, flex: 1, minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color }}>{title}</div>
      {items?.map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
          padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{item.symbol}</span>
          <span style={{ color }}>
            {item.daily_return > 0 ? '+' : ''}{item.daily_return?.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function CompareResult({ data }) {
  const { stock1, stock2, better_performer_30d } = data
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {[stock1, stock2].map((s, i) => (
        <div key={i} style={{
          flex: 1, minWidth: 200, background: '#0f172a', borderRadius: 10,
          padding: 20, border: s.symbol === better_performer_30d ? '1px solid #10b981' : '1px solid #334155',
        }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
            {s.symbol} {s.symbol === better_performer_30d && '🏆'}
          </div>
          <StatRow label="Latest Close" value={`₹${s.latest_close}`} />
          <StatRow label="30D Change" value={`${s['30d_change_pct'] > 0 ? '+' : ''}${s['30d_change_pct']}%`}
            color={s['30d_change_pct'] > 0 ? '#10b981' : '#ef4444'} />
          <StatRow label="Avg Daily Return" value={`${s.avg_daily_return?.toFixed(3)}%`} />
          <StatRow label="Volatility" value={s.volatility?.toFixed(4)} />
        </div>
      ))}
    </div>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderBottom: '1px solid #1e293b', fontSize: 14 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: color || '#e2e8f0', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
