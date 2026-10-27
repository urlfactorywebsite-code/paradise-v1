'use strict';
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const DP = require('../shared/domain');

const TEAL = [11, 85, 96];
const ORANGE = [226, 121, 44];
const INK = [38, 51, 59];
const PALE = [243, 247, 248];
const string = value => String(value ?? '');
const pageMargin = { top: 24, bottom: 24, left: 14, right: 14 };
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(string(value)) ? value.split('-').reverse().join('/') : string(value);

function renderQuotation(q, state, compact = false) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const settings = DP.companyDetails(q.companySnapshot || state.set);
  const terms = DP.companyDetails({ terms: q.terms }).terms;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  const footerLines = settings.footer ? doc.splitTextToSize(string(settings.footer).replace(/\s+/g, ' ').trim(), 180) : [];
  const footerTop = 279 - Math.max(0, footerLines.length - 2) * 3;
  const margin = { ...pageMargin, bottom: 297 - footerTop + 6 };
  const customer = q.customerSnapshot || state.customers.find(c => c.id === q.cid) || {};
  const totals = DP.totals(q, settings);
  const taxDisplay = q.taxDisplay || settings.taxDisplay || 'split';
  const currency = settings.currency || 'INR';
  const money = value => currency === 'INR' ? DP.rs(value) : `${currency} ${(value / 100).toFixed(2)}`;
  const fontSize = compact ? 8 : 8.8;
  const padding = compact ? 1.2 : 1.8;
  const gap = compact ? 3 : 4;
  const table = options => autoTable(doc, {
    margin, theme: 'plain', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize, cellPadding: padding, overflow: 'linebreak', textColor: INK, valign: 'top', lineColor: [222, 230, 232], lineWidth: 0 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    ...options,
  });
  const position = () => ({ page: doc.getCurrentPageInfo().pageNumber, y: doc.lastAutoTable.finalY });
  doc.setProperties({ title: `Quotation ${q.no}`, subject: q.subject || 'Product and service quotation', author: string(settings.name), creator: 'Design Paradise Quotation Manager' });

  // Keep company identity and quotation metadata on the same line of the layout.
  let nameX = 14, logoBottom = 0;
  // Embedded PNG/JPEG images only: customer PDFs never fetch remote logo URLs.
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(settings.logo || '')) {
    try {
      const image = doc.getImageProperties(settings.logo);
      const scale = Math.min(20 / image.width, 20 / image.height);
      const width = image.width * scale, height = image.height * scale;
      doc.addImage(settings.logo, image.fileType, 14, 14, width, height);
      nameX = 38;
      logoBottom = 14 + height;
    } catch {
      // Legacy image data must not make a saved quotation unreadable.
    }
  }
  table({ startY: 13, margin: { ...margin, left: nameX, right: 78 },
    body: [
      [{ content: string(settings.name), styles: { fontSize: compact ? 16 : 18, fontStyle: 'bold', textColor: TEAL } }],
      ...[settings.tag, settings.addr, [settings.phone, settings.email].filter(Boolean).join(' | '), settings.web, settings.gstin && `GSTIN: ${settings.gstin}`].filter(Boolean).map(value => [string(value)]),
    ], styles: { fontSize: compact ? 7.8 : 8.2, cellPadding: { top: 0.6, bottom: 0.6, left: 0, right: 0 }, textColor: INK, overflow: 'linebreak' },
  });
  const companyEnd = position();
  doc.setPage(1);
  table({ startY: 14, margin: { ...margin, left: 137 }, body: [
    [{ content: 'QUOTATION', styles: { fontSize: 15, fontStyle: 'bold', textColor: TEAL } }],
    [{ content: string(q.no), styles: { fontStyle: 'bold' } }],
    [`Date: ${date(q.date)}`], [`Valid until: ${date(q.valid)}`],
  ], styles: { fontSize, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 1 }, halign: 'right', textColor: INK, overflow: 'linebreak' } });
  const metadataEnd = position();
  const headerEnd = companyEnd.page > metadataEnd.page ? companyEnd : metadataEnd.page > companyEnd.page ? metadataEnd : { page: companyEnd.page, y: Math.max(companyEnd.y, metadataEnd.y, logoBottom) };
  doc.setPage(headerEnd.page);
  const quoteDetails = [q.project && `Project: ${q.project}`, q.ref && `Reference: ${q.ref}`,
    q.subject && `Subject: ${q.subject}`, q.req && `Requirements: ${q.req}`].filter(Boolean).join('\n');
  const customerDetails = [customer.name, customer.co, customer.person && `Contact: ${customer.person}`, customer.addr,
    customer.mob && `Mobile: ${customer.mob}`, (customer.wa || customer.whatsapp) && `WhatsApp: ${customer.wa || customer.whatsapp}`,
    customer.email, customer.gstin && `GSTIN: ${customer.gstin}`].filter(Boolean).join('\n');
  table({ startY: headerEnd.y + gap, head: [['QUOTED TO', 'PROJECT DETAILS']], body: [[customerDetails, quoteDetails]],
    bodyStyles: { fillColor: PALE }, columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } },
  });

  table({
    startY: doc.lastAutoTable.finalY + gap,
    head: [['#', 'Product / Service', 'Specifications', 'Qty', `Unit (${currency})`, `Amount (${currency})`]],
    body: q.items.map((item, index) => {
      const taxMode = item.taxMode || 'exclusive';
      const basis = taxMode === 'exempt' ? 'Tax exempt' : taxMode === 'inclusive' ? `Includes GST ${item.tax}%` : `GST ${item.tax}% extra`;
      // Rebuild customer specifications from trusted saved field metadata. The
      // shared formatter also sanitizes legacy snapshots and always excludes
      // internal-only values, including when a visibility flag was supplied.
      return [index + 1, string(item.name), [...DP.customerSpecifications(item), basis].join('; '), item.qty, money(Math.round(item.sub / item.qty)), money(item.sub)];
    }),
    alternateRowStyles: { fillColor: PALE },
    styles: { fontSize: compact ? 8 : 8.3, cellPadding: padding, overflow: 'linebreak', textColor: INK, lineColor: [222, 230, 232], lineWidth: { bottom: 0.15 } },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 31, fontStyle: 'bold' }, 2: { cellWidth: 73 }, 3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 29, halign: 'right', fontStyle: 'bold' } },
  });

  const rows = [['Product subtotal', money(totals.ib)]];
  // Omit inapplicable charges, retaining every amount that contributes to the total.
  if (totals.ic) rows.push(['Item-level charges', money(totals.ic)]);
  if (q.del) rows.push(['Delivery charges', money(DP.R(q.del))]);
  if (q.oth) rows.push(['Other charges', money(DP.R(q.oth))]);
  if (totals.disc) rows.push(['Discount', '- ' + money(totals.disc)]);
  rows.push(['Net taxable amount', money(totals.taxable)]);
  for (const bracket of totals.br) {
    if (!bracket.r) { rows.push(['Zero-rated / exempt (0%)', money(bracket.x)]); continue; }
    if (taxDisplay === 'igst') rows.push([`IGST ${bracket.r}%`, money(bracket.x)]);
    else {
      const first = Math.floor(bracket.x / 2);
      rows.push([`CGST ${bracket.r / 2}%`, money(first)], [`SGST ${bracket.r / 2}%`, money(bracket.x - first)]);
    }
  }
  rows.push(['GRAND TOTAL', money(totals.grand)]);

  // Use two columns for ordinary quotations. Extensive narrative text uses the
  // full width after the totals, avoiding mostly empty continuation pages.
  const bottomStart = position();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(fontSize);
  const narrativeLines = [settings.customerNotes, ...(terms || [])].filter(Boolean).reduce((count, text) => count + doc.splitTextToSize(string(text), 89).length + 1, 0);
  const fullWidthNarrative = narrativeLines * fontSize * 1.15 / doc.internal.scaleFactor > 297 - margin.bottom - margin.top;
  table({ startY: bottomStart.y + gap, body: rows, pageBreak: 'avoid', margin: { ...margin, left: 113 },
    styles: { fontSize, cellPadding: compact ? 1.3 : 1.8, textColor: INK, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 47 }, 1: { cellWidth: 36, halign: 'right' } },
    didParseCell(data) {
      if (data.row.index === rows.length - 1) {
        Object.assign(data.cell.styles, { fontStyle: 'bold', fillColor: TEAL, textColor: 255, cellPadding: compact ? 2 : 2.4 });
      }
    },
  });
  const rightEnd = position();
  let leftEnd = fullWidthNarrative ? { ...rightEnd, y: rightEnd.y + gap } : { ...bottomStart, y: bottomStart.y + gap };
  doc.setPage(leftEnd.page);
  const leftMargin = fullWidthNarrative ? margin : { ...margin, right: 103 };
  const sectionHead = { fillColor: false, textColor: TEAL, fontStyle: 'bold' };
  if (settings.customerNotes) {
    table({ startY: leftEnd.y, margin: leftMargin, head: [['Notes for the customer']], body: [[string(settings.customerNotes)]], headStyles: sectionHead, rowPageBreak: 'auto' });
    leftEnd = position(); leftEnd.y += gap;
  }
  if (terms?.length) {
    table({ startY: leftEnd.y, margin: leftMargin, head: [['Terms and conditions']], rowPageBreak: 'auto',
      body: terms.map((term, index) => [`${index + 1}. ${term}`]), headStyles: sectionHead,
      styles: { fontSize: compact ? 8 : 8.2, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 1 }, overflow: 'linebreak', textColor: INK },
    });
    leftEnd = position();
  }
  const end = leftEnd.page > rightEnd.page ? leftEnd : rightEnd.page > leftEnd.page ? rightEnd : { page: leftEnd.page, y: Math.max(leftEnd.y, rightEnd.y) };
  doc.setPage(end.page);
  table({ startY: end.y + gap, body: [[
    `Authorized Signatory${settings.signature ? '\n' + string(settings.signature) : ''}`,
    'Customer Acceptance',
  ]], pageBreak: 'avoid', margin,
    styles: { fontSize: 8.3, cellPadding: { top: 12, bottom: 2, left: 0, right: 0 }, textColor: INK, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91, halign: 'right' } },
    didDrawCell(data) {
      doc.setDrawColor(163, 183, 187); doc.setLineWidth(0.2);
      const x = data.column.index === 0 ? 14 : 134;
      doc.line(x, data.cell.y + 10, x + 62, data.cell.y + 10);
    },
  });

  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFillColor(...TEAL); doc.rect(0, 0, 210, 3, 'F');
    doc.setFillColor(...ORANGE); doc.rect(0, 3, 210, 0.8, 'F');
    if (n > 1) {
      doc.setTextColor(...TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(doc.splitTextToSize(string(settings.name), 120)[0], 14, 14);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(string(q.no), 58)[0], 196, 14, { align: 'right' });
      doc.setDrawColor(222, 230, 232); doc.line(14, 18, 196, 18);
    }
    doc.setDrawColor(215); doc.setLineWidth(0.2); doc.line(14, footerTop, 196, footerTop);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100);
    if (footerLines.length) doc.text(footerLines, 14, footerTop + 4);
    doc.text(`Page ${n} of ${pages}`, 14, 292);
    doc.text(`Amounts in ${currency} | Quotation`, 196, 292, { align: 'right' });
  }
  return doc;
}

function quotationPdf(q, state) {
  let doc = renderQuotation(q, state);
  if (doc.getNumberOfPages() > 1) {
    // Use a bounded, readable compact layout only when it achieves one page.
    const compact = renderQuotation(q, state, true);
    if (compact.getNumberOfPages() === 1) doc = compact;
  }
  return Buffer.from(doc.output('arraybuffer'));
}
module.exports = { quotationPdf };
