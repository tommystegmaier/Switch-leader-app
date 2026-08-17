import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { applyHubMetadata } from '@/lib/appMetadata';
import { useIsPlatformAdmin } from '@/data/platformHooks';
import { slugify, useAppTemplates, useCreateWorkspace, useCreateWorkspaceFromTemplate } from '@/data/workspaceHooks';

/**
 * "Create a new app" screen — platform admins only. New apps are set up
 * centrally for a location; everyone else is invited into one that already
 * exists. Blank or pre-built from a template; the creator becomes its owner and
 * the slug becomes the shareable viewer URL `/o/{slug}`.
 */
export function CreateWorkspacePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const createFromTemplate = useCreateWorkspaceFromTemplate();
  const { data: isPlatformAdmin, isLoading: adminLoading } = useIsPlatformAdmin(Boolean(user));
  const { data: templates } = useAppTemplates(Boolean(user));

  // null = start from a blank app; otherwise a template id.
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { applyHubMetadata(); }, []);

  useEffect(() => {
    if (!loading && !user) navigate('/login?next=/new', { replace: true });
  }, [loading, user, navigate]);

  // Nobody links here without the button, but the URL is guessable — send
  // non-admins back to their apps rather than showing a form that can only
  // fail at the server.
  useEffect(() => {
    if (user && !adminLoading && isPlatformAdmin === false) navigate('/workspaces', { replace: true });
  }, [user, adminLoading, isPlatformAdmin, navigate]);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const pending = create.isPending || createFromTemplate.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const finalSlug = slugify(effectiveSlug);
    if (!name.trim()) return setError('Please give your app a name.');
    if (!finalSlug) return setError('Please choose a valid link (letters and numbers).');
    try {
      const newSlug = templateId
        ? await createFromTemplate.mutateAsync({ templateId, name: name.trim(), slug: finalSlug })
        : (await create.mutateAsync({ name: name.trim(), slug: finalSlug })).slug;
      navigate(`/o/${newSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/duplicate|unique/i.test(msg) ? 'That link is already taken — try a different one.' : msg);
    }
  }

  if (!user || adminLoading || !isPlatformAdmin) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/workspaces" className="text-sm text-gray-500 underline">← My workspaces</Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>Create a new app</h1>
      <p className="mb-6 text-sm text-gray-500">You&apos;ll be the owner. Start from a template or a blank app — you can change everything later.</p>

      <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--th-heading)' }}>Choose a starting point</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TemplateCard
          selected={templateId === null}
          onSelect={() => setTemplateId(null)}
          icon="✨"
          name="Blank app"
          tagline="Start from scratch and build it with the block editor."
        />
        {(templates ?? []).map((t) => (
          <TemplateCard
            key={t.templateId}
            selected={templateId === t.templateId}
            onSelect={() => setTemplateId(t.templateId)}
            icon={t.icon || '📱'}
            name={t.name}
            tagline={t.tagline || 'Start from this app’s pages, layout, and theme.'}
          />
        ))}
      </div>
      {(templates ?? []).length > 0 && (
        <p className="-mt-4 mb-6 text-xs text-gray-500">Templates copy the pages, layout, theme, and channels — never the people, messages, or roster.</p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">App name</span>
          <input
            type="text"
            className="rounded-md border px-3 py-2 focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--th-hairline-strong)' }}
            placeholder="e.g. Switch Leader"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Link (shareable address)</span>
          <div className="flex items-center rounded-md border px-3 py-2" style={{ borderColor: 'var(--th-hairline-strong)' }}>
            <span className="text-gray-400">/o/</span>
            <input
              type="text"
              className="flex-1 bg-transparent focus:outline-none"
              placeholder="your-app"
              value={effectiveSlug}
              onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }}
            />
          </div>
          <span className="text-xs text-gray-500">Team members will open this link to view your app.</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full px-6 py-3 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          {pending ? 'Creating…' : templateId ? 'Create from template' : 'Create app'}
        </button>
      </form>
    </div>
  );
}

function TemplateCard({ selected, onSelect, icon, name, tagline }: { selected: boolean; onSelect: () => void; icon: string; name: string; tagline: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex items-start gap-3 rounded-xl border p-3 text-left transition-shadow"
      style={{
        borderColor: selected ? 'var(--th-primary)' : 'var(--th-hairline-strong)',
        boxShadow: selected ? '0 0 0 2px var(--th-primary)' : undefined,
      }}
    >
      <span className="text-2xl" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold" style={{ color: 'var(--th-heading)' }}>{name}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{tagline}</span>
      </span>
    </button>
  );
}
