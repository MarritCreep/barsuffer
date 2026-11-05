/** История изменений для Ctrl+Z / Ctrl+Y. Хранится только в памяти вкладки. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export type HistoryAction<A> = A | { kind: 'undo' } | { kind: 'redo' };

export const HISTORY_LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Оборачивает редьюсер: каждое изменение кладёт прошлое состояние в стек.
 * Действие, которое ничего не меняет (вернуло тот же объект), в историю не попадает.
 */
export function withHistory<T, A extends { kind: string }>(
  reducer: (state: T, action: A) => T,
): (state: History<T>, action: HistoryAction<A>) => History<T> {
  return (state, action) => {
    if (action.kind === 'undo') {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    if (action.kind === 'redo') {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    const present = reducer(state.present, action as A);
    if (present === state.present) return state;
    return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present, future: [] };
  };
}
