import { OSM_ATTRIBUTION } from '../data/campusGeo';
import { DAY_LABEL, type Day } from '../data/types';
import type { CoffeeGap } from '../logic/coffee';
import { timeRange } from './format';
import { formatDistance, funDistance, stepsFor } from '../logic/walking';

const DAY_FULL: Record<Day, string> = {
  1: 'Sunday',
  2: 'Monday',
  3: 'Tuesday',
  4: 'Wednesday',
  5: 'Thursday',
  6: 'Friday',
};

interface Props {
  hell: { day: Day; score: number } | null;
  weekMeters: number;
  gaps: CoffeeGap[];
}

/** Короткие «факты недели» под сеткой: адский день, шагомер, кофе в окнах. */
export function WeekInsights({ hell, weekMeters, gaps }: Props) {
  if (!hell && gaps.length === 0) return null;
  return (
    <div className="insights">
      {hell && (
        <p className="insight">
          <span className="insight-icon" aria-hidden="true">🔥</span>
          <span>
            <strong>{DAY_FULL[hell.day]}</strong> is your hell day — {hell.score} suffering points on its own.
          </span>
        </p>
      )}
      {weekMeters > 0 && (
        <p className="insight">
          <span className="insight-icon" aria-hidden="true">👟</span>
          <span>
            Each week you walk <strong>≈{formatDistance(weekMeters)}</strong> between classes (
            {stepsFor(weekMeters).toLocaleString('en-US')} steps) — {funDistance(weekMeters)}.
          </span>
        </p>
      )}
      {gaps.length > 0 && (
        <div className="insight insight-coffee">
          <span className="insight-icon" aria-hidden="true">☕</span>
          <div>
            <strong>Coffee in your gaps</strong>
            <ul className="coffee-list">
              {gaps.map((g) => (
                <li key={`${g.from.key}|${g.to.key}`}>
                  {DAY_LABEL[g.day]} {timeRange(g.from.end, g.to.start)} ·{' '}
                  {g.cafe ? (
                    <>
                      {g.cafe.label}: {g.walkThere} min there, {g.walkBack} min to your next class —{' '}
                      <strong>{g.coffeeMinutes} min</strong> for coffee
                    </>
                  ) : (
                    <>{Math.floor(g.minutes / 60)} h free (buildings not on the map)</>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="muted small">
        Walking is estimated from building positions (
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {OSM_ATTRIBUTION}
        </a>
        ) and the campus layout; café spots are approximate.
      </p>
    </div>
  );
}
