/* Signature Studio — social network catalogue. */
'use strict';

const NETWORKS = [
  { id: 'linkedin',  name: 'LinkedIn',    glyph: 'in', color: '#0a66c2', prefix: 'https://www.linkedin.com/in/', placeholder: 'username or full URL' },
  { id: 'x',         name: 'X / Twitter', glyph: '𝕏',  color: '#000000', prefix: 'https://x.com/',            placeholder: 'username or full URL' },
  { id: 'facebook',  name: 'Facebook',    glyph: 'f',  color: '#1877f2', prefix: 'https://www.facebook.com/', placeholder: 'username or full URL' },
  { id: 'instagram', name: 'Instagram',   glyph: '◉',  color: '#e4405f', prefix: 'https://www.instagram.com/',placeholder: 'username or full URL' },
  { id: 'github',    name: 'GitHub',      glyph: 'gh', color: '#24292f', prefix: 'https://github.com/',       placeholder: 'username or full URL' },
  { id: 'youtube',   name: 'YouTube',     glyph: '▶',  color: '#ff0000', prefix: 'https://www.youtube.com/@', placeholder: 'channel or full URL' },
  { id: 'tiktok',    name: 'TikTok',      glyph: '♫',  color: '#111111', prefix: 'https://www.tiktok.com/@',  placeholder: 'username or full URL' },
  { id: 'mastodon',  name: 'Mastodon',    glyph: 'M',  color: '#6364ff', prefix: '',                          placeholder: 'https://instance/@user' },
  { id: 'bluesky',   name: 'Bluesky',     glyph: '✹',  color: '#1185fe', prefix: 'https://bsky.app/profile/', placeholder: 'handle or full URL' },
  { id: 'whatsapp',  name: 'WhatsApp',    glyph: '✆',  color: '#25d366', prefix: 'https://wa.me/',           placeholder: 'number incl. country code' },
  { id: 'telegram',  name: 'Telegram',    glyph: '✈',  color: '#26a5e4', prefix: 'https://t.me/',             placeholder: 'username or full URL' },
  { id: 'signal',    name: 'Signal',      glyph: 'S',  color: '#3a76f0', prefix: 'https://signal.me/#p/',     placeholder: 'number or full URL' },
  { id: 'xing',      name: 'Xing',        glyph: 'X',  color: '#006567', prefix: 'https://www.xing.com/profile/', placeholder: 'profile id or full URL' },
  { id: 'pinterest', name: 'Pinterest',   glyph: 'P',  color: '#bd081c', prefix: 'https://www.pinterest.com/',placeholder: 'username or full URL' },
  { id: 'custom',    name: 'Custom link…',glyph: '↗',  color: '#5b6472', prefix: '',                          placeholder: 'https://…' },
];

const QUICK_NETWORKS = ['linkedin', 'x', 'github', 'instagram', 'youtube', 'whatsapp'];

function networkById(id) {
  return NETWORKS.find(n => n.id === id) || NETWORKS[0];
}

/* Turn user input into a usable URL: full URLs pass through, bare handles get
   the network's prefix, domain-looking values get https://. */
function normalizeUrl(network, raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  const net = networkById(network);
  if (net.prefix) return net.prefix + url.replace(/^\/+/, '');
  if (url.includes('.') || url.includes('/')) return 'https://' + url;
  return url;
}

/* Hostname → network detection for the HTML importer. */
const SOCIAL_HOST_PATTERNS = [
  [/linkedin\.com$/, 'linkedin'],
  [/^(x|twitter)\.com$/, 'x'],
  [/facebook\.com$/, 'facebook'],
  [/instagram\.com$/, 'instagram'],
  [/github\.com$/, 'github'],
  [/youtube\.com$/, 'youtube'],
  [/tiktok\.com$/, 'tiktok'],
  [/bsky\.app$/, 'bluesky'],
  [/wa\.me$/, 'whatsapp'],
  [/whatsapp\.com$/, 'whatsapp'],
  [/^t\.me$/, 'telegram'],
  [/signal\.me$/, 'signal'],
  [/xing\.com$/, 'xing'],
  [/pinterest\.com$/, 'pinterest'],
];

function detectNetwork(hostname) {
  for (const [re, id] of SOCIAL_HOST_PATTERNS) {
    if (re.test(hostname)) return id;
  }
  return null;
}
