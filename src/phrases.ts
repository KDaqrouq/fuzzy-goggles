/** Nine supported captions from PRD (full string shown in subtitle bar). */
export const PHRASES = [
  'ASL Speaker: Can you repeat that?',
  'ASL Speaker: I\'m having technical difficulties.',
  'ASL Speaker: Let\'s take a break.',
  'ASL Speaker: Can you slow down?',
  'ASL Speaker: Goodbye.',
  'ASL Speaker: Thank you.',
  'ASL Speaker: Bless you.',
  'ASL Speaker: Yes.',
  'ASL Speaker: No.',
] as const;

export type PhraseIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PHRASE_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;

export function phraseLabel(i: number): string {
  return PHRASE_IDS[i] ?? `P${i + 1}`;
}
