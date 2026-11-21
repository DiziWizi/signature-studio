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
  if (p.tagline) lines.push(p.tagline);
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

/* The async clipboard can STALL instead of rejecting (WebKitGTK, and
   Chromium when the document lost focus to an OS dialog) — a promise that
   never settles leaves the Copy button silently dead. Always race a
   timeout, then fall back. */
const COPY_TIMEOUT_MS = 1500;

async function copySignature(html, plain) {
  if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
    try {
      const write = navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]).then(() => 'done', () => 'failed');
      const outcome = await Promise.race([
        write,
        new Promise(resolve => setTimeout(() => resolve('timeout'), COPY_TIMEOUT_MS)),
      ]);
      if (outcome === 'done') return 'clipboard';
      /* 'failed' or 'timeout' → legacy path below */
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

/* Bare signature fragment for embedding in an existing document: the
   outermost signature table block, without the doctype/html/head/body
   wrapper. Delegates to templates.renderInner, so it always matches what
   renderSignature emits between <body> and </body> byte-for-byte. */
function renderFragment(state) {
  if (typeof renderInner !== 'function') return '';
  /* Strip preview-only data-edit marks so exports stay clean. */
  return renderInner(state).replace(/ data-edit="[^"]*"/g, '');
}

/* Apple Mail stores signatures as .mailsignature files: the HTML fragment
   prefixed with a Content-Type meta tag (Mail expects UTF-8 declared in
   the file itself). Users drop the file into the MailData/Signatures
   folder inside their Mail library; filenames there are UUIDs. */
function appleMailSignature(state) {
  const fragment = renderFragment(state);
  return '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n' + fragment;
}

/* Thunderbird takes the bare fragment in a plain .html file. */
function thunderbirdSignature(state) {
  return renderFragment(state);
}

/* Download a raw payload under a custom extension (no .html suffix). */
function downloadRawFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}
