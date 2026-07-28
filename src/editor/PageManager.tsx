import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Page, VisibilityRule } from '@/types';
import { usePageMutations } from './usePageMutations';

/**
 * Page management modal (Edit Mode): add, rename, set emoji icon, reorder
 * (drag), toggle published, set visibility (Everyone / Admins only), duplicate,
 * and delete pages. Templated team pages duplicate cleanly (page + all blocks).
 */
export function PageManager({
  orgId,
  pages,
  currentSlug,
  onNavigate,
  onClose,
}: {
  orgId: string;
  pages: Page[];
  currentSlug: string | undefined;
  onNavigate: (slug: string) => void;
  onClose: () => void;
}) {
  const { createPage, updatePage, reorderPages, deletePage, duplicatePage } = usePageMutations(orgId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderPages.mutate(arrayMove(pages, oldIndex, newIndex).map((p) => p.id));
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Manage pages">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <h2 className="text-lg font-bold">Pages</h2>
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Done</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {pages.map((page) => (
                  <PageRow
                    key={page.id}
                    page={page}
                    isCurrent={page.slug === currentSlug}
                    onOpen={() => { onNavigate(page.slug); onClose(); }}
                    onRename={(name) => updatePage.mutate({ id: page.id, patch: { name } })}
                    onIcon={(icon) => updatePage.mutate({ id: page.id, patch: { icon } })}
                    onTogglePublished={() => updatePage.mutate({ id: page.id, patch: { isPublished: !page.isPublished } })}
                    onVisibility={(visibility) => updatePage.mutate({ id: page.id, patch: { visibility } })}
                    onDuplicate={() => duplicatePage.mutate(page)}
                    onDelete={() => {
                      if (window.confirm(`Delete "${page.name}" and all its blocks? This cannot be undone.`)) deletePage.mutate(page.id);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={() => createPage.mutate('New page')}
            disabled={createPage.isPending}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:bg-black/5"
          >
            + Add page
          </button>
        </div>
      </div>
    </div>
  );
}

function PageRow({
  page,
  isCurrent,
  onOpen,
  onRename,
  onIcon,
  onTogglePublished,
  onVisibility,
  onDuplicate,
  onDelete,
}: {
  page: Page;
  isCurrent: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onIcon: (icon: string) => void;
  onTogglePublished: () => void;
  onVisibility: (v: VisibilityRule) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const [name, setName] = useState(page.name);
  const [icon, setIcon] = useState(page.icon ?? '');

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const visKind = page.visibility?.kind ?? 'everyone';

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg border p-2 ${isCurrent ? 'ring-2 ring-black/10' : ''}`} >
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab px-1 text-gray-400" aria-label="Drag to reorder">⠿</button>
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={() => icon !== (page.icon ?? '') && onIcon(icon)}
          className="w-9 rounded border border-gray-200 px-1 py-1 text-center"
          placeholder="🙂"
          aria-label="Page icon"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== page.name && onRename(name)}
          className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 font-medium"
          aria-label="Page name"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={page.isPublished} onChange={onTogglePublished} /> Published
        </label>
        <select
          value={visKind}
          onChange={(e) => onVisibility(e.target.value === 'admins' ? { kind: 'admins' } : { kind: 'everyone' })}
          className="rounded border border-gray-200 px-1 py-1"
          aria-label="Visibility"
        >
          <option value="everyone">Everyone</option>
          <option value="admins">Managers only</option>
        </select>
        <button type="button" onClick={onOpen} className="rounded px-2 py-1 underline">Open</button>
        <button type="button" onClick={onDuplicate} className="rounded px-2 py-1 hover:bg-black/10" title="Duplicate">⧉</button>
        <button type="button" onClick={onDelete} className="ml-auto rounded px-2 py-1 text-red-600 hover:bg-black/10" title="Delete">🗑</button>
      </div>
    </div>
  );
}
