/* Signature Studio — signature renderer. state → full HTML document.
   Outlook-safe: table layout, every style inline, no <style> in default output,
   explicit widths, role=presentation. */
'use strict';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* CID image mode: every image is emitted as cid:sigstudio-<key> so a
   mail pipeline can attach parts with matching Content-IDs. The stored
   value (hosted URL or data URI) stays the asset's source of truth and
   is restored when the mode switches back. */
const imgSrcOf = (d, key, stored) => {
  const ref = d.imageRef || {};
  const refKey = key.startsWith('social-')
    ? 'socials'
    : { 'footer-left': 'footerLeft', 'footer-center': 'footerCenter', 'footer-right': 'footerRight' }[key] || key;
  /* Per-image override wins; the legacy global imageMode applies only
     to images without an explicit per-image setting. */
  const cid = ref[refKey] === 'cid' || (!ref[refKey] && d.imageMode === 'cid');
  if (cid && stored && String(stored).trim()) return `cid:sigstudio-${key}`;
  return stored;
};

const stackOf = d => {
  const custom = String(d.customFont || '').trim();
  if (custom) {
    /* The stack is emitted inside a style attribute: keep only characters
       a font stack can legitimately contain, then escape for HTML. */
    return esc(custom.replace(/[^a-zA-Z0-9 ,.\-]/g, ''));
  }
  return FONT_STACKS[d.font] || FONT_STACKS.modern;
};

function textStyle(d, opts = {}) {
  const size = opts.size ?? d.fontSize;
  const parts = [
    `font-family:${stackOf(d)}`,
    `font-size:${size}px`,
    `color:${opts.color ?? d.textColor}`,
    `line-height:${Math.round(size * lineHeightOf(d))}px`,
    'mso-line-height-rule:exactly',
  ];
  if (opts.weight) parts.push(`font-weight:${opts.weight}`);
  if (opts.style) parts.push(`font-style:${opts.style}`);
  if (opts.letterSpacing) parts.push(`letter-spacing:${opts.letterSpacing}px`);
  return parts.join(';');
}

const mutedColor = d => (d.mutedColor && /^#[0-9a-fA-F]{3,8}$/.test(d.mutedColor))
  ? d.mutedColor
  : mixColors(d.textColor, '#ffffff', 0.42);

/* Accent-coloured link text: linkColor when set (hex-validated), else the
   primary colour — byte-identical defaults. */
const linkColorOf = d => (d.linkColor && /^#[0-9a-fA-F]{3,8}$/.test(d.linkColor))
  ? d.linkColor
  : d.primaryColor;

/* Name text colour override; falls back to textColor. */
const nameColorOf = d => (d.nameColor && /^#[0-9a-fA-F]{3,8}$/.test(d.nameColor))
  ? d.nameColor
  : d.textColor;

/* Letter-spacing on the name, clamped to 0-4 px; '' = none. */
const nameSpacingOf = d => {
  const n = Number(d.nameSpacing);
  return Number.isFinite(n) && n > 0 ? Math.min(4, n) : 0;
};

/* ── design-state keys with defaults ──────────────────────────────────── */

/* Density presets. 'regular' reproduces the pre-density hardcoded values
   exactly; 'airy' ≈ ×1.4, 'compact' ≈ ×0.55, rounded to integers. */
const DENSITY = {
  airy:    { cellPad: 22, rowGap: 14, socialGap: 10, dividerMargin: 17 },
  regular: { cellPad: 16, rowGap: 10, socialGap: 7,  dividerMargin: 12 },
  compact: { cellPad: 9,  rowGap: 6,  socialGap: 4,  dividerMargin: 7 },
};

/* Fine-tuning overrides: empty = follow the density preset, so default
   output stays byte-identical. Numbers are clamped to safe ranges. */
const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const overrideOr = (v, base, lo, hi) => (String(v ?? '').trim() === '' ? base : clampNum(v, lo, hi, base));

const densityOf = d => {
  const base = DENSITY[d.density] || DENSITY.regular;
  return {
    cellPad: overrideOr(d.cellPad, base.cellPad, 0, 48),
    rowGap: overrideOr(d.rowGap, base.rowGap, 0, 40),
    socialGap: overrideOr(d.socialGap, base.socialGap, 0, 24),
    dividerMargin: base.dividerMargin,
  };
};

/* Line-height multiplier (1.0-2.0); default 1.5 reproduces today. */
const lineHeightOf = d => overrideOr(d.lineHeight, 1.5, 1, 2);

/* Socials placement: 'bottom' (default, legacy), 'underName' (right after
   the identity block), 'inContact' (inside the contact stack). */
const socialsPos = d => d.socialsPosition || 'bottom';

/* Extra px on the name font size, on top of the per-layout baseline offset
   (+2 big / −2 small). Default 3 reproduces the classic +5/+1 today. */
const nameExtraOf = d => {
  const n = Number(d.nameSizeExtra);
  return Number.isFinite(n) ? n : 3;
};

/* Name font weight. Default 'bold' reproduces today's output byte-for-byte. */
const nameWeightOf = d => d.nameWeight || 'bold';

/* Signature canvas width (px) for the inner table. Clamp user values to
   400–600; empty/invalid falls back to the classic 600. */
const widthOf = d => {
  const raw = String(d.signatureWidth ?? '').trim();
  if (raw === '') return 600;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(600, Math.max(400, n)) : 600;
};

/* Social chip size (px). Default 22 reproduces today's output byte-for-byte;
   user values are clamped to 16–28, empty/invalid falls back to 22. */
const socialSizeOf = d => {
  const raw = String(d.socialSize ?? '').trim();
  if (raw === '') return 22;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(28, Math.max(16, n)) : 22;
};

/* Photo shape for side/top logos: 'square' (default), 'rounded' or 'circle'.
   roundPhoto (legacy) still maps to 'circle' when photoShape is unset.
   (Named photoShapeOfDesign: app.js owns photoShapeOf(s) at global scope.) */
const photoShapeOfDesign = d => d.photoShape || (d.roundPhoto ? 'circle' : 'square');

/* ── small pieces ─────────────────────────────────────────────────────── */

function imgTag(url, width, alt, extra = '') {
  return `<img src="${esc(url)}" width="${width}" alt="${esc(alt)}" ` +
    `style="display:block;width:${width}px;max-width:${width}px;height:auto;border:0;${extra}">`;
}

function dmCls(d, kind) {
  return d.darkModeFriendly ? ` class="dm-${kind}"` : '';
}

function nameHtml(s, d, { big = true, size = 0 } = {}) {
  const shown = s.profile.displayName || s.profile.name;
  if (!shown) return '';
  const honorificPrefix = String(s.profile.honorificPrefix || '').trim();
  const honorificSuffix = String(s.profile.honorificSuffix || '').trim();
  const shownWithHonorifics = (honorificPrefix ? honorificPrefix + ' ' : '') + shown +
    (honorificSuffix ? ', ' + honorificSuffix : '');
  const extra = nameExtraOf(d);
  const fs = size || (big ? d.fontSize + 2 + extra : d.fontSize - 2 + extra);
  const spacing = nameSpacingOf(d);
  const style = textStyle(d, {
    size: fs,
    weight: nameWeightOf(d),
    color: d.nameColor ? nameColorOf(d) : undefined,
    letterSpacing: spacing || undefined,
  });
  const pronouns = s.profile.pronouns
    ? ` <span${dmCls(d, 'mut')} style="${textStyle(d, { size: fs - 3, color: mutedColor(d) })}">(${esc(s.profile.pronouns)})</span>`
    : '';
  return `<span${dmCls(d, 'txt')} style="${style}">${esc(shownWithHonorifics)}</span>${pronouns}<br>`;
}

/* Personal context line: location · languages, muted under the title. */
function contextLineHtml(s, d) {
  if (d.showLocation === false) return '';
  const bits = [s.profile.location, s.profile.languages].filter(Boolean);
  if (!bits.length) return '';
  return `<span${dmCls(d, 'mut')} style="${textStyle(d, { size: d.fontSize - 1, color: mutedColor(d) })}">${esc(bits.join('  ·  '))}</span><br>`;
}

/* Strict mode: Word-engine Outlook ignores border-radius entirely, so
   strictOutlook strips every radius from the output — preview and export
   then show exactly what Outlook desktop renders. */
function br(d, v) {
  return d.strictOutlook ? '' : `border-radius:${v};`;
}

/* Availability / status badge (e.g. "Open to freelance work"). */
function statusHtml(s, d) {
  if (d.showStatus === false) return '';
  const text = String(s.design.statusText || '').trim();
  if (!text) return '';
  return `<span style="display:inline-block;background-color:${s.design.statusColor || '#2f9e44'};color:#ffffff;` +
    `${br(d, '10px')}padding:1px 9px;font-family:${stackOf(d)};font-size:${d.fontSize - 3}px;` +
    `line-height:1.7;font-weight:bold;">${esc(text)}</span>`;
}

/* Booking link chip (Calendly & friends) — accent-coloured, tappable. */
function bookingHtml(s, d) {
  if (d.showBooking === false) return '';
  const raw = String(s.contact.booking || '').trim();
  if (!raw) return '';
  const href = normalizeUrl('custom', raw);
  const label = String(s.contact.bookingLabel || '').trim() || 'Book a call';
  return `<a href="${esc(href)}" style="display:inline-block;background-color:${d.primaryColor};color:#ffffff;` +
    `${br(d, '12px')}padding:2px 13px;font-family:${stackOf(d)};font-size:${d.fontSize - 2}px;` +
    `line-height:1.8;text-decoration:none;font-weight:bold;">${esc(label)}</a>`;
}

function titleHtml(s, d) {
  const bits = [
    d.showTitle !== false ? s.profile.title : '',
    d.showDepartment !== false ? s.profile.department : '',
  ].filter(Boolean);
  if (!bits.length) return '';
  const style = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  return `<span${dmCls(d, 'mut')} style="${style}">${esc(bits.join('  ·  '))}</span><br>`;
}

function companyHtml(s, d) {
  if (d.showCompany === false || !s.profile.company) return '';
  const style = textStyle(d, { size: d.fontSize, color: linkColorOf(d), weight: 'bold' });
  if (s.contact.website && d.showWebsite !== false) {
    const href = normalizeUrl('custom', s.contact.website);
    return `<a href="${esc(href)}" style="${style};text-decoration:none;">${esc(s.profile.company)}</a><br>`;
  }
  return `<span style="${style}">${esc(s.profile.company)}</span><br>`;
}

/* Company tagline: muted line under the company name. Subordinate to the
   company — hidden when the company is hidden (or the tagline unset). */
function taglineHtml(s, d) {
  if (d.showCompany === false) return '';
  const tag = String(s.profile.tagline || '').trim();
  if (!tag) return '';
  const weight = d.taglineWeight === 'bold' ? 'bold' : undefined;
  return `<span${dmCls(d, 'mut')} style="${textStyle(d, { size: d.fontSize - 1, color: mutedColor(d), weight })}">${esc(tag)}</span><br>`;
}

function contactItems(s, d = {}) {
  const items = [];
  const c = s.contact;
  if (c.email && d.showEmail !== false) items.push({ key: 'email', label: c.emailLabel || 'Email', text: c.email, href: 'mailto:' + c.email });
  if (c.email2 && d.showEmail !== false) items.push({ key: 'email2', label: c.email2Label || 'Email 2', text: c.email2, href: 'mailto:' + c.email2 });
  if (c.phone && d.showPhone !== false) items.push({ key: 'phone', label: c.phoneLabel || 'Phone', text: c.phone, href: 'tel:' + c.phone.replace(/[^\d+]/g, '') });
  if (c.mobile && d.showMobile !== false) items.push({ key: 'mobile', label: c.mobileLabel || 'Mobile', text: c.mobile, href: 'tel:' + c.mobile.replace(/[^\d+]/g, '') });
  if (c.website && d.showWebsite !== false) items.push({ key: 'website', label: c.websiteLabel || 'Web', text: c.websiteLabel || c.website, href: normalizeUrl('custom', c.website) });
  if (c.portfolio) items.push({ key: 'portfolio', label: c.portfolioLabel || 'Portfolio', text: c.portfolioLabel || c.portfolio, href: normalizeUrl('custom', c.portfolio) });
  if (c.pgpKey) {
    const pgp = String(c.pgpKey).trim();
    if (pgp) {
      const isUrl = /^http/i.test(pgp);
      const item = { key: 'pgp', label: 'PGP', text: isUrl ? 'Public key' : (pgp.length > 24 ? pgp.slice(0, 24) + '…' : pgp) };
      if (isUrl) item.href = pgp;
      items.push(item);
    }
  }
  if (c.address && d.showAddress !== false) items.push({ key: 'address', label: c.addressLabel ? (c.addressLabel || 'Address') : '', text: c.address, multiline: true });
  for (const line of s.customLines) {
    if (line.value) items.push({ key: 'custom', label: line.label, text: line.value });
  }
  return items;
}

function contactLineHtml(d, item, { labels = true } = {}) {
  const style = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  const cls = dmCls(d, 'mut');
  let inner;
  if (item.multiline) {
    inner = item.text.split(/\r?\n/).map(l => esc(l)).join('<br>');
  } else if (item.href) {
    inner = `<a href="${esc(item.href)}" style="${style};text-decoration:none;">${esc(item.text)}</a>`;
  } else {
    inner = esc(item.text);
  }
  const label = labels && item.label
    ? `<span${cls} style="${style};font-weight:bold;">${esc(item.label)}: </span>` : '';
  return `<span${cls} style="${style};">${label}${inner}</span>`;
}

function contactStackHtml(s, d, opts = {}) {
  const items = contactItems(s, d);
  if (!items.length) return '';
  const labels = opts.labels !== undefined ? opts.labels : d.showLabels !== false;
  let stack = items.map(it => contactLineHtml(d, it, { labels })).join('<br>');
  if (socialsPos(d) === 'inContact') {
    const socials = socialsRowHtml(s, d);
    if (socials) stack += `<br>${socials}`;
  }
  return stack;
}

function contactInlineHtml(s, d, { labels = false } = {}) {
  const items = contactItems(s, d);
  if (!items.length) return '';
  return items.map(it => contactLineHtml(d, it, { labels }))
    .join(`<span style="font-size:${d.fontSize}px;color:${mutedColor(d)};">&nbsp;·&nbsp;</span>`);
}

function socialChipHtml(d, soc, withLabel, size = 22) {
  const net = networkById(soc.network);
  const isCustom = net.id === 'custom';
  const glyph = isCustom ? (soc.glyph || '↗') : net.glyph;
  const color = isCustom ? (soc.color || '#5b6472') : net.color;
  const raw = String(soc.url || '').trim();
  if (!raw) return '';
  const href = normalizeUrl(net.id, raw);
  const iconUrl = String(soc.iconUrl || '').trim();
  const chip = iconUrl
    ? `<img src="${esc(imgSrcOf(d, `social-${net.id}`, iconUrl))}" width="${size}" height="${size}" alt="${esc(net.name)}" style="display:inline-block;width:${size}px;height:${size}px;border:0;${br(d, '11px')}vertical-align:middle;">`
    : `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;` +
      `background-color:${color};color:#ffffff;${br(d, '11px')}` +
      `font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;vertical-align:middle;">${esc(glyph)}</span>`;
  if (!withLabel) return `<a href="${esc(href)}" style="text-decoration:none;">${chip}</a>`;
  const clsAttr = d.darkModeFriendly ? ' class="dm-txt"' : '';
  const label = `<span${clsAttr} style="display:inline-block;vertical-align:middle;` +
    `font-family:${stackOf(d)};font-size:${d.fontSize - 2}px;color:${d.textColor};padding-left:5px;">${esc(net.name)}</span>`;
  return `<a href="${esc(href)}" style="text-decoration:none;">${chip}${label}</a>`;
}

/* Chips in a nested table row — reliable in every client. */
function socialsRowHtml(s, d) {
  if (d.showSocials === false) return '';
  const socials = s.socials.filter(x => String(x.url || '').trim());
  if (!socials.length) return '';
  const style = d.socialStyle;

  if (style === 'labels') {
    const parts = socials.map(soc => {
      const net = networkById(soc.network);
      const color = net.id === 'custom' ? (soc.color || '#5b6472') : net.color;
      return `<a href="${esc(normalizeUrl(net.id, soc.url))}" style="font-family:${stackOf(d)};` +
        `font-size:${d.fontSize - 2}px;color:${color};text-decoration:none;">${esc(net.name)}</a>`;
    });
    const sep = `<span style="font-size:${d.fontSize - 2}px;color:${mutedColor(d)};">&nbsp;·&nbsp;</span>`;
    return parts.join(sep);
  }

  const withLabel = style === 'icons_labels';
  const gap = densityOf(d).socialGap;
  const cells = socials.map(soc =>
    `<td style="padding:0 ${gap}px ${gap}px 0;vertical-align:middle;">${socialChipHtml(d, soc, withLabel, socialSizeOf(d))}</td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>${cells}</tr></table>`;
}

/* Divider rule. opts.short (dividerLength 'short', classic/centered/banner)
   replaces the full-width rule with a 60px nested-table rule; opts.center
   centres it via align on the outer td. Defaults reproduce the original
   full-width output byte-for-byte. */
function dividerHtml(d, cols = 2, opts = {}) {
  if (!d.showDivider) return '';
  const margin = densityOf(d).dividerMargin;
  const cls = d.darkModeFriendly ? ' class="dm-div"' : '';
  const border = `border-top:1px ${d.dividerStyle || 'solid'} ${d.dividerColor}`;
  if (opts.short) {
    const align = opts.center ? ' align="center"' : '';
    return `<tr><td colspan="${cols}"${align}><table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td${cls} style="${border};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr></table></td></tr>` +
      `<tr><td colspan="${cols}" height="${margin}" style="height:${margin}px;line-height:${margin}px;font-size:0;">&nbsp;</td></tr>`;
  }
  return `<tr><td colspan="${cols}"${cls} style="${border};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>` +
    `<tr><td colspan="${cols}" height="${margin}" style="height:${margin}px;line-height:${margin}px;font-size:0;">&nbsp;</td></tr>`;
}

function legalHtml(s, d, cols = 2) {
  if (!d.showLegal || !String(d.legalText || '').trim()) return '';
  const style = textStyle(d, { size: 10, color: mutedColor(d) });
  return `<tr><td colspan="${cols}" style="padding-top:6px;">` +
    `<span${dmCls(d, 'mut')} style="${style}">${esc(d.legalText)}</span></td></tr>`;
}

function spacerHtml(h, cols = 2) {
  return `<tr><td colspan="${cols}" height="${h}" style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
}

/* Initials monogram: a coloured circle with the person's initials — a
   professional avatar that needs no image file. Outlook shows a square,
   which is acceptable. */
function monogramHtml(s, d) {
  const shown = String(s.profile.displayName || s.profile.name || '').trim();
  const initials = shown.split(/\s+/)
    .map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (!initials) return '';
  const size = d.logoWidth;
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;` +
    `background-color:${d.primaryColor};color:#ffffff;${br(d, '50%')}` +
    `font-family:Arial,Helvetica,sans-serif;font-size:${Math.round(size * 0.38)}px;font-weight:bold;">${esc(initials)}</span>`;
}

/* Logo cell content: hosted logo, or the initials monogram when enabled.
   photoShape gives the side logo a square (default), rounded or circular
   crop; the legacy roundPhoto flag maps to 'circle'. */
function logoCellHtml(s, d) {
  if (d.logoUrl) {
    const shape = photoShapeOfDesign(d);
    const radius = shape === 'circle' ? br(d, '50%') : shape === 'rounded' ? br(d, '10px') : '';
    return imgTag(imgSrcOf(d, 'logo', d.logoUrl), d.logoWidth, String(s.design.logoAlt || 'logo'), radius);
  }
  if (d.useMonogram) return monogramHtml(s, d);
  return '';
}

/* ── inline QR (Classic + Enterprise) ────────────────────────────────── */

/* Inline vCard QR as an Outlook-safe table of 1×1 cells — no canvas, no
   data URI, no <img>, so it survives every email client and node/vm
   rendering. Uses the same qrcode.js matrix API as the QR modal (the
   parent's doShowQR); any failure (missing generator/vCard builder, code
   length overflow) quietly renders nothing so the signature itself is
   never broken. */
function qrTableHtml(s, d) {
  if (!d.showQr) return '';
  if (typeof buildVCard !== 'function' || typeof qrcode !== 'function') return '';
  const raw = String(d.qrSize ?? '').trim();
  const target = (() => {
    if (raw === '') return 60;
    const num = Number(raw);
    return Number.isFinite(num) ? Math.min(96, Math.max(32, num)) : 60;
  })();
  /* The matrix + cell table are pure functions of (vCard, size): cache the
     built table so keystrokes never re-encode an 11k-cell grid. */
  const vcard = buildVCard(s);
  const key = `${vcard}|${target}`;
  const cached = qrTableCache.get(key);
  if (cached) return cached;
  let qr;
  try {
    qr = qrcode(0, 'M');
    qr.addData(vcard);
    qr.make();
  } catch (e) {
    return '';
  }
  const n = qr.getModuleCount();
  if (!n) return '';
  const c = Math.max(1, Math.round(target / n));
  const width = n * c;
  const rows = [];
  for (let r = 0; r < n; r++) {
    const cells = [];
    for (let col = 0; col < n; col++) {
      const dark = qr.isDark(r, col);
      cells.push(`<td width="${c}" height="${c}" style="background-color:${dark ? '#000000' : '#ffffff'};font-size:0;line-height:0;">&nbsp;</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  const table = `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('')}</table>`;
  const out = spacerHtml(8) + '\n' + `<tr><td colspan="2" align="left">${table}</td></tr>`;
  if (qrTableCache.size >= 3) qrTableCache.delete(qrTableCache.keys().next().value);
  qrTableCache.set(key, out);
  return out;
}

const qrTableCache = new Map();

/* ── layouts ──────────────────────────────────────────────────────────── */

function classicRows(s, d, { center = false, qr = true } = {}) {
  const rows = [];
  const align = center ? 'center' : 'left';
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const logoCell = logoContent
    ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${align}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
    : '';
  const identityCell = `<td class="m-cell" valign="middle" align="${align}">
      ${nameHtml(s, d)}${titleHtml(s, d)}${companyHtml(s, d)}${taglineHtml(s, d)}${contextLineHtml(s, d)}${statusHtml(s, d)}
    </td>`;

  rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);

  const socials = socialsRowHtml(s, d);
  const emitSocials = (alignVal) => {
    if (!socials) return;
    const nested = center
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
      : socials;
    rows.push(`<tr><td colspan="2" align="${alignVal}">${nested}</td></tr>`);
    rows.push(spacerHtml(4));
  };
  if (socialsPos(d) === 'underName') emitSocials(center ? 'center' : 'left');

  const stack = contactStackHtml(s, d);
  /* Divider sits under the name by default; 'belowContact' moves it after
     the contact stack (right before booking/socials). The short/full length
     and centring come from the layout's divider options. */
  const divider = dividerHtml(d, 2, { short: d.dividerLength === 'short', center });
  const dividerBelowContact = d.dividerPosition === 'belowContact' && stack;
  if (!dividerBelowContact) rows.push(divider);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="${align}">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  if (dividerBelowContact) rows.push(divider);
  /* Inline vCard QR — after the contact stack, before booking/socials.
     Disabled by callers that reuse these rows for another layout. */
  const qrRows = qr ? qrTableHtml(s, d) : '';
  if (qrRows) rows.push(qrRows);
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="${align}">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) === 'bottom') emitSocials(center ? 'center' : 'left');
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

function compactRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const logoCell = logoContent
    ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${right ? 'right' : 'left'}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
    : '';

  const contact = contactItems(s, d)
    .filter(it => ['email', 'email2', 'phone', 'mobile', 'website'].includes(it.key))
    .map(it => contactLineHtml(d, it, { labels: false }))
    .join('<br>');

  const socials = socialsRowHtml(s, d);
  const pos = socialsPos(d);

  const identityCell = `<td class="m-cell" valign="middle" align="left">
      ${nameHtml(s, d, { big: false })}${titleHtml(s, d)}${taglineHtml(s, d)}${contextLineHtml(s, d)}${statusHtml(s, d)}${pos === 'underName' && socials ? `<br>${socials}` : ''}
    </td>`;
  const contactInner = pos === 'inContact' && socials ? `${contact}<br>${socials}` : contact;
  const contactCell = `<td class="m-cell" valign="middle" align="right" style="padding-left:24px;">${contactInner || '&nbsp;'}</td>`;

  rows.push(`<tr>${right ? identityCell + contactCell + logoCell : logoCell + identityCell + contactCell}</tr>`);

  if (pos === 'bottom' && socials) {
    rows.push(spacerHtml(8, 3));
    rows.push(`<tr><td colspan="3" align="left">${socials}</td></tr>`);
  }
  rows.push(legalHtml(s, d, 3));
  return rows.join('\n');
}

function minimalRows(s, d) {
  const rows = [];
  const first = [nameHtml(s, d, { big: true }), titleHtml(s, d), companyHtml(s, d), taglineHtml(s, d), contextLineHtml(s, d), statusHtml(s, d)].join('');
  rows.push(`<tr><td colspan="2" align="left">${first}</td></tr>`);
  const socials = socialsRowHtml(s, d);
  if (socialsPos(d) === 'underName' && socials) {
    rows.push(spacerHtml(6));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  const stack = contactStackHtml(s, d, { labels: false });
  if (stack) {
    rows.push(spacerHtml(6));
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
  }
  if (socialsPos(d) === 'bottom' && socials) {
    rows.push(spacerHtml(6));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Clickable banner: wrap the banner image in a link when design.bannerLink
   is set. Same normalizeUrl + esc pipeline as every other link, plus a
   scheme guard — only http(s)/mailto/tel hrefs are emitted, so a hostile
   javascript:/data:/vbscript: value can never become a clickable href
   (the banner simply renders unlinked). Empty bannerLink → byte-identical
   output, no wrapper. */
function bannerImgHtml(s, d) {
  const img = imgTag(imgSrcOf(d, 'banner', d.bannerUrl), 600, String(s.design.bannerAlt || 'banner'));
  const raw = String(d.bannerLink || '').trim();
  if (!raw) return img;
  const href = normalizeUrl('custom', raw);
  if (!/^(https?:|mailto:|tel:)/i.test(href)) return img;
  return `<a href="${esc(href)}" style="text-decoration:none;display:block;">${img}</a>`;
}

function bannerRows(s, d) {
  const rows = [];
  if (d.bannerUrl) {
    rows.push(`<tr><td colspan="2" align="center">${bannerImgHtml(s, d)}</td></tr>`);
    rows.push(spacerHtml(16));
  }
  rows.push(classicRows(s, d, { qr: false }));
  return rows.join('\n');
}

/* Split: logo + identity left, contact details in a bordered card. */
function splitRows(s, d) {
  const rows = [];
  if (d.bannerUrl) {
    rows.push(`<tr><td colspan="2" align="center">${bannerImgHtml(s, d)}</td></tr>`);
    rows.push(spacerHtml(16));
  }
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const den = densityOf(d);
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + taglineHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (logoContent || identity) {
    const logoCell = logoContent
      ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${right ? 'right' : 'left'}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
      : '<td width="16" style="padding:0;font-size:0;line-height:0;">&nbsp;</td>';
    const identityCell = `<td class="m-cell" valign="middle" align="left">${identity || '&nbsp;'}</td>`;
    rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);
  }
  const socials = socialsRowHtml(s, d);
  if (socialsPos(d) === 'underName' && socials) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left" class="m-cell" style="background-color:#f6f8fa;border:1px solid ${d.dividerColor};padding:${den.rowGap}px ${den.cellPad - 2}px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding:0;">${stack}</td></tr></table>
    </td></tr>`);
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${booking}</td></tr>`);
  }
  if (socialsPos(d) === 'bottom' && socials) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  rows.push(dividerHtml(d));
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Roundel: circular logo (or initials monogram), everything centred. */
function roundelRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  if (logoContent) {
    const circle = d.logoUrl
      ? `<img src="${esc(imgSrcOf(d, 'logo', d.logoUrl))}" width="${d.logoWidth}" alt="${esc(String(s.design.logoAlt || 'logo'))}" ` +
        `style="display:block;width:${d.logoWidth}px;max-width:${d.logoWidth}px;height:auto;border:0;${br(d, '50%')}">`
      : monogramHtml(s, d);
    rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 ${den.dividerMargin}px 0;">${circle}</td></tr>`);
  }
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + taglineHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
  }
  const socials = socialsRowHtml(s, d);
  const socialsNested = socials
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
    : '';
  if (socialsPos(d) === 'underName' && socialsNested) {
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(dividerHtml(d));
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="center">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="center">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) !== 'underName' && socialsNested) {
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Masthead: company name in a coloured brand band up top. */
function mastheadRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const bandVisible = s.profile.company && d.showCompany !== false;
  if (bandVisible) {
    const bandStyle = textStyle(d, { size: d.fontSize + 6, color: '#ffffff', weight: 'bold' });
    const bits = [
      d.showTitle !== false ? s.profile.title : '',
      d.showDepartment !== false ? s.profile.department : '',
    ].filter(Boolean);
    const sub = bits.length
      ? `<span style="${textStyle(d, { size: d.fontSize, color: '#ffffff' })}">${esc(bits.join('  ·  '))}</span>`
      : '';
    rows.push(`<tr><td colspan="2" style="background-color:${d.primaryColor};padding:${den.dividerMargin}px ${den.cellPad}px;">` +
      `<span style="${bandStyle}">${esc(s.profile.company)}</span>` +
      (sub ? `<br>${sub}` : '') +
      `</td></tr>`);
    rows.push(spacerHtml(den.dividerMargin));
  }
  if (s.profile.displayName || s.profile.name) {
    /* Without the band (no company, or company hidden), keep title/department visible. */
    const rest = bandVisible ? '' : titleHtml(s, d) + companyHtml(s, d) + taglineHtml(s, d);
    rows.push(`<tr><td colspan="2" align="left">${nameHtml(s, d)}${rest}${contextLineHtml(s, d)}${statusHtml(s, d)}</td></tr>`);
    rows.push(spacerHtml(6));
  }
  const socials = socialsRowHtml(s, d);
  if (socialsPos(d) === 'underName' && socials) {
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="left">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) !== 'underName' && socials) {
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(dividerHtml(d));
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Monogram: initials avatar, centred — a complete signature with no images. */
function monogramRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  if (s.profile.displayName || s.profile.name) {
    rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 ${den.dividerMargin}px 0;">${monogramHtml(s, d)}</td></tr>`);
  }
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + taglineHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
  }
  const socials = socialsRowHtml(s, d);
  const socialsNested = socials
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
    : '';
  if (socialsPos(d) === 'underName' && socialsNested) {
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(dividerHtml(d));
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="center">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="center">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) !== 'underName' && socialsNested) {
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Photo card: portrait photo (or monogram) left, big name, everything else
   stacked — the personal-profile signature. */
function photocardRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  const identity = nameHtml(s, d, { size: d.fontSize + 4 + nameExtraOf(d) }) + titleHtml(s, d) +
    companyHtml(s, d) + taglineHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (logoContent || identity) {
    const logoCell = logoContent
      ? `<td class="m-cell" width="${d.logoWidth + 20}" valign="top" align="left" style="padding:2px 20px 0 0;">${logoContent}</td>`
      : '';
    rows.push(`<tr>${logoCell}<td class="m-cell" valign="top" align="left">${identity || '&nbsp;'}</td></tr>`);
  }
  const socials = socialsRowHtml(s, d);
  if (socialsPos(d) === 'underName' && socials) {
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(dividerHtml(d));
  const stack = contactStackHtml(s, d, { labels: false });
  if (stack) {
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="left">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) !== 'underName' && socials) {
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Postcard: a friendly bordered card with a 6px accent strip up top —
   casual, warm, everything centred inside the card. */
function postcardRows(s, d) {
  const rows = [];
  const den = densityOf(d);

  const strip = `<tr><td colspan="2" height="6" style="height:6px;line-height:6px;font-size:0;background-color:${d.primaryColor};"></td></tr>`;

  const logo = logoCellHtml(s, d);
  const logoBlock = logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td align="center" style="padding:0 0 ${den.rowGap}px 0;">${logo}</td></tr></table>`
    : '';
  const identity = [nameHtml(s, d), titleHtml(s, d), companyHtml(s, d), taglineHtml(s, d),
    contextLineHtml(s, d), statusHtml(s, d)].join('').replace(/<br>$/, '');
  const stack = contactStackHtml(s, d, { labels: false });
  const socials = socialsRowHtml(s, d);
  const socialsBlock = socials
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
    : '';

  const inner = (socialsPos(d) === 'underName'
    ? [logoBlock, identity, socialsBlock, stack]
    : [logoBlock, identity, stack, socialsBlock]).filter(x => x !== '').join('<br>');

  rows.push(`<tr><td colspan="2" style="border:1px solid ${d.dividerColor};${br(d, '10px')}background-color:#ffffff;padding:0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    strip +
    `<tr><td colspan="2" align="center" style="padding:${den.cellPad}px;">${inner || '&nbsp;'}</td></tr>` +
    `</table></td></tr>`);
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Line: one casual line — name, a few muted details, tiny 18px socials. */
function lineRows(s, d) {
  const rows = [];
  const muted = mutedColor(d);
  const sep = `<span style="font-size:${d.fontSize}px;color:${muted};">&nbsp;·&nbsp;</span>`;
  const parts = [];

  const name = nameHtml(s, d, { big: false }).replace(/<br>$/, '');
  if (name) parts.push(name);

  if (d.showTitle !== false) {
    const bits = [
      s.profile.title,
      d.showDepartment !== false ? s.profile.department : '',
    ].filter(Boolean);
    if (bits.length) {
      parts.push(`<span${dmCls(d, 'mut')} style="${textStyle(d, { color: muted })}">${esc(bits.join('  ·  '))}</span>`);
    }
  }

  if (d.showLocation !== false) {
    const loc = [s.profile.location, s.profile.languages].filter(Boolean).join('  ·  ');
    if (loc) {
      parts.push(`<span${dmCls(d, 'mut')} style="${textStyle(d, { color: muted })}">${esc(loc)}</span>`);
    }
  }

  if (s.contact.website && d.showWebsite !== false) {
    const href = normalizeUrl('custom', s.contact.website);
    const label = String(s.contact.websiteLabel || '').trim() || s.contact.website;
    parts.push(`<a href="${esc(href)}"${dmCls(d, 'mut')} style="${textStyle(d, { color: muted })};text-decoration:none;">${esc(label)}</a>`);
  }

  let lineSocials = '';
  if (d.showSocials !== false) {
    const socials = s.socials.filter(x => String(x.url || '').trim());
    if (socials.length) {
      const chips = socials.map(soc => socialChipHtml(d, soc, false, 18)).join('&nbsp;');
      if (socialsPos(d) === 'underName') lineSocials = chips;
      else parts.push(chips);
    }
  }
  if (parts.length) {
    rows.push(`<tr><td colspan="2" align="left">${parts.join(sep)}</td></tr>`);
  }
  if (lineSocials) {
    rows.push(`<tr><td colspan="2" align="left">${lineSocials}</td></tr>`);
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Duotone: white-on-accent identity panel left (220px), plain white contact
   column right. */
function duotoneRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const light = mixColors(d.primaryColor, '#ffffff', 0.25);

  const logoContent = logoCellHtml(s, d);
  const shown = String(s.profile.displayName || s.profile.name || '').trim();
  const duotonePrefix = String(s.profile.honorificPrefix || '').trim();
  const duotoneSuffix = String(s.profile.honorificSuffix || '').trim();
  const duotoneShown = (duotonePrefix ? duotonePrefix + ' ' : '') + shown +
    (duotoneSuffix ? ', ' + duotoneSuffix : '');

  const leftParts = [];
  if (logoContent) {
    leftParts.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td align="center" style="padding:0 0 ${den.rowGap}px 0;">${logoContent}</td></tr></table>`);
  }
  if (shown) {
    leftParts.push(`<span style="${textStyle(d, { size: d.fontSize + nameExtraOf(d), color: '#ffffff', weight: nameWeightOf(d) })}">${esc(duotoneShown)}</span><br>`);
  }
  if (d.showTitle !== false) {
    const bits = [
      s.profile.title,
      d.showDepartment !== false ? s.profile.department : '',
    ].filter(Boolean);
    if (bits.length) {
      leftParts.push(`<span style="${textStyle(d, { size: d.fontSize, color: light })}">${esc(bits.join('  ·  '))}</span><br>`);
    }
  }
  if (d.showCompany !== false && s.profile.company) {
    leftParts.push(`<span style="${textStyle(d, { size: d.fontSize, color: light, weight: 'bold' })}">${esc(s.profile.company)}</span><br>`);
  }
  leftParts.push(taglineHtml(s, d));
  if (d.showLocation !== false) {
    const loc = [s.profile.location, s.profile.languages].filter(Boolean).join('  ·  ');
    if (loc) {
      leftParts.push(`<span style="${textStyle(d, { size: d.fontSize - 1, color: light })}">${esc(loc)}</span><br>`);
    }
  }

  const stack = contactStackHtml(s, d);
  const socials = socialsPos(d) === 'inContact' ? '' : socialsRowHtml(s, d);
  const booking = bookingHtml(s, d);
  const underNameSocials = socialsPos(d) === 'underName' && socials ? `<br>${socials}` : '';
  const rightInner = [stack, socialsPos(d) === 'underName' ? '' : socials, booking].filter(x => x !== '').join('<br>');

  const leftInner = (leftParts.join('') || '&nbsp;') + underNameSocials;
  const leftCell = `<td class="m-cell" width="220" valign="middle" align="center" style="background-color:${d.primaryColor};padding:${den.cellPad}px;">${leftInner}</td>`;
  const rightCell = `<td class="m-cell" valign="middle" style="background-color:#ffffff;padding:${den.cellPad}px;">${rightInner || '&nbsp;'}</td>`;

  rows.push(`<tr>${leftCell}${rightCell}</tr>`);
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Quote: a favourite line above the identity — personal and warm. */
function quoteRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const quote = String(s.design.quoteText || '').trim();

  if (quote) {
    rows.push(`<tr><td colspan="2" align="center"><span style="${textStyle(d, { size: d.fontSize + 1, color: mutedColor(d), style: 'italic' })}">“${esc(quote)}”</span></td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }

  const logo = logoCellHtml(s, d);
  if (logo) {
    rows.push(`<tr><td colspan="2" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td align="center" style="padding:0 0 ${den.rowGap}px 0;">${logo}</td></tr></table></td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }

  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + taglineHtml(s, d) +
    contextLineHtml(s, d) + statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
  }

  const socials = socialsRowHtml(s, d);
  const socialsNested = socials
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
    : '';
  if (socialsPos(d) === 'underName' && socialsNested) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
  }

  const stack = contactStackHtml(s, d, { labels: false });
  if (stack) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${stack}</td></tr>`);
  }

  if (socialsPos(d) !== 'underName' && socialsNested) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
  }

  rows.push(spacerHtml(den.rowGap));
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* ── enterprise ───────────────────────────────────────────────────────── */

/* Secondary affiliation line (team / initiative): a muted line right after
   the title, same style as the personal context line. */
function teamHtml(s, d) {
  if (d.showTeam === false) return '';
  const team = String(s.profile.team || '').trim();
  if (!team) return '';
  return `<span${dmCls(d, 'mut')} style="${textStyle(d, { size: d.fontSize - 1, color: mutedColor(d) })}">${esc(team)}</span><br>`;
}

/* Support chat chip: mirrors bookingHtml's accent chip, labelled with the
   button label and linking the chat URL. */
function supportCtaHtml(s, d) {
  const raw = String(d.supportChatUrl || '').trim();
  if (!raw) return '';
  const label = String(d.supportButtonLabel || '').trim();
  if (!label) return '';
  const href = normalizeUrl('custom', raw);
  return `<a href="${esc(href)}" style="display:inline-block;background-color:${d.primaryColor};color:#ffffff;` +
    `${br(d, '12px')}padding:2px 13px;font-family:${stackOf(d)};font-size:${d.fontSize - 2}px;` +
    `line-height:1.8;text-decoration:none;font-weight:bold;">${esc(label)}</a>`;
}

/* Support module: title, chat link + CTA chip, tagline, phone numbers and
   alternative instructions. Rendered inside the bordered box row. */
function supportBoxHtml(s, d) {
  const title = String(d.supportTitle || '').trim();
  const chatUrl = String(d.supportChatUrl || '').trim();
  const phoneLocal = String(d.supportPhoneLocal || '').trim();
  const phoneIntl = String(d.supportPhoneIntl || '').trim();
  const altText = String(d.supportAltText || '').trim();
  if (!title && !chatUrl && !phoneLocal && !phoneIntl && !altText) return '';
  const muted = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  /* Deliberately NO dm-* classes inside the box: the box keeps its light
     #f2f4f7 tint in dark clients, so dm text classes (white !important)
     would render the title white-on-white. Inline colours stay dark and
     readable on the light surface. */
  const parts = [];
  if (title) {
    parts.push(`<span style="${textStyle(d, { size: d.fontSize + 1, weight: 'bold' })}">${esc(title)}</span><br>`);
  }
  if (chatUrl) {
    const href = normalizeUrl('custom', chatUrl);
    const chat = [];
    const chatLabel = String(d.supportChatLabel || '').trim();
    if (chatLabel) chat.push(`<a href="${esc(href)}" style="${muted};text-decoration:none;">${esc(chatLabel)}</a>`);
    chat.push(supportCtaHtml(s, d));
    const line = chat.filter(Boolean).join('&nbsp;&nbsp;');
    if (line) parts.push(`<span style="${muted};">${line}</span><br>`);
  }
  const tagline = String(d.supportTagline || '').trim();
  if (tagline) parts.push(`<span style="${muted};">${esc(tagline)}</span><br>`);
  if (phoneLocal) parts.push(`<span style="${muted};">Local: ${esc(phoneLocal)}</span><br>`);
  if (phoneIntl) parts.push(`<span style="${muted};">International: ${esc(phoneIntl)}</span><br>`);
  if (altText) parts.push(`<span style="${muted};">${esc(altText)}</span><br>`);
  return parts.join('');
}

/* Recognition line: intro sentence, then a muted link (contact-line link
   styling) labelled recogniseLabel or the URL itself. */
function recogniseLineHtml(s, d) {
  const text = String(d.recogniseText || '').trim();
  if (!text) return '';
  const style = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  const raw = String(d.recogniseUrl || '').trim();
  let link = '';
  if (raw) {
    const href = normalizeUrl('custom', raw);
    const label = String(d.recogniseLabel || '').trim() || raw;
    link = ` <a href="${esc(href)}" style="${style};text-decoration:none;">${esc(label)}</a>`;
  }
  return `<span${dmCls(d, 'mut')} style="${style};">${esc(text)}${link}</span><br>`;
}

/* Purpose statement: "Our purpose: " bold lead, statement muted after it. */
function purposeLineHtml(s, d) {
  const text = String(d.purposeText || '').trim();
  if (!text) return '';
  const style = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  const lead = textStyle(d, { size: d.fontSize, color: mutedColor(d), weight: 'bold' });
  return `<span${dmCls(d, 'mut')} style="${style};"><span style="${lead};">Our purpose: </span>${esc(text)}</span><br>`;
}

/* One slot of the three-slot brand footer: optional image (capped at 96px)
   above an optional small muted text line. */
function footerCellHtml(d, imgField, textField, align) {
  const img = String(d[imgField] || '').trim();
  const text = String(d[textField] || '').trim();
  let inner = '';
  if (img) {
    const keyMap = { footerLeftImg: 'footer-left', footerCenterImg: 'footer-center', footerRightImg: 'footer-right' };
    inner += imgTag(imgSrcOf(d, keyMap[imgField] || 'footer', img), 96, 'logo');
  }
  if (text) {
    if (inner) inner += '<br>';
    inner += `<span${dmCls(d, 'mut')} style="${textStyle(d, { size: d.fontSize - 2, color: mutedColor(d) })}">${esc(text)}</span>`;
  }
  return `<td width="33%" align="${align}" valign="top">${inner || '&nbsp;'}</td>`;
}

/* Brand footer: a three-cell row inside a full-width nested table (keeps the
   main two-column grid intact for Outlook). */
function footerRowHtml(s, d) {
  const fields = ['footerLeftImg', 'footerLeftText', 'footerCenterImg', 'footerCenterText',
    'footerRightImg', 'footerRightText'];
  if (!fields.some(f => String(d[f] || '').trim())) return '';
  const row = footerCellHtml(d, 'footerLeftImg', 'footerLeftText', 'left') +
    footerCellHtml(d, 'footerCenterImg', 'footerCenterText', 'center') +
    footerCellHtml(d, 'footerRightImg', 'footerRightText', 'right');
  return `<tr><td colspan="2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${row}</tr></table></td></tr>`;
}

/* Enterprise: identity, contact details, a support module, organisational
   statements (recognise / purpose / land acknowledgement) and a three-slot
   brand footer — the corporate-communications signature. Every section is
   omitted when its fields are empty. */
function enterpriseRows(s, d) {
  const rows = [];
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const logoCell = logoContent
    ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${right ? 'right' : 'left'}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
    : '';
  const identityCell = `<td class="m-cell" valign="middle" align="left">
      ${nameHtml(s, d)}${titleHtml(s, d)}${teamHtml(s, d)}${companyHtml(s, d)}${contextLineHtml(s, d)}${statusHtml(s, d)}
    </td>`;
  rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);

  const socials = socialsPos(d) === 'inContact' ? '' : socialsRowHtml(s, d);
  if (socialsPos(d) === 'underName' && socials) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }

  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
  }

  /* Inline vCard QR — right after the contact block. */
  const qrRows = qrTableHtml(s, d);
  if (qrRows) rows.push(qrRows);

  const support = supportBoxHtml(s, d);
  if (support) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" style="background-color:#f2f4f7;border:1px solid ${d.dividerColor};${br(d, '8px')}padding:${den.rowGap}px ${den.cellPad - 2}px;">${support}</td></tr>`);
  }

  const recognise = recogniseLineHtml(s, d);
  if (recognise) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${recognise}</td></tr>`);
  }

  const purpose = purposeLineHtml(s, d);
  if (purpose) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${purpose}</td></tr>`);
  }

  const acknowledgement = String(d.landAcknowledgement || '').trim();
  if (d.showAcknowledgement && acknowledgement) {
    rows.push(dividerHtml(d));
    rows.push(`<tr><td colspan="2" align="left"><span${dmCls(d, 'mut')} style="${textStyle(d, { size: d.fontSize - 2, color: mutedColor(d) })}">${esc(acknowledgement)}</span></td></tr>`);
  }

  if (socialsPos(d) !== 'underName' && socials) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }

  const footer = footerRowHtml(s, d);
  if (footer) {
    rows.push(dividerHtml(d));
    rows.push(footer);
  }

  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* ── Night & letterhead ───────────────────────────────────────────────── */

/* Night: dark panel, light text — a signature that stands out in any
   thread. Same structure as classicRows, with light-mode colours hardcoded
   in the text styles via a local lightStyle util (shared helpers keep the
   design palette, so nothing else changes). */
function nightRows(s, d) {
  const den = densityOf(d);
  const lightName = '#f2f4f8';
  const lightMuted = '#9aa1ad';
  const lightStyle = (size, color, { weight, style } = {}) => {
    const parts = [
      `font-family:${stackOf(d)}`,
      `font-size:${size}px`,
      `color:${color}`,
      `line-height:${Math.round(size * lineHeightOf(d))}px`,
      'mso-line-height-rule:exactly',
    ];
    if (weight) parts.push(`font-weight:${weight}`);
    if (style) parts.push(`font-style:${style}`);
    return parts.join(';');
  };

  const rows = [];
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const logoCell = logoContent
    ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${right ? 'right' : 'left'}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
    : '';

  /* Dedicated light-name span — same honour/pronoun handling as nameHtml. */
  let nameLine = '';
  const shown = s.profile.displayName || s.profile.name;
  if (shown) {
    const prefix = String(s.profile.honorificPrefix || '').trim();
    const suffix = String(s.profile.honorificSuffix || '').trim();
    const shownWithHonorifics = (prefix ? prefix + ' ' : '') + shown +
      (suffix ? ', ' + suffix : '');
    const fs = d.fontSize + 2 + nameExtraOf(d);
    const style = lightStyle(fs, lightName, { weight: nameWeightOf(d) });
    const pronouns = s.profile.pronouns
      ? ` <span style="${lightStyle(fs - 3, lightMuted)}">(${esc(s.profile.pronouns)})</span>`
      : '';
    nameLine = `<span style="${style}">${esc(shownWithHonorifics)}</span>${pronouns}<br>`;
  }

  const titleBits = [
    d.showTitle !== false ? s.profile.title : '',
    d.showDepartment !== false ? s.profile.department : '',
  ].filter(Boolean);
  const titleLine = titleBits.length
    ? `<span style="${lightStyle(d.fontSize, lightMuted)}">${esc(titleBits.join('  ·  '))}</span><br>`
    : '';
  const companyLine = (d.showCompany !== false && s.profile.company)
    ? `<span style="${lightStyle(d.fontSize, lightMuted, { weight: 'bold' })}">${esc(s.profile.company)}</span><br>`
    : '';
  const tag = String(s.profile.tagline || '').trim();
  const taglineLine = (d.showCompany !== false && tag)
    ? `<span style="${lightStyle(d.fontSize - 1, lightMuted)}">${esc(tag)}</span><br>`
    : '';
  const contextBits = d.showLocation !== false
    ? [s.profile.location, s.profile.languages].filter(Boolean) : [];
  const contextLine = contextBits.length
    ? `<span style="${lightStyle(d.fontSize - 1, lightMuted)}">${esc(contextBits.join('  ·  '))}</span><br>`
    : '';

  const identityCell = `<td class="m-cell" valign="middle" align="left">
      ${nameLine}${titleLine}${companyLine}${taglineLine}${contextLine}${statusHtml(s, d)}
    </td>`;
  rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);

  const socials = socialsRowHtml(s, d);
  const emitSocials = () => {
    if (!socials) return;
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  };
  if (socialsPos(d) === 'underName') emitSocials();

  /* Fixed full-width divider in the panel colour. */
  rows.push(d.showDivider
    ? `<tr><td colspan="2" style="border-top:1px ${d.dividerStyle || 'solid'} #2e333d;height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>` +
      `<tr><td colspan="2" height="${den.dividerMargin}" style="height:${den.dividerMargin}px;line-height:${den.dividerMargin}px;font-size:0;">&nbsp;</td></tr>`
    : '');

  /* Contact stack with light styles (labels and links included). */
  const items = contactItems(s, d);
  if (items.length) {
    const labels = d.showLabels !== false;
    let stack = items.map(it => {
      const style = lightStyle(d.fontSize, lightMuted);
      let inner;
      if (it.multiline) {
        inner = it.text.split(/\r?\n/).map(l => esc(l)).join('<br>');
      } else if (it.href) {
        inner = `<a href="${esc(it.href)}" style="${style};text-decoration:none;">${esc(it.text)}</a>`;
      } else {
        inner = esc(it.text);
      }
      const label = labels && it.label
        ? `<span style="${style};font-weight:bold;">${esc(it.label)}: </span>` : '';
      return `<span style="${style};">${label}${inner}</span>`;
    }).join('<br>');
    if (socialsPos(d) === 'inContact' && socials) stack += `<br>${socials}`;
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }

  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="left">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  if (socialsPos(d) === 'bottom') emitSocials();

  if (d.showLegal && String(d.legalText || '').trim()) {
    rows.push(`<tr><td colspan="2" style="padding-top:6px;">` +
      `<span style="${lightStyle(10, lightMuted)}">${esc(d.legalText)}</span></td></tr>`);
  }

  /* The dark panel is the outer wrapper td — Outlook keeps the background
     and the border rules; strict mode only strips radii, none are used. */
  return `<tr><td colspan="2" style="background-color:#171a21;padding:${den.cellPad}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('\n')}</table>
    </td></tr>`;
}

/* Letterhead department line: muted with letter-spacing:1px. The spacing
   string is the E2E marker and only appears when a department is set. */
function letterheadDepartmentHtml(s, serif, d) {
  if (d.showDepartment === false) return '';
  const dept = String(s.profile.department || '').trim();
  if (!dept) return '';
  const style = textStyle(serif, { size: d.fontSize - 1, color: mutedColor(d) });
  return `<span style="${style};letter-spacing:1px">${esc(dept)}</span><br>`;
}

/* Letterhead: centred serif identity between two hairline rules. */
/* Custom: the block-builder layout. Sections render in the user's chosen
   order (design.blockOrder); empty blocks collapse without a trace. Built
   entirely from the shared helpers, so every block matches its behaviour
   in the fixed templates. */
const DEFAULT_BLOCK_ORDER = ['identity', 'divider', 'contact', 'socials', 'banner', 'footer', 'qr', 'custom'];

function customRows(s, d) {
  const den = densityOf(d);
  const rows = [];
  const order = (Array.isArray(d.blockOrder) && d.blockOrder.length) ? d.blockOrder : DEFAULT_BLOCK_ORDER;

  for (const block of order) {
    switch (block) {
      case 'identity': {
        const logo = logoCellHtml(s, d);
        const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) +
          taglineHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
        if (!logo && !identity) break;
        if (logo) {
          rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 ${den.rowGap}px 0;">${logo}</td></tr>`);
        }
        if (identity) rows.push(`<tr><td colspan="2" align="left">${identity}</td></tr>`);
        break;
      }
      case 'divider': {
        const dv = dividerHtml(d);
        if (dv) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(dv);
        }
        break;
      }
      case 'contact': {
        const stack = contactStackHtml(s, d);
        if (stack) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
        }
        break;
      }
      case 'socials': {
        const soc = socialsRowHtml(s, d);
        if (soc) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(`<tr><td colspan="2" align="left">${soc}</td></tr>`);
        }
        break;
      }
      case 'banner': {
        if (d.bannerUrl) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(`<tr><td colspan="2" align="center">${bannerImgHtml(s, d)}</td></tr>`);
        }
        break;
      }
      case 'footer': {
        const f = footerRowHtml(s, d);
        if (f) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(f);
        }
        break;
      }
      case 'qr': {
        const qr = qrTableHtml(s, d);
        if (qr) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(qr);
        }
        break;
      }
      case 'custom': {
        if (d.customHtml && String(d.customHtml).trim()) {
          rows.push(spacerHtml(den.rowGap));
          rows.push(`<tr><td colspan="2" align="left">\n${String(d.customHtml)}\n</td></tr>`);
        }
        break;
      }
      default:
        break;
    }
  }
  return rows.join('\n');
}

function letterheadRows(s, d) {
  const den = densityOf(d);
  /* Layout-level serif override — design.font itself is never touched. */
  const serif = Object.assign({}, d, { font: 'classic' });
  const rows = [];
  rows.push(dividerHtml(d)); // top hairline

  const logo = logoCellHtml(s, d);
  if (logo) {
    rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 ${den.rowGap}px 0;">${logo}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }

  const identity = nameHtml(s, serif, { size: d.fontSize + 4 + nameExtraOf(d) }) +
    titleHtml(s, Object.assign({}, serif, { showDepartment: false })) +
    companyHtml(s, serif) +
    letterheadDepartmentHtml(s, serif, d) +
    contextLineHtml(s, d) +
    statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
  }

  const socials = socialsRowHtml(s, d);
  const socialsNested = socials
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
    : '';
  if (socialsPos(d) === 'underName' && socialsNested) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
  }

  const stack = contactStackHtml(s, d, { labels: false });
  if (stack) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${stack}</td></tr>`);
  }

  if (socialsPos(d) !== 'underName' && socialsNested) {
    rows.push(spacerHtml(den.rowGap));
    rows.push(`<tr><td colspan="2" align="center">${socialsNested}</td></tr>`);
  }

  rows.push(dividerHtml(d)); // bottom hairline
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* ── document assembly ────────────────────────────────────────────────── */

function darkStyleBlock(d) {
  if (!d.darkModeFriendly) return '';
  /* The card wrapper keeps its light tint in dark clients too, so dm
     classes inside it must resolve back to dark readable colours. */
  const cardFix = d.showCard ? `
  td[data-card="1"] .dm-txt { color:${d.textColor} !important; }
  td[data-card="1"] .dm-mut { color:${mutedColor(d)} !important; }` : '';
  return `<style type="text/css">
@media (prefers-color-scheme: dark) {
  .dm-txt { color:#e9ecf2 !important; }
  .dm-mut { color:#b3bac6 !important; }
  .dm-div { border-top-color:#3a414d !important; }${cardFix}
}
</style>`;
}

/* Progressive mobile stacking: columns become full-width blocks on narrow
   screens. Gmail/Apple Mail honour media queries; Outlook ignores the block
   and keeps the desktop layout, which is what you want there.
   Breakpoint is 599px, not 600: the full-size preview iframe is exactly
   600px wide and would otherwise trigger the mobile layout there. Real
   clients are ≤480px (phones) or wider than 600 (desktop bodies). */
function mobileStyleBlock(d) {
  if (!d.stackMobile) return '';
  return `<style type="text/css">
@media (max-width:599px) {
  .m-cell { display:block !important; width:100% !important; padding:0 0 10px 0 !important; text-align:left !important; }
  .m-cell:last-child { padding-bottom:0 !important; }
}
</style>`;
}

/* The bare signature fragment: the outermost signature table block — the
   entire <body> payload without the doctype/html/head/body wrapper. Both
   renderSignature (full document) and export.renderFragment (bare block)
   are built on top of it, so the two can never drift apart. */
function renderInner(state) {
  /* Clamp user/imported numeric values so the output can never degenerate. */
  const raw = state.design || {};
  const d = Object.assign({}, raw, {
    fontSize: Math.min(18, Math.max(10, Number(raw.fontSize) || 14)),
    logoWidth: Math.min(300, Math.max(20, Number(raw.logoWidth) || 72)),
  });
  const s = state;

  let inner;
  switch (d.template) {
    case 'centered': inner = classicRows(s, d, { center: true, qr: false }); break;
    case 'compact':  inner = compactRows(s, d); break;
    case 'minimal':  inner = minimalRows(s, d); break;
    case 'banner':   inner = bannerRows(s, d); break;
    case 'split':    inner = splitRows(s, d); break;
    case 'roundel':  inner = roundelRows(s, d); break;
    case 'masthead': inner = mastheadRows(s, d); break;
    case 'monogram': inner = monogramRows(s, d); break;
    case 'photocard': inner = photocardRows(s, d); break;
    case 'postcard':  inner = postcardRows(s, d); break;
    case 'line':      inner = lineRows(s, d); break;
    case 'duotone':   inner = duotoneRows(s, d); break;
    case 'quote':     inner = quoteRows(s, d); break;
    case 'enterprise': inner = enterpriseRows(s, d); break;
    case 'night':      inner = nightRows(s, d); break;
    case 'letterhead': inner = letterheadRows(s, d); break;
    case 'custom':     inner = customRows(s, d); break;
    default:          inner = classicRows(s, d);
  }

  const alignOverride = ['left', 'center', 'right'].includes(d.textAlign) ? d.textAlign : null;
  const outerAlign = alignOverride || (['centered', 'roundel', 'monogram', 'letterhead'].includes(d.template) ? 'center' : 'left');

  /* Signature background colour for the outermost content cell — the band
     spans the full 600px canvas with all cell padding preserved. Only
     hex-ish values (3–8 hex digits) are emitted; anything else falls back
     to transparent (no attribute), keeping default output byte-identical.
     Word-engine Outlook preserves cell backgrounds, so strict mode keeps it. */
  const bgStyle = (() => {
    const raw = String(d.background || '');
    return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? `background-color:${esc(raw)};` : '';
  })();

  /* Optional card wrapper: soft tint + border around the whole signature.
     Outlook keeps the background/border (ignores the radius, acceptable). */
  let bodyRows = inner;
  if (d.showCard) {
    const cardPad = String(d.cardPadding ?? '').trim() === '' ? '16px 18px' : `${clampNum(d.cardPadding, 8, 40, 16)}px`;
    const cardBorder = String(d.cardBorderWidth ?? '').trim() === '' ? 1 : clampNum(d.cardBorderWidth, 0, 4, 1);
    bodyRows = `<tr><td data-card="1" style="background-color:${d.cardColor || '#f6f8fa'};border:${cardBorder}px solid ${d.dividerColor};${br(d, '12px')}padding:${cardPad};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${inner}</table>
    </td></tr>`;
  }

  /* Optional raw-HTML block: embedded verbatim (power-user escape hatch).
     No escaping or validation — the user asked for it, so it goes in as
     written. Empty by default, keeping output byte-identical. */
  if (d.customHtml && String(d.customHtml).trim()) {
    bodyRows += `\n<tr><td colspan="2" align="left">\n${String(d.customHtml)}\n</td></tr>`;
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>
    <td align="${outerAlign}"${bgStyle ? ` style="${bgStyle}"` : ''}>
      <table role="presentation" width="${widthOf(d)}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${widthOf(d)}px;border-collapse:collapse;">
${bodyRows.split('\n').map(l => '        ' + l).join('\n')}
      </table>
    </td>
  </tr>
</table>`;
}

function renderSignature(state) {
  const raw = state.design || {};
  const d = Object.assign({}, raw, {
    fontSize: Math.min(18, Math.max(10, Number(raw.fontSize) || 14)),
    logoWidth: Math.min(300, Math.max(20, Number(raw.logoWidth) || 72)),
  });
  const doc =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${d.darkModeFriendly
  ? `<meta name="color-scheme" content="light dark">\n<meta name="supported-color-schemes" content="light dark">\n`
  : ''}${darkStyleBlock(d)}${mobileStyleBlock(d)}
<title>Email signature</title>
</head>
<body style="margin:0;padding:0;background-color:transparent;">
${renderInner(state)}
</body>
</html>`;
  return doc;
}
