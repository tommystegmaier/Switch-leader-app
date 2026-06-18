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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { ViewerCtx } from '@/blocks/actions';
import type { Block, BlockType } from '@/types';
import { AddBlockPicker } from './AddBlockPicker';
import { EditableBlock } from './EditableBlock';
import { PropertyDrawer } from './PropertyDrawer';
import { useBlockMutations } from './useBlockMutations';

/**
 * The Edit-Mode page surface: the same blocks as the Viewer, wrapped with
 * editing controls. Drag to reorder (dnd-kit) with ↑/↓ fallback, inline text
 * editing, a property drawer, and "+ Add block" controls between blocks.
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
    const ordered = arrayMove(blocks, oldIndex, newIndex).map((b) => b.id);
    reorder.mutate(ordered);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const ordered = arrayMove(blocks, index, j).map((b) => b.id);
    reorder.mutate(ordered);
  }

  return (
    <div className="flex flex-col">
      <AddButton onClick={() => setPicker({ atIndex: 0 })} label="Add block" />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block, i) => (
            <div key={block.id}>
              <SortableRow
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
                onInlineChange={(props) => updateProps.mutate({ id: block.id, props })}
              />
              <AddButton small onClick={() => setPicker({ atIndex: i + 1 })} label="Add block" />
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          This page is empty. Use “+ Add block” to start building.
        </p>
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

function AddButton({ onClick, label, small }: { onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`my-1 w-full rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-black/5 ${small ? 'py-1 text-xs opacity-60 hover:opacity-100' : 'py-2 text-sm'}`}
    >
      + {label}
    </button>
  );
}

function SortableRow(props: Parameters<typeof EditableBlock>[0] & { block: Block }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.block.id });
  const style = {
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
