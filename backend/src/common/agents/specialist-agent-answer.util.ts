const REQUIRED_ANSWER_SECTIONS = [
  'answer',
  'evidence',
  'calculation',
  'assumptions and gaps',
  'confidence',
] as const;

/**
 * Accept an agent answer only when each evidence-contract section is present,
 * ordered, and has content. This validates structure, not factual correctness.
 */
export function hasRequiredSpecialistAgentAnswerSections(
  answer: string,
): boolean {
  const headingPattern =
    /^\s*(?:#{1,6}\s*)?(?:\*\*)?(Answer|Evidence|Calculation|Assumptions\s+(?:and|&|\/)\s+gaps?|Confidence)(?:\*\*)?\s*:?[ \t]*$/i;
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of answer.split(/\r?\n/)) {
    const match = line.match(headingPattern);
    if (match) {
      if (current) sections.push(current);
      const heading = match[1]
        .toLowerCase()
        .replace(/[&/]/g, 'and')
        .replace(/\s+/g, ' ')
        .trim();
      current = { heading, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return (
    sections.length === REQUIRED_ANSWER_SECTIONS.length &&
    sections.every(
      (section, index) =>
        section.heading === REQUIRED_ANSWER_SECTIONS[index] &&
        section.body.join('\n').trim().length > 0,
    )
  );
}
