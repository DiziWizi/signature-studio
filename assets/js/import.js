/* Signature Studio — best-effort HTML signature import. */
'use strict';

function parseSignatureHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const out = { profile: {}, contact: {}, socials: [], customLines: [], design: {}, notes: [] };

  /* Images: first image = logo, widest large image = banner. */
  const imgEls = Array.from(doc.querySelectorAll('img'));
  const imgs = imgEls.map(i => {
    const w = parseInt(i.getAttribute('width') || (i.style && i.style.width) || '0', 10) || 0;
    return { src: i.getAttribute('src') || '', w };
  }).filter(i => i.src && !i.src.startsWith('data:image/'));
  if (imgs.length) {
    out.design.logoUrl = imgs[0].src;
    const banner = imgs.find(i => i.w >= 300);
    if (banner && banner.src !== imgs[0].src) out.design.bannerUrl = banner.src;
    /* Heuristic: logo after the first text block → right position. */
    try {
      const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
      let firstTextEl = null;
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent || '').trim();
        if (t) { firstTextEl = walker.currentNode.parentElement; break; }
      }
      if (firstTextEl && imgEls[0] &&
          (firstTextEl.compareDocumentPosition(imgEls[0]) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        out.design.logoPosition = 'right';
      }
    } catch (e) { /* ignore */ }
  }

  /* Links. */
  const seenSocials = new Set();
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || '';
    const text = (a.textContent || '').trim();
    if (href.startsWith('mailto:')) {
      if (!out.contact.email) out.contact.email = decodeURIComponent(href.slice(7));
    } else if (href.startsWith('tel:')) {
      const t = href.slice(4).replace(/[^\d+]/g, '');
      if (!out.contact.phone) out.contact.phone = t;
      else if (!out.contact.mobile) out.contact.mobile = t;
    } else if (/^https?:/i.test(href)) {
      let host = '';
      try { host = new URL(href).hostname; } catch (e) { continue; }
      const net = detectNetwork(host);
      if (net && !seenSocials.has(net)) {
        seenSocials.add(net);
        out.socials.push({ network: net, url: href, glyph: '', color: '' });
      } else if (!out.contact.website && !text.startsWith('http') && text.length < 80) {
        out.contact.website = href;
        if (text && !/^www\./i.test(text) && text.length < 40) out.contact.websiteLabel = text;
      } else if (!out.contact.portfolio && !text.startsWith('http') && text.length < 80) {
        out.contact.portfolio = href;
      }
    }
  }

  /* Text: first short lines become name/title/company. innerText is unreliable
     on detached documents, so split on block boundaries in the raw HTML. */
  let lines = [];
  const bodyHtml = doc.body ? doc.body.innerHTML : '';
  if (bodyHtml) {
    const textish = bodyHtml
      .replace(/<(br|\/td|\/tr|\/th|\/div|\/p|\/li|\/h[1-6]|\/section|\/header|\/footer)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
    lines = textish.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }
  if (lines.length) {
    if (lines[0].length <= 60 && !lines[0].includes('@') && !/^https?:/i.test(lines[0])) {
      out.profile.name = lines[0];
    }
    const second = lines[1] || '';
    if (second && second.length <= 80 && !second.includes('@') && /[·|•,—]/.test(second)) {
      const [title, department] = second.split(/\s*[·|•,—]\s*/);
      out.profile.title = (title || '').trim();
      out.profile.department = (department || '').trim();
    } else if (second && second.length <= 80 && !second.includes('@')) {
      out.profile.title = second;
    }
  }

  /* Legal line: very small text. */
  const small = Array.from(doc.querySelectorAll('span,td,p,div,font'))
    .map(el => {
      const m = /font-size\s*:\s*([0-9.]+)\s*px/i.exec(el.getAttribute('style') || '');
      return m ? { size: parseFloat(m[1]), text: (el.textContent || '').trim() } : null;
    })
    .filter(x => x && x.size <= 10.5 && x.text.length > 15)
    .map(x => x.text)
    .sort((a, b) => b.length - a.length);
  if (small.length) {
    out.design.showLegal = true;
    out.design.legalText = small[0].slice(0, 500);
  }

  out.notes = ['Best-effort import — check every field before exporting.'];
  return out;
}
