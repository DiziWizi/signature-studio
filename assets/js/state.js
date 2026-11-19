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
  { id: 'photocard', name: 'Photo card', desc: 'Portrait photo left, big name — the personal profile.' },
  { id: 'postcard', name: 'Postcard', desc: 'A friendly bordered card with an accent strip — casual and warm.' },
  { id: 'line',     name: 'Line',     desc: 'One casual line: name, a few details, tiny socials.' },
  { id: 'duotone',  name: 'Duotone',  desc: 'A bold accent panel behind your photo and name.' },
  { id: 'quote',    name: 'Quote',    desc: 'A favourite line above your name — personal and warm.' },
  { id: 'enterprise', name: 'Enterprise', desc: 'Identity, support box, purpose, acknowledgement and brand footer.' },
  { id: 'night', name: 'Night', desc: 'Dark background, light text — a signature that stands out.' },
  { id: 'letterhead', name: 'Letterhead', desc: 'Centred serif letterhead with hairline rules.' },
];

/* Curated colour themes: one click sets accent, text and divider together.
   Personal users have no brand guidelines — this is their fastest start. */
const THEMES = [
  { id: 'slate',      name: 'Slate',      primary: '#3b5bdb', text: '#343a40', divider: '#e9ecef' },
  { id: 'ocean',      name: 'Ocean',      primary: '#0b7285', text: '#2b3a42', divider: '#dee7ea' },
  { id: 'forest',     name: 'Forest',     primary: '#2f9e44', text: '#2b3a2b', divider: '#e4efe5' },
  { id: 'terracotta', name: 'Terracotta', primary: '#c94f2d', text: '#44302a', divider: '#f0e4de' },
  { id: 'plum',       name: 'Plum',       primary: '#7048a8', text: '#33313d', divider: '#e9e4f0' },
  { id: 'ink',        name: 'Ink',        primary: '#1c7ed6', text: '#212529', divider: '#dee2e6' },
  { id: 'mono',       name: 'Mono',       primary: '#495057', text: '#212529', divider: '#dee2e6' },
];

function themeById(id) {
  return THEMES.find(t => t.id === id) || null;
}

function defaultState() {
  return {
    profile: { name: '', displayName: '', honorificPrefix: '', honorificSuffix: '', title: '', department: '', team: '', company: '', tagline: '', pronouns: '', location: '', languages: '', birthday: '', timezone: '' },
    contact: { email: '', email2: '', emailLabel: '', email2Label: '', phone: '', phoneLabel: '', mobile: '', mobileLabel: '', website: '', websiteLabel: '', booking: '', bookingLabel: '', portfolio: '', portfolioLabel: '', pgpKey: '', address: '', addressLabel: '' },
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
      logoAlt: '',
      logoWidth: 72,
      signatureWidth: 600,   // canvas width in px — renderer clamps to 400–600
      logoPosition: 'left',
      bannerUrl: '',
      bannerAlt: '',
      bannerLink: '',        // optional click-through link for a clickable banner
      showDivider: true,
      dividerStyle: 'solid',
      dividerLength: 'full',      // full | short (classic, centered, banner)
      dividerPosition: 'belowName', // belowName | belowContact (classic, centered, banner)
      socialStyle: 'icons',   // icons | icons_labels | labels
      showLegal: false,
      legalText: '',
      quoteText: '',
      darkModeFriendly: false,
      stackMobile: true,
      showLabels: true,
      useMonogram: false,
      statusText: '',
      statusColor: '#2f9e44',
      showCard: false,
      cardColor: '#f6f8fa',
      roundPhoto: false,       // legacy — superseded by photoShape
      photoShape: 'square',    // square | rounded | circle (side/top logos)
      nameWeight: 'bold',      // name font-weight in every layout
      strictOutlook: false,
      /* element visibility — hide anything you don't need */
      showTitle: true,
      showDepartment: true,
      showCompany: true,
      showLocation: true,
      showEmail: true,
      showPhone: true,
      showMobile: true,
      showWebsite: true,
      showAddress: true,
      showBooking: true,
      showStatus: true,
      showSocials: true,
      socialsPosition: 'bottom',  // bottom | underName | inContact
      /* density + name size */
      density: 'regular',   // airy | regular | compact
      nameSizeExtra: 3,     // px added to the base font size for the name
      /* enterprise template — organisational field set */
      supportTitle: '',       // support box heading (empty box title hides nothing by itself — box shows when any support field is set)
      supportChatUrl: '',     // support chat link target
      supportChatLabel: '',   // chat link text
      supportButtonLabel: '', // accent chip label (chip renders with a chat URL)
      supportTagline: '',
      supportPhoneLocal: '',
      supportPhoneIntl: '',
      supportAltText: '',     // e.g. "Or reach us on Teams"
      recogniseText: '',      // intro sentence for the recognition link
      recogniseUrl: '',
      recogniseLabel: '',
      purposeText: '',        // rendered as "Our purpose: …"
      landAcknowledgement: '',
      showAcknowledgement: false,
      footerLeftImg: '',
      footerLeftText: '',
      footerCenterImg: '',
      footerCenterText: '',
      footerRightImg: '',
      footerRightText: '',
    },
    meta: { name: 'My signature' },
  };
}

const SAMPLE_PERSONAS = [
  { id: 'default',    name: 'Corporate (Ada)', desc: 'Role, team and contact details' },
  { id: 'freelancer', name: 'Freelancer',      desc: 'Portfolio, booking link and open-to-work badge' },
  { id: 'designer',   name: 'Designer',        desc: 'Portfolio, Dribbble and Behance' },
  { id: 'academic',   name: 'Academic',        desc: 'Title, institution and office hours' },
  { id: 'developer',  name: 'Developer',       desc: 'GitHub, Twitch and building-in-public badge' },
];

function applyTheme(s, themeId) {
  const t = themeById(themeId);
  if (!t) return;
  s.design.primaryColor = t.primary;
  s.design.textColor = t.text;
  s.design.dividerColor = t.divider;
}

function sampleState(personaId = 'default') {
  const s = defaultState();
  if (personaId === 'freelancer') {
    s.profile = { name: 'Maya Chen', displayName: 'Maya', title: 'Freelance Software Consultant', department: '', company: '', pronouns: 'she/her', location: 'Berlin, DE · UTC+1', languages: 'English · Deutsch' };
    s.contact = { email: 'maya@example.com', phone: '', mobile: '', website: 'mayachen.dev', websiteLabel: 'mayachen.dev', booking: 'cal.com/mayachen', bookingLabel: 'Book a call', address: '' };
    s.socials = [
      { network: 'linkedin', url: 'https://www.linkedin.com/in/mayachen', glyph: '', color: '' },
      { network: 'github', url: 'https://github.com/mayachen', glyph: '', color: '' },
      { network: 'medium', url: 'https://medium.com/@mayachen', glyph: '', color: '' },
      { network: 'kofi', url: 'https://ko-fi.com/mayachen', glyph: '', color: '' },
    ];
    s.customLines = [{ label: 'Projects', value: 'mayachen.dev/work' }];
    s.design.statusText = 'Open to freelance work';
    s.design.quoteText = 'Small team, big care.';
    s.design.template = 'split';
    applyTheme(s, 'ocean');
    s.meta.name = 'Maya — freelance';
  } else if (personaId === 'designer') {
    s.profile = { name: 'Jonas Lindqvist', displayName: 'Jonas', title: 'Independent Product Designer', department: '', company: '', pronouns: 'he/him', location: 'Stockholm, SE · UTC+1', languages: 'English · Svenska' };
    s.contact = { email: 'jonas@example.com', phone: '', mobile: '', website: 'jonaslindqvist.design', websiteLabel: 'jonaslindqvist.design', booking: 'cal.com/jonas-lindqvist', bookingLabel: 'Book an intro call', address: '' };
    s.socials = [
      { network: 'dribbble', url: 'https://dribbble.com/jonasl', glyph: '', color: '' },
      { network: 'behance', url: 'https://www.behance.net/jonasl', glyph: '', color: '' },
      { network: 'instagram', url: 'https://www.instagram.com/jonasl', glyph: '', color: '' },
    ];
    s.design.statusText = 'Available for projects';
    s.design.useMonogram = true;
    s.design.template = 'classic';
    applyTheme(s, 'plum');
    s.meta.name = 'Jonas — designer';
  } else if (personaId === 'academic') {
    s.profile = { name: 'Priya Nair', displayName: 'Priya', title: 'Associate Professor', department: 'Computer Science', company: 'State University', pronouns: 'she/her', location: 'Melbourne, AU · UTC+11', languages: 'English · हिन्दी' };
    s.contact = { email: 'priya.nair@example.edu', phone: '+61 3 9000 0000', mobile: '', website: 'example.edu/~pnair', websiteLabel: 'Faculty page', booking: '', bookingLabel: '', address: 'Building 8, State University Campus' };
    s.socials = [
      { network: 'linkedin', url: 'https://www.linkedin.com/in/priyanair', glyph: '', color: '' },
      { network: 'x', url: 'https://x.com/priya_nair', glyph: '', color: '' },
    ];
    s.customLines = [{ label: 'Office hours', value: 'Tue & Thu, 14:00–16:00' }];
    s.design.template = 'classic';
    applyTheme(s, 'ink');
    s.meta.name = 'Priya — academic';
  } else if (personaId === 'developer') {
    s.profile = { name: 'Sam Okafor', displayName: 'Sam', title: 'Open-source developer', department: '', company: '', pronouns: 'they/them', location: 'Lagos, NG · WAT', languages: 'English' };
    s.contact = { email: 'sam@example.com', phone: '', mobile: '', website: 'samokafor.dev', websiteLabel: 'samokafor.dev', booking: '', bookingLabel: '', address: '' };
    s.socials = [
      { network: 'github', url: 'https://github.com/samokafor', glyph: '', color: '' },
      { network: 'twitch', url: 'https://www.twitch.tv/samokafor', glyph: '', color: '' },
      { network: 'discord', url: 'https://discord.gg/samokafor', glyph: '', color: '' },
      { network: 'signal', url: 'https://signal.me/#eu/samokafor', glyph: '', color: '' },
      { network: 'matrix', url: 'https://matrix.to/#/@samokafor:matrix.org', glyph: '', color: '' },
    ];
    s.design.statusText = 'Building in public';
    s.design.statusColor = '#7048a8';
    s.design.useMonogram = true;
    s.design.template = 'compact';
    applyTheme(s, 'mono');
    s.meta.name = 'Sam — developer';
  } else {
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
  }
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
