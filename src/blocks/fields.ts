/**
 * Field descriptors that drive the generic property editor (PropertyDrawer).
 *
 * Each block type declares a list of `FieldDef`s describing how to edit its
 * `props`. The drawer renders the right input for each `type`, so adding a new
 * block usually means writing a Viewer + a field list — no bespoke editor UI.
 * (Blocks needing something special can still register a custom editor.)
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'color'
  | 'boolean'
  | 'select'
  | 'url'
  | 'action' // composite: { type: 'url'|'page'|'email'|'phone', target: string }
  | 'image' // image URL (+ alt handled as sibling text fields)
  | 'pdf' // PDF URL (upload UI wired in Phase 5)
  | 'date' // ISO datetime-local
  | 'items'; // array of objects edited with `itemFields`

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** options for `select` */
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  /** sub-fields for `items` arrays (e.g. each gallery image / list row). */
  itemFields?: FieldDef[];
  /** default value for a newly added item (items only). */
  itemDefault?: Record<string, unknown>;
}

/** Common alignment field reused by many blocks. */
export const ALIGN_FIELD: FieldDef = {
  key: 'align',
  label: 'Alignment',
  type: 'select',
  options: [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ],
};

/** Action target field group (used by button/card/list rows). */
export const ACTION_FIELD: FieldDef = {
  key: 'action',
  label: 'When tapped',
  type: 'action',
  help: 'Open a link, jump to a page, send an email, or dial a phone number.',
};
