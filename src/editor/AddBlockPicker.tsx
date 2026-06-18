import type { BlockType } from '@/types';
import { BLOCK_LIST, type BlockCategory } from '@/blocks/registry';

/**
 * Visual block picker for "+ Add block". Shows every registered block type with
 * its icon, name, and one-line description, grouped by category. Picking one
 * inserts it with sensible defaults at the requested position.
 */
const CATEGORY_LABELS: Record<BlockCategory, string> = {
  text: 'Text',
  media: 'Media',
  interactive: 'Buttons & links',
  layout: 'Layout',
  advanced: 'Advanced',
};

const CATEGORY_ORDER: BlockCategory[] = ['text', 'interactive', 'media', 'layout', 'advanced'];

export function AddBlockPicker({
  onPick,
  onClose,
}: {
  onPick: (type: BlockType) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add a block">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Add a block</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-2xl leading-none hover:bg-black/10" aria-label="Close">×</button>
        </div>
        {CATEGORY_ORDER.map((cat) => {
          const blocks = BLOCK_LIST.filter((b) => b.category === cat);
          if (blocks.length === 0) return null;
          return (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{CATEGORY_LABELS[cat]}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {blocks.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    onClick={() => onPick(b.type)}
                    className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-left hover:bg-black/5"
                  >
                    <span className="text-2xl" aria-hidden>{b.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{b.label}</span>
                      <span className="block text-xs text-gray-500">{b.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
