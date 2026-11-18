/* Signature Studio — real-world HTML signature import fixtures.
   Browser-executed: parseSignatureHTML uses DOMParser, which node lacks.
   Load this after socials.js and import.js, then call runImportFixtureTests(). */
'use strict';

/* Each fixture: { name, html, expect }. `expect` lists the facts the importer
   must extract. Supported keys: name, title, company, department, email,
   phone, mobile, website, legal, legalText, logo, logoPosition, banner,
   socials (array of network ids). */
const FIXTURES = [
  {
    name: 'gmail-basic',
    html: [
      '<div dir="ltr">',
      '  <div><b>Jane Doe</b></div>',
      '  <div>Senior Marketing Manager</div>',
      '  <div><a href="mailto:jane@example.com">jane@example.com</a></div>',
      '  <div><a href="tel:+15551234567">+1 (555) 123-4567</a></div>',
      '  <div><span style="color:rgb(153,153,153);font-size:10px">This email and any attachments are confidential and may be privileged. If you received this in error, please delete it and notify the sender.</span></div>',
      '</div>',
    ].join(''),
    expect: {
      name: 'Jane Doe',
      title: 'Senior Marketing Manager',
      email: 'jane@example.com',
      phone: '+15551234567',
      legal: true,
      logo: false,
    },
  },
  {
    name: 'gmail-image',
    html: [
      '<div dir="ltr">',
      '  <div><b>Jane Doe</b></div>',
      '  <div>Senior Marketing Manager</div>',
      '  <div><a href="mailto:jane@example.com">jane@example.com</a></div>',
      '  <div><img src="https://lh3.googleusercontent.com/a/ACg8ocJr-signature-logo96" width="96" height="32" alt="Acme logo"></div>',
      '  <div><a href="https://www.linkedin.com/in/janedoe" target="_blank">LinkedIn</a>&nbsp;|&nbsp;<a href="https://github.com/janedoe" target="_blank">GitHub</a></div>',
      '  <div><span style="color:rgb(102,102,102);font-size:10px">This message is confidential and intended solely for the named addressee.</span></div>',
      '</div>',
    ].join(''),
    expect: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      legal: true,
      logo: true,
      logoPosition: 'right',
      socials: ['linkedin', 'github'],
    },
  },
  {
    name: 'outlook-desktop',
    html: [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">',
      '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>p.MsoNormal,li.MsoNormal,div.MsoNormal {margin:0in;font-size:11.0pt;font-family:"Calibri",sans-serif}a:link,span.MsoHyperlink {color:#0563c1}</style></head>',
      '<body lang="EN-AU" style="word-wrap:break-word">',
      '<div class="WordSection1">',
      '<p class="MsoNormal"><img width="220" height="48" id="Picture_x0020_1" src="https://www.acmecorp.example/signature/logo.png" alt="Acme logo"></p>',
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p>',
      '<p class="MsoNormal"><b><span style="font-size:12.0pt;font-family:&quot;Segoe UI&quot;,sans-serif;mso-fareast-font-family:&quot;Times New Roman&quot;;color:#1f3864">John Smith</span></b><o:p></o:p></p>',
      '<p class="MsoNormal"><span style="font-size:9.0pt;font-family:&quot;Segoe UI&quot;,sans-serif;mso-fareast-font-family:&quot;Times New Roman&quot;;color:#333333">Director of Operations<o:p></o:p></span></p>',
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p>',
      '<p class="MsoNormal"><span style="font-size:9.0pt"><a href="mailto:john.smith@acmecorp.example"><span style="color:#0563c1">john.smith@acmecorp.example</span></a><o:p></o:p></span></p>',
      '<p class="MsoNormal"><span style="font-size:9.0pt">Office&nbsp;<a href="tel:+61255512345"><span style="color:#0563c1">+61 2 5551 2345</span></a><o:p></o:p></span></p>',
      '<p class="MsoNormal"><span style="font-size:9.0pt">Mobile&nbsp;<a href="tel:+61455598765"><span style="color:#0563c1">+61 4 5559 8765</span></a><o:p></o:p></span></p>',
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p>',
      '<p class="MsoNormal"><span style="font-size:8.0pt;font-family:&quot;Segoe UI&quot;,sans-serif;mso-fareast-font-family:&quot;Times New Roman&quot;;color:#7f7f7f">This message and any attachments are confidential and may contain privileged information intended only for the named recipient. If you are not the intended recipient, please delete this message immediately.<o:p></o:p></span></p>',
      '</div>',
      '</body>',
      '</html>',
    ].join(''),
    expect: {
      name: 'John Smith',
      title: 'Director of Operations',
      email: 'john.smith@acmecorp.example',
      phone: '+61255512345',
      mobile: '+61455598765',
      legal: true,
      logo: true,
      logoPosition: 'left',
    },
  },
  {
    name: 'apple-mail',
    html: [
      '<div dir="auto" style="font-family:-apple-system,BlinkMacSystemFont,AppleSystemUIFont,Helvetica,Arial,sans-serif">',
      '<p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,AppleSystemUIFont,Helvetica,Arial,sans-serif"><b>Sam Rivera</b></p>',
      '<p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,AppleSystemUIFont,Helvetica,Arial,sans-serif">Product Designer</p>',
      '<p style="margin:0 0 4px"><a href="mailto:sam@samrivera.design">sam@samrivera.design</a></p>',
      '<p style="margin:0"><img src="https://samrivera.design/signature/logo.png" width="120" height="40" alt="Logo"></p>',
      '</div>',
    ].join(''),
    expect: {
      name: 'Sam Rivera',
      title: 'Product Designer',
      email: 'sam@samrivera.design',
      legal: false,
      logo: true,
    },
  },
];

/* Run every fixture through parseSignatureHTML and report which expected
   facts were not extracted. Returns {passed, failed, results:[{name, ok,
   missing, notes}]}. */
function runImportFixtureTests() {
  const results = [];
  for (const fx of FIXTURES) {
    let parsed;
    try {
      parsed = parseSignatureHTML(fx.html);
    } catch (e) {
      results.push({ name: fx.name, ok: false, missing: ['exception: ' + e.message], notes: [] });
      continue;
    }
    const missing = [];
    const ex = fx.expect || {};
    const has = k => Object.prototype.hasOwnProperty.call(ex, k);
    if (has('name') && parsed.profile.name !== ex.name) missing.push('name');
    if (has('title') && parsed.profile.title !== ex.title) missing.push('title');
    if (has('company') && parsed.profile.company !== ex.company) missing.push('company');
    if (has('department') && parsed.profile.department !== ex.department) missing.push('department');
    if (has('email') && parsed.contact.email !== ex.email) missing.push('email');
    if (has('phone') && parsed.contact.phone !== ex.phone) missing.push('phone');
    if (has('mobile') && parsed.contact.mobile !== ex.mobile) missing.push('mobile');
    if (has('website') && parsed.contact.website !== ex.website) missing.push('website');
    if (has('legal') && !!parsed.design.showLegal !== !!ex.legal) missing.push('legal');
    if (has('legalText') && !(parsed.design.legalText || '').includes(ex.legalText)) missing.push('legalText');
    if (has('logo') && !!parsed.design.logoUrl !== !!ex.logo) missing.push('logo');
    if (has('logoPosition') && (parsed.design.logoPosition || 'left') !== ex.logoPosition) missing.push('logoPosition');
    if (has('banner') && !!parsed.design.bannerUrl !== !!ex.banner) missing.push('banner');
    if (has('socials')) {
      const nets = (parsed.socials || []).map(s => s.network);
      for (const n of ex.socials) if (!nets.includes(n)) missing.push('social:' + n);
    }
    results.push({ name: fx.name, ok: missing.length === 0, missing: missing, notes: parsed.notes || [] });
  }
  const passed = results.filter(r => r.ok).length;
  return { passed: passed, failed: results.length - passed, results: results };
}
