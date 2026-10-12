/**
 * English changelog, keyed by version. Every entry in CHANGELOG (lib/version.ts) needs one here with
 * the same number of `changes`, in the same order; changelog.test.ts enforces it.
 */
export interface ChangelogTranslation {
  title: string;
  changes: string[];
}

export const CHANGELOG_EN: Readonly<Record<string, ChangelogTranslation>> = {
  '4.1.0': {
    title: 'Cross-Module Demo Data and Release Tooling',
    changes: [
      'Demo Data in Settings > Backup & Restore replaces Dummy Data: documents are created through the real application flows (approvals, journals, stock, audit trail) across sales, purchasing, production, inventory, assets, finance, EAM, and sample AIRA conversations',
      'Exclusive mode: demo data can only be created while there are no transactions, and is removed entirely by typing HAPUS without touching users, the chart of accounts, or System Accounts',
      'Fixed: invoice and deposit KPI cards no longer show the amount twice; returns awaiting approval show their estimated amount instead of Rp 0',
      'The AIRA panel explains when the service has been disabled by an administrator and no longer shows "No conversations yet"',
      'Release tooling: versions are synced and checked in CI, and a version tag publishes a GitHub Release from the changelog',
    ],
  },
  '4.0.0': {
    title: 'AIRA MCP, New Chat Panel, and Bilingual Interface',
    changes: [
      'AIRA integration rebuilt: Entaris is now an MCP server (`POST /mcp`, 474 tools, 14 toolsets) with per-user identity, access tiers, and human approval for risky actions',
      'New AIRA chat panel: sessions and messages stored by Entaris (history, search, archive, export, attachments), agent called through an OpenAI-compatible API, result cards and tool progress chips',
      'Cash-book drafts from receipts: debit/credit direction decided deterministically on the server, human account corrections are learned, suspicious rows flagged for review',
      'Bilingual Indonesian/English interface across all modules, PDFs, API error messages, and the in-app changelog',
      'Loose SQL migrations now run automatically with a ledger on every container boot',
      'Fixed: GRN from a PO now fills quantities and updates the PO received quantity; Delivery Notes carry the customer PO number and SO number',
      'BREAKING: env AIRA_CORE_BASE_URL/AIRA_API_TOKEN and the aira-net network removed; tables ai_whitelist and ai_executed_runs dropped; AIRA_ENGINE_URL, AIRA_ENGINE_KEY, AIRA_ENGINE_TURN_SECRET must be set. Take a pg_dump backup before upgrading',
    ],
  },
  '3.19.0': {
    title: 'Temporary Delivery Notes, COGS Fixes, and Finance-Integrated EAM',
    changes: [
      'Temporary Delivery Notes (SJS): new tab under Sales > Delivery Notes for goods shipped before production is entered; no stock or journal, linked to the official DO',
      'One purchase invoice can bill more than one GRN; WAC guard rejects zero-price GRNs for own goods',
      'Account 5.12 Conversion Cost Charged to Inventory and pure raw-material cost (WAC2) on production detail',
      'Automatic COGS settlement reversal when a production run, purchase invoice, or manual movement is cancelled/edited',
      'GA bills (vehicle tax/registration/inspection, service, material requests) integrated with finance: direct journal or purchase invoice',
      'Company logo on all financial report PDFs; Bank & Cash page opens manual journal details',
    ],
  },
  '3.18.1': {
    title: 'PDF Export of Periodic Vehicle Inspection Results',
    changes: [
      'New "PDF" button on each row of the vehicle inspection history: download a single inspection result as a PDF ready to print or archive',
      'PDF contents: vehicle identity, date & odometer, inspector, fuel level, overall result, next inspection date, checklist per category with color-coded status (OK/Needs Attention/Damaged), notes, and evidence photos per category',
      'Inspection checklists in the old format are still printed under the "Checklist (old format)" group',
      'Inspection photos are now loaded with an access-rights check. Previously photos did not appear because the direct link to the file could not be opened',
    ],
  },
  '3.18.0': {
    title: 'Periodic Vehicle Inspection: Comprehensive',
    changes: [
      'Inspection checklist expanded from 12 flat items to 33 sub-items grouped into 6 categories (Engine & Fluids, Electrical, Brakes & Steering, Tyres & Wheels, Safety, Other) with an accordion view per category',
      'Visual evidence photos per inspection category (optional, max 5 MB/photo), saved and shown in the inspection history',
      'Inspector name recorded: choose from the user list or type it manually for inspectors outside the system',
      'Fuel level at inspection (Empty / Quarter / Half / Three Quarters / Full)',
      'Next inspection date calculated automatically (default 30 days, interval adjustable) + Overdue/due soon reminder status, the same pattern as tax & insurance',
      'New fleet KPI: Inspections Due (overdue / <30 days / never inspected)',
      'Each inspection history row can be expanded to see the checklist detail per category + photos; old-format inspection data remains readable under the "Checklist (old format)" group',
    ],
  },
  '3.17.0': {
    title: 'EAM (Enterprise Asset Management): Its Own App, Still One Dataset',
    changes: [
      'The EAM module now has its own web app on the EAM subdomain, still using the same server and database as the ERP',
      'SSO login: one ERP account is used for EAM via a cross-subdomain shared cookie, no need to log in again',
      'The EAM login screen is distinguished from the ERP one (teal/emerald palette, asset/maintenance-specific icons & copy) so users do not mix them up',
      'Compact EAM dashboard: total assets, net book value (NBV), active/overdue work orders, breakdown per asset category, quick links to all modules',
      'Automatic filter per module (e.g. clicking Vehicles shows only the Vehicles category), with several categories at once possible',
      'The GA (General Affairs) module in the main ERP stays active and is connected to EAM in real time: data & actions are synced both ways',
    ],
  },
  '3.16.9': {
    title: 'Fix: old Delivery Orders not showing + "Invoiced" filter empty',
    changes: [
      'The Delivery Order list used to load only the latest 200 and then filter them in the browser. Older delivery orders (>200) did not appear at all. Filtering, search, and paging are now processed on the server so all data is reachable',
      'The "Invoiced" tab was previously always empty (status was compared the wrong way). It now correctly shows delivery orders that have been billed',
    ],
  },
  '3.16.8': {
    title: 'Fix: empty cash/bank account dropdown when receiving a deposit on an SO',
    changes: [
      'The "Receive Deposit" form in SO detail: the Cash/Bank dropdown did not appear because the wrong data was fetched. Fixed by using the same account list as other modules. Accounts 1.1.x now appear',
    ],
  },
  '3.16.7': {
    title: 'Delivery Orders may exceed the SO quantity (over-delivery)',
    changes: [
      'Generating a Delivery Order from an SO no longer blocks quantities that exceed the remaining order. Staff can ship more than the SO quantity (recorded as "+X over" on the SO)',
      'The "Pull from SO" form now shows all rows (including fully delivered ones, prefilled with 0) so it can be used for additional shipments',
    ],
  },
  '3.16.6': {
    title: 'SO: delivered quantity always follows the actual Delivery Order figures',
    changes: [
      'SO delivered quantity is now recalculated from the total of linked active Delivery Orders, instead of being incremented bit by bit, which could drift. Over-delivery (+X over) is shown correctly',
      'Editing a Delivery Order no longer breaks its link to the SO: rows are automatically relinked & the SO is recalculated. Cancelling a Delivery Order also recalculates in the same way',
    ],
  },
  '3.16.5': {
    title: 'SO: Download PDF merges attachments (PNG/PDF)',
    changes: [
      'The Download PDF button in SO detail now merges the SO attachment files (photos/PDFs) into a single PDF file. File name "<SO>_with_lampiran.pdf". Without attachments it still downloads the regular SO PDF',
    ],
  },
  '3.16.4': {
    title: 'SO: Download PDF (complete with deliveries & invoices)',
    changes: [
      '"Download PDF" button in SO detail: print the sales order with its items, a deposit summary, the list of related Delivery Orders, and related Invoices in one document',
    ],
  },
  '3.16.3': {
    title: 'SO: deposit breakdown (Received · Used · Remaining)',
    changes: [
      'The deposit panel in SO detail now shows Deposit Used (already applied to invoices) & Remaining Deposit. Previously only the total received was shown, so it seemed never to decrease',
      'Plus separate Grand Total & Remaining Balance rows for clarity',
    ],
  },
  '3.16.2': {
    title: 'SO: show over-delivery (more than ordered)',
    changes: [
      'SO detail: the Remaining column now shows "+X over" (blue) when the delivered quantity exceeds the ordered quantity. Previously only a green check mark was shown (the excess was hidden)',
    ],
  },
  '3.16.1': {
    title: 'Delivery Order: Pull from SO (reduces the SO automatically)',
    changes: [
      'The Delivery Order form now has a "Pull from Sales Order (optional)" dropdown: choose an SO → rows are filled from the remaining undelivered quantity',
      'Delivery Orders pulled from an SO automatically add to the delivered quantity & update the SO status (Partially Delivered/Completed), through the existing generate-do flow',
      'Without choosing an SO: still a free-standing delivery order as usual (not linked to an SO)',
    ],
  },
  '3.16.0': {
    title: 'Negative-Stock Delivery Orders via Approval (Not Admin-Only)',
    changes: [
      'Staff can still create a Delivery Order when stock is negative (goods shipped while production is running); it goes to the approval queue instead of being blocked',
      'Managers approve in the Approval tab (Delivery Order detail + negative-stock reason shown); the Delivery Order is created only after approval',
      'Holders of the "Bypass negative stock" permission can still proceed directly without approval',
    ],
  },
  '3.15.7': {
    title: 'Delivery Order: stock shown per selected warehouse',
    changes: [
      'The stock picker in Delivery Orders now shows & validates the stock of the warehouse selected on each row (not the total across all warehouses)',
      'Each row shows "Stock in this warehouse: X"; shortage warnings name the warehouse',
    ],
  },
  '3.15.6': {
    title: 'Redesigned /welcome Page',
    changes: [
      'Redesign of /welcome: navy color, bolder typography, fewer animations',
      'Hero visual replaced with an ERP dashboard mockup (simulated UI: sidebar, KPIs, cash flow chart, document status)',
      'Monochrome feature grid, dark-background How It Works section, improved heading contrast',
    ],
  },
  '3.15.5': {
    title: 'EAM: aligned asset category code prefixes',
    changes: [
      'Asset code numbering uses a consistent prefix per category (KND, MSN, BLD, TNH, ALT, IT, FRN, GDG, EQP); legacy Fixed Assets categories are aligned as well',
    ],
  },
  '3.15.4': {
    title: 'Production Data: search filter',
    changes: [
      'Search box in the Production Data tab: quickly search by production no., reference, item name (input/output), or notes',
    ],
  },
  '3.15.3': {
    title: 'EAM: group position in the main menu tidied up',
    changes: [
      'The EAM · Asset Management group moved between Accounting and Reports (no longer stuck under System); consistent in the menu & the Access Rights matrix',
    ],
  },
  '3.15.2': {
    title: 'EAM: menu order tidied up',
    changes: [
      'EAM module order: Assets → Vehicles → Buildings → Equipment → Maintenance/WO → Inventory → Documents → Master Data (logical flow: asset master, specialization, operations, support, configuration)',
    ],
  },
  '3.15.1': {
    title: 'EAM · Asset Management (GA renamed + Fixed Assets unified)',
    changes: [
      'The General Affairs menu group is renamed EAM · Asset Management',
      'Fixed Assets (accounting) are now unified with EAM assets: every fixed asset has the same EAM asset master (marked with a "Fixed Asset" badge)',
      'Fixed asset depreciation & journals keep running as they are; they are only linked, not changed',
    ],
  },
  '3.15.0': {
    title: 'General Affairs (GA) Module: GA Monitor Merged into 1 App',
    changes: [
      'New General Affairs menu group: Physical Assets, Documents & Certificates, GA Inventory, Maintenance/Work Orders, Vehicles, Buildings & Leases, Equipment & Calibration, GA Master Data',
      'GA Monitor merged into the ERP: one app, one login, one database',
      'GA access rights are managed via Settings → Access Rights (8 ga_* modules); public asset QR codes remain accessible without login',
    ],
  },
  '3.14.2': {
    title: 'Landing Page /welcome: Animations and New Sections',
    changes: [
      'Animated hero: moving gradient, floating particles & icons, hero card with a sonar effect, counter statistics',
      'Added a trust strip, a How It Works section, and sector badges; consistent with the AKS navy brand',
    ],
  },
  '3.14.1': {
    title: 'Fix: Invoice Status Colors (Cancelled Now Red)',
    changes: [
      'The "Cancelled" status in the Sales & Purchase Invoice lists is now red (previously blue, the same as "Submitted")',
      'Status labels made consistent across lists (Submitted, Partial, Cancelled)',
    ],
  },
  '3.14.0': {
    title: 'Public Product Landing Page (/welcome)',
    changes: [
      'Public landing page at /welcome introducing the Entaris product by PT Arah Karya Sinergi (features, principles, sign-in/consultation CTAs)',
      'Logged-in users are automatically redirected to the app; existing app routing is unchanged',
    ],
  },
  '3.13.4': {
    title: 'Fix: Purchase Submission Grand Total Rp 0 in Notifications & Approval List',
    changes: [
      'The value of Purchase Invoice submissions is now calculated correctly when they are created. Previously it was Rp 0 in Telegram notifications & the approval list (it only appeared in the detail) because the submission data did not store per-row values',
    ],
  },
  '3.13.3': {
    title: 'Branding: Replace Remaining "Keuangan" Text with ERP',
    changes: [
      'The browser tab title, login page subtitle, onboarding screen, and sidebar now use the product name instead of "Keuangan" (Finance), which was leftover old branding',
      'Accounting terms stay as they are (Financial Statements, Financial Ratios, etc.)',
    ],
  },
  '3.13.2': {
    title: 'Fix: Batches Already Selected No Longer Appear in Other Rows',
    changes: [
      'Batch picker (Stock Transfer, Production Run, Sales Invoice): batches already selected on another row are automatically hidden from the dropdown of subsequent rows. Prevents double allocation',
      'Reminder: for large transfers/production runs spread across many batches, use the "Split Batch" button so the quantity is split automatically (FIFO) without entering rows one by one',
    ],
  },
  '3.13.1': {
    title: 'Fix: Per-Row Total in Purchase Approval Detail Showing Rp 0',
    changes: [
      'Purchase Invoice submission detail: the final price total per item row is now calculated correctly (qty × price − discount + VAT − PPh). Previously it was always Rp 0 because the submission data did not store per-row values',
    ],
  },
  '3.13.0': {
    title: 'Automatic Batch Split (FIFO): Production & Stock Transfer',
    changes: [
      'A "Split Batch" button on input rows of Production Runs & Stock Transfers: enter the total quantity and the system automatically splits it into several rows by available batch (FIFO, oldest first)',
      'No more manual entry of one row per batch (e.g. transferring 9,950 kg spread across more than a dozen batches)',
      'Batches already used by other rows are not reallocated; quantity exceeding the batches automatically becomes a weighted average cost (WAC) row with a warning',
    ],
  },
  '3.12.3': {
    title: 'Fix: Production Cost Standard Dropdown Not Visible',
    changes: [
      'The cost standard picker in the Production Run form was squeezed to zero width by the basis dropdown (a regression from the custom dropdown sweep). It now displays normally',
      'The "Add Cost" row can again select the cost standard master per warehouse',
    ],
  },
  '3.12.2': {
    title: 'Fix: "Customer & Supplier" Parties Appear in Dropdowns on Both Sides',
    changes: [
      'Parties of type "Both" (Customer & Supplier) now also appear when selecting a Supplier (Goods Receipt, PO, Purchase Invoice, Supplier Deposit) as well as a Customer (SO, Sales Invoice, etc.)',
      'Previously Both parties did not appear in any dropdown, e.g. a reprocessing customer who is also the supplier on a customer-owned goods receipt',
    ],
  },
  '3.12.1': {
    title: 'Goods Receipt for Customer-Owned Goods (Reprocessing/Toll Manufacturing Services)',
    changes: [
      'A "Customer-Owned Goods" checkbox on the Goods Receipt (STT/BPB) form: receive goods owned by a customer for reprocessing (rice-to-rice)',
      'Automatic guardrails: only the quantity is recorded, with no inventory/payables value, and the item average price is not affected',
      'Customer-owned Goods Receipts do not appear in the Purchase Invoice selection and are blocked if forced to be invoiced. Bill the service through a Sales Invoice (service line)',
      '"Customer-Owned" badge in the Goods Receipt list & detail',
    ],
  },
  '3.12.0': {
    title: 'Project Guarantee Deposits: Deposit, Return/Forfeit, Due Date Reminders',
    changes: [
      'New module Cash & Bank → Project Guarantee Deposits: record bid/performance/maintenance guarantee deposits placed with the project owner',
      'Automatic journals: deposit (DR Guarantee Deposit 1.8 / CR Cash-Bank), settlement as returned and/or forfeited as an expense. Can be partial & repeated',
      'Automatic status Deposited → Completed; cancelling a deposit/settlement reverses the journal (special Cancel Document permission)',
      'Automatic reminders 7 days before the return due date and once it is overdue, via in-app notification + Telegram',
      'Asset account 1.8 Project Guarantee Deposits is created automatically; it can be changed in Settings → System Accounts',
    ],
  },
  '3.11.0': {
    title: 'Dynamic Roles & Access Rights (RBAC): Create Custom Roles + Permission Matrix',
    changes: [
      'Admins can create/delete their own roles (e.g. Cashier, Auditor, Purchasing Staff) via Settings → Access Rights',
      'Per-module permission matrix (View/Edit) configurable for each role without code changes; menus & access follow the permissions automatically',
      'Separate special permissions: approve submissions, skip approval, cancel/finalize documents, bypass negative stock, manage access rights',
      'Built-in roles (Admin/Accountant/Production Staff/Viewer) keep exactly the same access, with no change for existing users',
      'Role selection when creating/editing a user now follows the existing role list (dynamic)',
    ],
  },
  '3.10.0': {
    title: 'Approval Directly from Telegram (Approve / Reject / Request Revision)',
    changes: [
      'Managers can approve, reject, or request revision of submissions directly from buttons in a Telegram private chat, without opening the app',
      'Request Revision: the bot asks the admin to reply with a reason, then the submitter is notified automatically',
      'Submission messages are now more informative: document type, value, and submitter name',
      'Every submission notification includes an "Open & process" link that opens that submission detail directly in the app (deep link)',
      'Security: only active admins whose Telegram is linked can execute decisions; buttons appear only in admin private chats (not groups)',
    ],
  },
  '3.9.0': {
    title: 'Per-Staff Telegram Private Notifications (Auto-link /start)',
    changes: [
      'Personal notifications (e.g. approval results to the submitter) are now sent to the personal Telegram of staff who have linked it',
      'User Management: Connect Telegram button -> staff open the bot link & press Start, status becomes Linked automatically',
      'Master "Personal notifications" toggle in Settings -> Notifications; role broadcasts still go to the group',
    ],
  },
  '3.8.5': {
    title: 'Uniform Dropdowns (Batch 2): Almost All Selects',
    changes: [
      'Almost all dropdowns in the app (transaction modals: payments, purchase invoices, production, transfers, deposits; pages: SO/PO/quotations/delivery orders/receipts/general ledger/COA/audit/reports) are now uniform custom dropdowns + automatic search when there are many options',
      'Excluded: fixed asset & approval rule forms (they use native forms), and the inline unit picker in item rows',
    ],
  },
  '3.8.4': {
    title: 'Uniform Dropdowns (Batch 1): Warehouse, Terms, List Filters',
    changes: [
      'All Warehouse pickers are now tidy, searchable custom dropdowns (applies to all forms)',
      'Payment terms & status filters (Sales/Purchase Invoice) + Item/stock movement Type filters are now uniform dropdowns',
      'New Select component (drop-in replacement for <select>) for consistency; the dropdown sweep continues in stages',
    ],
  },
  '3.8.3': {
    title: 'Create Invoice Button Directly from Delivery Order',
    changes: [
      'In Delivery Order detail, the "Create Invoice" button now opens the Sales Invoice form prefilled from that Delivery Order (customer, items, prices, PO/SO No.). Just check & save',
      'Previously it only showed instructions to open the menu manually',
    ],
  },
  '3.8.2': {
    title: 'Fix Create Invoice from Delivery Order + Auto-fill PO/SO No.',
    changes: [
      'Delivery Order numbers now display correctly in the picker (previously empty because the wrong data was fetched)',
      'Invoice row prices & discounts from a Delivery Order are filled automatically from the SO (no longer 0)',
      'The invoice Reference No. is filled automatically: the customer PO No. from the SO, or the SO No. if the PO is empty',
    ],
  },
  '3.8.1': {
    title: 'Customer Search in Create Sales Invoice',
    changes: [
      'The customer picker when creating a sales invoice can now be typed into/searched (SearchableSelect) + shows the phone number to distinguish similar names',
    ],
  },
  '3.8.0': {
    title: 'Telegram Notifications + Configuration Menu',
    changes: [
      'System notifications (approvals, due invoices, low stock) can be sent to a Telegram group',
      'Settings -> Notifications menu: enter the Bot Token & Chat ID, toggle per type, Test Connection button',
      'Bot token stored securely (write-only, never displayed again); Admin-only',
    ],
  },
  '3.7.7': {
    title: 'Attachments on Sales Orders (SO)',
    changes: [
      'Sales Orders (SO) can now have files attached (customer PO, contract, proof) in the detail drawer, just like Delivery Orders & invoices',
      'Delivery Orders already supported attachments (unchanged)',
    ],
  },
  '3.7.6': {
    title: 'Mobile / PWA Display Optimization',
    changes: [
      'Numbers on cards (e.g. Rupiah values) are no longer cut off on phones. They now wrap in full instead of being truncated with "..."',
      'Forms/modals (deposits, receipts, customers, delivery orders, payments, etc.) stack neatly in 1 column on phones (previously 2-3 narrow columns)',
      'Sales return tables & general ledger detail can be scrolled horizontally on phones (not cut off)',
      'Desktop display is unchanged',
    ],
  },
  '3.7.5': {
    title: 'Fix: Transferred Batches Can Be Used as Production Input',
    changes: [
      'Production submit/approve & edit now accept source batches of type TransferIn (stock from inter-warehouse transfers), consistent with the batch picker',
      'Previously, approving production that used batches from inter-warehouse transfers failed with "Source batch is not inbound stock"',
    ],
  },
  '3.7.4': {
    title: 'Per-Warehouse Dashboard Grouped by Category',
    changes: [
      'Stock per warehouse is now grouped: Raw Materials, Semi-Finished Goods, Finished Products, By-Products, Supplies/Other, with a value subtotal per group',
      'The stock per warehouse PDF export is also grouped by category + subtotals',
    ],
  },
  '3.7.3': {
    title: 'Record Movement: Item Stock Follows the Selected Warehouse',
    changes: [
      'In the stock movement form, the item stock info now follows the selected warehouse (stock per warehouse), not the total stock',
    ],
  },
  '3.7.2': {
    title: 'Choose Warehouse When Recording Stock Movements',
    changes: [
      'The stock movement form now has a warehouse selection (defaults to the main warehouse, can be changed)',
      'When editing, the original warehouse is shown read-only',
    ],
  },
  '3.7.1': {
    title: 'Warehouse Filter in Stock Movement History',
    changes: [
      'Stock movement history can now be filtered by warehouse + a Warehouse column was added',
      'Transfer In/Out movement types now appear in the filter & labels',
    ],
  },
  '3.7.0': {
    title: 'Sales Return Feature (Sales Return / Credit Note)',
    changes: [
      'Sales returns from an invoice: choose the items & quantity to return (partial); each row can either go back into stock (saleable) or not (damaged)',
      'Automatic posting of a contra-revenue journal (4.3 Sales Returns) + VAT reversal + COGS reversal for goods returned to stock',
      'The return value reduces the invoice receivable; the remainder becomes a customer credit/deposit for the next invoice',
      'Supports the approval gate (staff submit, admin approves) and return cancellation (reverses stock & journals)',
    ],
  },
  '3.6.4': {
    title: 'Profit & Loss and Trial Balance Default to a Full Month',
    changes: [
      'The default date range for Profit & Loss and Trial Balance now runs to the end of the month, not just to today',
      'Month-end entries such as depreciation expense & adjusting journals (posted on the 30th/31st) are now visible immediately without setting dates manually',
    ],
  },
  '3.6.3': {
    title: 'Batch Picker Recognizes Stock from Inter-Warehouse Transfers',
    changes: [
      'The batch picker (production & sales) now shows stock received via inter-warehouse transfer (TransferIn), complete with its cost',
      'Previously: semi-finished goods produced in one warehouse and then transferred to another did not show a batch/WAC when used for production in the destination warehouse',
    ],
  },
  '3.6.2': {
    title: 'Active Notifications: Approvals & Scheduled Checks',
    changes: [
      'Automatic approval notifications: staff submit → Admin is notified; approved/rejected/edit requested → the submitting staff member is notified',
      'A daily scheduled check (07:00) automatically sends notifications for due invoices + low stock (previously it never ran)',
      'Clicking a notification goes directly to the related page (by role), + a Notifications menu in the sidebar',
    ],
  },
  '3.6.1': {
    title: 'More Complete Approval Submission Detail',
    changes: [
      'Submission detail now shows full info: PI (supplier, due date, terms, quality/weighing/refaction/discount/VAT/PPh/deductions per item) + estimated Grand Total',
      'Production: warehouse, shift window, machines, downtime, processes, costs per account, locked batches + estimated COGS/kg',
      '"View Document" button on Approved submissions → opens the final document (official total/COGS/journal)',
    ],
  },
  '3.6.0': {
    title: 'Approval & Submissions Tab + Request Edit (Revision) Flow',
    changes: [
      'An "Approval & Submissions" tab with status sub-tabs (Pending/Approved/Rejected/Needs Revision) on the Purchase Invoice page, a Production Run sub-tab, & the System→Approval page',
      'Admins have 3 actions: Approve, Reject (+reason), and Request Edit (+reason), which returns the submission to staff for correction',
      'Staff see the history of their own submissions; those that Need Revision can be opened with "Edit & Resubmit" (form fully prefilled) → back to the Pending queue',
      'Full submission detail (input/output/costs, item names) before deciding',
    ],
  },
  '3.5.2': {
    title: 'Production Data Submission Detail (Approval)',
    changes: [
      'A "Detail" button on each production approval queue entry. Opens a modal with full details: shift info, raw materials (input), production results (output + by-products), and cost components',
      'Item names are shown (not IDs), so managers can double-check before approving',
      'Admins can Approve/Reject directly from the detail modal',
    ],
  },
  '3.5.1': {
    title: 'Production Approval Queue Shown in the Production Run Tab',
    changes: [
      'Production data awaiting approval now appears as a yellow panel in Stock & Warehouse → Production Run → Production Data',
      'Both admins & staff can see which runs are awaiting approval (complete with input/output)',
      'Admins can Approve/Reject directly from this panel without going to System → Approval',
    ],
  },
  '3.5.0': {
    title: 'Manager Approval for Purchase Invoices & Production Data',
    changes: [
      'Purchase Invoices & Production Data entered by non-Admins (StaffProduksi/Accountant) now await Admin approval before being processed',
      'New documents are created only after approval. Before approval, journals, stock, and COGS do not change, so reports are not mixed with unchecked input',
      'System → Approval page: view the queue, open input details (item/qty/price), Approve or Reject. Reject = discarded with no GL trace',
      'Admin input goes through directly without approval; staff can see the status of their own submissions',
    ],
  },
  '3.4.7': {
    title: 'Purchase Invoice Price Revision Feature',
    changes: [
      'A "Revise Price" button in Purchase Invoice detail (Admin/Accountant), for cases where the supplier corrects the price after the PI is submitted, even after the goods have been produced/sold',
      'The difference is split automatically: the portion still in stock → adjusts Inventory + the weighted average cost (WAC); the portion already issued → account 5.11 Purchase Price Variance',
      'Payables to the supplier are adjusted as well; the variance journal is posted automatically & recorded in the audit log. Works for both Submitted and Paid PIs',
    ],
  },
  '3.4.6': {
    title: 'Fixes from the System Audit (7 latent bugs)',
    changes: [
      'Cancel Goods Receipt: negative-stock guard (cannot cancel if the goods have already been issued; Admin can override with a reason) + weighted average cost (WAC) recalculated + blocked if the batch has already been used in production/sales',
      'Production: loaded COGS cannot go below 0 (prevents negative COGS when by-product NRV > cost)',
      'Edit stock movement: the weighted average cost (WAC) is now recalculated after qty/price changes',
      'Delivery Order cancellation: the SO delivered quantity is reduced only for rows whose stock was actually returned',
      'Landed cost: WAC is not changed if stock ≤ 0 (prevents an absurd WAC for goods already issued)',
      'Stock movement GL posting uses Decimal (removes floating-point tails)',
      'Attachments: listing/count given an explicit role guard',
    ],
  },
  '3.4.5': {
    title: 'Stock as of Date + Stock Position in the Daily Report',
    changes: [
      'Stock per Warehouse dashboard: added a date filter: download a PDF of the latest stock position as of a given date (not only the current stock)',
      'Stock positions are reconstructed exactly from the stock movement history (exact quantities; values use the current average cost as an estimate)',
      'Daily Report: added a "Stock Position" section: stock position per warehouse at the end of the report date (qty, avg cost, value), shown on screen & in the PDF',
      'The Production section in the Daily Report stays (input/output/yield per run)',
    ],
  },
  '3.4.4': {
    title: 'Redesigned Login Page',
    changes: [
      'Login page overhauled: left panel with a moving gradient (emerald-teal-amber), floating ERP icons, particle drift, and a sonar animation on the logo',
      'Animated statistics (COA Accounts, Modules, Roles) and feature labels (RBAC Audit, Multi-warehouse, Loaded COGS)',
      'Right-hand form: rounded card with a shadow, gradient "Sign In" button with a shine effect on hover and an animated arrow',
      'Still responsive (mobile shows only the form panel), dark mode supported, branding (logo + company name) stays dynamic',
    ],
  },
  '3.4.3': {
    title: 'More Complete Create Delivery Order from SO',
    changes: [
      'The Create Delivery Order from Sales Order (SO) panel is now as complete as the Delivery Order module: added Recipient & Notes fields',
      'The Admin override "allow negative stock" + reason is now also available when creating a Delivery Order from an SO (not only in the Delivery Order module)',
      'The automatic "Auto from SO" note is still used if the Notes field is left empty',
    ],
  },
  '3.4.2': {
    title: 'UX Fix for Create Delivery Order from SO: Qty Not Auto-Filled',
    changes: [
      'When creating a Delivery Order from a Sales Order (SO), the Qty to Ship column is now empty by default. Users just type how much they want to ship (e.g. 10 tons). Previously it was auto-filled in full (e.g. 209 tons), making partial shipments difficult',
      'The placeholder shows the maximum remaining quantity that can be shipped per item ("max X")',
    ],
  },
  '3.4.1': {
    title: 'StaffProduksi Gets Full Access to Sales Orders (SO)',
    changes: [
      'The StaffProduksi role now has full access to the Sales Order module: view, create, edit, submit, generate Delivery Orders, cancel (same as Admin/Accountant)',
      'Previously they could only see Delivery Orders in the sidebar; now Sales Orders (SO) also appear in their sidebar',
      'Supports the physical flow: factory staff can enter customer orders directly + prepare/ship goods without waiting for finance staff',
      'Plus: customer deposit reconciliation (GL-neutral, fixes the phantom balance display)',
    ],
  },
  '3.4.0': {
    title: 'Production OEE Tracking: Machines, Shifts, Downtime',
    changes: [
      'Machine Master: a new tab in Stock for the list of production machines + ideal capacity (add, edit, delete)',
      'Production Data & OEE in the Production Run modal: shift window (start/stop), machine selection (multi-machine), downtime recorded per machine with a reason',
      'Automatic OEE calculation: Availability (runtime vs planned) × Performance (output vs ideal × runtime) × Quality (good vs total from item rows) = OEE%',
      'OEE panel + per-machine table in Production Run detail: see the availability/performance/quality breakdown + total downtime',
      'The Docker entrypoint auto-applies loose .sql migrations after migrate deploy (for fresh installs)',
      'Complete user manual (12 chapters + PDF version)',
    ],
  },
  '3.3.0': {
    title: 'Deposits (DP) Linked to Sales Orders (SO)',
    changes: [
      'Deposit payments (CustomerDeposit) can now be tagged to a specific Sales Order. Previously they were a per-customer pool, with no way to tell which order a deposit was for',
      '"Deposit (DP)" panel in Sales Order detail: deposit received / Grand Total / Remaining / % of total + the list of deposit payments',
      '"Receive Deposit" button directly from the Sales Order screen: choose the date, amount, and cash/bank account. Automatic journal entry: DR Cash/Bank / CR 2.1.2 Sales Advances',
      'Full flow: customer PO → SO → receive deposit (linked to the SO) → ship (DO) → invoice → apply deposit → paid',
      'Plus: manual linking of Delivery Orders to the related Sales Order (data fix); fix for the Admin negative-stock bypass passing the per-warehouse check (v3.2.8)',
    ],
  },
  '3.2.8': {
    title: 'Fix: Admin Negative-Stock Bypass in Delivery Orders Now Works All the Way',
    changes: [
      'Bug fix: Admin ticked "Allow negative stock" on a Delivery Order but was still rejected. Cause: there were 2 layers of stock checks: an aggregate check (respects the bypass) + a per-warehouse check (hard block, not updated when the bypass feature was added in v3.2.1)',
      'The per-warehouse check now also follows the negative-stock permission. The Admin permission now applies until the stock is actually reduced',
      'Delivery Order & Production edits are not affected (only one layer of checks, already correct)',
    ],
  },
  '3.2.7': {
    title: 'Purchase Invoice Shows Source Goods Receipt (STT/BPB)',
    changes: [
      'Bug fix: Purchase Invoice detail now shows the Goods Receipt (STT/BPB) the goods came from. Previously the link was one-way only (from the Goods Receipt you could see the PI number, but from the PI you could not see the Goods Receipt)',
      'Green STT badge per item row (similar to the Delivery Order badge in sales)',
      'Summary banner "Goods received from STT/BPB" above the item list: lists all Goods Receipts used by this PI',
      'Purchase Invoice detail now includes the number and date of the source Goods Receipt',
    ],
  },
  '3.2.6': {
    title: 'Attachments on Delivery Orders & Goods Receipts: Weighbridge Proof',
    changes: [
      'Added an "Attachments" section to the Delivery Order and Goods Receipt (STT/BPB) drawers: upload photos/PDFs of weighbridge proof, vehicle photos, etc.',
      'Supported formats: JPG, PNG, WebP, PDF (max 5 MB/file, max 10 files per document)',
      'StaffProduksi can upload (they physically handle the documents in the warehouse); all roles can view & download',
      'Attachments can now be linked to Delivery Orders and Goods Receipts, with a check that the document exists',
      'Plus linking of old sales invoices to their related Delivery Orders as a retroactive data fix. Duplicate stock movements from old direct sales cancelled',
    ],
  },
  '3.2.5': {
    title: 'Dashboard Widget "Delivery Orders Not Yet Invoiced"',
    changes: [
      'New widget in the Dashboard Sales section: lists all Submitted DOs not yet invoiced, sorted by age from oldest → newest',
      'Age badge: ≥10 days red (critical), ≥5 days amber (warning), <5 days neutral. An amber banner appears if there is a DO ≥ 5 days old',
      'Auto-refresh every 60 seconds. Clicking a row navigates to the Delivery Order page',
      'Prevents Delivery Orders from being stuck for days without being invoiced. They are now visible right on the Dashboard',
      'The widget shows at most 50 Delivery Orders, starting from the oldest',
    ],
  },
  '3.2.4': {
    title: 'General Ledger: Default Filter to the Current Month',
    changes: [
      'Follow-up bug fix: the General Ledger without a date filter showed all periods → this month\'s journal vouchers could be buried on later pages (real case: the 4 May JV was on row 1,335, page 27 of 30 at 50 per page). Users reasonably assumed it "did not exist"',
      'The General Ledger now automatically filters to the current month when opened. Users see this month\'s data immediately, newest rows at the top',
      'You can still change to another period via presets (Today / Week / Last month / Year) or pick dates manually',
    ],
  },
  '3.2.3': {
    title: 'Fix General Ledger Search: Search by Account Name + Line Description',
    changes: [
      'Bug fix: General Ledger search used to match only the journal number & header narration, not the account name or per-line description. As a result, searching "Piutang Karyawan" (employee receivables) did not find the JV "Terima Pembayaran Kasbon Karyawan", which has a line to account 1.2.2 Piutang Karyawan',
      'General Ledger search now also matches: the account name on JE lines, the account number (e.g. "1.2.2"), and per-line descriptions (e.g. "Kasbon Karyawan")',
      'Result: searching "piutang karyawan" in the General Ledger shows JV-202605-0225 (4 May), as it appears in the General Ledger Report',
    ],
  },
  '3.2.2': {
    title: 'New App Icon',
    changes: [
      'App icon (browser tab + mobile/PWA) redesigned: bold white letter monogram on a steel-blue rounded square with a golden dot accent',
      'Vector-based from a single master SVG → generates all sizes (16, 32, 64, 180, 192, 512). Consistent across favicon, Apple Touch, Android PWA',
      'The company logo (for invoices, documents, delivery orders) is unchanged and the old company logo is still used. This app icon is separate, purely the app\'s digital identity',
      'Theme color updated: #1e40af → #2c4d78 (matches the icon background)',
    ],
  },
  '3.2.1': {
    title: 'Admin Override "Allow Negative Stock" + Audit Trail',
    changes: [
      'The Admin role can bypass negative-stock validation in Delivery Orders & Production. A reason of at least 10 characters is required, and an audit log is recorded automatically to the logger + server',
      'The "Allow negative stock" checkbox + reason textarea are shown only for the Admin role. StaffProduksi / Accountant / Viewer are still strictly blocked',
      'Use case: a 50-ton production run is in progress and the physical goods need to ship first; Admin bypasses with a reason, then enters the production later',
      'The WAC formula has been safe since 3.1.2 (it uses the inbound price when stock ≤ 0), so allowing negative stock no longer corrupts the average price',
      'New Dashboard widget "Active Negative Stock" in the Stock section: lists items with stock < 0 (item-level or per warehouse), age of the last movement, an indicator for monitoring bypasses',
      'The server rejects negative-stock permission from anyone other than Admin with the message "Only Admin can bypass stock validation"',
    ],
  },
  '3.2.0': {
    title: 'Sales Order Module',
    changes: [
      'New "Sales Orders (SO)" module for sales commitments before the Delivery Order + Invoice. Suits an "invoice first, ship goods later" scheme. The customer has a written commitment before the goods are ready to ship',
      'Flow: Quotation (optional) → Sales Order → Delivery Order → Invoice. Submitting an SO does not move stock and does not create journals (purely a commitment)',
      'SO statuses: Draft, Submitted, Partially Delivered, Fully Delivered, Cancelled. The status updates automatically with partial deliveries',
      'Generate a Delivery Order from an SO: choose items + qty + warehouse; the system records the delivered quantity per row',
      'Multiple Delivery Orders can come from 1 SO (partial delivery). Cancelling a Delivery Order automatically restores the delivered quantity and recalculates the SO status',
      'Numbering: PSN-YYYYMM-NNNN (Pesanan, i.e. order)',
      'New "Sales Orders (SO)" sidebar menu under Quotations',
    ],
  },
  '3.1.3': {
    title: 'Strict Mode: Stock May Not Go Negative (Bypass Removed)',
    changes: [
      'Negative stock is prohibited on all transaction paths: Delivery Orders, Production (submit/edit/cancel), Stock Transfers, Inventory Movements. Submissions are rejected with the message "Insufficient stock, create a receipt/transfer first"',
      'The "Allow negative stock" bypass flag in Delivery Orders and Production has been removed from the UI. There is no longer any way to override. If stock is short, production/transfer/receipt must happen first',
      'Prevents WAC (weighted average cost) corruption, which used to happen when negative stock × inbound price = an absurd average cost (millions/kg)',
      'Stock Transfers already had per-warehouse validation (unchanged)',
      'Production cancel/edit that reverses In (output) is also validated: if the output has already been used by other production/sales, cancellation is rejected. Cancel the downstream transactions first',
    ],
  },
  '3.1.2': {
    title: 'Fix WAC Corruption with Negative Stock + Block Overselling in Delivery Orders',
    changes: [
      'Critical bug fix: the WAC (weighted average cost) formula is now safe when stock is negative. Previously it produced absurd cost prices (millions/kg) that got locked into subsequent Delivery Orders and caused COGS to be booked higher than sales',
      'Overselling blocked in Delivery Orders: you can no longer ship qty > warehouse stock. The system rejects it with the message "Insufficient stock, X Kg available, Y Kg requested" and asks for production/transfer/receipt first',
      'The Dashboard "Inventory Value" now shows negative inventory balances as they are so the owner knows there is an anomaly (previously hidden as 0)',
      'Stock + cost reset per warehouse from the physical reconciliation: items updated via stock adjustment documents, with the difference booked to the Rounding & Differences account so the inventory balance is back to normal',
    ],
  },
  '3.1.1': {
    title: 'Purchase Landed Cost (Material + Refaction → Inventory)',
    changes: [
      'The PI ↔ Goods Receipt price difference no longer posts to the "Purchase Price Variance" account (5.11). It now goes directly to Inventory as a landed cost adjustment (in line with accounting principles: additional costs attributable to goods are charged to the stock value)',
      'Final price per Kg formula when there is a refaction: PI invoice total ÷ Goods Receipt qty (physical qty). Example: 10,000 Kg physical, PI total Rp 80,000,000 → cost price Rp 8,000/Kg (not the provisional price)',
      'Stock movements from the Goods Receipt automatically get their unit price and total value updated after the PI is submitted, so the production & sales batch pickers show the actual cost price (not the provisional one)',
      'The item average price is recalculated in proportion to the stock still on hand when the PI is submitted',
      'PI line components such as refaction deductions are also absorbed into inventory value instead of becoming a separate expense',
    ],
  },
  '3.1.0': {
    title: 'Production Module with Loaded COGS, Complete Fixed Assets, Stock Required via Delivery Order/STT',
    changes: [
      'Production module (6 phases): raw material batch picker, production cost components (electricity/labor/etc.) as standards, automatic loaded COGS calculation (material + cost components − by-product NRV), process traceability (Drying/Huller/Polishing), production PDF document, and a Profitability per SKU report (Material vs Loaded margin)',
      'Production Cost Standards master per warehouse: cost rates can be scoped per warehouse (e.g. electricity for a specific machine appears only in the warehouse that uses it)',
      'Universal batch picker: production input, sales (WAC by default, optional batch pick), inter-warehouse transfers, stock adjustment Out. Not just WAC; specific identification per batch is possible',
      'Remaining stock per batch in the picker is now reduced by past usage (FIFO), so it does not exceed the actual warehouse stock',
      'Dashboard enrichment: a new "Assets" section (asset value KPI, distribution per category, depreciation schedule, top 10 assets), a Profitability per SKU widget in Sales, and Production Deep Dive (run KPIs, yield trend, top input/output, best/worst yield, loaded COGS breakdown) in Production',
      'Complete Fixed Assets: asset import via script, opening balance JE (acquisition cost + accumulated depreciation + opening balance equity), bulk monthly depreciation posting (1 click for all assets instead of clicking per asset), confirm dialog for single posting, asset metadata editing, CSV export/import',
      'The dashboard shows total assets, accumulated depreciation, and net book value per category (Land/Buildings/Equipment/Machinery)',
      'General Ledger: pagination footer with First/Prev/Next/Last buttons + per-page selector (25/50/100/200) + "X–Y of Z journals" indicator; search filtering and hiding cancelled journals are processed on the server so they are consistent across pages',
      'Production Process Master: a list of processes (Drying, Huller, Polishing, etc.) selected when entering production for traceability; no GL posting, notes only',
      'Stock out required via Delivery Order: sales invoices with inventory items must be linked to a submitted DO. Direct sales are closed so stock is not reduced twice between the DO and the invoice',
      'Stock in required via Goods Receipt (STT/BPB): purchase invoices with inventory items must be linked to a submitted Goods Receipt. Direct purchases are closed. Service items can still be invoiced directly',
      'Fix for the "duplicate data detected" bug when reusing a DO/Goods Receipt after an invoice was cancelled. Links between invoice rows and the DO/Goods Receipt are now released when the invoice is cancelled',
      'Fix for pending DOs not refreshing after an invoice was cancelled. The Delivery Order list, stock movements, journals, payments, and dashboard now update immediately',
      'Fix for the customer/supplier list UI: long names and the "Customer/Supplier" label overlapping',
      'New version notice: every new release automatically shows a "New version available → Reload" toast to logged-in users, no manual Ctrl-Shift-R needed',
      'The app always loads the latest version after a release; UI files are cached in the browser so it opens quickly',
      'Production: by-product NRV, batch-to-item match validation, stock movements record their source batch, and loaded COGS is stored on sales invoice rows to calculate the loaded margin',
      'Production cost standards: prevents double entry: standards already used on another row are hidden in the dropdown of subsequent rows',
      'COGS of the main production output is optional: auto-filled from the computed loaded COGS if staff leave it empty',
      'Production Run PDF: A4 layout with company header, input/output/by-product with batch refs, cost component table, loaded COGS breakdown, 3-column signatures',
    ],
  },
  '3.0.0': {
    title: 'Product Rebrand, Inquiry → Quotation → Invoice Pipeline, Public Form',
    changes: [
      'Rebrand: app name and domain updated',
      'Inquiry module: record questions from prospective customers (prospects) before a formal quotation. Workflow New → In Progress → Converted/Lost/Closed, multi-channel tracking (WA/Phone/Email/Walk-in/Referral)',
      'Public Inquiry Form: a /tanya page for customers to fill in themselves, automatically integrated into the pipeline. Anti-spam: honeypot + rate limit',
      'QR Code Generator: generate a QR code in the Inquiry header to share via WA/IG bio/printed brochures, with source tracking',
      'Quotations module: full lifecycle Draft → Sent → Accepted/Rejected/Expired, conversion to Sales Invoice, PDF export, Excel export',
      'Quotation auto-expiry: every hour the system marks Sent quotations past their validity period as Expired + a notification 3 days before expiry',
      'Modular sidebar: 9 modules (Sales, Purchasing, Stock & Production, Cash & Bank, Accounting, Reports, Master Data, System) with collapsible/expandable submenus and persisted state',
      'Theme toggle: moved from the sidebar to the header (next to Search), Light/Dark/System cycle',
      'Per-item Excel export for Sales & Purchase Invoices (previously per invoice only)',
      'PO/Quotation Reference No. on Sales Invoices, shown in the drawer & PDF',
      'Total Qty in the Invoice modal & drawer: aggregated per unit (Kg / Sack / Pcs)',
      'Supplier deposit refund: offsets payables (FIFO), then the remainder is returned to cash',
      'New color theme: steel blue, Inter and Plus Jakarta Sans fonts, dark mode improvements',
      'Faster journal and stock movement search',
      'File uploads are now checked by file content, not just by extension (security)',
      'Revoked login tokens are cleaned up automatically',
      'COGS backfill is now restricted by role (security)',
      'Table column headers stay visible while scrolling; confirmation dialogs in Approvals, Fixed Assets, and Purchase Invoices',
      'Health Check: journal references on manual stock adjustments fixed',
      'Inventory Dashboard: the stock value formula uses the general ledger balance (not accumulated stock movements)',
      'Sales invoices may have a grand total of 0 (for samples/replacements/100% discount)',
      'Usable across industries: supplier/customer labels are configurable',
    ],
  },
  '2.3.0': {
    title: 'New Features, Bug Fixes & App Icon',
    changes: [
      'New app icon with a transparent background for the favicon, PWA, sidebar & login',
      'App icon (static) separated from the company logo (for invoices & documents)',
      'Fix Health Check: the page did not appear because of a wrong data address',
      'Fix Fixed Assets, Approvals, COGS, Receivables/Payables Schedule: wrong data addresses corrected',
      'Cash & Bank detail: a new drawer for viewing payment details, journals, and attachments',
      'Upload & delete attachments directly from the payment detail drawer (drag & drop)',
      'Payment detail includes complete data: partner, account, breakdown, allocations, and journals',
      'Monthly Profit chart: fixed month labels not showing',
    ],
  },
  '2.2.0': {
    title: 'Opening Balance Import & Dashboard Fixes',
    changes: [
      'Fix COA import: opening balances are no longer counted twice (double balance)',
      'Fix party import: the outstandingAmount/piutang/hutang columns are now recognized as aliases of openingBalance',
      'Fix party import: the depositBalance column is automatically recorded as a customer deposit for the Customer type',
      'Fix inventory import: current stock is now updated after importing opening stock',
      'Fix Excel formulas: cells with formulas (=A1*B1) now read their value, not [object Object]',
      'Auto-detect openingPrice: the system automatically detects whether the column contains a unit price or a total value',
      'Added openingQty & openingPrice columns to the Master Item download template',
      'Added openingQty & openingPrice columns to the inventory import preview',
      'Dashboard: added a Supplier Deposit KPI card to the main dashboard',
      'Dashboard: added an Inventory Value KPI (Rupiah format) to the warehouse dashboard',
      'Dashboard: the stock status bar appears only if the item has a minimum stock > 0',
      'Stock movement number capacity increased so large values do not fail to save',
    ],
  },
  '2.1.0': {
    title: 'Comprehensive System Accounts (IFRS/GAAP) & UI Fixes',
    changes: [
      '26 system account roles based on the global IFRS/GAAP accounting standards (from 12 to 26)',
      'New groups: Tax (Input/Output VAT, Corporate Income Tax), Discounts & Returns, Fixed Assets & Depreciation',
      'New groups: Bank Charges & Interest, Exchange Differences, Bad Debts, Accruals & Prepaids',
      'New groups: Other Income & Expenses, Rounding & Differences, Drawings',
      '4 new COA accounts: Allowance for Doubtful Accounts (1.2.5), Drawings (3.5), Bad Debt Expense (6.27), Rounding & Differences (8.8)',
      'Fix System Account Settings: the dropdown now shows all COA accounts correctly',
      'Upload backup files from outside: supports uploading .sql.gz via Settings > Backup',
      'Stock dashboard: shows all items sorted by stock quantity',
      '11 UI groups for system account configuration (from 6 to 11)',
    ],
  },
  '2.0.0': {
    title: 'System Account Configuration & COA Fixes',
    changes: [
      'System Accounts feature: configure the COA account mapping for automatic GL posting via Settings > System Accounts',
      'System accounts (AR, AP, Cash, Sales, etc.) can now be changed without code changes, supporting various industries',
      'Multiple accounts for Cash & Bank: add/remove bank accounts flexibly',
      'Startup validation: automatic warning if the account mapping is incomplete',
      'COA fix: account 7 split into 7 (Non-Operating Income) and 8 (Non-Operating Expenses)',
      'Account 5 (COGS) is now a group account to support sub-accounts',
      'Fix opening balances: use Opening Balance Equity (3.1) instead of Retained Earnings (3.2)',
      'Fix Excel import: the "balance" column is now read when importing the COA',
      'Fix stock: automatic GL posting when adding stock history even if the item has no account yet',
      'Fix Profit & Loss report: supports multiple root income and expense groups',
      'Account numbers are no longer hard-coded; all follow the System Accounts settings',
    ],
  },
  '1.9.0': {
    title: 'Stock Dashboard & Bulk Excel Import/Export',
    changes: [
      'Warehouse Stock Dashboard: KPI cards, stock status table, comparison chart vs the 20,000 Kg minimum, 6-month trend, production statistics',
      'Reactive dark/light mode for all charts',
      'Excel download & import for the Chart of Accounts, Customers/Suppliers, and Master Items',
      'Excel templates contain existing data to edit and upload back',
      'Bulk import of Master Items from Excel',
      'Download Excel templates per data type',
      'Fixed errors in the Reconciliation form',
    ],
  },
  '1.8.0': {
    title: 'COA Standardization & Initial Data',
    changes: [
      'COA restructured into 111 accounts following accounting standards (from the company spreadsheet)',
      'New numbering without leading zeros: 1.1.x Cash/Bank, 1.2.x Receivables, 1.4.x Inventory, 1.6.x Fixed Assets, 1.7.x Accum. Depreciation',
      '32 detailed inventory sub-accounts (raw materials, semi-finished goods, finished products & by-products)',
      '26 operating expense accounts (6.01-6.26)',
      'Non-Operating Income & Expenses (7.1.xx, 7.2.xx)',
      'Seed of 18 suppliers + 31 customers for development',
      'Fix group account status on system accounts (4.1 Sales, 5 COGS) so GL posting works',
      'Fix cash flow report: investing → 1.6/1.7, financing → 2.3',
    ],
  },
  '1.7.0': {
    title: 'Supplier Deposits & Service Items',
    changes: [
      'Supplier Deposit feature: deposits to suppliers, apply to purchase invoices, cancel & automatic GL reversal',
      'Dedicated /vendor-deposits page with summary cards and a table',
      '"Use Deposit" button in purchase invoice detail',
      '"Deposit" badge on the Cash & Bank page',
      'Deposit balance shown on partner cards (Customers & Suppliers)',
      'New COA: 1.2 Other Current Assets, 1.2.1 Supplier Deposits',
      'Support for service items in sales invoices (no stock)',
      'Inventory page fixes',
    ],
  },
  '1.6.0': {
    title: 'StaffProduksi Role & Automatic Stock',
    changes: [
      'Added the StaffProduksi role for warehouse & purchasing access',
      'Invoice items linked to inventory: stock & COA sync automatically',
      'Reconciliation & recurring transactions restricted from Viewer',
      'Dashboard toggle accessibility fixes',
    ],
  },
  '1.5.0': {
    title: 'Report Printing, Dynamic Favicon & Update Check',
    changes: [
      'Fix report printing: clean printouts without the sidebar/navbar',
      'Added an automatic print header: company name, report title, period',
      'The browser tab favicon automatically uses the company logo from settings',
      'Dynamic browser tab title based on the company name',
      'The update check now works: compares versions from GitHub',
      'Shows the changelog of new changes when an update is available',
    ],
  },
  '1.4.0': {
    title: 'Invoice Redesign & Set Opening Balance',
    changes: [
      'Redesigned Sales & Purchase Invoice pages: summary cards, filters, pagination',
      'Added an invoice detail drawer: click a row to see details, payment history, progress',
      'Added a Set Opening Balance feature to the Chart of Accounts (COA)',
      'Fixed the message when deleting a partner (deactivated vs permanently deleted)',
      'Sales and purchase invoice details can be opened per document',
    ],
  },
  '1.3.0': {
    title: 'Party Fix & Error Handling',
    changes: [
      'Fix editing & deleting partners (parties): hardened error handling on all routes',
      'Error messages standardized across the server',
    ],
  },
  '1.2.0': {
    title: 'Expenses & Bank Transfers',
    changes: [
      'Expenses now support all types, not just payments to suppliers',
      'Fix payment error handling + added inter-bank transfers (pinbuk)',
      'All financial report templates updated + bug fixes',
    ],
  },
  '1.1.0': {
    title: 'Auto Backup & Production Fix',
    changes: [
      'Automatic daily database backup to GitHub',
      'Fixed page routes that failed to open after a server update',
      'Access from the local computer (localhost) is allowed automatically',
      'Fixed 502 errors when the app runs on the production server',
      'Production server configuration fixes',
    ],
  },
  '1.0.0': {
    title: 'Initial Release',
    changes: [
      'KPI dashboard: cash, receivables, payables, net profit MTD',
      'Hierarchical Chart of Accounts (COA) with parent-child',
      'Double-entry General Ledger',
      'Sales & Purchase Invoices with automatic GL posting',
      'Cash & Bank: receipts, payments, inter-bank transfers',
      'Customer & Supplier management',
      'Reports: Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP Aging',
      'Fiscal Year & year-end closing',
      'Company profile settings + logo',
      'Role-based auth (Admin, Accountant, Viewer)',
    ],
  },
};
