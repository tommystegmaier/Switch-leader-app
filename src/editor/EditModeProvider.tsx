import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Tracks whether the admin is currently in Edit Mode.
 *
 * Phase 2 only flips this flag (and gates the toggle by role). The actual
 * in-place editing controls are layered on the same rendering surface in
 * Phase 3. Viewers and anonymous users can never reach a state where this is
 * true for them — the toggle that sets it is role-gated, and writes are
 * RLS-enforced regardless.
 */
interface EditModeContextValue {
  editing: boolean;
  setEditing: (v: boolean) => void;
  toggle: () => void;
}

const EditModeContext = createContext<EditModeContextValue | undefined>(undefined);

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const value = useMemo<EditModeContextValue>(
    () => ({ editing, setEditing, toggle: () => setEditing((v) => !v) }),
    [editing],
  );
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}

export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error('useEditMode must be used within <EditModeProvider>');
  return ctx;
}
