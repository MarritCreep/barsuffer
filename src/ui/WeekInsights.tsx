import { OSM_ATTRIBUTION } from '../data/campusGeo';
import type { Day } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { CoffeeGap } from '../logic/coffee';
import { stepsFor } from '../logic/walking';
import { distance, funText, rich, span } from './weekText';

interface Props {
  hell: { day: Day; score: number } | null;
  weekMeters: number;
  gaps: CoffeeGap[];
}

/** Короткие «факты недели» под сеткой: адский день, шагомер, кофе в окнах. */
export function WeekInsights({ hell, weekMeters, gaps }: Props) {
  const tr = useI18n();
  const { t, day } = tr;
  if (!hell && gaps.length === 0) return null;
  const steps = stepsFor(weekMeters);
  return (
    <div className="insights">
      {hell && (
        <p className="insight">
          <span className="insight-icon" aria-hidden="true">🔥</span>
          <span>{rich(t('insights.hell', { n: hell.score }), { day: <strong>{day(hell.day, 'long')}</strong> })}</span>
        </p>
      )}
      {weekMeters > 0 && (
        <p className="insight">
          <span className="insight-icon" aria-hidden="true">👟</span>
          <span>
            {rich(t('insights.walk', { n: steps, steps: tr.num(steps), fun: funText(tr, weekMeters) }), {
              dist: <strong>≈{distance(tr, weekMeters)}</strong>,
            })}
          </span>
        </p>
      )}
      {gaps.length > 0 && (
        <div className="insight insight-coffee">
          <span className="insight-icon" aria-hidden="true">☕</span>
          <div>
            <strong>{t('insights.coffeeTitle')}</strong>
            <ul className="coffee-list">
              {gaps.map((g) => (
                <li key={`${g.from.key}|${g.to.key}`}>
                  {day(g.day)} {span(tr, g.from.end, g.to.start)} ·{' '}
                  {g.cafe
                    ? rich(
                        t('insights.coffee', {
                          cafe: t('insights.cafe', { b: g.cafe.id.replace(/^cafe-/, '') }),
                          there: g.walkThere,
                          back: g.walkBack,
                        }),
                        { coffee: <strong>{t('common.min', { n: g.coffeeMinutes })}</strong> },
                      )
                    : t('insights.noCafe', { h: Math.floor(g.minutes / 60) })}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="muted small">
        {rich(t('insights.footer'), {
          osm: (
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              {OSM_ATTRIBUTION}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
