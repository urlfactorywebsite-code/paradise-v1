# Design Paradise user guide

This application prepares quotations. Quoted values are offers to customers; they are not payments or collected revenue.

## First setup

Start the application using the [README](../README.md). On a new installation, create the first Administrator account. Use a unique password of 12-128 characters. There is no default login. Sample company information and catalog rates must be reviewed and replaced with Design Paradise's approved information before issuing customer quotations.

The Administrator should review Company Settings, product categories, products and pricing. Configure company identity, logo, GSTIN, quotation prefix and validity, public notes, footer, signatory and standard terms. Select the applicable tax treatment and CGST/SGST or IGST presentation. These settings must match the business's approved tax rules.

For an existing workspace, use **Products & Services > Add missing SRS catalog entries** to add the remaining service names. These entries start inactive with unapproved prices. Edit their specifications, configure approved prices, and activate them when ready. Existing products and prices are retained.

Create Employee accounts through User Management. Assign only the permissions required for each person's work. Deactivating an account revokes its sessions. Temporary password resets require the employee to choose a replacement password.

## Create a quotation

1. Open **Create Quotation** and select a customer, or create one. Check the billing and contact details. Store the customer's WhatsApp number separately, including the international dialing code, for example `+919000000001`.
2. Enter the quotation date, valid-until date, project, reference, subject and requirements. The server assigns the unique quotation number on save.
3. Select an active product. Complete its specifications and quantity. Area products calculate from width, height, unit and quantity; T-shirt quantities come from the size breakdown. Required fields, available options and pricing come from the product configuration.
4. Add the item. Repeat for additional products. Review each item's specifications and calculation; edit, duplicate or remove items as needed.
5. Enter permitted charges and discounts. The server enforces discount and charge permissions and calculates the saved prices and taxes. Review whether displayed product prices include tax or require tax to be added.
6. Review terms and the financial summary, preview the quotation, then save the Draft. Generate or download its PDF after saving.

Internal item notes and customer internal notes are excluded from customer PDFs. Use the dedicated customer-facing notes setting for information that should appear on a document. Product specifications and requirements are customer-facing information.

Saved quotations retain product prices, specifications, company details, customer details and tax settings as snapshots. Updating the catalog does not update old quotations. **Refresh prices** explicitly applies current prices. **Duplicate** creates a new Draft and number while preserving the original quotation's stored values.

## Review and statuses

Use **All Quotations** to search and filter saved quotations. Open a quotation to review its PDF and status history. Drafts are editable according to assigned permissions. Status changes are recorded with the acting user and time.

The statuses are Draft, Pending Internal Review, Approved Internally, Sent to Customer, Customer Approved, Customer Rejected, Expired and Cancelled. Internal approval and customer approval are separate actions. When independent approval is enabled, a creator cannot approve their own quotation. Sending or downloading a PDF never establishes customer approval.

Employees normally see their own quotations and reports. An Administrator may grant additional access. Historical records whose original owner cannot be safely identified require Administrator access.

## Share on WhatsApp

This installation supports a clearly identified **manual click-to-chat handoff**. It does not automatically attach a PDF, send a message, or confirm WhatsApp delivery/read status. An official Business Platform/provider connection requires separate account setup, credentials and approved messaging configuration.

1. Save the quotation, open **Share on WhatsApp**, and review the customer's international WhatsApp number and prepared message.
2. Prepare the handoff. The application retains a protected PDF for that attempt and records its state as **Prepared**.
3. Download that PDF, open the prepared WhatsApp chat, attach the PDF and send the message in WhatsApp.
4. Return to **WhatsApp Sharing History** and mark the handoff **Manually Confirmed** only after completing it, or **Failed** with a useful note.

**Manually Confirmed** is an employee's confirmation of a manual action. It is not a provider delivery receipt. A valid phone-number format does not prove that a number has a WhatsApp account. Retry only after reviewing a failed attempt; the retry is linked to its original history entry. A saved sharing PDF remains available to authorized users even if the quotation is later edited.

WhatsApp handoff status and quotation status remain separate. Record **Sent to Customer** or a customer decision only when the corresponding business event has occurred.

## Reports and data care

Use Dashboard and Reports filters to inspect the records you are permitted to see. CSV exports contain quotation values. Review quotation counts by date, customer, employee and status, and frequently quoted products. Review sharing history separately for manual handoffs and failures.

The Administrator can create and download database backups from Settings. Keep backups off the application machine and protect them as confidential business data. Restore and account recovery commands are documented in the README. Browser storage is not the production database.

If another user changes a record while it is open, reload its latest version and review your draft before retrying. A conflict must not be resolved by blindly repeating a write. Check connectivity when an action fails; do not repeatedly prepare WhatsApp handoffs without reviewing sharing history.

Public hosting, HTTPS, restore operations and outbound messaging account setup require the deployment steps and business inputs described in the README. Local tests alone do not verify a production installation.
