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
  /* One line of a signature, classified. Real signatures put the phone on
     a bare line ("+61 3 9000 0000") or behind a label ("M: …", "Tel: …");
     neither used to import at all, and a phone in second position was
     taken for the job title. */
  const ROLE_RE = /\b(engineer|developer|manager|director|lead|head|principal|analyst|consultant|specialist|officer|designer|architect|coordinator|advisor|partner|founder|owner|president|ceo|cto|cfo|coo|associate|assistant|executive|administrator|supervisor|technician|scientist|professor|teacher|nurse|technician|accountant|lawyer|solicitor|agent|broker|editor|producer|planner|strategist|researcher)\b/i;
  const phoneFromLine = line => {
    const m = String(line).match(/^(?:[a-z]{1,6}\s*[:.)-]\s*)?(\+?\d[\d\s().-]{5,}\d)$/i);
    if (!m) return null;
    const digits = m[1].replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 6 ? digits : null;
  };
  const isContactLine = l => l.includes('@') || /^(https?:\/\/|www\.)/i.test(l) || !!phoneFromLine(l);

  if (lines.length) {
    /* Pull every phone-shaped line out first, label or not. */
    for (const raw of lines) {
      const phone = phoneFromLine(raw);
      if (!phone) continue;
      if (!out.contact.phone) out.contact.phone = phone;
      else if (!out.contact.mobile && phone !== out.contact.phone) {
        out.contact.mobile = phone;
        break;
      }
    }

    const clean = lines.filter(l => !isContactLine(l) && l.length <= 90);
    if (clean[0] && clean[0].length <= 60) out.profile.name = clean[0];
    const second = clean[1] || '';
    const third = clean[2] || '';
    if (second && second.length <= 80 && /[·|•,—]/.test(second)) {
      const [title, department] = second.split(/\s*[·|•,—]\s*/);
      out.profile.title = (title || '').trim();
      out.profile.department = (department || '').trim();
    } else if (second && second.length <= 80 && ROLE_RE.test(second)) {
      out.profile.title = second;
    } else if (second && third && ROLE_RE.test(third)) {
      /* Company first, then role (common outside ANZ). */
      out.profile.company = second;
      out.profile.title = third;
    } else if (second && second.length <= 80) {
      out.profile.title = second;
    }
    if (!out.profile.company) {
      const after = clean.slice(out.profile.title === third ? 3 : (out.profile.title ? 2 : 1));
      const cand = after.find(l => l.length <= 60 && !ROLE_RE.test(l) && l !== out.profile.name);
      if (cand) out.profile.company = cand;
    }
  }

  /* Legal line: very small text. Gmail uses px; Outlook uses points — its
     canonical disclaimer size is 8.0pt, and 1pt ≈ 4/3px, so 8.0pt is the pt
     equivalent of the existing 10.5px threshold (8.0 × 4/3 ≈ 10.5). The \b
     keeps mso-bidi-font-size etc. from matching. */
  const small = Array.from(doc.querySelectorAll('span,td,p,div,font'))
    .map(el => {
      const m = /\bfont-size\s*:\s*([0-9.]+)\s*(px|pt)/i.exec(el.getAttribute('style') || '');
      if (!m) return null;
      const value = parseFloat(m[1]);
      const unit = (m[2] || 'px').toLowerCase();
      const sizePx = unit === 'pt' ? value * 4 / 3 : value;
      const maxPx = unit === 'pt' ? 8.0 * 4 / 3 : 10.5;
      return { small: sizePx <= maxPx, text: (el.textContent || '').trim() };
    })
    .filter(x => x && x.small && x.text.length > 15)
    .map(x => x.text)
    .sort((a, b) => b.length - a.length);
  if (small.length) {
    out.design.showLegal = true;
    out.design.legalText = small[0].slice(0, 500);
  }

  out.notes = ['Best-effort import — check every field before exporting.'];
  return out;
}
