import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { CategoryDef, HubValue, row, RowDef, plural } from '../hub.core';
import { HubDeps } from './hub.deps';
import {
  FONT_OPTIONS,
  MOTION_OPTIONS,
  SOUND_STYLE_OPTIONS,
  UI_PREF_DEFAULTS,
  UiPrefs,
  resolveUiPrefs,
} from '../ui-preferences';
import { DIAGNOSTIC_FIELDS } from '../diagnostics';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function personalCategories(d: HubDeps): CategoryDef[] {
  const prefs = async (userId: string): Promise<UiPrefs> => {
    const u = await d.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { uiPreferences: true } });
    return resolveUiPrefs(u.uiPreferences);
  };
  const save = async (userId: string, next: UiPrefs) => {
    await d.prisma.user.update({ where: { id: userId }, data: { uiPreferences: next as never } });
  };

  const selectRow = (opts: {
    key: string;
    label: string;
    description: string;
    options: { value: string; label: string }[];
    read: (p: UiPrefs) => string;
    write: (p: UiPrefs, v: string) => UiPrefs;
    defaultValue: string;
    tone?: (v: string) => 'green' | 'neutral' | 'blue';
  }): RowDef =>
    row({
      key: opts.key,
      label: opts.label,
      description: opts.description,
      scope: 'User',
      reset: { label: opts.options.find((o) => o.value === opts.defaultValue)!.label, value: opts.defaultValue },
      state: async (ctx) => {
        const v = opts.read(await prefs(ctx.userId));
        return { value: opts.options.find((o) => o.value === v)?.label ?? v, tone: opts.tone?.(v) ?? 'neutral', control: { type: 'select', current: v, options: opts.options } };
      },
      write: async (ctx, v: HubValue) => {
        if (!opts.options.some((o) => o.value === String(v))) throw bad('Choose one of the listed options.');
        await save(ctx.userId, opts.write(await prefs(ctx.userId), String(v)));
      },
    });

  const toggleRow = (opts: {
    key: string;
    label: string;
    description: string;
    read: (p: UiPrefs) => boolean;
    write: (p: UiPrefs, on: boolean) => UiPrefs;
    defaultOn: boolean;
    on?: string;
    off?: string;
  }): RowDef =>
    row({
      key: opts.key,
      label: opts.label,
      description: opts.description,
      scope: 'User',
      reset: { label: opts.defaultOn ? (opts.on ?? 'On') : (opts.off ?? 'Off'), value: opts.defaultOn },
      state: async (ctx) => {
        const on = opts.read(await prefs(ctx.userId));
        return { value: on ? (opts.on ?? 'On') : (opts.off ?? 'Off'), tone: on ? 'green' : 'neutral', control: { type: 'toggle', on } };
      },
      write: async (ctx, v: HubValue) => {
        await save(ctx.userId, opts.write(await prefs(ctx.userId), Boolean(v)));
      },
    });

  const soundNumber = (key: string, label: string, description: string, field: 'volume' | 'cooldownSec', min: number, max: number, unit: string, fmt: (n: number) => string): RowDef =>
    row({
      key,
      label,
      description,
      scope: 'User',
      reset: { label: fmt(UI_PREF_DEFAULTS.sound[field]), value: UI_PREF_DEFAULTS.sound[field] },
      state: async (ctx) => {
        const n = (await prefs(ctx.userId)).sound[field];
        return { value: fmt(n), control: { type: 'number', current: n, min, max, step: 1, unit } };
      },
      write: async (ctx, v: HubValue) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) throw bad(`Enter a number from ${min} to ${max}.`);
        const p = await prefs(ctx.userId);
        await save(ctx.userId, { ...p, sound: { ...p.sound, [field]: n } });
      },
    });

  const quietTime = (key: string, label: string, description: string, field: 'quietFrom' | 'quietTo'): RowDef =>
    row({
      key,
      label,
      description,
      scope: 'User',
      reset: { label: 'Not set', value: null },
      state: async (ctx) => {
        const t = (await prefs(ctx.userId)).sound[field];
        return { value: t ?? 'Not set', tone: t ? 'blue' : 'neutral', control: { type: 'time', current: t, nullable: true } };
      },
      write: async (ctx, v: HubValue) => {
        if (v !== null && !TIME.test(String(v))) throw bad('Enter a time like 22:00.');
        const p = await prefs(ctx.userId);
        await save(ctx.userId, { ...p, sound: { ...p.sound, [field]: v === null ? null : String(v) } });
      },
    });

  return [
    {
      key: 'appearance',
      label: 'Appearance',
      title: 'Appearance & Personalization',
      icon: 'palette',
      group: 'Platform',
      userScoped: true,
      description: 'Motion and text size. These are your own preferences.',
      affects: ['Interface', 'Accessibility'],
      affectsNote: 'These are your own preferences. They do not change what anyone else sees.',
      help: [
        'Only what is actually implemented is offered — there is no dark theme yet.',
        'Reduced and Off both switch off transitions and animation across the app.',
        'Larger text scales the whole interface, including drawers and tables.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Motion and text',
          hint: 'Applied everywhere, for you',
          rows: [
            selectRow({
              key: 'ap-motion',
              label: 'Motion',
              description: 'Normal, reduced or off. Reduced and Off both disable animation and transitions.',
              options: MOTION_OPTIONS,
              read: (p) => p.motion,
              write: (p, v) => ({ ...p, motion: v as UiPrefs['motion'] }),
              defaultValue: 'normal',
            }),
            selectRow({
              key: 'ap-font',
              label: 'Text size',
              description: 'Default, large or extra large. Scales the whole interface.',
              options: FONT_OPTIONS,
              read: (p) => p.fontSize,
              write: (p, v) => ({ ...p, fontSize: v as UiPrefs['fontSize'] }),
              defaultValue: 'default',
            }),
          ],
        },
        {
          title: 'Not available',
          hint: 'Listed so you are not left guessing',
          rows: [
            row({ key: 'ap-theme', label: 'Theme', description: 'Noxtill has one theme. Dark and system themes are not available.', scope: 'User', state: () => ({ value: 'Light only', tone: 'neutral' }) }),
            row({ key: 'ap-density', label: 'Density', description: 'Table and list spacing cannot be changed; the interface has one spacing scale.', scope: 'User', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
            row({ key: 'ap-accent', label: 'Accent colour', description: 'There is one accent colour, Noxtill green.', scope: 'User', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'sounds',
      label: 'Notification Sounds',
      title: 'Notification Sounds',
      icon: 'volume-2',
      group: 'Engagement',
      userScoped: true,
      description: 'Whether a sound plays for a new notification, how loud, and when it stays quiet. Your own preference.',
      affects: ['Notifications', 'Accessibility'],
      affectsNote: 'The cooldown is what stops a burst of notifications producing a burst of sounds.',
      help: [
        'A sound only ever accompanies a notification that also appears in the bell — it is never the only signal.',
        'Notifications arriving together play one sound: after a sound, none play until the cooldown ends.',
        'During quiet hours nothing sounds, except high-priority notifications if you allow them.',
        'Sounds play in your browser while Noxtill is open, so your browser must allow audio.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Sound',
          hint: 'Plays in this browser',
          rows: [
            toggleRow({
              key: 'snd-enabled',
              label: 'Play a sound for new notifications',
              description: 'The master switch. Notifications still appear in the bell when this is off.',
              read: (p) => p.sound.enabled,
              write: (p, on) => ({ ...p, sound: { ...p.sound, enabled: on } }),
              defaultOn: true,
            }),
            selectRow({
              key: 'snd-style',
              label: 'Sound',
              description: 'The tone that plays.',
              options: SOUND_STYLE_OPTIONS,
              read: (p) => p.sound.style,
              write: (p, v) => ({ ...p, sound: { ...p.sound, style: v as UiPrefs['sound']['style'] } }),
              defaultValue: 'chime',
            }),
            soundNumber('snd-volume', 'Volume', 'How loud the sound plays.', 'volume', 0, 100, '%', (n) => `${n}%`),
            row({
              key: 'snd-preview',
              label: 'Preview',
              description: 'Play the sound as currently saved.',
              scope: 'User',
              state: () => ({ value: 'Plays in your browser', control: { type: 'action', label: 'Play preview', actionKey: 'play-sound', client: 'play-sound' } }),
            }),
          ],
        },
        {
          title: 'Rate limiting and quiet hours',
          hint: 'Keeps sound from becoming noise',
          rows: [
            soundNumber('snd-cooldown', 'Cooldown', 'The minimum gap between two sounds. Notifications inside it arrive silently.', 'cooldownSec', 1, 300, 'seconds', (n) => `${n} second${n === 1 ? '' : 's'}`),
            quietTime('snd-quiet-from', 'Quiet hours start', 'No sound from this time (your device’s clock). Set both times to use quiet hours.', 'quietFrom'),
            quietTime('snd-quiet-to', 'Quiet hours end', 'Sound resumes at this time. The window may run past midnight, for example 22:00 to 07:00.', 'quietTo'),
            toggleRow({
              key: 'snd-quiet-high',
              label: 'High-priority notifications may still sound',
              description: 'During quiet hours, still play a sound for notifications marked High priority in Notification settings.',
              read: (p) => p.sound.quietAllowHigh,
              write: (p, on) => ({ ...p, sound: { ...p.sound, quietAllowHigh: on } }),
              defaultOn: true,
              on: 'Allowed',
              off: 'Silent',
            }),
          ],
        },
        {
          title: 'Not available',
          hint: 'Listed so you are not left guessing',
          rows: [row({ key: 'snd-custom', label: 'Custom sound upload', description: 'Uploading your own audio is not available.', scope: 'User', state: () => ({ value: 'Not available', tone: 'neutral' }) })],
        },
      ],
    },
    {
      key: 'accessibility',
      label: 'Accessibility',
      title: 'Accessibility',
      icon: 'accessibility',
      group: 'Platform',
      userScoped: true,
      description: 'Motion and text preferences that make Noxtill easier to use. Your own preference.',
      affects: ['Interface', 'Every module'],
      affectsNote: 'These are the same settings as in Appearance, shown here as simple switches.',
      help: [
        'Reduced motion and larger text apply everywhere in Noxtill, for you only.',
        'High contrast is not available, so no switch is offered for it.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }, { label: 'Keyboard shortcuts', icon: 'keyboard', href: '/settings/shortcuts', kind: 'link' }],
      groups: [
        {
          title: 'Preferences',
          hint: 'Applied everywhere, for you',
          rows: [
            toggleRow({
              key: 'a11y-motion',
              label: 'Reduced motion',
              description: 'Disable animation and transitions. Turn this on if motion is uncomfortable.',
              read: (p) => p.motion !== 'normal',
              write: (p, on) => ({ ...p, motion: on ? 'reduced' : 'normal' }),
              defaultOn: false,
            }),
            toggleRow({
              key: 'a11y-text',
              label: 'Larger text',
              description: 'Increase the size of text across the interface.',
              read: (p) => p.fontSize !== 'default',
              write: (p, on) => ({ ...p, fontSize: on ? 'large' : 'default' }),
              defaultOn: false,
            }),
            row({ key: 'a11y-contrast', label: 'High contrast', description: 'A higher-contrast mode is not available.', scope: 'User', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'shortcuts',
      label: 'Keyboard Shortcuts',
      title: 'Keyboard Shortcuts',
      icon: 'keyboard',
      group: 'Platform',
      description: 'Every keyboard shortcut Noxtill responds to today.',
      affects: ['Interface', 'Accessibility'],
      affectsNote: 'No shortcut performs a financial or destructive action.',
      help: [
        'Only shortcuts that exist in the app are listed.',
        'Shortcuts cannot be changed or added.',
      ],
      actions: [],
      groups: [
        {
          title: 'Shortcuts',
          hint: 'Fixed',
          rows: [
            row({ key: 'sc-search', label: 'Search everything', description: 'Open the global search for customers, orders and products.', scope: 'User', state: () => ({ value: 'Ctrl K  ·  ⌘ K' }) }),
            row({ key: 'sc-focus', label: 'Focus the search box', description: 'On Settings and Reports, jump to that page’s search field.', scope: 'User', state: () => ({ value: '/' }) }),
            row({ key: 'sc-close', label: 'Close a drawer, dialog, menu or search', description: 'Dismiss whatever is open on top.', scope: 'User', state: () => ({ value: 'Esc' }) }),
            row({ key: 'sc-send', label: 'Send a message to the AI Assistant', description: 'Send the message you typed. Shift and Enter starts a new line instead.', scope: 'User', state: () => ({ value: 'Enter' }) }),
          ],
        },
        {
          title: 'By design',
          hint: 'What shortcuts do not do',
          rows: [
            row({ key: 'sc-financial', label: 'Financial actions', description: 'Refunds, write-offs and deletions have no shortcut, so a keystroke cannot move money.', risk: 'High', state: () => ({ value: 'No shortcut', tone: 'green' }) }),
            row({ key: 'sc-custom', label: 'Customise shortcuts', description: 'Changing or adding shortcuts is not available.', scope: 'User', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'support',
      label: 'Help & Support',
      title: 'Help & Support',
      icon: 'circle-help',
      group: 'Governance',
      description: 'Where to find help inside Noxtill, and a diagnostic file you can review before sharing it.',
      affects: ['Support'],
      affectsNote: 'The diagnostic file is generated on your device request only. Nothing is sent anywhere automatically.',
      help: [
        'Only resources that exist are linked.',
        'The diagnostic file never includes customer names, contact details, payment data or message content.',
        'You choose whether to share the file; Noxtill does not send it.',
      ],
      actions: [],
      groups: [
        {
          title: 'Resources',
          hint: 'Only real links',
          rows: [
            row({
              key: 'sup-help',
              label: 'Help assistant',
              description: 'Ask how a module works and get an answer drawn from Noxtill’s help articles.',
              link: { label: 'Open the help assistant', href: '/assistant/help' },
              state: async () => ({ value: plural(await d.prisma.helpArticle.count(), 'help article') }),
            }),
            row({
              key: 'sup-status',
              label: 'System status',
              description: 'The same measurements as System Health.',
              link: { label: 'Open System Health', href: '/settings/health' },
              state: () => ({ value: 'See System Health' }),
            }),
            row({
              key: 'sup-shortcuts',
              label: 'Keyboard shortcuts',
              description: 'Every shortcut Noxtill responds to.',
              link: { label: 'View shortcuts', href: '/settings/shortcuts' },
              state: () => ({ value: 'View' }),
            }),
            row({ key: 'sup-notes', label: 'Release notes', description: 'A list of what changed and when is not published in the app.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
            row({ key: 'sup-contact', label: 'Contact support', description: 'No support contact is configured for this installation.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
        {
          title: 'Diagnostics',
          hint: 'Listed before it is shared',
          footer: 'Download the file and read it before sharing it with anyone.',
          rows: [
            row({
              key: 'sup-bundle',
              label: 'Diagnostic file',
              description: `A JSON file with system facts. It contains: ${DIAGNOSTIC_FIELDS.map((f) => f.label.toLowerCase()).join(', ')}.`,
              risk: 'Medium',
              impact: 'It is created when you press the button and downloaded to your device. It is not sent anywhere.',
              state: () => ({ value: 'Review before sharing', control: { type: 'action', label: 'Download', actionKey: 'diagnostics', client: 'download-diagnostics' } }),
            }),
            row({ key: 'sup-excluded', label: 'Never included', description: 'Customer names and contact details, payment data, message content, passwords and keys, and file contents.', risk: 'High', state: () => ({ value: 'Excluded', tone: 'green' }) }),
          ],
        },
      ],
    },
  ];
}
