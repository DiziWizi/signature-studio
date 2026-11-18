/* Signature Studio — signature renderer. state → full HTML document.
   Outlook-safe: table layout, every style inline, no <style> in default output,
   explicit widths, role=presentation. */
'use strict';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stackOf = d => FONT_STACKS[d.font] || FONT_STACKS.modern;

function textStyle(d, opts = {}) {
  const size = opts.size ?? d.fontSize;
  const parts = [
    `font-family:${stackOf(d)}`,
    `font-size:${size}px`,
    `color:${opts.color ?? d.textColor}`,
    `line-height:${Math.round(size * 1.5)}px`,
    'mso-line-height-rule:exactly',
  ];
  if (opts.weight) parts.push(`font-weight:${opts.weight}`);
  if (opts.style) parts.push(`font-style:${opts.style}`);
  return parts.join(';');
}

const mutedColor = d => mixColors(d.textColor, '#ffffff', 0.42);

/* ── design-state keys with defaults ──────────────────────────────────── */

/* Density presets. 'regular' reproduces the pre-density hardcoded values
   exactly; 'airy' ≈ ×1.4, 'compact' ≈ ×0.55, rounded to integers. */
const DENSITY = {
  airy:    { cellPad: 22, rowGap: 14, socialGap: 10, dividerMargin: 17 },
  regular: { cellPad: 16, rowGap: 10, socialGap: 7,  dividerMargin: 12 },
  compact: { cellPad: 9,  rowGap: 6,  socialGap: 4,  dividerMargin: 7 },
};
const densityOf = d => DENSITY[d.density] || DENSITY.regular;

/* Extra px on the name font size, on top of the per-layout baseline offset
   (+2 big / −2 small). Default 3 reproduces the classic +5/+1 today. */
const nameExtraOf = d => {
  const n = Number(d.nameSizeExtra);
  return Number.isFinite(n) ? n : 3;
};

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
  const extra = nameExtraOf(d);
  const fs = size || (big ? d.fontSize + 2 + extra : d.fontSize - 2 + extra);
  const style = textStyle(d, { size: fs, weight: 'bold' });
  const pronouns = s.profile.pronouns
    ? ` <span${dmCls(d, 'mut')} style="${textStyle(d, { size: fs - 3, color: mutedColor(d) })}">(${esc(s.profile.pronouns)})</span>`
    : '';
  return `<span${dmCls(d, 'txt')} style="${style}">${esc(shown)}</span>${pronouns}<br>`;
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
  const style = textStyle(d, { size: d.fontSize, color: d.primaryColor, weight: 'bold' });
  if (s.contact.website && d.showWebsite !== false) {
    const href = normalizeUrl('custom', s.contact.website);
    return `<a href="${esc(href)}" style="${style};text-decoration:none;">${esc(s.profile.company)}</a><br>`;
  }
  return `<span style="${style}">${esc(s.profile.company)}</span><br>`;
}

function contactItems(s, d = {}) {
  const items = [];
  const c = s.contact;
  if (c.email && d.showEmail !== false) items.push({ key: 'email', label: 'Email', text: c.email, href: 'mailto:' + c.email });
  if (c.phone && d.showPhone !== false) items.push({ key: 'phone', label: 'Phone', text: c.phone, href: 'tel:' + c.phone.replace(/[^\d+]/g, '') });
  if (c.mobile && d.showMobile !== false) items.push({ key: 'mobile', label: 'Mobile', text: c.mobile, href: 'tel:' + c.mobile.replace(/[^\d+]/g, '') });
  if (c.website && d.showWebsite !== false) items.push({ key: 'website', label: c.websiteLabel || 'Web', text: c.websiteLabel || c.website, href: normalizeUrl('custom', c.website) });
  if (c.portfolio) items.push({ key: 'portfolio', label: c.portfolioLabel || 'Portfolio', text: c.portfolioLabel || c.portfolio, href: normalizeUrl('custom', c.portfolio) });
  if (c.address && d.showAddress !== false) items.push({ key: 'address', label: '', text: c.address, multiline: true });
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
  return items.map(it => contactLineHtml(d, it, { labels })).join('<br>');
}

function contactInlineHtml(s, d, { labels = false } = {}) {
  const items = contactItems(s, d);
  if (!items.length) return '';
  return items.map(it => contactLineHtml(d, it, { labels }))
    .join(`<span style="font-size:${d.fontSize}px;color:${mutedColor(d)};">&nbsp;·&nbsp;</span>`);
}

function socialChipHtml(d, soc, withLabel) {
  const net = networkById(soc.network);
  const isCustom = net.id === 'custom';
  const glyph = isCustom ? (soc.glyph || '↗') : net.glyph;
  const color = isCustom ? (soc.color || '#5b6472') : net.color;
  const raw = String(soc.url || '').trim();
  if (!raw) return '';
  const href = normalizeUrl(net.id, raw);
  const iconUrl = String(soc.iconUrl || '').trim();
  const chip = iconUrl
    ? `<img src="${esc(iconUrl)}" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;border:0;${br(d, '11px')}vertical-align:middle;">`
    : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;` +
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
    `<td style="padding:0 ${gap}px ${gap}px 0;vertical-align:middle;">${socialChipHtml(d, soc, withLabel)}</td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>${cells}</tr></table>`;
}

function dividerHtml(d, cols = 2) {
  if (!d.showDivider) return '';
  const margin = densityOf(d).dividerMargin;
  const cls = d.darkModeFriendly ? ' class="dm-div"' : '';
  return `<tr><td colspan="${cols}"${cls} style="border-top:1px ${d.dividerStyle || 'solid'} ${d.dividerColor};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>` +
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
   roundPhoto gives the side logo a circular crop. */
function logoCellHtml(s, d) {
  if (d.logoUrl) return imgTag(d.logoUrl, d.logoWidth, 'logo', d.roundPhoto ? br(d, '50%') : '');
  if (d.useMonogram) return monogramHtml(s, d);
  return '';
}

/* ── layouts ──────────────────────────────────────────────────────────── */

function classicRows(s, d, { center = false } = {}) {
  const rows = [];
  const align = center ? 'center' : 'left';
  const den = densityOf(d);
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const logoCell = logoContent
    ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${align}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
    : '';
  const identityCell = `<td class="m-cell" valign="middle" align="${align}">
      ${nameHtml(s, d)}${titleHtml(s, d)}${companyHtml(s, d)}${contextLineHtml(s, d)}${statusHtml(s, d)}
    </td>`;

  rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);
  rows.push(dividerHtml(d));

  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="${align}">${stack}</td></tr>`);
    rows.push(spacerHtml(den.rowGap));
  }
  const booking = bookingHtml(s, d);
  if (booking) {
    rows.push(`<tr><td colspan="2" align="${align}">${booking}</td></tr>`);
    rows.push(spacerHtml(8));
  }
  const socials = socialsRowHtml(s, d);
  if (socials) {
    const nested = center
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`
      : socials;
    rows.push(`<tr><td colspan="2" align="${center ? 'center' : 'left'}">${nested}</td></tr>`);
    rows.push(spacerHtml(4));
  }
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
    .filter(it => ['email', 'phone', 'mobile', 'website'].includes(it.key))
    .map(it => contactLineHtml(d, it, { labels: false }))
    .join('<br>');

  const identityCell = `<td class="m-cell" valign="middle" align="left">
      ${nameHtml(s, d, { big: false })}${titleHtml(s, d)}${contextLineHtml(s, d)}${statusHtml(s, d)}
    </td>`;
  const contactCell = `<td class="m-cell" valign="middle" align="right" style="padding-left:24px;">${contact || '&nbsp;'}</td>`;

  rows.push(`<tr>${right ? identityCell + contactCell + logoCell : logoCell + identityCell + contactCell}</tr>`);

  const socials = socialsRowHtml(s, d);
  if (socials) {
    rows.push(spacerHtml(8, 3));
    rows.push(`<tr><td colspan="3" align="left">${socials}</td></tr>`);
  }
  rows.push(legalHtml(s, d, 3));
  return rows.join('\n');
}

function minimalRows(s, d) {
  const rows = [];
  const first = [nameHtml(s, d, { big: true }), titleHtml(s, d), companyHtml(s, d), contextLineHtml(s, d), statusHtml(s, d)].join('');
  rows.push(`<tr><td colspan="2" align="left">${first}</td></tr>`);
  const stack = contactStackHtml(s, d, { labels: false });
  if (stack) {
    rows.push(spacerHtml(6));
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
  }
  const socials = socialsRowHtml(s, d);
  if (socials) {
    rows.push(spacerHtml(6));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

function bannerRows(s, d) {
  const rows = [];
  if (d.bannerUrl) {
    rows.push(`<tr><td colspan="2" align="center">${imgTag(d.bannerUrl, 600, 'banner')}</td></tr>`);
    rows.push(spacerHtml(16));
  }
  rows.push(classicRows(s, d));
  return rows.join('\n');
}

/* Split: logo + identity left, contact details in a bordered card. */
function splitRows(s, d) {
  const rows = [];
  if (d.bannerUrl) {
    rows.push(`<tr><td colspan="2" align="center">${imgTag(d.bannerUrl, 600, 'banner')}</td></tr>`);
    rows.push(spacerHtml(16));
  }
  const logoContent = logoCellHtml(s, d);
  const right = d.logoPosition === 'right';
  const den = densityOf(d);
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (logoContent || identity) {
    const logoCell = logoContent
      ? `<td class="m-cell" width="${d.logoWidth + den.cellPad}" valign="middle" align="${right ? 'right' : 'left'}" style="${right ? `padding:0 0 0 ${den.cellPad}px;` : `padding:0 ${den.cellPad}px 0 0;`}">${logoContent}</td>`
      : '<td width="16" style="padding:0;font-size:0;line-height:0;">&nbsp;</td>';
    const identityCell = `<td class="m-cell" valign="middle" align="left">${identity || '&nbsp;'}</td>`;
    rows.push(`<tr>${right ? identityCell + logoCell : logoCell + identityCell}</tr>`);
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
  const socials = socialsRowHtml(s, d);
  if (socials) {
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
      ? `<img src="${esc(d.logoUrl)}" width="${d.logoWidth}" alt="logo" ` +
        `style="display:block;width:${d.logoWidth}px;max-width:${d.logoWidth}px;height:auto;border:0;${br(d, '50%')}">`
      : monogramHtml(s, d);
    rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 ${den.dividerMargin}px 0;">${circle}</td></tr>`);
  }
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
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
  const socials = socialsRowHtml(s, d);
  if (socials) {
    const nested = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`;
    rows.push(`<tr><td colspan="2" align="center">${nested}</td></tr>`);
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
    const rest = bandVisible ? '' : titleHtml(s, d) + companyHtml(s, d);
    rows.push(`<tr><td colspan="2" align="left">${nameHtml(s, d)}${rest}${contextLineHtml(s, d)}${statusHtml(s, d)}</td></tr>`);
    rows.push(spacerHtml(6));
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
  const socials = socialsRowHtml(s, d);
  if (socials) {
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
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
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
  const socials = socialsRowHtml(s, d);
  if (socials) {
    const nested = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr><td>${socials}</td></tr></table>`;
    rows.push(`<tr><td colspan="2" align="center">${nested}</td></tr>`);
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
    companyHtml(s, d) + contextLineHtml(s, d) + statusHtml(s, d);
  if (logoContent || identity) {
    const logoCell = logoContent
      ? `<td class="m-cell" width="${d.logoWidth + 20}" valign="top" align="left" style="padding:2px 20px 0 0;">${logoContent}</td>`
      : '';
    rows.push(`<tr>${logoCell}<td class="m-cell" valign="top" align="left">${identity || '&nbsp;'}</td></tr>`);
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
  const socials = socialsRowHtml(s, d);
  if (socials) {
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
    rows.push(spacerHtml(4));
  }
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* ── document assembly ────────────────────────────────────────────────── */

function darkStyleBlock(d) {
  if (!d.darkModeFriendly) return '';
  return `<style type="text/css">
@media (prefers-color-scheme: dark) {
  .dm-txt { color:#e9ecf2 !important; }
  .dm-mut { color:#b3bac6 !important; }
  .dm-div { border-top-color:#3a414d !important; }
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

function renderSignature(state) {
  /* Clamp user/imported numeric values so the output can never degenerate. */
  const raw = state.design || {};
  const d = Object.assign({}, raw, {
    fontSize: Math.min(18, Math.max(10, Number(raw.fontSize) || 14)),
    logoWidth: Math.min(300, Math.max(20, Number(raw.logoWidth) || 72)),
  });
  const s = state;

  let inner;
  switch (d.template) {
    case 'centered': inner = classicRows(s, d, { center: true }); break;
    case 'compact':  inner = compactRows(s, d); break;
    case 'minimal':  inner = minimalRows(s, d); break;
    case 'banner':   inner = bannerRows(s, d); break;
    case 'split':    inner = splitRows(s, d); break;
    case 'roundel':  inner = roundelRows(s, d); break;
    case 'masthead': inner = mastheadRows(s, d); break;
    case 'monogram': inner = monogramRows(s, d); break;
    case 'photocard': inner = photocardRows(s, d); break;
    default:         inner = classicRows(s, d);
  }

  const outerAlign = ['centered', 'roundel', 'monogram'].includes(d.template) ? 'center' : 'left';

  /* Optional card wrapper: soft tint + border around the whole signature.
     Outlook keeps the background/border (ignores the radius, acceptable). */
  let bodyRows = inner;
  if (d.showCard) {
    bodyRows = `<tr><td style="background-color:${d.cardColor || '#f6f8fa'};border:1px solid ${d.dividerColor};${br(d, '12px')}padding:16px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${inner}</table>
    </td></tr>`;
  }

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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>
    <td align="${outerAlign}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
${bodyRows.split('\n').map(l => '        ' + l).join('\n')}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  return doc;
}
