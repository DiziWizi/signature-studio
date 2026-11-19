/* Signature Studio — export: clipboard (rich + plain), download, plain text. */
'use strict';

function plainTextVersion(s) {
  const lines = [];
  const p = s.profile;
  const shown = p.displayName || p.name;
  if (shown) {
    const honorificPrefix = String(p.honorificPrefix || '').trim();
    const honorificSuffix = String(p.honorificSuffix || '').trim();
    const shownWithHonorifics = (honorificPrefix ? honorificPrefix + ' ' : '') + shown +
      (honorificSuffix ? ', ' + honorificSuffix : '');
    lines.push(p.pronouns ? `${shownWithHonorifics} (${p.pronouns})` : shownWithHonorifics);
  }
  const bits = [p.title, p.department].filter(Boolean).join(' · ');
  if (bits) lines.push(bits);
  if (p.company) lines.push(p.company);
  const ctx = [p.location, p.languages].filter(Boolean).join(' · ');
  if (ctx) lines.push(ctx);
  if (s.design.statusText) lines.push(`[${s.design.statusText}]`);
  lines.push('');
  const c = s.contact;
  const contact = [];
  if (c.email) contact.push(c.email);
  if (c.email2) contact.push(`${c.email2Label || 'Email 2'}: ${c.email2}`);
  if (c.phone) contact.push(c.phone);
  if (c.mobile) contact.push(c.mobile);
  if (c.website) contact.push(c.websiteLabel || c.website);
  if (c.portfolio) contact.push(c.portfolioLabel || c.portfolio);
  if (c.address) contact.push(c.address.replace(/\r?\n/g, ', '));
  for (const l of s.customLines) if (l.value) contact.push(`${l.label ? l.label + ': ' : ''}${l.value}`);
  if (contact.length) lines.push(contact.join(' | '));
  const pgpKey = String(c.pgpKey || '').trim();
  if (pgpKey) lines.push('PGP: ' + (/^http/i.test(pgpKey) ? 'Public key ' + pgpKey : pgpKey));
  if (c.booking) lines.push(`${c.bookingLabel || 'Book a call'}: ${c.booking}`);
  const socials = s.socials.filter(x => String(x.url || '').trim())
    .map(x => {
      const net = networkById(x.network);
      return `${net.name}: ${normalizeUrl(net.id, x.url)}`;
    });
  if (socials.length) lines.push(socials.join('  '));
  if (s.design.showLegal && s.design.legalText) {
    lines.push('');
    lines.push(s.design.legalText);
  }
  return lines.filter(l => l !== null).join('\n');
}

async function copySignature(html, plain) {
  if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return 'clipboard';
    } catch (e) {
      /* fall through to legacy path */
    }
  }
  try {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;left:-9999px;top:0;';
    div.innerHTML = html;
    document.body.appendChild(div);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(div);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    div.remove();
    return ok ? 'legacy' : 'failed';
  } catch (e) {
    return 'failed';
  }
}

function downloadSignature(html, name) {
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(name)}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
