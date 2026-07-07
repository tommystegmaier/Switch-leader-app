import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { blockFlexStyle } from '@/blocks/BlockView';
import type { ViewerCtx } from '@/blocks/actions';
import type { Block, BlockType } from '@/types';
import { AddBlockPicker } from './AddBlockPicker';
import { EditableBlock } from './EditableBlock';
import { PropertyDrawer } from './PropertyDrawer';
import { useBlockMutations } from './useBlockMutations';

/**
 * The Edit-Mode page surface: the same blocks as the Viewer, wrapped with
 * editing controls. Blocks flow in a wrapping row (so half/third-width blocks
 * sit side by side, matching the published view). Drag to reorder (dnd-kit,
 * grid-aware) with ↑/↓ fallback, inline text editing, a property drawer, an
 * "insert after" (+) on each block, and Add-block at the top and bottom.
 */
export function EditablePage({
  orgId,
  pageId,
  blocks,
  ctx,
}: {
  orgId: string;
  pageId: string;
  blocks: Block[];
  ctx: ViewerCtx;
}) {
  const { addBlock, updateProps, deleteBlock, duplicateBlock, reorder } = useBlockMutations(orgId, pageId);
  const [picker, setPicker] = useState<{ atIndex: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const editingBlock = blocks.find((b) => b.id === editingId) ?? null;

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorder.mutate(arrayMove(blocks, oldIndex, newIndex).map((b) => b.id));
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    reorder.mutate(arrayMove(blocks, index, j).map((b) => b.id));
  }

  return (
    <div className="flex flex-col">
      <AddButton onClick={() => setPicker({ atIndex: 0 })} label="Add block" />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap items-stretch gap-4">
            {blocks.map((block, i) => (
              <SortableRow
                key={block.id}
                block={block}
                ctx={ctx}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
                onEdit={() => setEditingId(block.id)}
                onDuplicate={() => duplicateBlock.mutate(block)}
                onDelete={() => {
                  if (window.confirm('Delete this block? This cannot be undone.')) deleteBlock.mutate(block.id);
                }}
                onMove={(dir) => move(i, dir)}
                onInsertAfter={() => setPicker({ atIndex: i + 1 })}
                onInlineChange={(props) => updateProps.mutate({ id: block.id, props })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          This page is empty. Use “+ Add block” to start building.
        </p>
      ) : (
        <AddButton onClick={() => setPicker({ atIndex: blocks.length })} label="Add block" />
      )}

      {picker && (
        <AddBlockPicker
          onPick={(type: BlockType) => {
            addBlock.mutate({ type, atIndex: picker.atIndex });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {editingBlock && (
        <PropertyDrawer
          block={editingBlock}
          onCommit={(props) => updateProps.mutate({ id: editingBlock.id, props })}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="my-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-gray-400 hover:bg-black/5"
    >
      + {label}
    </button>
  );
}

function SortableRow(props: Parameters<typeof EditableBlock>[0] & { block: Block }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.block.id });
  const style = {
    ...blockFlexStyle(props.block),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <EditableBlock {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}
