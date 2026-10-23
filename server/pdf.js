'use strict';
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const DP = require('../shared/domain');
function quotationPdf(q, state) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const settings = q.companySnapshot || state.set, customer = q.customerSnapshot || state.customers.find(c => c.id === q.cid) || {};
  const totals = DP.totals(q, state.set);
  doc.setFillColor(11, 85, 96); doc.rect(0, 0, 210, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(11, 85, 96);
  doc.text(String(settings.name), 14, 22, { maxWidth: 180 });
  autoTable(doc, { startY: 30, body: [[settings.tag], [settings.addr], [[settings.phone, settings.email, settings.web].filter(Boolean).join(' | ')], ['GSTIN: ' + settings.gstin]], theme: 'plain', styles: { fontSize: 9, cellPadding: 1 }, margin: { left: 14, right: 14 } });
  autoTable(doc, { startY: doc.lastAutoTable.finalY + 7, head: [['QUOTATION', 'QUOTED TO']], body: [[[`No: ${q.no}`, `Date: ${q.date}`, `Valid until: ${q.valid}`, q.project, q.subject].filter(Boolean).join('\n'), [customer.name, customer.co, customer.addr, customer.mob, customer.email, customer.gstin].filter(Boolean).join('\n')]], headStyles: { fillColor: [11, 85, 96] }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 0: { cellWidth: 90 } } });
  autoTable(doc, { startY: doc.lastAutoTable.finalY + 6, head: [['#', 'Product / Service', 'Specifications', 'Qty', 'Unit (INR)', 'Amount (INR)']], body: q.items.map((i, k) => [k + 1, i.name, i.sp.join('\n') + (settings.showNotes && i.notes ? '\nNote: ' + i.notes : ''), i.qty, DP.rs(Math.round(i.sub / i.qty)), DP.rs(i.sub)]), headStyles: { fillColor: [11, 85, 96] }, styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 9 }, 2: { cellWidth: 60 }, 3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' } } });
  const rows = [['Product subtotal', DP.rs(totals.ib)], ['Item-level charges', DP.rs(totals.ic)], ['Delivery & other charges', DP.rs(totals.qc)], ['Discount', '- ' + DP.rs(totals.disc)], ['Taxable amount', DP.rs(totals.taxable)]];
  for (const b of totals.br) { const first = Math.floor(b.x / 2); rows.push([`CGST ${b.r / 2}%`, DP.rs(first)], [`SGST ${b.r / 2}%`, DP.rs(b.x - first)]); }
  rows.push(['GRAND TOTAL', DP.rs(totals.grand)]);
  autoTable(doc, { startY: doc.lastAutoTable.finalY + 4, body: rows, theme: 'plain', styles: { fontSize: 9 }, columnStyles: { 1: { halign: 'right' } }, margin: { left: 95, right: 14 } });
  autoTable(doc, { startY: doc.lastAutoTable.finalY + 7, head: [['Terms and conditions']], body: q.terms.map((t, i) => [`${i + 1}. ${t}`]), theme: 'plain', styles: { fontSize: 8 }, margin: { left: 14, right: 14 } });
  let y = doc.lastAutoTable.finalY + 20; if (y > 265) { doc.addPage(); y = 30; }
  doc.setFontSize(9); doc.setTextColor(30); doc.line(14, y, 70, y); doc.text('Authorized Signatory', 14, y + 5); doc.line(140, y, 196, y); doc.text('Customer Acceptance', 140, y + 5);
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) { doc.setPage(n); doc.setFontSize(7); doc.setTextColor(110); doc.text(`${q.no} | Page ${n} of ${pages}`, 14, 290); }
  return Buffer.from(doc.output('arraybuffer'));
}
module.exports = { quotationPdf };
