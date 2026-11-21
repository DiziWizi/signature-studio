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
  { id: 'bluesky',   name: 'BlueSky',     glyph: 'B',  color: '#0085ff', prefix: 'https://bsky.app/profile/', placeholder: 'handle or full URL' },
  { id: 'whatsapp',  name: 'WhatsApp',    glyph: '✆',  color: '#25d366', prefix: 'https://wa.me/',           placeholder: 'number incl. country code' },
  { id: 'telegram',  name: 'Telegram',    glyph: 'T',  color: '#26a5e4', prefix: 'https://t.me/',             placeholder: 'username or full URL' },
  { id: 'signal',    name: 'Signal',      glyph: 'S',  color: '#3a76f0', prefix: 'https://signal.me/#p/',     placeholder: 'number or full URL' },
  { id: 'xing',      name: 'Xing',        glyph: 'X',  color: '#006567', prefix: 'https://www.xing.com/profile/', placeholder: 'profile id or full URL' },
  { id: 'pinterest', name: 'Pinterest',   glyph: 'P',  color: '#bd081c', prefix: 'https://www.pinterest.com/',placeholder: 'username or full URL' },
  { id: 'medium',    name: 'Medium',      glyph: 'M',  color: '#000000', prefix: 'https://medium.com/@',        placeholder: 'username or full URL' },
  { id: 'substack',  name: 'Substack',    glyph: 'S',  color: '#ff6719', prefix: '',                            placeholder: 'yourname.substack.com' },
  { id: 'behance',   name: 'Behance',     glyph: 'Bē', color: '#1769ff', prefix: 'https://www.behance.net/',   placeholder: 'username or full URL' },
  { id: 'dribbble',  name: 'Dribbble',    glyph: 'D',  color: '#ea4c89', prefix: 'https://dribbble.com/',       placeholder: 'username or full URL' },
  { id: 'twitch',    name: 'Twitch',      glyph: 'T',  color: '#9146ff', prefix: 'https://www.twitch.tv/',     placeholder: 'username or full URL' },
  { id: 'discord',   name: 'Discord',     glyph: 'D',  color: '#5865f2', prefix: 'https://discord.gg/',        placeholder: 'invite code or full URL' },
  { id: 'etsy',      name: 'Etsy',        glyph: 'E',  color: '#f1641e', prefix: 'https://www.etsy.com/shop/', placeholder: 'shop name or full URL' },
  { id: 'vimeo',     name: 'Vimeo',       glyph: 'V',  color: '#1ab7ea', prefix: 'https://vimeo.com/',         placeholder: 'username or full URL' },
  { id: 'goodreads', name: 'Goodreads',   glyph: 'G',  color: '#754e20', prefix: 'https://www.goodreads.com/', placeholder: 'user or author, or full URL' },
  { id: 'letterboxd',name: 'Letterboxd',  glyph: 'L',  color: '#00a84c', prefix: 'https://letterboxd.com/',    placeholder: 'username or full URL' },
  { id: 'spotify',   name: 'Spotify',     glyph: '♪',  color: '#1db954', prefix: 'https://open.spotify.com/user/', placeholder: 'user id or full URL' },
  { id: 'kofi',      name: 'Ko-fi',       glyph: '☕',  color: '#ff5e5b', prefix: 'https://ko-fi.com/',         placeholder: 'username or full URL' },
  { id: 'matrix',    name: 'Matrix',      glyph: 'M',  color: '#0f8a5f', prefix: 'https://matrix.to/#/',        placeholder: '@user:server or full URL' },
  { id: 'keybase',   name: 'Keybase',     glyph: 'K',  color: '#33a0ff', prefix: 'https://keybase.io/',           placeholder: 'username or full URL' },
  { id: 'threads',   name: 'Threads',     glyph: 'T',  color: '#000000', prefix: 'https://www.threads.net/@',     placeholder: 'username or full URL' },
  { id: 'paypal',    name: 'PayPal',      glyph: 'P',  color: '#003087', prefix: 'https://paypal.me/',             placeholder: 'username or full URL' },
  { id: 'venmo',     name: 'Venmo',       glyph: 'V',  color: '#3d95ce', prefix: 'https://venmo.com/',              placeholder: 'username or full URL' },
  { id: 'cashapp',   name: 'Cash App',    glyph: '$',  color: '#00d632', prefix: 'https://cash.app/',               placeholder: '$cashtag or full URL' },
  { id: 'revolut',   name: 'Revolut',     glyph: 'R',  color: '#0075eb', prefix: 'https://revolut.me/',             placeholder: 'username or full URL' },
  { id: 'monzo',     name: 'Monzo',       glyph: 'M',  color: '#14233c', prefix: 'https://monzo.me/',               placeholder: 'username or full URL' },
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
  /* Refuse every other scheme outright (javascript:, vbscript:, data:, …).
     A host with a port ("example.com:8080/x") is not a scheme — the part
     after the colon starts with digits. */
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
  if (scheme && !/^\d+(\/|$)/.test(scheme[2])) return '';
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
  [/telegram\.me$/, 'telegram'],
  [/matrix\.to$/, 'matrix'],
  [/mastodon/, 'mastodon'],
  [/keybase\.io$/, 'keybase'],
  [/threads\.net$/, 'threads'],
  [/paypal(\.me)?$/, 'paypal'],
  [/venmo\.com$/, 'venmo'],
  [/cash\.app$/, 'cashapp'],
  [/revolut(\.me)?$/, 'revolut'],
  [/monzo\.me$/, 'monzo'],
];

function detectNetwork(hostname) {
  for (const [re, id] of SOCIAL_HOST_PATTERNS) {
    if (re.test(hostname)) return id;
  }
  return null;
}
