import React from 'react';
import * as Diff from 'diff';
import { Button } from '@/components/ui/button';
import type { Hunk, DiffLine } from '@/lib/unifiedDiff';
import { useTranslation } from 'react-i18next';

interface HunkDiffListProps {
  hunks: Hunk[];
  onAcceptHunk: (hunkIndex: number) => void;
  onRejectHunk?: (hunkIndex: number) => void;
  rejectedHunks?: Set<number>;
}

/**
 * Renders word-level highlighted text for a paired remove/add line group.
 */
const WordDiff: React.FC<{ oldText: string; newText: string }> = ({ oldText, newText }) => {
  const parts = Diff.diffWords(String(oldText || ''), String(newText || ''));
  return (
    <span>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-green-200 text-green-900 px-0.5 rounded-sm">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-200 text-red-900 line-through px-0.5 rounded-sm">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
};

/**
 * Groups consecutive remove+add lines into pairs for word-level diffing.
 * Context lines and unpaired adds/removes are returned as-is.
 */
type LineGroup =
  | { kind: 'context'; lines: DiffLine[] }
  | { kind: 'change'; removed: DiffLine[]; added: DiffLine[] }
  | { kind: 'add'; lines: DiffLine[] }
  | { kind: 'remove'; lines: DiffLine[] };

function groupHunkLines(lines: DiffLine[]): LineGroup[] {
  const groups: LineGroup[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      const last = groups[groups.length - 1];
      if (last && last.kind === 'context') {
        last.lines.push(line);
      } else {
        groups.push({ kind: 'context', lines: [line] });
      }
      i++;
    } else if (line.type === 'remove') {
      const removed: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'remove') {
        removed.push(lines[i]);
        i++;
      }
      const added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        added.push(lines[i]);
        i++;
      }
      if (added.length > 0) {
        groups.push({ kind: 'change', removed, added });
      } else {
        groups.push({ kind: 'remove', lines: removed });
      }
    } else if (line.type === 'add') {
      const added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        added.push(lines[i]);
        i++;
      }
      groups.push({ kind: 'add', lines: added });
    } else {
      i++;
    }
  }

  return groups;
}

function hunkHasChanges(hunk: Hunk): boolean {
  return hunk.lines.some(l => l.type === 'add' || l.type === 'remove');
}

const HunkDiffList: React.FC<HunkDiffListProps> = ({
  hunks,
  onAcceptHunk,
  onRejectHunk,
  rejectedHunks,
}) => {
  const { t } = useTranslation();
  const visibleHunks = hunks
    .map((hunk, idx) => ({ hunk, idx }))
    .filter(({ hunk, idx }) => {
      if (rejectedHunks?.has(idx)) return false;
      return hunkHasChanges(hunk);
    });

  if (visibleHunks.length === 0) return null;

  return (
    <div className="space-y-3">
      {visibleHunks.map(({ hunk, idx }) => {
        const groups = groupHunkLines(hunk.lines);

        return (
          <div key={idx} className="bg-white rounded-md p-3 border border-blue-200">
            {hunk.header && (
              <div className="text-xs text-gray-500 mb-2 font-mono truncate">
                @@ {hunk.header}
              </div>
            )}

            <div className="text-sm font-mono whitespace-pre-wrap break-words mb-3 border rounded p-2 bg-gray-50">
              {groups.map((group, gIdx) => {
                if (group.kind === 'context') {
                  return (
                    <div key={gIdx}>
                      {group.lines.map((l, li) => (
                        <div key={li} className="text-gray-500 pl-4">
                          {l.content || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  );
                }

                if (group.kind === 'change') {
                  const oldText = group.removed.map(l => l.content).join('\n');
                  const newText = group.added.map(l => l.content).join('\n');
                  return (
                    <div key={gIdx} className="border-l-2 border-blue-400 pl-3 my-1">
                      <WordDiff oldText={oldText} newText={newText} />
                    </div>
                  );
                }

                if (group.kind === 'remove') {
                  return (
                    <div key={gIdx}>
                      {group.lines.map((l, li) => (
                        <div
                          key={li}
                          className="bg-red-50 text-red-800 line-through pl-4"
                        >
                          {l.content || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  );
                }

                if (group.kind === 'add') {
                  return (
                    <div key={gIdx}>
                      {group.lines.map((l, li) => (
                        <div key={li} className="bg-green-50 text-green-800 pl-4">
                          {l.content || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  );
                }

                return null;
              })}
            </div>

            <div className="flex justify-end gap-2">
              {onRejectHunk && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => onRejectHunk(idx)}
                >
                  {t('rfxs.specs_reject')}
                </Button>
              )}
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onAcceptHunk(idx)}
              >
                {t('rfxs.specs_acceptChange')}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HunkDiffList;
