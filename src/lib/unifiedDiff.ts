/**
 * Unified diff parser and applier for Markdown text.
 *
 * Format:
 *   @@ optional header
 *    context line          (space prefix = unchanged)
 *   -removed line          (minus prefix = delete)
 *   +added line            (plus prefix = insert)
 */

export type DiffLineType = 'context' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export function parseUnifiedDiff(diffText: string): Hunk[] {
  if (!diffText || !diffText.trim()) return [];

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('@@')) {
      current = { header: raw.slice(2).trim(), lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (raw.startsWith('-')) {
      current.lines.push({ type: 'remove', content: raw.slice(1) });
    } else if (raw.startsWith('+')) {
      current.lines.push({ type: 'add', content: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      current.lines.push({ type: 'context', content: raw.slice(1) });
    } else if (raw === '') {
      current.lines.push({ type: 'context', content: '' });
    } else {
      current.lines.push({ type: 'context', content: raw });
    }
  }

  return hunks;
}

/** Collapse multiple backslashes before [ or ] to one (so "\\[" and "\\\\[" both match "\["). */
function normalizeBracketEscapes(s: string): string {
  return s.replace(/(\\+)([[\]])/g, '\\$2');
}

function matchLines(original: string, search: string): boolean {
  const o = original.trimEnd();
  const s = search.trimEnd();
  const oNorm = normalizeBracketEscapes(o);
  const sNorm = normalizeBracketEscapes(s);
  if (oNorm === sNorm) return true;
  // Normalize markdown list: diff removal content " X" often from LLM when original is "- X"
  if (s.length > 1 && s[0] === ' ' && s[1] !== ' ' && o.length > 2 && o.slice(0, 2) === '- ') {
    return normalizeBracketEscapes(o.slice(2).trimEnd()) === normalizeBracketEscapes(s.slice(1).trimEnd());
  }
  return false;
}

function findHunkPosition(originalLines: string[], hunk: Hunk): number {
  const expected: string[] = [];
  for (const dl of hunk.lines) {
    if (dl.type === 'context' || dl.type === 'remove') {
      expected.push(dl.content);
    }
  }

  if (expected.length === 0) {
    return originalLines.length;
  }

  const windowSize = expected.length;
  for (let i = 0; i <= originalLines.length - windowSize; i++) {
    let match = true;
    for (let j = 0; j < windowSize; j++) {
      if (!matchLines(originalLines[i + j], expected[j])) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }

  // Fallback: stripped whitespace comparison
  const strippedExpected = expected.map(e => e.trim());
  for (let i = 0; i <= originalLines.length - windowSize; i++) {
    let match = true;
    for (let j = 0; j < windowSize; j++) {
      if (originalLines[i + j].trim() !== strippedExpected[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }

  // Allow match at end when the only "missing" lines are trailing empty in expected
  const firstExpected = expected[0];
  for (let i = 0; i < originalLines.length; i++) {
    if (!matchLines(originalLines[i], firstExpected)) continue;
    const remaining = originalLines.length - i;
    if (remaining >= windowSize || remaining <= 0) continue;
    let match = true;
    for (let j = 0; j < remaining; j++) {
      if (!matchLines(originalLines[i + j], expected[j])) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const allRestEmpty = expected.slice(remaining, windowSize).every(e => e.trim() === '');
    if (allRestEmpty) return i;
  }

  return -1;
}

export function applyHunk(
  originalLines: string[],
  hunk: Hunk,
): { ok: boolean; lines: string[] } {
  if (hunk.lines.length === 0) {
    return { ok: true, lines: [...originalLines] };
  }

  const pos = findHunkPosition(originalLines, hunk);
  if (pos === -1) {
    return { ok: false, lines: [...originalLines] };
  }

  const span = hunk.lines.filter(
    dl => dl.type === 'context' || dl.type === 'remove',
  ).length;
  // When hunk matched with trailing-empty-line fallback, don't exceed remaining lines
  const effectiveSpan = Math.min(span, originalLines.length - pos);

  const replacement: string[] = [];
  for (const dl of hunk.lines) {
    if (dl.type === 'context' || dl.type === 'add') {
      replacement.push(dl.content);
    }
  }

  const result = [...originalLines];
  result.splice(pos, effectiveSpan, ...replacement);
  return { ok: true, lines: result };
}

export function applyUnifiedDiff(original: string, diffText: string): string {
  const hunks = parseUnifiedDiff(diffText);
  if (hunks.length === 0) return original;

  let lines = original.split('\n');
  for (let index = 0; index < hunks.length; index++) {
    const result = applyHunk(lines, hunks[index]);
    if (!result.ok) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[unifiedDiff] Hunk', index, 'failed to apply (context not found); skipping.');
      }
      continue;
    }
    lines = result.lines;
  }

  return lines.join('\n');
}

/**
 * Check whether a diff has any actual changes (add/remove lines).
 */
export function diffHasChanges(diffText: string): boolean {
  const hunks = parseUnifiedDiff(diffText);
  return hunks.some(h => h.lines.some(l => l.type === 'add' || l.type === 'remove'));
}

/**
 * Create a unified diff that replaces oldText with newText (full-field replacement).
 * Used for backward compat with legacy JSON Patch proposals.
 */
export function createFullReplaceDiff(oldText: string, newText: string): string {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  let diff = '@@\n';
  for (const line of oldLines) {
    diff += `-${line}\n`;
  }
  for (const line of newLines) {
    diff += `+${line}\n`;
  }
  return diff;
}

/**
 * Normalize a legacy JSON Patch proposal (with `patch` array) into the new
 * unified diff format (with `diffs` dict).
 *
 * Requires the current field values so we can build proper diffs for `add` ops.
 */
export function normalizeLegacyProposal(
  proposal: { id: string; title: string; rationale?: string; impactedPaths?: string[]; patch?: any[]; diffs?: Record<string, string> },
  currentState: Record<string, string>,
): { id: string; title: string; rationale?: string; impactedPaths?: string[]; diffs: Record<string, string>; patch?: any[] } {
  if (proposal.diffs && Object.keys(proposal.diffs).length > 0) {
    return proposal as any;
  }

  const diffs: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    '/description': 'description',
    '/technical_specifications': 'technical_specifications',
    '/company_requirements': 'company_requirements',
  };

  if (Array.isArray(proposal.patch)) {
    for (const op of proposal.patch) {
      if (!op || typeof op !== 'object') continue;
      const path = op.path as string;
      const fieldName = fieldMap[path];
      if (!fieldName) continue;

      const oldText = currentState[fieldName] || '';

      if (op.op === 'replace' && typeof op.value === 'string') {
        diffs[path] = createFullReplaceDiff(oldText, op.value);
      } else if (op.op === 'add' && typeof op.value === 'string') {
        const newText = typeof oldText === 'string' ? oldText + op.value : op.value;
        diffs[path] = createFullReplaceDiff(oldText, newText);
      }
    }
  }

  return {
    ...proposal,
    diffs,
    impactedPaths: proposal.impactedPaths || Object.keys(diffs),
  };
}
