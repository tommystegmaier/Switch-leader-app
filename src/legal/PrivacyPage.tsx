import { Link } from 'react-router-dom';

import { PLATFORM_NAME } from '@/lib/appMetadata';

/**
 * Privacy policy. Public — no sign-in — because both app stores require a
 * policy at a URL their reviewers (and anyone else) can open directly.
 *
 * Written to be read, not to be survived: short sections, plain sentences, and
 * the answers people actually want first — what's collected, who can see it,
 * and how to get rid of it. The legal-sounding phrasing common to these pages
 * buys nothing here and costs comprehension.
 *
 * If the way the app handles data changes, this file changes with it. It is
 * the statement being relied on, not decoration.
 */

const UPDATED = 'August 2026';
const CONTACT = 'tommy.stegmaier@life.church';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-16" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
      <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--th-heading)' }}>Privacy Policy</h1>
      <p className="mt-1 text-sm text-gray-500">{PLATFORM_NAME} · Last updated {UPDATED}</p>

      <Section title="The short version">
        <p>
          {PLATFORM_NAME} is a private tool for church ministry teams. You have to be invited to use it.
          We collect the small amount of information the app needs to work, we don&apos;t sell it, we don&apos;t
          use it for advertising, and you can delete your account and everything in it at any time from
          inside the app.
        </p>
      </Section>

      <Section title="What we collect">
        <List items={[
          <><B>Your account.</B> Your name, email address, phone number, and birthday — you enter these when you sign up. Your password is stored encrypted and we can never see it.</>,
          <><B>What you post.</B> Messages, photos, voice messages, and poll votes you send in the app&apos;s group chats, and answers you submit to forms.</>,
          <><B>Your team details.</B> The groups you&apos;re part of and the times you&apos;re scheduled to serve, entered by you or by a leader.</>,
          <><B>Basic usage.</B> The date you last opened the app, so leaders can tell who has it working. We do not track your location, your browsing, or anything you do outside this app.</>,
        ]} />
      </Section>

      <Section title="How we use it">
        <p>
          Only to run the app: to sign you in, show you the right groups, deliver the messages and
          notifications you asked for, and let your leaders organise the team. That&apos;s the whole list.
        </p>
        <p className="mt-3">
          <B>We do not sell your information, share it with advertisers, or use it to build a profile
          of you.</B> There is no advertising in this app.
        </p>
      </Section>

      <Section title="Who can see it">
        <List items={[
          <><B>Your team.</B> Other people in your app see your name and anything you post in a channel you share with them. Leaders can also see your phone number, birthday, and when you last opened the app.</>,
          <><B>The people who run the app.</B> A small number of administrators can see all apps in order to support and moderate them.</>,
          <><B>Nobody else.</B> We don&apos;t give your information to anyone outside the app, except the service providers below or where the law requires it.</>,
        ]} />
      </Section>

      <Section title="Services we rely on">
        <p>
          The app is built on a few standard services that process data on our behalf, under their own
          security commitments: <B>Supabase</B> (database, accounts, file storage), <B>Cloudflare</B>
          {' '}(hosting), <B>Apple and Google</B> (delivering push notifications to your phone), and
          {' '}<B>GIPHY</B> (only when you search for a GIF, which sends just your search word).
        </p>
      </Section>

      <Section title="Notifications">
        <p>
          Push notifications are off until you turn them on, and you can turn them off at any time —
          in the app&apos;s menu, or in your phone&apos;s own settings. Muting a channel stops
          notifications from it without leaving it.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Your account and posts stay until you delete them or delete your account. Photos and voice
          messages in chat are cleared out automatically after a period of time to keep storage in
          check. Reports of inappropriate content are kept after they&apos;re dealt with, so there&apos;s a
          record.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Open the menu (☰) at the top of the app and choose <B>Delete account</B> at the bottom.
          It asks you to confirm, and then it&apos;s immediate and permanent: your account, your profile,
          your messages, and your place on every team are removed. We can&apos;t undo it, and we don&apos;t keep
          a copy.
        </p>
      </Section>

      <Section title="Reporting something">
        <p>
          Tap any message and then the flag (⚑) to report it. Reports go to the administrators, who can
          remove the content and act on the account behind it. Leaders in your app can also delete
          messages directly.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This app is for ministry leaders and volunteers, and accounts are only created by invitation.
          It isn&apos;t intended for children, and we don&apos;t knowingly collect information from anyone under
          13. If you believe a child has an account, contact us and we&apos;ll remove it.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can view and correct your details, or ask a leader to. You can delete your account
          yourself at any time. If you&apos;d like a copy of what we hold about you, or want something
          corrected or removed, email us and we&apos;ll take care of it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change how the app handles your information, we&apos;ll update this page and the date at the
          top. Meaningful changes will be announced in the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, requests, or concerns: <a href={`mailto:${CONTACT}`} className="underline" style={{ color: 'var(--th-primary)' }}>{CONTACT}</a>
        </p>
      </Section>

      <div className="mt-10 border-t pt-5" style={{ borderColor: 'var(--th-hairline)' }}>
        <Link to="/" className="text-sm underline" style={{ color: 'var(--th-text)' }}>← Back to the app</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{title}</h2>
      <div className="mt-2 text-[0.95rem] leading-relaxed" style={{ color: 'var(--th-text)' }}>{children}</div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="select-none" style={{ color: 'var(--th-primary)' }}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: 'var(--th-heading)' }}>{children}</strong>;
}
