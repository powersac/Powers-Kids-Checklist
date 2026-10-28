import { Check } from '@phosphor-icons/react'
import { useApp } from '../lib/AppContext'
import { weekList } from '../lib/derived'
import { DOW } from '../lib/dates'
import { fmtD } from '../lib/money'

export function SummaryView() {
  const { data } = useApp()
  if (!data) return null
  const weeks = weekList(data)

  return (
    <>
      <h2 style={{ margin: '0 0 var(--space-4)', fontSize: 26 }}>Week by week</h2>
      {weeks.map((w) => (
        <div key={w.mon} className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="card-kicker">{w.isCurrent ? 'This week' : 'Week of'}</p>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19 }}>{w.rangeStr}</div>
            </div>
            {!w.isCurrent &&
              (w.paid ? (
                <span className="tag tag-accent" style={{ gap: 4 }}>
                  Paid <Check weight="bold" size={12} />
                </span>
              ) : (
                <span className="tag tag-outline">Not paid</span>
              ))}
          </div>

          {w.perKid.map((pk) => (
            <div key={pk.kid.id} style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ flex: 1, fontWeight: 600, color: pk.kid.dark }}>{pk.kid.name}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{fmtD(pk.cents)}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {pk.pcts.map((p, i) => {
                  const pctRound = Math.round(p * 100)
                  return (
                    <div
                      key={i}
                      title={`${DOW[i]}: ${pctRound}%`}
                      style={{
                        flex: 1,
                        height: 22,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: p > 0.55 ? '#fff' : 'var(--color-neutral-600)',
                        background: `color-mix(in srgb, ${pk.kid.color} ${pctRound}%, var(--color-neutral-200))`,
                      }}
                    >
                      {'MTWTFSS'[i]}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
