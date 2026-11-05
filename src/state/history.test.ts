import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, initHistory, withHistory } from './history';

type Action = { kind: 'add'; n: number } | { kind: 'noop' };
const reducer = withHistory((state: number, action: Action) => (action.kind === 'add' ? state + action.n : state));

describe('withHistory', () => {
  it('undoes and redoes changes', () => {
    let h = initHistory(0);
    h = reducer(h, { kind: 'add', n: 1 });
    h = reducer(h, { kind: 'add', n: 2 });
    expect(h.present).toBe(3);
    h = reducer(h, { kind: 'undo' });
    expect(h.present).toBe(1);
    h = reducer(h, { kind: 'undo' });
    expect(h.present).toBe(0);
    h = reducer(h, { kind: 'redo' });
    expect(h.present).toBe(1);
  });

  it('undo with empty history does nothing', () => {
    const h = initHistory(5);
    expect(reducer(h, { kind: 'undo' })).toBe(h);
    expect(reducer(h, { kind: 'redo' })).toBe(h);
  });

  it('a new change clears the redo stack', () => {
    let h = initHistory(0);
    h = reducer(h, { kind: 'add', n: 1 });
    h = reducer(h, { kind: 'undo' });
    h = reducer(h, { kind: 'add', n: 10 });
    expect(h.future).toEqual([]);
    expect(reducer(h, { kind: 'redo' }).present).toBe(10);
  });

  it('no-op actions are not recorded', () => {
    let h = initHistory(0);
    h = reducer(h, { kind: 'noop' });
    expect(h.past).toEqual([]);
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = initHistory(0);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = reducer(h, { kind: 'add', n: 1 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
