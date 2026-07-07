import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { slugify, useCreateWorkspace } from '@/data/workspaceHooks';

/**
 * Self-service "create a new workspace" screen. Any signed-in user can spin up
 * a fresh, empty app and immediately become its owner — then build it from the
 * block palette. The slug becomes the shareable viewer URL `/o/{slug}`.
 */
export function CreateWorkspacePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useCreateWorkspace();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login?next=/new', { replace: true });
  }, [loading, user, navigate]);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const finalSlug = slugify(effectiveSlug);
    if (!name.trim()) return setError('Please give your app a name.');
    if (!finalSlug) return setError('Please choose a valid link (letters and numbers).');
    try {
      const org = await create.mutateAsync({ name: name.trim(), slug: finalSlug });
      navigate(`/o/${org.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /duplicate|unique/i.test(msg)
          ? 'That link is already taken — try a different one.'
          : msg,
      );
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Link to="/workspaces" className="text-sm text-gray-500 underline">← My workspaces</Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>
        Create a new app
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        You&apos;ll be the owner. Start empty and build it with the block editor.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">App name</span>
          <input
            type="text"
            className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2"
            placeholder="e.g. Switch Leader"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Link (shareable address)</span>
          <div className="flex items-center rounded-md border border-gray-300 px-3 py-2">
            <span className="text-gray-400">/o/</span>
            <input
              type="text"
              className="flex-1 bg-transparent focus:outline-none"
              placeholder="your-app"
              value={effectiveSlug}
              onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }}
            />
          </div>
          <span className="text-xs text-gray-500">
            Team members will open this link to view your app.
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={create.isPending}
          className="mt-2 rounded-full px-6 py-3 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          {create.isPending ? 'Creating…' : 'Create app'}
        </button>
      </form>
    </div>
  );
}
