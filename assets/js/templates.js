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

/* ── small pieces ─────────────────────────────────────────────────────── */

function imgTag(url, width, alt) {
  return `<img src="${esc(url)}" width="${width}" alt="${esc(alt)}" ` +
    `style="display:block;width:${width}px;max-width:${width}px;height:auto;border:0;">`;
}

function dmCls(d, kind) {
  return d.darkModeFriendly ? ` class="dm-${kind}"` : '';
}

function nameHtml(s, d, { big = true } = {}) {
  if (!s.profile.name) return '';
  const style = textStyle(d, { size: big ? d.fontSize + 5 : d.fontSize + 1, weight: 'bold' });
  return `<span${dmCls(d, 'txt')} style="${style}">${esc(s.profile.name)}</span><br>`;
}

function titleHtml(s, d) {
  const bits = [s.profile.title, s.profile.department].filter(Boolean);
  if (!bits.length) return '';
  const style = textStyle(d, { size: d.fontSize, color: mutedColor(d) });
  return `<span${dmCls(d, 'mut')} style="${style}">${esc(bits.join('  ·  '))}</span><br>`;
}

function companyHtml(s, d) {
  if (!s.profile.company) return '';
  const style = textStyle(d, { size: d.fontSize, color: d.primaryColor, weight: 'bold' });
  if (s.contact.website) {
    const href = normalizeUrl('custom', s.contact.website);
    return `<a href="${esc(href)}" style="${style};text-decoration:none;">${esc(s.profile.company)}</a><br>`;
  }
  return `<span style="${style}">${esc(s.profile.company)}</span><br>`;
}

function contactItems(s) {
  const items = [];
  const c = s.contact;
  if (c.email) items.push({ key: 'email', label: 'Email', text: c.email, href: 'mailto:' + c.email });
  if (c.phone) items.push({ key: 'phone', label: 'Phone', text: c.phone, href: 'tel:' + c.phone.replace(/[^\d+]/g, '') });
  if (c.mobile) items.push({ key: 'mobile', label: 'Mobile', text: c.mobile, href: 'tel:' + c.mobile.replace(/[^\d+]/g, '') });
  if (c.website) items.push({ key: 'website', label: c.websiteLabel || 'Web', text: c.websiteLabel || c.website, href: normalizeUrl('custom', c.website) });
  if (c.address) items.push({ key: 'address', label: '', text: c.address, multiline: true });
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
  const items = contactItems(s);
  if (!items.length) return '';
  return items.map(it => contactLineHtml(d, it, opts)).join('<br>');
}

function contactInlineHtml(s, d, { labels = false } = {}) {
  const items = contactItems(s);
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
    ? `<img src="${esc(iconUrl)}" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;border:0;border-radius:11px;vertical-align:middle;">`
    : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;` +
      `background-color:${color};color:#ffffff;border-radius:11px;` +
      `font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;vertical-align:middle;">${esc(glyph)}</span>`;
  if (!withLabel) return `<a href="${esc(href)}" style="text-decoration:none;">${chip}</a>`;
  const clsAttr = d.darkModeFriendly ? ' class="dm-txt"' : '';
  const label = `<span${clsAttr} style="display:inline-block;vertical-align:middle;` +
    `font-family:${stackOf(d)};font-size:${d.fontSize - 2}px;color:${d.textColor};padding-left:5px;">${esc(net.name)}</span>`;
  return `<a href="${esc(href)}" style="text-decoration:none;">${chip}${label}</a>`;
}

/* Chips in a nested table row — reliable in every client. */
function socialsRowHtml(s, d) {
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
  const cells = socials.map(soc =>
    `<td style="padding:0 7px 7px 0;vertical-align:middle;">${socialChipHtml(d, soc, withLabel)}</td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>${cells}</tr></table>`;
}

function dividerHtml(d, cols = 2) {
  if (!d.showDivider) return '';
  const cls = d.darkModeFriendly ? ' class="dm-div"' : '';
  return `<tr><td colspan="${cols}"${cls} style="border-top:1px solid ${d.dividerColor};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>` +
    `<tr><td colspan="${cols}" height="12" style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`;
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

/* ── layouts ──────────────────────────────────────────────────────────── */

function classicRows(s, d, { center = false } = {}) {
  const rows = [];
  const align = center ? 'center' : 'left';
  const hasLogo = !!d.logoUrl;
  const logoCell = hasLogo
    ? `<td width="${d.logoWidth + 16}" valign="middle" align="${align}" style="padding:0 16px 0 0;">${imgTag(d.logoUrl, d.logoWidth, 'logo')}</td>`
    : '';

  rows.push(`<tr>
    ${logoCell}
    <td valign="middle" align="${align}">
      ${nameHtml(s, d)}${titleHtml(s, d)}${companyHtml(s, d)}
    </td>
  </tr>`);
  rows.push(dividerHtml(d));

  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="${align}">${stack}</td></tr>`);
    rows.push(spacerHtml(10));
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
  const hasLogo = !!d.logoUrl;
  const logoCell = hasLogo
    ? `<td width="${d.logoWidth + 16}" valign="middle" align="left" style="padding:0 16px 0 0;">${imgTag(d.logoUrl, d.logoWidth, 'logo')}</td>`
    : '';

  const contact = contactItems(s)
    .filter(it => ['email', 'phone', 'mobile', 'website'].includes(it.key))
    .map(it => contactLineHtml(d, it, { labels: false }))
    .join('<br>');

  rows.push(`<tr>
    ${logoCell}
    <td valign="middle" align="left">
      ${nameHtml(s, d, { big: false })}${titleHtml(s, d)}
    </td>
    <td valign="middle" align="right" style="padding-left:24px;">${contact || '&nbsp;'}</td>
  </tr>`);

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
  const first = [nameHtml(s, d, { big: true }), titleHtml(s, d), companyHtml(s, d)].join('');
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
  const hasLogo = !!d.logoUrl;
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d);
  if (hasLogo || identity) {
    const logoCell = hasLogo
      ? `<td width="${d.logoWidth + 16}" valign="middle" align="left" style="padding:0 16px 0 0;">${imgTag(d.logoUrl, d.logoWidth, 'logo')}</td>`
      : '<td width="16" style="padding:0;font-size:0;line-height:0;">&nbsp;</td>';
    rows.push(`<tr>
    ${logoCell}
    <td valign="middle" align="left">${identity || '&nbsp;'}</td>
  </tr>`);
  }
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(spacerHtml(10));
    rows.push(`<tr><td colspan="2" align="left" style="background-color:#f6f8fa;border:1px solid ${d.dividerColor};padding:10px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding:0;">${stack}</td></tr></table>
    </td></tr>`);
  }
  const socials = socialsRowHtml(s, d);
  if (socials) {
    rows.push(spacerHtml(10));
    rows.push(`<tr><td colspan="2" align="left">${socials}</td></tr>`);
  }
  rows.push(dividerHtml(d));
  rows.push(legalHtml(s, d));
  return rows.join('\n');
}

/* Roundel: circular logo, everything centred. */
function roundelRows(s, d) {
  const rows = [];
  if (d.logoUrl) {
    rows.push(`<tr><td colspan="2" align="center" style="padding:0 0 12px 0;">` +
      `<img src="${esc(d.logoUrl)}" width="${d.logoWidth}" alt="logo" ` +
      `style="display:block;width:${d.logoWidth}px;max-width:${d.logoWidth}px;height:auto;border:0;border-radius:50%;"></td></tr>`);
  }
  const identity = nameHtml(s, d) + titleHtml(s, d) + companyHtml(s, d);
  if (identity) {
    rows.push(`<tr><td colspan="2" align="center">${identity}</td></tr>`);
  }
  rows.push(dividerHtml(d));
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="center">${stack}</td></tr>`);
    rows.push(spacerHtml(10));
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
  if (s.profile.company) {
    const bandStyle = textStyle(d, { size: d.fontSize + 6, color: '#ffffff', weight: 'bold' });
    const bits = [s.profile.title, s.profile.department].filter(Boolean);
    const sub = bits.length
      ? `<span style="${textStyle(d, { size: d.fontSize, color: '#ffffff' })}">${esc(bits.join('  ·  '))}</span>`
      : '';
    rows.push(`<tr><td colspan="2" style="background-color:${d.primaryColor};padding:12px 16px;">` +
      `<span style="${bandStyle}">${esc(s.profile.company)}</span>` +
      (sub ? `<br>${sub}` : '') +
      `</td></tr>`);
    rows.push(spacerHtml(12));
  }
  if (s.profile.name) {
    /* Without the band (no company), keep title/department visible. */
    const rest = s.profile.company ? '' : titleHtml(s, d) + companyHtml(s, d);
    rows.push(`<tr><td colspan="2" align="left">${nameHtml(s, d)}${rest}</td></tr>`);
    rows.push(spacerHtml(6));
  }
  const stack = contactStackHtml(s, d);
  if (stack) {
    rows.push(`<tr><td colspan="2" align="left">${stack}</td></tr>`);
    rows.push(spacerHtml(10));
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
    default:         inner = classicRows(s, d);
  }

  const outerAlign = (d.template === 'centered' || d.template === 'roundel') ? 'center' : 'left';

  const doc =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${d.darkModeFriendly
  ? `<meta name="color-scheme" content="light dark">\n<meta name="supported-color-schemes" content="light dark">\n`
  : ''}${darkStyleBlock(d)}
<title>Email signature</title>
</head>
<body style="margin:0;padding:0;background-color:transparent;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>
    <td align="${outerAlign}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;">
${inner.split('\n').map(l => '        ' + l).join('\n')}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  return doc;
}
