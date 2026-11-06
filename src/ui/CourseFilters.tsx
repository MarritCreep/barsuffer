import { useMemo, useState } from 'react';
import type { Catalog, Day } from '../data/types';
import { LOCALE, useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import {
  EMPTY_FILTER,
  ONLINE,
  SELF,
  activeCount,
  toggleValue,
  type CourseFilter,
  type FacetOption,
  type Facets,
  type FilterGroup,
} from '../logic/filters';
import { formatMinutes } from '../logic/time';

interface Props {
  facets: Facets;
  filter: CourseFilter;
  onChange: (f: CourseFilter) => void;
  catalog: Pick<Catalog, 'faculties' | 'departments'>;
  /** Группы, которые не показываем (в панели клетки: семестр, день, время). */
  hide?: FilterGroup[];
}

/** Длинные списки (кафедры, здания) — с поиском и прокруткой, короткие — кнопками-чипами. */
const LONG_LIST = 10;
const TIMES = Array.from({ length: 15 }, (_, i) => (8 + i) * 60);

type ListKey = Exclude<FilterGroup, 'time'>;

function ChipGroup<T extends string | number>({
  legend,
  options,
  selected,
  label,
  onToggle,
}: {
  legend: string;
  options: FacetOption<T>[];
  selected: readonly T[];
  label: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const long = options.length > LONG_LIST;
  const shown = long && q ? options.filter((o) => label(o.value).toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <fieldset className={`filter-group ${long ? 'long' : ''}`}>
      <legend>
        {legend}
        {selected.length > 0 && <span className="count">{selected.length}</span>}
      </legend>
      {long && (
        <input type="search" className="filter-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filters.searchIn')} aria-label={`${legend}: ${t('filters.searchIn')}`} />
      )}
      <div className="filter-chips">
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button key={String(o.value)} type="button" className={`filter-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(o.value)}>
              {label(o.value)} <span className="filter-n">{o.count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Фильтры курсов: показываются только группы, по которым в данных что-то есть. */
export function CourseFilters({ facets, filter, onChange, catalog, hide = [] }: Props) {
  const { t, lang, day, type, term } = useI18n();
  const languageName = useMemo(() => {
    try {
      const names = new Intl.DisplayNames([LOCALE[lang]], { type: 'language' });
      return (code: string) => names.of(code) ?? code;
    } catch {
      return (code: string) => code;
    }
  }, [lang]);
  const unitName = (list: { id: string; name: string; nameHe?: string }[] | undefined) => (id: string) => {
    const u = list?.find((x) => x.id === id);
    return u ? (lang === 'he' && u.nameHe ? u.nameHe : u.name) : id;
  };
  const show = (g: FilterGroup, count: number) => !hide.includes(g) && count > 0;
  const toggle = <K extends ListKey>(key: K) => (v: CourseFilter[K][number]) => onChange(toggleValue(filter, key, v));

  return (
    <div className="course-filters">
      {show('terms', facets.terms.length) && (
        <ChipGroup legend={t('filters.terms')} options={facets.terms} selected={filter.terms} label={(v) => term(v)} onToggle={toggle('terms')} />
      )}
      {show('categories', facets.categories.length) && (
        <ChipGroup
          legend={t('filters.categories')}
          options={facets.categories}
          selected={filter.categories}
          label={(v) => t(`filters.cat.${v}` as MessageKey)}
          onToggle={toggle('categories')}
        />
      )}
      {show('faculties', facets.faculties.length) && (
        <ChipGroup legend={t('filters.faculties')} options={facets.faculties} selected={filter.faculties} label={unitName(catalog.faculties)} onToggle={toggle('faculties')} />
      )}
      {show('departments', facets.departments.length) && (
        <ChipGroup
          legend={t('filters.departments')}
          options={facets.departments}
          selected={filter.departments}
          label={unitName(catalog.departments)}
          onToggle={toggle('departments')}
        />
      )}
      {show('types', facets.types.length) && (
        <ChipGroup legend={t('filters.types')} options={facets.types} selected={filter.types} label={(v) => type(v)} onToggle={toggle('types')} />
      )}
      {show('places', facets.places.length) && (
        <ChipGroup
          legend={t('filters.places')}
          options={facets.places}
          selected={filter.places}
          label={(v) => (v === ONLINE ? t('filters.place.online') : v === SELF ? t('filters.place.self') : v)}
          onToggle={toggle('places')}
        />
      )}
      {show('credits', facets.credits.length) && (
        <ChipGroup legend={t('filters.credits')} options={facets.credits} selected={filter.credits} label={(v) => String(v)} onToggle={toggle('credits')} />
      )}
      {show('languages', facets.languages.length) && (
        <ChipGroup legend={t('filters.languages')} options={facets.languages} selected={filter.languages} label={languageName} onToggle={toggle('languages')} />
      )}
      {show('days', facets.days.length) && (
        <ChipGroup<Day> legend={t('filters.days')} options={facets.days} selected={filter.days} label={(v) => day(v)} onToggle={toggle('days')} />
      )}
      {!hide.includes('time') && (
        <fieldset className="filter-group">
          <legend>{t('filters.time')}</legend>
          <div className="filter-time">
            <label>
              {t('filters.from')}{' '}
              <select
                value={filter.timeFrom ?? ''}
                onChange={(e) => onChange({ ...filter, timeFrom: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={`${t('filters.time')}: ${t('filters.from')}`}
              >
                <option value="">{t('filters.any')}</option>
                {TIMES.map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('filters.to')}{' '}
              <select
                value={filter.timeTo ?? ''}
                onChange={(e) => onChange({ ...filter, timeTo: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={`${t('filters.time')}: ${t('filters.to')}`}
              >
                <option value="">{t('filters.any')}</option>
                {TIMES.map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      )}
      {activeCount(filter, hide) > 0 && (
        <button type="button" className="link-btn" onClick={() => onChange({ ...EMPTY_FILTER, query: filter.query })}>
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
