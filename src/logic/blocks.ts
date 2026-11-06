import type { Semester } from '../data/types';
import type { PlacedMeeting } from './schedule';
import type { PersonalBlock, Plan } from './selection';
import { toMinutes } from './time';

/** Префикс courseId у блокировок — чтобы не путать с настоящими курсами. */
export const BLOCK_PREFIX = 'block:';

export function isBlockId(courseId: string): boolean {
  return courseId.startsWith(BLOCK_PREFIX);
}

export function blockAppliesTo(block: PersonalBlock, semester: Semester): boolean {
  return block.semester === undefined || block.semester === semester;
}

/** Блокировки семестра в том же виде, что и занятия, — для сетки и проверки накладок. */
export function blockMeetings(plan: Plan, semester: Semester): PlacedMeeting[] {
  return (plan.blocks ?? [])
    .filter((b) => blockAppliesTo(b, semester))
    .map((b) => ({
      key: `${BLOCK_PREFIX}${b.id}`,
      courseId: `${BLOCK_PREFIX}${b.id}`,
      courseName: b.label,
      sectionNumber: '',
      type: 'other',
      day: b.day,
      start: toMinutes(b.startTime),
      end: toMinutes(b.endTime),
      color: 0,
      isDemo: false,
      isBlock: true,
    }));
}

export function nextBlockId(plan: Plan): string {
  const used = new Set((plan.blocks ?? []).map((b) => b.id));
  let i = (plan.blocks?.length ?? 0) + 1;
  while (used.has(`b${i}`)) i++;
  return `b${i}`;
}
