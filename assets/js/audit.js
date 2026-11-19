/* Signature audit: a one-click lint report over the current signature.
   Pure functions over (state, render output) — no DOM. */
'use strict';

function auditDataUriSize(uri) {
  /* rough byte estimate: base64 payload * 3/4 */
  const m = String(uri).match(/^data:[^,]+,(.*)$/);
  if (!m) return 0;
  const b64 = m[1].replace(/\s+/g, '');
  return Math.round((b64.length * 3) / 4);
}

function buildAudit(state) {
  const items = [];
  const ok = t('audit.ok');
  const warn = t('audit.warn');
  const info = t('audit.info');
  const html = typeof renderSignature === 'function' ? renderSignature(state) : '';
  const plain = typeof plainTextVersion === 'function' ? plainTextVersion(state) : '';
  const s = state.design || {};
  const p = state.profile || {};
  const c = state.contact || {};

  /* images */
  for (const [label, url, alt] of [
    [t('audit.logo'), s.logoUrl, s.logoAlt],
    [t('audit.banner'), s.bannerUrl, s.bannerAlt],
    [t('audit.footerLeft'), s.footerLeftImg, null],
    [t('audit.footerCenter'), s.footerCenterImg, null],
    [t('audit.footerRight'), s.footerRightImg, null],
  ]) {
    if (!url) continue;
    if (String(url).startsWith('data:')) {
      const kb = auditDataUriSize(url);
      items.push({ kind: 'warn', text: t('audit.imgEmbedded', { what: label, size: kb < 1024 ? `${kb} B` : `${Math.round(kb / 1024)} KB` }) });
    } else {
      items.push({ kind: 'ok', text: t('audit.imgHosted', { what: label }) });
    }
    if (alt !== null && !String(alt || '').trim() && !String(url).startsWith('data:')) {
      items.push({ kind: 'warn', text: t('audit.imgNoAlt', { what: label }) });
    }
  }

  /* required fields */
  if (!String(p.name || '').trim()) items.push({ kind: 'warn', text: t('audit.missingName') });
  if (!String(c.email || '').trim()) items.push({ kind: 'warn', text: t('audit.missingEmail') });

  /* links */
  let links = 0;
  if (c.website) links += 1;
  links += (state.socials || []).filter(x => String(x.url || '').trim()).length;
  if (s.bannerLink) links += 1;
  if (s.supportChatUrl) links += 1;
  if (s.recogniseUrl) links += 1;
  if (s.showBooking && c.bookingUrl) links += 1;
  items.push({ kind: 'info', text: t('audit.links', { n: links }) });

  /* weight + length */
  if (html) {
    const kb = html.length < 1024 ? `${html.length} B` : `${Math.round(html.length / 1024)} KB`;
    items.push({ kind: 'info', text: t('audit.weight', { size: kb }) });
  }
  const lines = plain ? plain.split('\n').filter(l => l.trim()).length : 0;
  if (lines) items.push({ kind: 'info', text: t('audit.lines', { n: lines }) });

  /* Outlook quirks */
  if (!s.strictOutlook && (s.showCard || s.roundPhoto || s.photoShape !== 'square')) {
    items.push({ kind: 'warn', text: t('audit.outlookRadius') });
  }
  if (s.showQr) items.push({ kind: 'info', text: t('audit.qr') });
  if (s.customHtml && String(s.customHtml).trim()) {
    items.push({ kind: 'warn', text: t('audit.customHtml') });
  }

  /* Image strategy: point the user at the right mode for their setup. */
  if (s.imageMode === 'cid') {
    items.push({ kind: 'info', text: t('audit.cidModeInfo') });
  } else {
    const dataUriImages = [s.logoUrl, s.bannerUrl, s.footerLeftImg, s.footerCenterImg, s.footerRightImg]
      .concat((state.socials || []).map(x => x.iconUrl))
      .filter(v => String(v || '').startsWith('data:'));
    if (dataUriImages.length) items.push({ kind: 'info', text: t('audit.dataUriInfo') });
  }

  if (!items.length) items.push({ kind: 'ok', text: t('audit.allGood') });

  const warns = items.filter(i => i.kind === 'warn').length;
  const summary = warns === 0 ? t('audit.summaryClean') : t('audit.summaryWarn', { n: warns });
  return { summary, items, labels: { ok, warn, info } };
}

function auditTextReport(state) {
  const r = buildAudit(state);
  const lines = [t('audit.title'), '='.repeat(40), r.summary, ''];
  for (const item of r.items) {
    lines.push(`[${item.kind === 'warn' ? r.labels.warn : item.kind === 'ok' ? r.labels.ok : r.labels.info}] ${item.text}`);
  }
  return lines.join('\n');
}
