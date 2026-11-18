/* Signature Studio — data model, defaults, sample data. */
'use strict';

const FONT_STACKS = {
  modern:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  classic: "Georgia, 'Times New Roman', Times, serif",
  clean:   "Arial, Helvetica, sans-serif",
  mono:    "'Courier New', Courier, monospace",
};

const TEMPLATES = [
  { id: 'classic',  name: 'Classic',  desc: 'Logo left, details right — the standard.' },
  { id: 'centered', name: 'Centered', desc: 'Everything centred under your logo.' },
  { id: 'compact',  name: 'Compact',  desc: 'One tight block for short replies.' },
  { id: 'banner',   name: 'Banner',   desc: 'Full-width image up top.' },
  { id: 'minimal',  name: 'Minimal',  desc: 'Plain text, links only.' },
  { id: 'split',    name: 'Split',    desc: 'Logo and identity left, contact details in a card on the right.' },
  { id: 'roundel',  name: 'Roundel',  desc: 'Circular photo, centred text, inline socials.' },
  { id: 'masthead', name: 'Masthead', desc: 'Company name in a coloured brand band up top.' },
  { id: 'monogram', name: 'Monogram', desc: 'Initials avatar, centred — no image needed.' },
];

function defaultState() {
  return {
    profile: { name: '', title: '', department: '', company: '', pronouns: '' },
    contact: { email: '', phone: '', mobile: '', website: '', websiteLabel: '', address: '' },
    socials: [],      // { network, url, glyph, color }
    customLines: [],  // { label, value }
    design: {
      template: 'classic',
      primaryColor: '#2f6fed',
      textColor: '#3a3f47',
      dividerColor: '#e3e6ea',
      font: 'modern',
      fontSize: 14,
      logoUrl: '',
      logoWidth: 72,
      bannerUrl: '',
      showDivider: true,
      dividerStyle: 'solid',
      socialStyle: 'icons',   // icons | icons_labels | labels
      showLegal: false,
      legalText: '',
      darkModeFriendly: false,
      stackMobile: true,
      showLabels: true,
      useMonogram: false,
    },
    meta: { name: 'My signature' },
  };
}

function sampleState() {
  const s = defaultState();
  s.profile = { name: 'Ada Lovelace', title: 'Head of Analytics', department: 'Data Science', company: 'Analytical Engines Ltd', pronouns: 'she/her' };
  s.contact = {
    email: 'ada@example.com',
    phone: '+44 20 7946 0958',
    mobile: '+44 7700 900123',
    website: 'analytical-engines.example',
    websiteLabel: '',
    address: '17 Analytical Lane\nLondon, United Kingdom',
  };
  s.socials = [
    { network: 'linkedin', url: 'https://www.linkedin.com/in/adalovelace', glyph: '', color: '' },
    { network: 'x', url: 'https://x.com/ada_l', glyph: '', color: '' },
    { network: 'github', url: 'https://github.com/ada-l', glyph: '', color: '' },
  ];
  s.customLines = [{ label: 'Office hours', value: 'Mon–Fri, 9:00–17:00 GMT' }];
  s.design.showLegal = true;
  s.design.legalText = 'This message and any attachments are confidential and intended solely for the addressee. If you received it in error, please let us know and delete it.';
  s.meta.name = 'Ada Lovelace — Analytical Engines';
  return s;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] ?? {}), obj);
  target[last] = value;
}

/* Mix two hex colours; t = amount of b. */
function mixColors(a, b, t) {
  const pa = String(a).replace('#', '');
  const pb = String(b).replace('#', '');
  if (pa.length !== 6 || pb.length !== 6) return a;
  const ch = c => parseInt(c, 16);
  const r = Math.round(ch(pa.slice(0, 2)) * (1 - t) + ch(pb.slice(0, 2)) * t);
  const g = Math.round(ch(pa.slice(2, 4)) * (1 - t) + ch(pb.slice(2, 4)) * t);
  const bl = Math.round(ch(pa.slice(4, 6)) * (1 - t) + ch(pb.slice(4, 6)) * t);
  return '#' + [r, g, bl].map(x => x.toString(16).padStart(2, '0')).join('');
}

function slugify(s) {
  return String(s || 'signature').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'signature';
}
