import React from 'react';
import * as Diff from 'diff';
import { Button } from '@/components/ui/button';
import DiffView from './DiffView';

interface ParagraphDiffListProps {
  oldText: string;
  newText: string;
  onAccept: (updatedText: string) => void;
  onReject?: (changeKey: string) => void;
  rejectedKeys?: Set<string>;
}

type ChangeItem =
  | { type: 'replace'; oldStartIndex: number; removed: string[]; added: string[] }
  | { type: 'add'; oldStartIndex: number; added: string[] }
  | { type: 'remove'; oldStartIndex: number; removed: string[] };

const splitParagraphs = (text: string): string[] => {
  const safe = String(text || '');
  // Split by one or more blank lines, trim extra whitespace within paragraphs
  const parts = safe
    .split(/\n{2,}/g)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return parts;
};

const joinParagraphs = (paras: string[]): string => paras.join('\n\n');

const ParagraphDiffList: React.FC<ParagraphDiffListProps> = ({ oldText, newText, onAccept, onReject, rejectedKeys }) => {
  const oldParas = splitParagraphs(oldText);
  const newParas = splitParagraphs(newText);

  const parts = Diff.diffArrays(oldParas, newParas);

  const changes: (ChangeItem & { key: string })[] = [];
  let oldIdx = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as any;
    if (part.added && !part.removed) {
      const added = part.value as string[];
      changes.push({ type: 'add', oldStartIndex: oldIdx, added, key: `add|${added.join('\n\n')}@${oldIdx}` });
    } else if (part.removed && !part.added) {
      // Look ahead to pair a remove+add as a replace
      const next = parts[i + 1] as any;
      if (next && next.added && !next.removed) {
        const removed = part.value as string[];
        const added = next.value as string[];
        changes.push({ type: 'replace', oldStartIndex: oldIdx, removed, added, key: `replace|${removed.join('\n\n')}->${added.join('\n\n')}@${oldIdx}` });
        i += 1; // skip the paired add
      } else {
        const removed = part.value as string[];
        changes.push({ type: 'remove', oldStartIndex: oldIdx, removed, key: `remove|${removed.join('\n\n')}@${oldIdx}` });
      }
      oldIdx += part.value.length;
    } else {
      // Unchanged chunk
      oldIdx += part.value.length;
    }
  }

  const visibleChanges = changes.filter(c => !(rejectedKeys && rejectedKeys.has(c.key)));

  if (visibleChanges.length === 0) {
    return null;
  }

  const acceptChange = (change: ChangeItem) => {
    const updated = [...oldParas];
    if (change.type === 'replace') {
      updated.splice(change.oldStartIndex, change.removed.length, ...change.added);
    } else if (change.type === 'add') {
      updated.splice(change.oldStartIndex, 0, ...change.added);
    } else if (change.type === 'remove') {
      updated.splice(change.oldStartIndex, change.removed.length);
    }
    onAccept(joinParagraphs(updated));
  };

  return (
    <div className="space-y-3">
      {visibleChanges.map((change, idx) => (
        <div key={idx} className="bg-white rounded-md p-3 border border-blue-200">
          {change.type === 'replace' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">Changed paragraph</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Before</div>
                  <DiffView oldText={joinParagraphs(change.removed)} newText={joinParagraphs(change.removed)} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">After</div>
                  <DiffView oldText={joinParagraphs(change.removed)} newText={joinParagraphs(change.added)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {onReject && (
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => onReject(change.key)}>Reject</Button>
                )}
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => acceptChange(change)}>Accept paragraph</Button>
              </div>
            </div>
          )}

          {change.type === 'add' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">New paragraph</div>
              <div>
                <DiffView oldText={''} newText={joinParagraphs(change.added)} />
              </div>
              <div className="flex justify-end gap-2">
                {onReject && (
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => onReject(change.key)}>Reject</Button>
                )}
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => acceptChange(change)}>Accept paragraph</Button>
              </div>
            </div>
          )}

          {change.type === 'remove' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">Paragraph to remove</div>
              <div>
                <DiffView oldText={joinParagraphs(change.removed)} newText={''} />
              </div>
              <div className="flex justify-end gap-2">
                {onReject && (
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => onReject(change.key)}>Reject</Button>
                )}
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => acceptChange(change)}>Remove paragraph</Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ParagraphDiffList;


