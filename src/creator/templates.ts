import type { BlockType } from '@/types';

/**
 * Starter templates — ready-made apps a new owner can pick instead of a blank
 * canvas. Each is pure STRUCTURE (pages + blocks + theme) with sample text and
 * NO real people or data; roster/schedule/chat blocks start empty. The
 * `create_workspace_from_template` RPC (migration 0037) builds a real workspace
 * from one of these and publishes it immediately.
 *
 * These are generic and reusable — the Switch Leader one is just the first,
 * sanitized example so ministries can start fast; the others cover common
 * non-ministry contexts.
 */

export interface TemplateBlock {
  type: BlockType;
  props: Record<string, unknown>;
  visibility?: { kind: string };
}
export interface TemplatePage {
  name: string;
  icon?: string;
  slug: string;
  visibility?: { kind: string };
  blocks: TemplateBlock[];
}
export interface AppTemplate {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  settings: { theme?: Record<string, string>; fontFamily?: string };
  pages: TemplatePage[];
}

// --- small builders to keep the templates readable -------------------------
const h = (text: string, level = 2, align = 'left'): TemplateBlock => ({ type: 'heading', props: { text, level, align, underline: false } });
const p = (html: string, align = 'left'): TemplateBlock => ({ type: 'paragraph', props: { html, align } });
const btnPage = (label: string, slug: string): TemplateBlock => ({ type: 'button', props: { label, action: { type: 'page', target: slug }, style: 'filled', align: 'center', fullWidth: true, openInNewTab: false } });
const btnUrl = (label: string, url: string): TemplateBlock => ({ type: 'button', props: { label, action: { type: 'url', target: url }, style: 'filled', align: 'center', fullWidth: true, openInNewTab: true } });
const btnPhone = (label: string, number: string): TemplateBlock => ({ type: 'button', props: { label, action: { type: 'phone', target: number }, style: 'outline', align: 'center', fullWidth: true, openInNewTab: false } });
const divider = (): TemplateBlock => ({ type: 'divider', props: { color: '#0f1420', thickness: 1, margin: 16 } });
const accordion = (title: string, html: string): TemplateBlock => ({ type: 'accordion', props: { title, html, openByDefault: false } });

export const TEMPLATES: AppTemplate[] = [
  // ------------------------------------------------------------------ Switch
  {
    id: 'switch-leader',
    name: 'Switch Leader App',
    tagline: 'Youth / small-group ministry hub — weekly info, roster, chat, sign-ups.',
    icon: '⛪️',
    settings: {
      theme: { background: '#ffffff', text: '#0f1420', primary: '#0f1420', primaryText: '#ffffff', accent: '#e23b2e', heading: '#1c2541' },
    },
    pages: [
      {
        name: 'Home', icon: '🏠', slug: 'home',
        blocks: [
          h('Welcome to Switch Leader App', 1, 'center'),
          p('<p>This is your team’s home base. Replace this text with a welcome message for your leaders — what tonight looks like, where to be, and anything they need to know.</p>'),
          divider(),
          h('This Week', 2),
          p('<p>🔔 <strong>Huddle starts at 6:15pm.</strong></p><ul><li>Doors / check-in: 6:30pm</li><li>Program: 7:00pm</li><li>Dismiss: 8:30pm</li></ul>'),
          h('Jump to', 3),
          btnPage('🗓️ Weekly Info', 'weekly'),
          btnPage('👥 Team Roster', 'roster'),
          btnPage('💬 Team Chat', 'chat'),
          btnPage('✍️ Serve Sign-Up', 'signup'),
        ],
      },
      {
        name: 'Weekly Info', icon: '🗓️', slug: 'weekly',
        blocks: [
          h('Weekly Team Information', 1),
          p('<p>Post this week’s plan, talk outline, and announcements here. Tap “Edit” to change anything.</p>'),
          accordion('This week’s talk', '<p>Add the theme, key verse, and discussion questions for small groups.</p>'),
          accordion('Announcements', '<ul><li>Upcoming event…</li><li>Volunteer need…</li></ul>'),
        ],
      },
      {
        name: 'Roster', icon: '👥', slug: 'roster',
        blocks: [
          h('Switch Roster', 1),
          p('<p>Add your groups and leaders here. Tap “Edit” on the roster to create groups and add people (from accounts or by name).</p>'),
          { type: 'roster', props: { title: 'Team Roster', headerSize: 'md' } },
        ],
      },
      {
        name: 'Team Chat', icon: '💬', slug: 'chat',
        blocks: [
          { type: 'chat', props: { title: 'Team Chat' } },
        ],
      },
      {
        name: 'Serve Sign-Up', icon: '✍️', slug: 'signup',
        blocks: [
          h('Serve Sign-Up', 1),
          p('<p>Fill this out to let us know when you can serve.</p>'),
          {
            type: 'form',
            props: {
              title: 'Volunteer sign-up',
              description: 'We’ll follow up with your team assignment.',
              submitLabel: 'Sign me up',
              successMessage: 'Thanks for signing up — we’ll be in touch!',
              fields: [
                { label: 'Full name', type: 'short', required: true, options: '' },
                { label: 'Phone number', type: 'phone', required: true, options: '' },
                { label: 'Which team?', type: 'dropdown', required: true, options: 'Group Leader, Host Team, Check-In, Safety, Production' },
                { label: 'Which weeks can you serve?', type: 'long', required: false, placeholder: 'e.g. every week, or specific dates', options: '' },
              ],
            },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------- Small biz
  {
    id: 'small-business',
    name: 'Small Business',
    tagline: 'Storefront-style app — about, hours, services, and a contact form.',
    icon: '🛍️',
    settings: {
      theme: { background: '#ffffff', text: '#1f2937', primary: '#0f766e', primaryText: '#ffffff', accent: '#f59e0b', heading: '#134e4a' },
    },
    pages: [
      {
        name: 'Home', icon: '🏠', slug: 'home',
        blocks: [
          h('Your Business Name', 1, 'center'),
          p('<p style="text-align:center">A short, friendly tagline about what you do.</p>', 'center'),
          divider(),
          h('Hours', 2),
          p('<ul><li>Mon–Fri: 9am – 6pm</li><li>Sat: 10am – 4pm</li><li>Sun: Closed</li></ul>'),
          btnPhone('📞 Call us', '+15555550123'),
          btnUrl('📍 Get directions', 'https://maps.google.com'),
          btnPage('✉️ Contact us', 'contact'),
        ],
      },
      {
        name: 'Services', icon: '🛎️', slug: 'services',
        blocks: [
          h('What we offer', 1),
          { type: 'card', props: { title: 'Service one', icon: '⭐', body: 'A sentence about this service.', columns: 2, action: { type: 'page', target: 'contact' } } },
          { type: 'card', props: { title: 'Service two', icon: '✨', body: 'A sentence about this service.', columns: 2, action: { type: 'page', target: 'contact' } } },
          { type: 'list', props: { title: 'More', items: [
            { label: 'Another offering', sublabel: 'Short detail', icon: '•', action: { type: 'page', target: 'contact' } },
            { label: 'Something else', sublabel: 'Short detail', icon: '•', action: { type: 'page', target: 'contact' } },
          ] } },
        ],
      },
      {
        name: 'Contact', icon: '✉️', slug: 'contact',
        blocks: [
          h('Get in touch', 1),
          {
            type: 'form',
            props: {
              title: 'Send us a message',
              description: 'We usually reply within one business day.',
              submitLabel: 'Send',
              successMessage: 'Thanks — we’ll get back to you soon!',
              fields: [
                { label: 'Name', type: 'short', required: true, options: '' },
                { label: 'Email', type: 'email', required: true, options: '' },
                { label: 'Phone', type: 'phone', required: false, options: '' },
                { label: 'How can we help?', type: 'long', required: true, options: '' },
              ],
            },
          },
          { type: 'map', props: { query: '', height: 300 } },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Sports
  {
    id: 'sports-team',
    name: 'Sports Team / Club',
    tagline: 'Roster, schedule, team chat, and sign-ups for a team or club.',
    icon: '🏆',
    settings: {
      theme: { background: '#ffffff', text: '#111827', primary: '#1d4ed8', primaryText: '#ffffff', accent: '#f59e0b', heading: '#1e3a8a' },
    },
    pages: [
      {
        name: 'Home', icon: '🏠', slug: 'home',
        blocks: [
          h('Team Home', 1, 'center'),
          p('<p>Post announcements and this week’s game/practice info here.</p>'),
          btnPage('📅 Schedule', 'schedule'),
          btnPage('👥 Roster', 'roster'),
          btnPage('💬 Team Chat', 'chat'),
          btnPage('📝 Sign-Ups', 'signup'),
        ],
      },
      { name: 'Schedule', icon: '📅', slug: 'schedule', blocks: [ h('Schedule', 1), { type: 'schedule', props: { title: 'Game & practice schedule', headerSize: 'md' } } ] },
      { name: 'Roster', icon: '👥', slug: 'roster', blocks: [ h('Roster', 1), { type: 'roster', props: { title: 'Team roster', headerSize: 'md' } } ] },
      { name: 'Team Chat', icon: '💬', slug: 'chat', blocks: [ { type: 'chat', props: { title: 'Team Chat' } } ] },
      {
        name: 'Sign-Ups', icon: '📝', slug: 'signup',
        blocks: [
          h('Sign-Ups', 1),
          {
            type: 'form',
            props: {
              title: 'Snack & volunteer sign-up',
              description: '',
              submitLabel: 'Sign up',
              successMessage: 'Thanks for signing up!',
              fields: [
                { label: 'Your name', type: 'short', required: true, options: '' },
                { label: 'What are you bringing / helping with?', type: 'short', required: true, options: '' },
                { label: 'For which date?', type: 'date', required: true, options: '' },
              ],
            },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------- Classroom
  {
    id: 'classroom',
    name: 'Classroom',
    tagline: 'A hub for a class — resources, assignments, and a permission-slip form.',
    icon: '🍎',
    settings: {
      theme: { background: '#ffffff', text: '#1f2937', primary: '#7c3aed', primaryText: '#ffffff', accent: '#10b981', heading: '#5b21b6' },
    },
    pages: [
      {
        name: 'Home', icon: '🍎', slug: 'home',
        blocks: [
          h('Welcome to Our Class', 1, 'center'),
          p('<p>Use this space for a welcome note, weekly focus, and reminders for students and families.</p>'),
          btnPage('📚 Resources', 'resources'),
          btnPage('📝 Assignments', 'assignments'),
          btnPage('✅ Permission Slip', 'permission'),
        ],
      },
      {
        name: 'Resources', icon: '📚', slug: 'resources',
        blocks: [
          h('Class Resources', 1),
          { type: 'list', props: { title: 'Helpful links', items: [
            { label: 'Class website', sublabel: '', icon: '🔗', action: { type: 'url', target: 'https://example.com' } },
            { label: 'Reading list', sublabel: '', icon: '📖', action: { type: 'url', target: 'https://example.com' } },
          ] } },
        ],
      },
      {
        name: 'Assignments', icon: '📝', slug: 'assignments',
        blocks: [
          h('Assignments', 1),
          accordion('This week', '<ul><li>Assignment 1 — due Friday</li><li>Reading — chapters 3–4</li></ul>'),
          accordion('Next week', '<p>Add upcoming work here.</p>'),
        ],
      },
      {
        name: 'Permission Slip', icon: '✅', slug: 'permission',
        blocks: [
          h('Field Trip Permission Slip', 1),
          {
            type: 'form',
            props: {
              title: 'Permission slip',
              description: 'Please complete and submit by the due date.',
              submitLabel: 'Submit',
              successMessage: 'Thank you — your permission slip was submitted.',
              fields: [
                { label: 'Student name', type: 'short', required: true, options: '' },
                { label: 'Parent/guardian name', type: 'short', required: true, options: '' },
                { label: 'Parent/guardian email', type: 'email', required: true, options: '' },
                { label: 'Emergency phone', type: 'phone', required: true, options: '' },
                { label: 'I give permission for my child to attend.', type: 'checkbox', required: true, options: '' },
              ],
            },
          },
        ],
      },
    ],
  },
];
