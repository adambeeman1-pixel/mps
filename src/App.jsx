import { useState, useEffect, useRef, useCallback } from "react";

const SCHEMA_VERSION = "1.1";
const PRODUCT_VERSION = "fds_v1";
const STORAGE_KEY = "fds_session_v1";

// --- Supabase connection (shared project with PPPS and MPS) ---
const SUPABASE_URL = "https://kyhsljmjibzlgomgmmkn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_u0qrF7ZGzWc2e6WMNzPhyw_VOTUPdMx";
const supabase =
  typeof window !== "undefined" && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const NAVY = "#1B2B4B";
const AMBER = "#C9974A";
const AMBER_LIGHT = "#FDF6E8";
const SLATE = "#4A5568";
const RULE = "#E2DDD6";
const CREAM = "#F8F6F1";
const MISS_RED = "#D9705E";
const DONE_GREEN = "#2F7D5B";

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------- Record workspace defaults ----------------
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLS = 12;

function monthLabel(i) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - (COLS - 1 - i));
  return {
    short: MONTH_NAMES[d.getMonth()],
    full: MONTH_NAMES[d.getMonth()] + " " + d.getFullYear(),
    key: d.getFullYear() + "-" + (d.getMonth() + 1),
  };
}

const CADENCE_LABELS = { weekly: "Weekly", biweekly: "Every two weeks", semimonthly: "Twice a month", monthly: "Once a month" };
const CADENCE_STEP = { weekly: 7, biweekly: 14, semimonthly: 15 };

// Pay-period columns for cadence lines, anchored to a fixed grid so keys stay stable day to day.
function periodCols(line) {
  const step = CADENCE_STEP[line.cadence] || 14;
  const winMonths = line.win >= 999 ? 3 : line.win;
  const count = Math.min(14, Math.max(2, Math.round((winMonths * 30.44) / step)));
  const dayMs = 86400000;
  const baseIdx = Math.floor(Date.now() / (step * dayMs));
  const cols = [];
  for (let k = count - 1; k >= 0; k--) {
    const idx = baseIdx - k;
    const d = new Date(idx * step * dayMs);
    cols.push({
      short: (d.getMonth() + 1) + "/" + d.getDate(),
      full: "Pay period ending about " + (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear(),
      key: "p" + step + "-" + idx,
    });
  }
  return cols;
}


// ---------------- Numbers layer (line items, mirrors state affidavits) ----------------
// Taxonomy consolidated from FL 12.902(c), CO JDF 1111, WA FL All Family 131,
// GA DRFA, MA CJD-301L, NY Statement of Net Worth, NJ CIS.
const NUM_GROUPS = [
  { id: "income", name: "Monthly Income (Before Taxes)", kind: "m1", col: "Monthly", seed: [
    "Salary Or Wages", "Overtime, Tips, Bonuses, Commissions", "Business / Self-Employment (Net)",
    "Rental Income", "Interest And Dividends", "Retirement Or Pension Income", "Social Security",
    "Disability / Workers' Compensation", "Unemployment", "Public Assistance",
    "Spousal Support Received", "Child Support Received (Other Cases)" ] },
  { id: "deductions", name: "Payroll Deductions (Monthly)", kind: "m1", col: "Monthly", seed: [
    "Federal Income Tax", "State Income Tax", "Social Security And Medicare (FICA)",
    "Health / Dental / Vision Premium (From Pay)", "Retirement Contributions", "Union Dues",
    "Childcare Deducted From Pay" ] },
  { id: "housing", name: "Housing", kind: "m1", col: "Monthly", seed: [
    "Mortgage Or Rent", "Second Mortgage / HELOC", "Property Taxes",
    "Homeowner's / Renter's Insurance", "HOA Or Condo Fees", "Repairs And Maintenance",
    "Lawn / Pool / Pest Service" ] },
  { id: "utilities", name: "Utilities", kind: "m1", col: "Monthly", seed: [
    "Electricity", "Gas Or Heating Fuel", "Water / Sewer / Garbage", "Cell Phone",
    "Internet, Cable, Streaming" ] },
  { id: "food", name: "Food And Household", kind: "m1", col: "Monthly", seed: [
    "Groceries And Household Supplies", "Meals Outside The Home" ] },
  { id: "transport", name: "Transportation", kind: "m1", col: "Monthly", seed: [
    "Vehicle Payment (Loan Or Lease)", "Fuel", "Repairs And Maintenance", "Auto Insurance",
    "Registration, Tolls, Parking", "Public Transit / Rideshare" ] },
  { id: "health", name: "Health (Adults)", kind: "m1", col: "Monthly", seed: [
    "Health Insurance Premium (If Not From Pay)", "Out-Of-Pocket Medical And Dental",
    "Prescriptions", "Mental Health Care" ] },
  { id: "children", name: "Children's Expenses", kind: "m1", col: "Monthly", seed: [
    "Childcare / Daycare", "Children's Health Insurance Portion",
    "Children's Medical / Dental / Orthodontia", "School Tuition And Supplies",
    "Activities, Lessons, Sports, Camps", "Children's Clothing And Allowance" ] },
  { id: "personal", name: "Personal And Miscellaneous", kind: "m1", col: "Monthly", seed: [
    "Clothing And Dry Cleaning", "Personal Care And Grooming", "Entertainment And Recreation",
    "Vacations", "Subscriptions And Memberships", "Gifts And Holidays", "Pets",
    "Religious And Charitable Giving", "Life Insurance Premium" ] },
  { id: "supportpaid", name: "Support Paid (Other Cases)", kind: "m1", col: "Monthly", seed: [
    "Child Support Paid (Other Cases)", "Spousal Support Paid" ] },
  { id: "debts", name: "Debts (Payments To Creditors)", kind: "m2", colA: "Balance", colB: "Monthly Payment", seed: [
    "Credit Card — (Name It)", "Student Loans", "Medical Debt", "Personal / Family Loans", "Tax Debt" ] },
  { id: "assets", name: "Assets", kind: "m1", col: "Value", seed: [
    "Checking Accounts", "Savings Accounts", "Retirement Accounts (401k, IRA, Pension)",
    "Investments / Brokerage", "Real Estate (Market Value)", "Vehicles", "Business Interests",
    "Life Insurance Cash Value", "Money Owed To Me" ] },
];
const COMPONENT_DESCS = {
  "Income": "Pay records and proof of every income source: pay stubs, business income, benefits.",
  "Expenses": "The statements behind your household spending: bank accounts, credit cards, insurance premiums.",
  "Assets": "Statements showing what you own: savings, retirement accounts, investments, property.",
  "Liabilities": "Statements for what you owe: mortgage, vehicle and other loans, credit card balances.",
  "Child-Related": "Receipts and records for costs that exist because of your children.",
  "Court Papers": "Copies of everything filed or received in your case: your filed disclosures exactly as filed, orders and judgments, certificates of service.",
};

const EXPENSE_GROUPS = ["housing","utilities","food","transport","health","children","personal","supportpaid"];

function defaultNumbers() {
  const n = {};
  NUM_GROUPS.forEach(g => { n[g.id] = g.seed.map(label => ({ id: generateId(), label, a: "", b: "" })); });
  return n;
}

function toNum(v) { const x = parseFloat(String(v).replace(/[$,\s]/g, "")); return isNaN(x) ? 0 : x; }
function fmtMoney(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function groupSum(items, key) { return (items || []).reduce((t, it) => t + toNum(it[key]), 0); }

function defaultWorkspace() {
  return {
    components: [
      { name: "Income", lines: [
        { id: generateId(), name: "Pay Stubs — Primary Job", win: 3, cells: {}, cadence: null, askCadence: true },
      ]},
      { name: "Expenses", lines: [
        { id: generateId(), name: "Checking Account Statements", win: 12, cells: {} },
        { id: generateId(), name: "Credit Card — (name it: e.g., BofA ...1234)", win: 12, cells: {} },
        { id: generateId(), name: "Health Insurance Premiums (Breakdown)", win: 3, cells: {} },
        { id: generateId(), name: "Auto / Home / Life Policies (Declarations)", win: 1, cells: {} },
      ]},
      { name: "Assets", lines: [
        { id: generateId(), name: "Savings Account Statements", win: 12, cells: {} },
        { id: generateId(), name: "Retirement — (name it: e.g., 401k, Roth IRA)", win: 3, cells: {} },
      ]},
      { name: "Liabilities", lines: [
        { id: generateId(), name: "Mortgage Statements", win: 999, cells: {} },
      ]},
      { name: "Child-Related", lines: [
        { id: generateId(), name: "Childcare Receipts", win: 12, cells: {} },
        { id: generateId(), name: "Children's Health Insurance Portion", win: 3, cells: {} },
        { id: generateId(), name: "Out-Of-Pocket Medical (Children)", win: 12, cells: {} },
        { id: generateId(), name: "Activities And School Costs", win: 12, cells: {} },
      ]},
      { name: "Court Papers", lines: [
        { id: generateId(), name: "Filed Disclosures (As Filed)", win: 1, cells: {} },
        { id: generateId(), name: "Orders And Judgments", win: 1, cells: {} },
      ]},
    ],
    timeline: [
      { doc: "Federal Tax Returns", win: "", hint: "Most states: 1-3 years", opts: ["1 year","2 years","3 years"] },
      { doc: "State Tax Returns", win: "", hint: "Usually mirrors federal; nine states have no state income tax", opts: ["1 year","2 years","3 years","My state has no income tax"] },
      { doc: "Pay Stubs", win: "", hint: "Most states: 2-4 most recent; longer if income varies", opts: ["2 most recent","3 most recent","4 most recent","6 months","12 months"] },
      { doc: "Bank Statements", win: "", hint: "Where specified: 3-12 months", opts: ["3 months","6 months","12 months","24 months"] },
      { doc: "Credit Card Statements", win: "", hint: "Often mirrors bank statements", opts: ["3 months","6 months","12 months","24 months"] },
      { doc: "Retirement Statements", win: "", hint: "Usually current statement only", opts: ["Most recent","3 months","12 months"] },
    ],
    collapsed: {},
    numbers: defaultNumbers(),
  };
}

function blankSession(userId) {
  return {
    user_id: userId || generateId(),
    session_id: generateId(),
    product_id: "fds",
    product_version: PRODUCT_VERSION,
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_active_section: "welcome",
    last_active_tab: "learn",
    completion_status: "not_started",
    completed_at: null,
    quick_notes: "",
    answers: { workspace: defaultWorkspace() },
  };
}

function initSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.schema_version === SCHEMA_VERSION || parsed.schema_version === "1.0") {
        parsed.schema_version = SCHEMA_VERSION;
        if (!parsed.answers) parsed.answers = {};
        if (!parsed.answers.workspace) parsed.answers.workspace = defaultWorkspace();
        return parsed;
      }
    }
  } catch (e) {}
  return blankSession();
}

// ---------------- Sections ----------------
// The rail carries the product: chapters first. The workspace lives in a
// collapsible bar above the content -- present everywhere, in your face nowhere.
const SECTIONS = [
  { id: "welcome",   label: "Getting Started",                      short: "How It Works",     layer: "start" },
  { id: "timeline",  label: "Your Timeline",                        short: "Timeline",         layer: "workspace" },
  { id: "numbers",   label: "My Numbers",                           short: "My Numbers",       layer: "workspace" },
  { id: "record",    label: "My Record",                            short: "My Record",        layer: "workspace" },
  { id: "missing",   label: "What's Missing",                       short: "What's Missing",   layer: "workspace" },
  { id: "summary",   label: "Financial Disclosure Summary",         short: "My Summary",       layer: "workspace" },
  { id: "ch1",       label: "Why This Matters",                     short: "Why This Matters", layer: "foundation" },
  { id: "ch2",       label: "What Is Financial Disclosure?",        short: "What It Is",       layer: "foundation" },
  { id: "ch3",       label: "When Should I Begin?",                 short: "When To Begin",    layer: "foundation" },
  { id: "ch4",       label: "Understanding Your Financial Picture", short: "Your Picture",     layer: "building" },
  { id: "ch5",       label: "Building Your Financial Record",       short: "Building",         layer: "building" },
  { id: "ch6",       label: "Gathering Supporting Evidence",        short: "Gathering",        layer: "building" },
  { id: "ch7",       label: "Completing Your State's Disclosure",   short: "Completing",       layer: "completing" },
  { id: "ch8",       label: "Maintaining the Financial Record",     short: "Maintaining",      layer: "completing" },
];

const LAYER_LABELS = {
  start: "Getting Started",
  workspace: "Your Workspace",
  foundation: "Part I — Understanding",
  building: "Part II — Building",
  completing: "Part III — Completing",
  pages: "Yours To Keep",
};
const RAIL_LAYERS = ["start", "foundation", "building", "completing", "pages"];

const SECTION_TABS = {
  welcome: ["learn"],
  timeline: ["work"],
  record: ["work"],
  numbers: ["work"],
  summary: ["work"],
  reflections: ["work"],
  missing: ["work"],
  ch1: ["learn", "reflect"], ch2: ["learn", "reflect"], ch3: ["learn", "reflect"], ch4: ["learn", "reflect"],
  ch5: ["learn", "reflect"], ch6: ["learn", "reflect"], ch7: ["learn", "reflect"], ch8: ["learn", "reflect"],
};

const TAB_LABELS = { learn: "Learn", reflect: "Reflect", work: "Workspace" };

// ---------------- Doctrine ----------------
const QUOTES = [
  "The forms are not the work; they are the result of the work.",
  "The forms are temporary. The record is the asset.",
  "Evidence outranks memory.",
  "Understanding comes before calculation.",
  "Documents first. Record second. Forms last.",
  "An empty section is not an incomplete record. It is a completed answer.",
];

// ---------------- Chapter content ----------------
// Chapter 1 carries the full manuscript text as the pattern.
// Chapters 2–8 carry their opening movement; full text flows in from the locked manuscript.
const CH1_PARAS = [
  "At some point in a family court case, you will be asked to put your financial life on paper. The request may arrive as a form with an unfamiliar name, a deadline in a scheduling order, or a list of documents from an attorney or mediator. However it arrives, many parents describe the same reaction: a quiet sense of dread, built from uncertainty about where the information will come from, worry about missing something, and concern about the consequences of getting it wrong.",
  "Those concerns are reasonable, and this system exists to address them. But before turning to the process itself, it helps to understand why financial disclosure is worth doing well, not just to satisfy a court, but for reasons that have more to do with you than with any judge.",
];
const CH1_SECTIONS = [
  { h: "More Than a Court Requirement", paras: [
    "Financial disclosure is usually introduced as an obligation: something the court requires before your case can move forward. That is accurate, but it is the least useful way to think about it.",
    "A family court case puts your financial life under a lens regardless of how you arrived there, whether through separation, divorce, or as parents who were never married or never lived together. Where households are dividing, one household becomes two: income that supported a single set of bills now stretches across duplicate rents or mortgages, duplicate utilities, and new costs that did not exist before. Where households were always separate, the court still needs a clear picture of each. Either way, decisions about support, property, and parenting arrangements will rest, in one way or another, on financial facts.",
    "Parents who understand their financial picture early often find it easier to navigate the decisions that follow. The court deadline is the occasion for building that understanding. It is not the reason. The reason is that you are about to make some of the most consequential financial decisions of your life, and you will make them better with a clear picture in front of you.",
  ]},
  { h: "What Organized Parents Avoid", paras: [
    "It is tempting to think of financial disclosure as a single task with a single risk: miss the deadline, face the consequences. In practice, the risks are smaller, quieter, and cumulative, and so are the benefits of preparation.",
    "A parent working from an organized financial record avoids dozens of small problems that quietly consume time, money, and energy over a case. Fewer corrections, because the numbers were right the first time. Fewer requests from the other side for missing documents, because nothing was missing. Less time spent by an attorney organizing paperwork, and more time spent providing advice. Fewer moments in mediation where a discussion stalls because no one is sure what a number actually is.",
    "Another benefit, one parents rarely anticipate, is that a complete, consistent, well-documented disclosure speaks for itself over time. It gives no one an easy reason to question your numbers, and it makes every later conversation about money shorter. Whether anyone ever remarks on it, you will feel the difference in how smoothly those conversations go.",
    "None of these advantages is dramatic on its own. Together, they often become one of the most valuable parts of the entire process. Preparation does not eliminate every challenge, but it quietly prevents many of the ones that never needed to become problems in the first place.",
  ]},
  { h: "Your Financial Reality, Finally in One Place", paras: [
    "For many parents, the disclosure process is the first time they have seen their complete financial picture in one place.",
    "Every family organizes finances differently. In some households one parent managed most of the financial records. In others the responsibility was shared, or accounts remained largely separate. Whatever your situation, financial disclosure asks you to gather information that may never have existed in one place before. Every source of income, every recurring expense, every account, every debt.",
    "Building that record has value far beyond the court case. Planning a budget for life after the case, deciding whether to keep a home, and weighing a settlement proposal all draw on the same picture the disclosure process brings into focus. Many parents finish this process understanding their finances better than they ever did before, and that understanding remains long after the case ends.",
  ]},
  { h: "The Stakes of Getting It Right", paras: [
    "There is one more reason to take this seriously, and it deserves plain language rather than alarm.",
    "A financial disclosure is a sworn statement. Whether your state has you sign before a notary or certify under penalty of perjury, the legal meaning is the same: you are stating, under penalty of law, that the information is true. Courts treat the document as evidence. The other parent, and any attorney involved, will read it closely, and they may compare it against documents they already have.",
    "That responsibility should not create fear. It should create care. Courts generally understand the difference between an estimate that is clearly identified as an estimate and information intended to mislead. Mistakes can be corrected, and later chapters cover exactly how to handle values you are unsure of. What the sworn statement does mean is that guessing silently, rounding carelessly, or leaving things out is not a shortcut worth taking. The process in this book is built so you will never need to.",
  ]},
  { h: "Closing Thought", paras: [
    "Throughout this system, you will notice a consistent theme: the forms are not the work — they are the result of the work. Once you have built a complete, organized financial record, your state's forms become a way to communicate information you already understand. That shift in perspective is the foundation of the Financial Disclosure System, and it is the reason this process can feel far more manageable than it first appears.",
  ]},
];

const CHAPTER_STUBS = {
  ch2: "Financial disclosure is the process by which both parents give the court, and each other, an accurate picture of their financial lives. Both parents do this. It is not something one side does to the other. It is something both sides do so that everyone involved is working from the same facts.",
  ch3: "The answer to the question that ended the last chapter is straightforward. Begin now.",
  ch4: "The goal here is not to memorize categories. It is to learn a way of seeing. A financial life does not arrive sorted.",
  ch5: "Documentation is not really a sixth category alongside the other five. It is the foundation underneath all of them. The forms are temporary. The record is the asset.",
  ch6: "Evidence outranks memory. Gathering is often described as paperwork, but it could be better understood as verification.",
  ch7: "For many parents, the disclosure form looks like the beginning of the process. In reality, it is almost the end.",
  ch8: "Many parents think of disclosure as a project with an ending. It is better understood as a record with a beginning.",
};

const CHAPTERS_FULL = {
"ch1": [
{
"t": "p",
"x": "At some point in a family court case, you will be asked to put your financial life on paper. The request may arrive as a form with an unfamiliar name, a deadline in a scheduling order, or a list of documents from an attorney or mediator. However it arrives, many parents describe the same reaction: a quiet sense of dread, built from uncertainty about where the information will come from, worry about missing something, and concern about the consequences of getting it wrong."
},
{
"t": "p",
"x": "Those concerns are reasonable, and this system exists to address them. But before turning to the process itself, it helps to understand why financial disclosure is worth doing well, not just to satisfy a court, but for reasons that have more to do with you than with any judge."
},
{
"t": "h2",
"x": "More Than a Court Requirement"
},
{
"t": "p",
"x": "Financial disclosure is usually introduced as an obligation: something the court requires before your case can move forward. That is accurate, but it is the least useful way to think about it."
},
{
"t": "p",
"x": "A family court case puts your financial life under a lens regardless of how you arrived there, whether through separation, divorce, or as parents who were never married or never lived together. Where households are dividing, one household becomes two: income that supported a single set of bills now stretches across duplicate rents or mortgages, duplicate utilities, and new costs that did not exist before. Where households were always separate, the court still needs a clear picture of each. Either way, decisions about support, property, and parenting arrangements will rest, in one way or another, on financial facts."
},
{
"t": "p",
"x": "Parents who understand their financial picture early often find it easier to navigate the decisions that follow. The court deadline is the occasion for building that understanding. It is not the reason. The reason is that you are about to make some of the most consequential financial decisions of your life, and you will make them better with a clear picture in front of you."
},
{
"t": "h2",
"x": "What Organized Parents Avoid"
},
{
"t": "p",
"x": "It is tempting to think of financial disclosure as a single task with a single risk: miss the deadline, face the consequences. In practice, the risks are smaller, quieter, and cumulative, and so are the benefits of preparation."
},
{
"t": "p",
"x": "A parent working from an organized financial record avoids dozens of small problems that quietly consume time, money, and energy over a case. Fewer corrections, because the numbers were right the first time. Fewer requests from the other side for missing documents, because nothing was missing. Less time spent by an attorney organizing paperwork, and more time spent providing advice. Fewer moments in mediation where a discussion stalls because no one is sure what a number actually is."
},
{
"t": "p",
"x": "Another benefit, one parents rarely anticipate, is that a complete, consistent, well-documented disclosure speaks for itself over time. It gives no one an easy reason to question your numbers, and it makes every later conversation about money shorter. Whether anyone ever remarks on it, you will feel the difference in how smoothly those conversations go."
},
{
"t": "p",
"x": "None of these advantages is dramatic on its own. Together, they often become one of the most valuable parts of the entire process. Preparation does not eliminate every challenge, but it quietly prevents many of the ones that never needed to become problems in the first place."
},
{
"t": "h2",
"x": "Your Financial Reality, Finally in One Place"
},
{
"t": "p",
"x": "For many parents, the disclosure process is the first time they have seen their complete financial picture in one place."
},
{
"t": "p",
"x": "Every family organizes finances differently. In some households one parent managed most of the financial records. In others the responsibility was shared, or accounts remained largely separate. Whatever your situation, financial disclosure asks you to gather information that may never have existed in one place before. Every source of income, every recurring expense, every account, every debt."
},
{
"t": "p",
"x": "Building that record has value far beyond the court case. Planning a budget for life after the case, deciding whether to keep a home, and weighing a settlement proposal all draw on the same picture the disclosure process brings into focus. Many parents finish this process understanding their finances better than they ever did before, and that understanding remains long after the case ends."
},
{
"t": "h2",
"x": "The Stakes of Getting It Right"
},
{
"t": "p",
"x": "There is one more reason to take this seriously, and it deserves plain language rather than alarm."
},
{
"t": "p",
"x": "A financial disclosure is a sworn statement. Whether your state has you sign before a notary or certify under penalty of perjury, the legal meaning is the same: you are stating, under penalty of law, that the information is true. Courts treat the document as evidence. The other parent, and any attorney involved, will read it closely, and they may compare it against documents they already have."
},
{
"t": "p",
"x": "That responsibility should not create fear. It should create care. Courts generally understand the difference between an estimate that is clearly identified as an estimate and information intended to mislead. Mistakes can be corrected, and later chapters cover exactly how to handle values you are unsure of. What the sworn statement does mean is that guessing silently, rounding carelessly, or leaving things out is not a shortcut worth taking. The process in this book is built so you will never need to."
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "Throughout this book, you will notice a consistent theme: the forms are not the work; they are the result of the work. Once you have built a complete, organized financial record, your state's forms become a way to communicate information you already understand. That shift in perspective is the foundation of the Financial Disclosure System, and it is the reason this process can feel far more manageable than it first appears."
}
],
"ch2": [
{
"t": "p",
"x": "By now, you know that financial disclosure is about more than completing forms. A parent who has already received the paperwork may have noticed that it never quite explains itself. The form assumes you know what it is for, why it exists, and what the court intends to do with it. Most parents do not, and not because the concept is difficult. No one has ever had a reason to tell them."
},
{
"t": "p",
"x": "This chapter fills that gap, starting with the most natural question. Why does the court require this in the first place?"
},
{
"t": "h2",
"x": "The Concept"
},
{
"t": "p",
"x": "Financial disclosure is the process by which both parents give the court, and each other, an accurate picture of their financial lives. Each parent reports their income, their expenses, what they own, what they owe, and the financial obligations connected to their children. Both parents do this. It is not something one side does to the other. It is something both sides do so that everyone involved is working from the same facts."
},
{
"t": "p",
"x": "The reason is practical. Nearly every decision a family court makes has a financial dimension. Child support depends on what each parent earns and what the children cost. Property division depends on what exists and what it is worth. Requests for temporary support, attorney's fees, or help with specific expenses all depend on what each household can actually afford. Without reliable financial information, none of those decisions can be made fairly. The court has no way of knowing what it does not know."
},
{
"t": "p",
"x": "Financial disclosure helps solve that problem by creating an official financial picture that both the court and the parents can rely on. It brings together information that often exists in many different places and organizes it into a shared reference point, the foundation the rest of the case is built on."
},
{
"t": "h2",
"x": "What Financial Disclosure Is Not"
},
{
"t": "p",
"x": "It is not an audit."
},
{
"t": "p",
"x": "No one expects your records to be perfect, and the process is not designed to catch you making honest mistakes. Estimates, when they are clearly identified as estimates, are a normal part of disclosure."
},
{
"t": "p",
"x": "It is not a negotiation. The disclosure document is not the place to argue for outcomes, explain history, or characterize the other parent. It states facts. You may disagree with the other parent about what those facts mean and about what should happen next. Financial disclosure comes before those disagreements. Its purpose is to establish the facts that make meaningful discussion possible."
},
{
"t": "p",
"x": "It is not a judgment of how you have lived. The form does not care whether you spent wisely, saved enough, or carry more debt than you would like. Courts see every kind of financial life, every day. The only thing disclosure asks of you is accuracy."
},
{
"t": "p",
"x": "And it is not optional. Disclosure is required in every state, in one form or another, in essentially every case involving support or property. Treating it as a formality, or putting it off until the last minute, often makes a case longer, more expensive, and more stressful than it needed to be."
},
{
"t": "h2",
"x": "One System, Fifty Versions"
},
{
"t": "p",
"x": "This entire book is built on one fact. Every state requires financial disclosure, and every state asks for essentially the same information."
},
{
"t": "p",
"x": "The names differ. The forms differ. The deadlines and procedures differ. But when you set the paperwork from all fifty states side by side, as we did in building this system, the underlying request is remarkably consistent. Every state is reconstructing the same financial picture, assembled from the same components, almost always expressed in monthly figures."
},
{
"t": "p",
"x": "This means the skills this book teaches are not tied to any one state. A parent who builds a complete financial record has done the work that any state's form will ask for. If your case moves, if you relocate, if your state revises its forms next year, the record you built keeps its value. The forms are not the work; they are the result of the work."
},
{
"t": "h2",
"x": "The Six Universal Components"
},
{
"t": "p",
"x": "Every state's disclosure, whatever it looks like, is assembled from six components. This is a preview; Chapter 4 walks through each one in depth."
},
{
"t": "p",
"x": "Income is everything that comes in, including wages, self-employment income, tips, bonuses, rental income, benefits, retirement income, and support received. States almost universally want this expressed as a monthly amount, whatever your actual pay schedule looks like."
},
{
"t": "p",
"x": "Expenses are what it costs to run your household each month, including housing, utilities, transportation, insurance, food, childcare, medical costs, and payments on debts."
},
{
"t": "p",
"x": "Assets are what you own, such as real estate, vehicles, bank accounts, retirement accounts, business interests, and personal property of meaningful value."
},
{
"t": "p",
"x": "Liabilities are what you owe, including mortgages, loans, credit cards, tax debts, and money owed to individuals, along with the monthly payment each requires."
},
{
"t": "p",
"x": "Child-related financial obligations are the costs attached specifically to your children, such as health insurance premiums, childcare, and support paid for children from other relationships. These items appear on nearly every state's paperwork because child support calculations require them."
},
{
"t": "p",
"x": "Supporting documentation means the records that back the numbers, such as tax returns, pay stubs, and account statements. Most states require some of these to be attached, and all states expect the numbers to be supportable if questioned."
},
{
"t": "p",
"x": "Taken together, these six components form a complete picture of a household's financial life. That is not an accident, and it is why the record-first approach works. Build the picture once, completely, and every question any form asks is already answered."
},
{
"t": "h2",
"x": "How Courts Use What You Provide"
},
{
"t": "p",
"x": "Understanding what happens to your disclosure after you file it explains almost everything about how it should be prepared, and why organization and accuracy matter long before anyone walks into a courtroom."
},
{
"t": "lb",
"l": "Calculations. ",
"x": "Child support in every state runs through a guideline formula, and the formula's inputs, including each parent's income, health insurance costs, and childcare costs, come directly from disclosure."
},
{
"t": "lb",
"l": "Temporary decisions. ",
"x": "Courts often make early orders about support and expenses based almost entirely on the disclosed picture, because at that stage it is the only financial information the court has."
},
{
"t": "lb",
"l": "Reference point. ",
"x": "Your disclosure stays in the case, and later statements and positions may be compared against it."
},
{
"t": "p",
"x": "Your disclosure will also be read carefully by the other parent and any attorney involved, often alongside records they already have. This is a normal part of the process, and it is one more reason the honest, well-documented path is also the practical one. Chapter 7 returns to all of this in detail when you complete your state's paperwork."
},
{
"t": "h2",
"x": "The Sworn Statement"
},
{
"t": "p",
"x": "Every state's disclosure ends the same way, with your signature under a statement that the information is true. States handle the mechanics in one of two ways, and knowing which to expect removes a common surprise."
},
{
"t": "p",
"x": "Some states use a notarized affidavit, which you sign in front of a notary or court clerk who verifies your identity and witnesses the signature. Roughly a third of states work this way, so it is worth finding out early whether yours does. It is an extra errand, not a formality to discover on the day of a deadline."
},
{
"t": "p",
"x": "Most other states use a certification signed under penalty of perjury. There is no notary, just your signature beneath a statement acknowledging the legal consequences of falsity. A number of states use both styles across their various forms."
},
{
"t": "p",
"x": "The mechanics differ; the meaning does not. Either way, you are making a sworn statement that courts will treat as evidence. That responsibility should not create fear. It should create care. And working methodically almost always produces a stronger disclosure than working quickly."
},
{
"t": "h2",
"x": "What It's Called Where You Live"
},
{
"t": "p",
"x": "One of the more disorienting parts of this process is that no two states seem to speak the same language. The same document answers to many names: a Financial Affidavit in some states, a Financial Declaration in others, a Domestic Relations Affidavit, an Income and Expense Declaration, a Case Information Statement, a Statement of Net Worth, a Sworn Financial Statement."
},
{
"t": "p",
"x": "The packaging varies as much as the names. Some states put everything in a single comprehensive form. Others split the picture across companion forms, one for income and expenses and another for assets and debts. Several states offer a short form for simpler financial situations and a long form for more complex ones. Some states publish no statewide form at all and instead list required documents in a court rule, and in a handful of states the exact form depends on your county or judicial district."
},
{
"t": "p",
"x": "None of this variety changes what you will actually do. Whatever your state calls its version, and however it packages the questions, it is asking for the same six components you just read about. When you encounter your state's paperwork, you should expect to recognize it, not because you have seen that form before but because you already know what any such form must ask."
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "Financial disclosure is the one part of a family court case where the task is fully within your control. You cannot control what the other parent files, how quickly the court moves, or what gets decided. You can control whether your financial picture is complete, accurate, and organized."
},
{
"t": "p",
"x": "The forms are important. But they come later. The record comes first. And that raises the question nearly every parent asks next. When should I actually begin?"
}
],
"ch3": [
{
"t": "p",
"x": "The answer to the question that ended the last chapter is straightforward. Begin now."
},
{
"t": "p",
"x": "Not because your deadline is tomorrow. It probably is not. Begin now because building your financial record is a process rather than a single event, and like many parts of family court, the work only feels urgent when it has been postponed until a deadline appeared. The parents who struggle with financial disclosure are almost never the ones who started too early."
},
{
"t": "p",
"x": "Searching for an important document under pressure is a familiar experience. A tax return needed for a mortgage application, or an insurance policy requested after an accident, can suddenly become difficult to find. The document itself is not complicated. Time has become part of the problem."
},
{
"t": "p",
"x": "Financial disclosure works the same way. Most of the information already exists. Pay stubs have been issued, tax returns have been filed, statements are sitting in accounts you already have. The challenge is rarely creating information. The challenge is gathering, organizing, and verifying it before someone else needs it."
},
{
"t": "h2",
"x": "Begin Before You Are Asked"
},
{
"t": "p",
"x": "Disclosure deadlines tend to arrive early. In many states the obligation begins automatically the moment a case is filed, with documents due within the first several weeks. Others tie the exchange to the first hearing or to a request from the other side. Whatever form it takes, the pattern is consistent. The court asks for your financial picture near the beginning, because so many of the decisions ahead depend on it."
},
{
"t": "p",
"x": "A deadline only marks the finish line. The starting line is yours to choose, and you do not need a deadline, a lawyer, or a filed case to begin. Starting early simply means the work happens calmly, on your schedule instead of the court's."
},
{
"t": "h2",
"x": "Define Your Timeline First"
},
{
"t": "p",
"x": "When the need for financial disclosure first becomes clear, many parents instinctively begin gathering documents. While understandable, that approach often creates unnecessary work. Before collecting any records, first answer one question. How far back does each type of document need to go?"
},
{
"t": "p",
"x": "Every disclosure requirement has a time window attached to it, whether the form says so or not. Your state does not want all your tax returns; it wants a certain number of recent years. It wants bank statements for a defined period of recent months, not every statement you have ever received. Those windows are the real shape of the task. Once you know them, the vague dread of paperwork everywhere becomes a finite list. So many years of this, so many months of that."
},
{
"t": "p",
"x": "Knowing the windows first changes everything about the work. You know what done looks like before you start. You can spot gaps immediately and stop collecting when the window is filled. Defining the timeline first often changes the experience in the same way. The task stops feeling endless."
},
{
"t": "h2",
"x": "What the Windows Usually Look Like"
},
{
"t": "p",
"x": "Your state sets its own windows, and Chapter 7 covers how to confirm them. But state requirements cluster tightly enough that realistic expectations are possible, and having them now removes most of the anxiety."
},
{
"t": "p",
"x": "Tax returns. Most states ask for one to three years of your most recent returns. Self-employed parents and business owners should expect the higher end, with business returns requested alongside personal ones."
},
{
"t": "p",
"x": "Pay records. Most states ask for your two to four most recent pay stubs, roughly the last month or two of pay. If your income varies with seasons, tips, or commissions, expect to show a longer stretch so the numbers can be fairly averaged."
},
{
"t": "p",
"x": "Bank and account statements. Where states specify a period, it typically runs from three months to a year. Organizing a full year is the safest approach, and many financial institutions make at least twelve months of statements available online, making this one of the easier records to gather."
},
{
"t": "p",
"x": "Everything else. Retirement statements, insurance information, and proof of expenses such as childcare are usually requested as most recent or current, a single document rather than a stretch of history."
},
{
"t": "p",
"x": "One caution. These windows are not always printed on the form itself. In some states they live in a court rule or statute instead. Confirming your state's actual requirements is usually straightforward through the form's instructions, your court's self-help center, or the clerk's office."
},
{
"t": "h2",
"x": "The Timeline Worksheet"
},
{
"t": "p",
"x": "This is the first working tool of the system, and it is deliberately simple. Take one page. Down the left side, list the document types you just read about. Next to each, write the window your state requires, using the ranges above as placeholders until you confirm the real numbers. That single page is your disclosure timeline. A blank copy is included at the back of the book."
},
{
"t": "p",
"x": "The worksheet turns disclosure from a mood into a checklist. Every document you gather from here on has a place it belongs and a window it fills, and at any moment you can see exactly what remains."
},
{
"t": "p",
"x": "Beginning early does not mean beginning perfectly, and it does not mean gathering everything at once. Very few parents start with a complete record. You may know your monthly income but need to locate retirement statements. You may have your tax returns but need to verify loan balances. That is normal. The record is built piece by piece, and the worksheet exists so the pieces have somewhere to go."
},
{
"t": "p",
"x": "The way you organize those records matters too, but we will build that system after you have defined what you are actually looking for. That is the work of Chapter 5. Right now the only task is knowing what the complete set looks like."
},
{
"t": "h2",
"x": "If Your Case Has Already Started"
},
{
"t": "p",
"x": "Some readers will begin this process after a case is already underway. If that describes your situation, the same approach still applies. Only the pace changes."
},
{
"t": "p",
"x": "Define the timeline first anyway. It feels like a detour when time is short. It is the opposite. Twenty minutes spent listing the windows will save you from the two most expensive mistakes rushed parents make, gathering records you do not need and discovering missing ones at the deadline. If a required document truly cannot arrive in time, most courts deal with that reasonably when a parent can show what was requested and when. What courts respond to poorly is silence."
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "Beginning is not a dramatic act. It is a page with a list of windows on it. But that page changes your relationship to everything that follows. When your state's forms eventually arrive, they should not feel like the beginning of the process. They should feel like the final step."
},
{
"t": "p",
"x": "The next chapter begins building the financial picture itself. We will start with the six components introduced in Chapter 2 and look at how each one fits into a complete financial record."
}
],
"ch4": [
{
"t": "p",
"x": "Chapter 2 introduced the six components that every state's disclosure is built from. This chapter teaches each one properly, and it is worth saying plainly what that means."
},
{
"t": "p",
"x": "The goal here is not to memorize categories. It is to learn a way of seeing. A financial life does not arrive sorted. It arrives as a paycheck with unfamiliar deductions, a truck that is half paid off, a retirement account from two jobs ago, a credit card that floats the groceries in tight months. Disclosure asks you to look at that unsorted life and recognize what each piece is."
},
{
"t": "p",
"x": "It helps to understand what the picture is for. The numbers matter, but what a disclosure really describes is how a household functions. Income explains where resources come from. Expenses explain where they go. Assets describe what has been accumulated over time, and liabilities identify what remains owed. Child-related costs show the financial shape of raising the children, and documentation ties every figure to a record. None of these stands alone. Assets without liabilities create a misleading impression of financial strength. Income without expenses tells only half the story. The components are lenses on one household, and the court reads them together."
},
{
"t": "p",
"x": "It also helps to understand what the picture is not. Financial disclosure is a snapshot, not a biography. Some records look backward, such as tax returns and recent statements, and some describe the present, such as current income and outstanding balances. Together they capture where things stand at the time decisions are being made. Life will continue changing afterward, and financial disclosure is designed to be updated when circumstances materially change. The task in front of you is only to make the current picture accurate."
},
{
"t": "p",
"x": "One principle governs everything that follows. Understanding comes before calculation. Once you can recognize what belongs in each component, gathering documents and computing figures becomes far easier, because you know what you are looking for. The rest of this chapter builds that recognition, one component at a time."
},
{
"t": "h2",
"x": "Income"
},
{
"t": "p",
"x": "Income is everything that flows in, whatever its name. That definition matters more than any list, because income arrives under many names, and forms cannot anticipate all of them. Wages and salary are obvious. So are tips, bonuses, commissions, and overtime. Less obvious sources count just as much. Self-employment and side work. Rental income. Interest and dividends. Retirement and pension payments. Unemployment, disability, and workers' compensation. Public assistance. Spousal or child support received from another relationship. Recurring help from family, in some states. If money arrives with any regularity, it should generally be considered part of your financial picture unless your state's rules provide otherwise."
},
{
"t": "p",
"x": "Most states ask for income as a monthly figure, and a smaller number work in weekly figures instead. Either way, most pay schedules will not match the required period, and the arithmetic is simple. The box below collects the monthly conversions; weekly figures follow the same logic."
},
{
"t": "box",
"title": "Converting Pay to Monthly Figures",
"items": [
"Weekly pay: multiply by 52, divide by 12.",
"Every two weeks: multiply by 26, divide by 12. This is not the same as doubling. A biweekly paycheck of $2,000 is $4,333 per month, not $4,000.",
"Twice per month: multiply by 2.",
"Annual figures: divide by 12.",
"If your state uses weekly figures, the same logic applies: divide annual amounts by 52."
]
},
{
"t": "p",
"x": "Gross and net is the other distinction that matters. Gross income is the amount before anything is taken out. Net is what actually arrives. Most states build their support calculations on gross income and handle deductions separately, and even the states that calculate on net income collect gross figures first, so disclosure forms generally want gross figures with deductions itemized. A parent who reports take-home pay as income has understated it, and the discrepancy will surface the moment a pay stub is examined."
},
{
"t": "p",
"x": "Variable income deserves patience rather than worry. Seasonal work, commissions, tips, gig income, and overtime do not produce a neat monthly number, and states know this. The standard approach is averaging over a longer period, commonly six to twelve months, so that a slow February and a strong June both tell the truth. This is one reason the longer documentation windows discussed in Chapter 3 exist at all."
},
{
"t": "p",
"x": "Self-employment requires one honest distinction. What a business takes in is not what its owner earns. Disclosure wants the owner's actual income, which is generally receipts minus legitimate business expenses, and states look to business tax returns and profit-and-loss statements to establish it. Several states publish dedicated schedules for exactly this situation. Business owners should expect more documentation, not more suspicion. The extra paperwork exists because the truth takes more paper to establish."
},
{
"t": "h2",
"x": "Expenses"
},
{
"t": "p",
"x": "Expenses are what it costs to run your household each month. Disclosure forms approach them with a logic that becomes familiar quickly. Housing first, including rent or mortgage, property taxes, and insurance. Then utilities, transportation, food and household supplies, insurance premiums, medical costs, childcare, and payments on debts. The categories are ordinary. The discipline is in the numbers."
},
{
"t": "p",
"x": "Two habits produce accurate expense figures. The first is averaging anything irregular. Car insurance paid twice a year, holiday costs, annual subscriptions, and seasonal utility swings all convert to monthly averages, and a year of bank and card statements makes those averages factual rather than guessed. The second is distinguishing what you actually spend from what you think you spend. Estimated grocery numbers are famously optimistic. Statements are not. Where a figure must be estimated, estimate it and be prepared to identify it as an estimate."
},
{
"t": "p",
"x": "One structural note prevents a common confusion. A debt appears in two places on most disclosures, and that is intentional. The monthly payment on a car loan is an expense. The remaining balance on that loan is a liability. Forms ask for both because they measure different things, what the household spends each month and what the household owes in total. Recording the same loan in both places is correct, not double counting."
},
{
"t": "p",
"x": "One principle prevents the most common expense mistake, and it applies to every puzzle in the box below. Capture first, classify second. Money that leaves the household is an expense even when its category is unclear, and uncertainty about where a cost belongs must never become a reason to leave it out. Record it in your record. At form time, place it on the most reasonable line, use the other-expenses fields forms provide for exactly this purpose, and give each expense one line, never two."
},
{
"t": "box",
"title": "Where Does This Go?",
"items": [
"Some real costs fit no obvious category. They are still expenses, and each has a sensible home.",
"Travel for exchanges and parenting time. Fuel, flights, or lodging spent to see your children or carry out the schedule is a real cost of parenting, distinct from ordinary transportation. Give it its own line. Some states account for significant parenting travel in their support calculations, which makes documenting it doubly worthwhile.",
"Unreimbursed work expenses. The ride to the airport, parking near a job site, tools, uniforms, union dues, licenses. These are costs of earning income, and states place them differently. Some forms deduct them on the income side; others list them among expenses. Record them on one line in your record, and let your form's instructions decide where they land.",
"Children's activities and school costs. Sports, lessons, field trips, supplies. Forms differ on whether these sit with household expenses or child-related costs. Either placement is defensible; consistent placement is what matters.",
"The cash that disappears. Regular withdrawals that vanish into daily life are still expenses. A stretch of honest tracking turns miscellaneous into a fair monthly average instead of a blank."
]
},
{
"t": "h2",
"x": "Assets"
},
{
"t": "p",
"x": "Assets are what you own that has meaningful value. Real estate. Vehicles. Bank accounts. Investment accounts. Retirement accounts and pensions. Business interests. Life insurance with cash value. Money owed to you. Personal property of consequence, such as jewelry, tools, equipment, or collections. Ordinary household contents are typically summarized rather than itemized; no state expects an inventory of the silverware drawer."
},
{
"t": "p",
"x": "The recurring question with assets is value, and the honest answer is that value means different things for different assets. A bank account has a balance, exact to the penny on a statement. A retirement account has a balance on its most recent statement, even though it changes daily. A house has an estimated market value, which is not what was paid for it and not what the tax assessor says, but what it would reasonably sell for today. A vehicle has a lookup value from any standard pricing guide. Where an exact figure does not exist, states expect a reasonable estimate identified as such, not a shrug and not false precision."
},
{
"t": "p",
"x": "Every asset value is a snapshot in time, which is why forms ask for figures as of a date. The value of the account matters less than the honesty of the date attached to it. A statement from three months ago, identified as such, is a perfectly good answer. It is also worth listing assets you believe belong solely to the other parent when a form asks. Classification is the court's job, and completeness is yours."
},
{
"t": "h2",
"x": "Liabilities"
},
{
"t": "p",
"x": "Liabilities are what you owe. Mortgages and home equity loans. Vehicle loans. Student loans. Credit cards. Medical debt. Personal loans, including informal ones from family. Tax debt. Money owed under prior court orders. For each, disclosures generally want three facts: who is owed, the total balance, and the required monthly payment."
},
{
"t": "p",
"x": "Debts carry names, and the names matter. Some debts are yours alone. Some belong to the other parent alone. Some are joint, and joint debts remain joint regardless of what an eventual agreement says about who pays them, because the lender was never party to that agreement. Disclosure simply records the facts as they stand. List what you owe, list joint obligations as joint, and let classification arguments wait for the stage of the case built for them."
},
{
"t": "p",
"x": "Parents are sometimes tempted to leave out debts that embarrass them, payday loans, gambling debts, borrowed money from relatives. The disclosure is not a character assessment, and courts have seen every kind of debt there is. An omitted debt discovered later damages credibility in a way no balance ever could."
},
{
"t": "h2",
"x": "Child-Related Financial Obligations"
},
{
"t": "p",
"x": "These costs are separated from ordinary household expenses because they feed directly into child support calculations and related financial decisions. Three appear on nearly every state's paperwork."
},
{
"t": "lb",
"l": "Health insurance. ",
"x": "Forms typically want the cost of covering the children, not the whole family premium. If family coverage costs 600 dollars per month and employee-only coverage would cost 250, the children's portion is the difference attributable to them, and pay stubs or benefits statements establish it. Out-of-pocket medical costs for the children, such as copays, orthodontics, or therapy, are usually reported separately."
},
{
"t": "lb",
"l": "Childcare. ",
"x": "Work-related childcare, including daycare, after-school care, and summer care, feeds directly into most states' support formulas. Receipts and provider statements make the figure exact."
},
{
"t": "lb",
"l": "Support for other children. ",
"x": "Support paid under an order for children from another relationship is a standard line on guideline worksheets, because it reduces the income available in the current case. Support received for other children is generally reported as well."
},
{
"t": "p",
"x": "Parents who share these costs informally should record what is actually paid, by whom, and how regularly. Informal arrangements are common, and the disclosure simply documents reality."
},
{
"t": "box",
"title": "If You Live in a Community Property State",
"items": [
"Nine states, including Arizona, California, Idaho, Louisiana, Nevada, New Mexico, Texas, Washington, and Wisconsin, classify most property acquired during a marriage as belonging to the marital community rather than to either spouse individually. Forms in those states ask for property to be identified as community or separate, and sometimes provide separate schedules for each.",
"This changes labels, not work. The record you are building is identical in every state. Community property states add a classification question after the gathering is done, and Chapter 7 addresses how those forms present it. Nothing about this chapter changes."
]
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "These six components are the entire subject matter of financial disclosure. Every form in every state is some arrangement of the questions this chapter just answered. A parent who can look at their own financial life and mentally sort it, this is income, this is an expense, this loan is a payment and a balance, this cost exists because of the children, has already done the intellectual work of disclosure."
},
{
"t": "p",
"x": "You have now learned the language. What remains is the physical work, turning that understanding into an organized record that holds the documents behind every number. That is the next chapter."
}
],
"ch5": [
{
"t": "h2",
"x": "The Record Is the Asset"
},
{
"t": "p",
"x": "Chapter 2 listed supporting documentation as the sixth component of disclosure, and then this book went quiet about it. That was deliberate. Documentation is not really a sixth category alongside the other five. It is the foundation underneath all of them. Income, expenses, assets, liabilities, and child-related costs are the information a disclosure reports. Documents are what make that information true. A financial record is where information and documentation meet, organized well enough that every number can be traced back to the document that supports it."
},
{
"t": "p",
"x": "It is worth being clear about what that record is for. A completed form is useful for one filing. An organized financial record is useful throughout a case. It supports mediation, conversations with an attorney, settlement discussions, future modifications, and, if necessary, testimony. The forms are temporary. The record is the asset."
},
{
"t": "h2",
"x": "Memory or Record"
},
{
"t": "p",
"x": "Consider a simple question. What is your monthly income? There are two ways to answer it. The first is to estimate from memory. The second is to open the income section of a financial record, locate the current pay information, and report the number along with the document that supports it."
},
{
"t": "p",
"x": "The number may be identical. The confidence is not. That confidence, multiplied across every number a case will ask for, is what this chapter builds."
},
{
"t": "h2",
"x": "Organize by Obligation, Not by Institution"
},
{
"t": "p",
"x": "Financial records seem to arrive organized. The bank sends statements, the employer issues pay stubs, the mortgage company sends its own paperwork. The natural filing instinct follows the senders, a folder for the bank, a folder for the employer, a folder for the mortgage company. That mirrors the mail. It does not mirror disclosure."
},
{
"t": "p",
"x": "The instinct fails quietly, and it fails for a reason worth understanding. Institutions change. A mortgage may be sold and resold; a loan that began with one servicer can pass through several without the borrower doing anything at all. Banks merge. Employers change payroll providers. If the record is organized around institutions, every one of those changes fractures it."
},
{
"t": "p",
"x": "The institution may change. The obligation usually does not. The mortgage is one continuous monthly fact from the day it began, no matter how many companies have collected it. The paycheck is one continuous income stream across payroll systems. So the record is organized around obligations and sources, one line for each, and each line runs across time. Which company sent the January statement is a detail. That January exists and is accounted for is the point."
},
{
"t": "h2",
"x": "The Record Structure"
},
{
"t": "p",
"x": "The structure follows directly from Chapter 4, and it is deliberately plain. One section for each component. Within each section, one line per item, each income source, each account, each debt, each recurring child-related cost. Across each line, the months your timeline worksheet from Chapter 3 requires. A working record looks like this."
},
{
"t": "table",
"rows": [
[
"Obligation / Source",
"Jan",
"Feb",
"Mar",
"Apr",
"May",
"Jun"
],
[
"Mortgage",
"✓",
"✓",
"✓",
"✓",
"□",
"✓"
],
[
"Checking account",
"✓",
"✓",
"✓",
"✓",
"✓",
"✓"
],
[
"Pay stubs",
"✓",
"✓",
"✓",
"□",
"□",
"✓"
],
[
"Childcare receipts",
"✓",
"✓",
"□",
"□",
"✓",
"✓"
]
]
},
{
"t": "p",
"x": "A record built this way answers the two questions that matter at every later stage of a case. What is the number, and where is the document that supports it? The completed grid also does something quieter. It shows the shape of your financial life on a single page, which is the picture Chapter 4 taught you to see."
},
{
"t": "h2",
"x": "The One-Minute Test"
},
{
"t": "p",
"x": "One question evaluates almost any financial record. If someone asked where a number came from, could you answer in less than a minute? When the answer is yes, the record is doing its job. When the answer is no, the problem is usually organization rather than missing paperwork. The test works on the day a disclosure is due, and it works just as well in a mediation session eight months later."
},
{
"t": "h2",
"x": "Completeness You Can See"
},
{
"t": "p",
"x": "The quiet advantage of a grid is that absence becomes visible. A pile of paperwork can feel complete while missing half of what a disclosure requires, because piles do not show gaps. A grid does. An empty cell under May is not a feeling. It is a fact. And it converts vague worry into a specific errand, request the May statement."
},
{
"t": "p",
"x": "This is the useful way to think about missing documents generally. Not as a crisis, but as an empty cell with a known remedy. Chapter 6 covers where every common document lives and how to retrieve it. The record's job is only to make the gaps impossible to miss, and to hold the answer once it arrives."
},
{
"t": "h2",
"x": "Digital, Paper, or Both"
},
{
"t": "p",
"x": "Either works. Parents who prefer paper use a binder with a tab per line of the grid. Parents who prefer digital use folders that mirror the same structure, one folder per component, one subfolder per item, files named by month and year. A consistent name, such as 2026-03-mortgage.pdf, keeps every folder sorting itself chronologically. Documents arrive from many directions, downloads on one device, photographs on a phone, attachments in an email account. The habit that prevents scatter is simple. Everything moves to its cell in the record when it arrives, not later."
},
{
"t": "p",
"x": "The best organizational system is the one you will actually maintain. And progress matters more than perfection. Few parents begin with everything. A statement may be missing, a balance may need updating, and that is normal. An incomplete record that continues improving is worth more than a perfect one that never gets started."
},
{
"t": "h2",
"x": "Sections That Do Not Apply"
},
{
"t": "p",
"x": "Parts of this record will not apply to you. A parent with no rental property has no rental income line. A parent who rents has no mortgage line. Renters, retirees, business owners, and wage earners will each leave different sections empty. An empty section is not an incomplete record. It is a completed answer. It says, considered, and not applicable."
},
{
"t": "p",
"x": "The record is deliberately built wider than any one financial life, for the same reason a tax organizer asks about farms and foreign accounts. Completeness is what lets you stop wondering whether something was missed. Mark the sections that do not apply and move on."
},
{
"t": "h2",
"x": "Starting Your Record"
},
{
"t": "p",
"x": "Understanding the structure is most of the work. Starting it takes far less time than most parents expect, and it is worth doing before opening the next chapter. The checklist below sets up the skeleton. Every line you create is an empty row waiting for documents, and Chapter 6 begins filling them."
},
{
"t": "box",
"title": "Record Starter",
"items": [
"□  Choose the home: one binder or one folder. Nothing else counts as the record.",
"□  Create six sections: Income, Expenses, Assets, Liabilities, Child-Related Costs, Court Papers.",
"□  Income: one line per source (employment, self-employment, benefits, support received).",
"□  Expenses: one line per recurring obligation (housing, utilities, insurance, transportation, childcare).",
"□  Assets: one line per account or item of value (checking, savings, retirement, vehicles, real estate).",
"□  Liabilities: one line per debt (mortgage, loans, credit cards, money owed to individuals).",
"□  Child-related: one line per cost (health insurance premium, childcare, support for other children).",
"□  Across each line, write the months your Chapter 3 timeline worksheet requires.",
"□  Mark any line that does not apply: considered, and not applicable."
]
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "A financial record built this way outlasts the form it was built for. The same income appears on support worksheets. The same expenses appear in mediation. The same asset values appear in property discussions. Built once, it continues answering the same questions wherever they appear."
},
{
"t": "p",
"x": "What remains is filling it. The next chapter is about the documents themselves, where each one lives, how to retrieve it, and what to do about the ones that resist."
}
],
"ch6": [
{
"t": "p",
"x": "The record now exists. Its sections are named, its lines are drawn, and its empty cells are waiting. This chapter fills them."
},
{
"t": "p",
"x": "The work of gathering is different from the work of understanding, and it deserves its own principle. Evidence outranks memory. Gathering is often described as paperwork, but it could be better understood as verification. Each document replaces something you would otherwise have to remember, estimate, or explain later, and a disclosure built on documents can be checked, defended, and trusted. Most states require supporting documents to accompany the disclosure itself, and the other parent may compare every reported number against records they already hold. Gathering is therefore not a chore that follows the real work. It is the real work."
},
{
"t": "p",
"x": "As the record fills, the unknowns become fewer and more specific. Some questions disappear the moment a document is found. Others become defined retrieval tasks instead of vague worries. Either way, the evidence behind every number becomes visible."
},
{
"t": "p",
"x": "The encouraging news is that almost every document a disclosure requires already exists and was created by an institution whose business is keeping records. Retrieving those records is sometimes quick and sometimes requires persistence, but very little of this information needs to be recreated from scratch. The question is no longer whether the documents exist. It is where to retrieve them."
},
{
"t": "h2",
"x": "Where Documents Live"
},
{
"t": "p",
"x": "Most retrieval follows the same short list of sources. The table below covers the documents that appear in nearly every disclosure, and the rest of this section adds what the table cannot say."
},
{
"t": "table",
"rows": [
[
"Document",
"Usual source"
],
[
"Tax returns",
"Your own files or tax preparer; free transcripts from the IRS if lost; state returns from the state revenue agency"
],
[
"Pay stubs",
"Employer payroll portal or human resources office"
],
[
"Bank and card statements",
"Online banking archives, commonly the most recent twelve months or more; older statements by request"
],
[
"Retirement statements",
"Plan administrator's portal or the most recent mailed statement"
],
[
"Mortgage and loan statements",
"Current servicer's portal; older records or transferred loans may require additional requests"
],
[
"Insurance documents",
"Insurer or employer benefits portal; declarations pages and premium summaries"
],
[
"Benefit letters",
"The issuing agency, such as Social Security or unemployment offices"
],
[
"Childcare receipts",
"The provider; most can produce a payment history on request"
],
[
"Business records",
"Your bookkeeping software, accountant, or business bank account"
]
]
},
{
"t": "p",
"x": "Three habits make retrieval efficient. Work from the record, not from a pile; each empty cell names exactly what to request, so nothing unnecessary is gathered. Start with the sources you control, your own files, portals, and accounts, before contacting anyone; most of the grid fills from sources that require no one's help. And send the slow requests early. Beginning with the easiest documents builds momentum while the requests that depend on other institutions have time to arrive."
},
{
"t": "p",
"x": "For anything that requires a request, the request itself is straightforward, even when obtaining the records is not. Identify the account, state the period you need, and ask in writing where possible, so the request becomes part of the record. Institutions handle requests like this every day, and when one does not cooperate, the hard cases below are written for exactly that moment. Nothing about asking signals a legal dispute, and nothing about it requires explanation."
},
{
"t": "p",
"x": "One limitation is worth knowing in advance so it never causes alarm. Most institutions keep only a limited history available online. When a statement is older than the online archive, it has not ceased to exist. Older records generally remain available by request, sometimes for a small fee, and a discovered gap in the record is not a failure. It is simply the next task, with a known address."
},
{
"t": "h2",
"x": "The Hard Cases"
},
{
"t": "p",
"x": "Some evidence resists gathering, and each common case has a standard answer."
},
{
"t": "lb",
"l": "Cash and irregular income. ",
"x": "Income without pay stubs still leaves footprints, deposits, payment app transfers, invoices, and calendars of work performed. The obligation is to report the income accurately, and the practical method is to reconstruct it from whatever trail exists, over a long enough period to be fair. A reconstructed figure identified as a good-faith estimate is a legitimate answer. A shrug is not."
},
{
"t": "lb",
"l": "Gig and platform work. ",
"x": "The platforms keep excellent records. Rideshare, delivery, and marketplace services all provide earnings summaries and annual tax documents, usually downloadable from the account itself."
},
{
"t": "lb",
"l": "Closed accounts. ",
"x": "A closed account is not a dead end. It is a records request. Institutions retain account records for years after closure and provide statements on request, sometimes for a fee. Allow time; this is among the slower retrievals."
},
{
"t": "lb",
"l": "Institutions that resist. ",
"x": "Persistence in writing usually succeeds. When it does not, note the attempt in the record, what was requested, from whom, and when, and move on. Chapter 3 made this point about deadlines and it applies here. A documented attempt is a defensible position. Silence is not."
},
{
"t": "lb",
"l": "Records the other parent holds. ",
"x": "Some documents may simply live with the other parent, joint account histories, business records, a shared accountant's files. You are not expected to produce what you cannot access. Disclose what you have, identify what exists but is out of reach, and let the disclosure process do its work. The same obligations that bind you bind the other parent, and the court has tools for records that one side holds."
},
{
"t": "h2",
"x": "Redaction and Privacy"
},
{
"t": "p",
"x": "Financial documents are full of information that does not belong in a public court file, and many states instruct filers to redact it. The principle is simple. Redact identity, never substance. Social Security numbers, full account numbers, and dates of birth are commonly blacked out, with account numbers reduced to their last few digits so documents remain identifiable. Amounts, dates, and transaction details are the substance of disclosure and are never redacted."
},
{
"t": "p",
"x": "Your state may also have a confidential information procedure, one or more cover sheets or a separate form that holds sensitive identifiers apart from the public file. Chapter 7 covers where to find such procedures. When redacting, work on copies and leave originals untouched, and apply the same treatment to every document rather than deciding page by page."
},
{
"t": "h2",
"x": "Before Moving On"
},
{
"t": "p",
"x": "The goal of this chapter is not perfection. It is a simpler standard. Every document in your timeline should now belong to one of three categories. Already in the record. Requested, with the request noted. Or not applicable, marked as considered. By this point, every document should fit one of these three categories."
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "Gathering ends in a specific and satisfying condition. Every line of the record runs its full window with no empty cells, every number has a document, and every document sits where the one-minute test can find it. Parents who reach this point often report something unexpected. The case ahead feels smaller, because its largest unknown has become known."
},
{
"t": "p",
"x": "What remains is the step this entire system has been building toward, and it is now the easiest one. Your state's forms are waiting, and you already have everything they ask for."
}
],
"ch7": [
{
"t": "p",
"x": "For many parents, the disclosure form looks like the beginning of the process. In reality, it is almost the end. The difficult work was never filling in boxes. It was understanding your financial picture, defining the timeline, organizing a record, and gathering the documents behind every number. Those chapters are now behind you, and the form simply gives that work a place to go."
},
{
"t": "p",
"x": "It helps to name what makes forms intimidating, because it is rarely their substance. They arrive with unfamiliar labels, numbered schedules, checkboxes, and references to court rules. It is easy to mistake complexity of appearance for complexity of purpose. The purpose has not changed. Every schedule on every state's form is asking some arrangement of the six questions this book has already answered, and completing it is a translation exercise rather than a discovery exercise. Your record holds the answers in one representation. The form asks for them in another."
},
{
"t": "h2",
"x": "Recognizing What Your State Handed You"
},
{
"t": "p",
"x": "Chapter 2 promised that when you met your state's paperwork, it would feel familiar. This is where that promise is kept. Whatever arrived, it is one of a small number of packages, and knowing which one changes nothing about the work you have already done."
},
{
"t": "lb",
"l": "One comprehensive form. ",
"x": "The most common package. A single affidavit or declaration walks through income, expenses, assets, and debts in order. Your record's sections map onto it almost one to one."
},
{
"t": "lb",
"l": "Companion forms. ",
"x": "Several states split the picture, one form for income and expenses, another for property and debts, sometimes a third for health insurance or child-related costs. Together they ask exactly what the single form asks; only the packaging differs."
},
{
"t": "lb",
"l": "Short and long versions. ",
"x": "Some states provide a simpler form for simpler finances, usually divided by income level, with instructions on the form stating which version applies. Read that instruction first; it is typically the very first decision the paperwork asks of you."
},
{
"t": "lb",
"l": "A list instead of a form. ",
"x": "A few states publish no statewide financial form and instead list required documents and figures in a court rule. Your record already holds what the list demands; the rule simply tells you what to produce and when."
},
{
"t": "lb",
"l": "A local form. ",
"x": "In a handful of states the exact form depends on the county or judicial district. The local version rearranges familiar questions; it does not invent new ones."
},
{
"t": "p",
"x": "Your state may also use its own vocabulary for the same document, an affidavit here, a declaration there, a statement of net worth somewhere else. The label changes the title block, not the task."
},
{
"t": "h2",
"x": "Reading the Form Before Filling It"
},
{
"t": "p",
"x": "A few minutes with the form's instructions, before any field is touched, answers most of the questions that otherwise interrupt the work. Five things are worth locating."
},
{
"t": "p",
"x": "The attachment list, because many states print the required documents directly on the form, and this is also where your state's lookback windows finally appear in official form, confirming or correcting the placeholder ranges from Chapter 3. The certification block at the end, because it tells you whether your state expects a notarized signature or a certification under penalty of perjury, and therefore whether the last step involves an errand. The tier instruction, if your state uses short and long versions. Any confidential information procedure, the cover sheets or separate forms some states use to keep identifiers out of the public file, as discussed in Chapter 6. And in community property states, the classification columns, where property is marked community or separate, the labeling exercise Chapter 4 previewed."
},
{
"t": "p",
"x": "The period covered matters as much as the fields. Forms ask for figures as of a date or averaged over a period, and the instructions say which. Matching the form's period to your record's columns is most of the arithmetic this chapter requires."
},
{
"t": "h2",
"x": "Let the Record Lead"
},
{
"t": "p",
"x": "Work from the record, one form section at a time, and resist the temptation to answer questions as you read them. Each form field corresponds to a line in your record; the number transfers, and the document behind it stands ready if anyone asks. Where the form's categories differ slightly from your record's, and they sometimes will, the six components are the bridge. A form that asks for transportation costs is asking for lines your expense section already holds."
},
{
"t": "box",
"title": "Translation, in Practice",
"items": [
"Record line: Pay stubs (employment income, monthly average)  →  Form field: Gross Monthly Income, Section 1",
"Record line: Mortgage (balance and payment)  →  Form fields: Monthly Housing Expense (expenses) and Mortgage Balance (liabilities)",
"Record line: Childcare receipts (monthly total)  →  Form field: Work-Related Childcare, child-related schedule",
"One record. Different destinations. The same numbers, everywhere they are requested."
]
},
{
"t": "p",
"x": "Working this way produces something more valuable than speed. It produces consistency. The same income appears the same way everywhere it is requested, the same mortgage balance on every schedule that references it, the same childcare figure throughout the filing. Consistency is one of the quiet signs of a well-prepared disclosure, and its absence is one of the first things a careful reader on the other side will notice."
},
{
"t": "p",
"x": "Answer every field. A blank is ambiguous; it can mean zero, not applicable, or forgot, and only one of those is harmless. Where the true answer is zero, write zero. Where a section does not apply, mark it so. The completed answer you built in Chapter 5, considered and not applicable, belongs on the form as much as in the record."
},
{
"t": "p",
"x": "Estimates deserve their own discipline. Some values have no exact figure, a house's market value, an averaged utility bill, reconstructed cash income. States expect reasonable estimates identified as estimates, and most forms provide a way to mark them. What undermines a disclosure is not an estimate; it is an estimate dressed up as a precise figure. When a number you need is genuinely unavailable, say so on the form and continue; an amendment when the document arrives is routine, and Chapter 8 covers it."
},
{
"t": "h2",
"x": "When a Form Asks for Something Unexpected"
},
{
"t": "p",
"x": "Eventually every parent reaches a question they did not expect. That is not a sign of having done something wrong. States collect different details, local courts add schedules, and some judges issue standing orders that expand what must be filed."
},
{
"t": "p",
"x": "Most unexpected questions resolve into one of three categories. The information already exists somewhere in your record. The information requires one additional document, which becomes a new line and a retrieval task from Chapter 6. Or the question does not apply, and the answer is the familiar one, considered and not applicable. Understand what is being asked, locate the support, document it accurately, and continue. The method does not change because the question was unfamiliar."
},
{
"t": "h2",
"x": "Attestation, Filing, and Service"
},
{
"t": "p",
"x": "The signature is the moment the document becomes a sworn statement, so it comes last, after a final read. If your state uses a notarized affidavit, sign in front of the notary or clerk, not before. If your state uses certification under penalty of perjury, the signature line itself carries the legal weight. Either way, sign only what is true as of that day, which, with a maintained record, it will be."
},
{
"t": "p",
"x": "Filing and service are two separate acts. Filing delivers the disclosure to the court. Service delivers it to the other parent, and several states require a certificate of service, sometimes a separate form, confirming when and how that happened. The form's instructions, local court rules, or your court's self-help resources will explain which procedures apply."
},
{
"t": "p",
"x": "Before anything leaves your hands, make a complete copy of the package, the form, every attachment, and every certificate, and give it a permanent home in the record's court papers section. The version you keep should be identical to the version the court has."
},
{
"t": "h2",
"x": "After Filing"
},
{
"t": "p",
"x": "A disclosure is finished when it is true, complete, and served. It does not stay finished by itself. Finances change during a case, jobs end, expenses shift, accounts close, and most states expect a disclosure to be updated or amended when something material changes. A few states build this in formally, requiring a preliminary disclosure early and a final one before judgment. If your state is one of them, the second filing is not a repeat of the ordeal; it is the same translation from a record you have kept current."
},
{
"t": "p",
"x": "This is where the record proves what Chapter 5 claimed. A maintained record usually means updating a few lines rather than rebuilding an entire disclosure. The final chapter is about keeping it that way."
},
{
"t": "box",
"title": "Before You File",
"items": [
"□  Every field answered: an amount, a zero, or not applicable. No silent blanks.",
"□  Estimates identified as estimates.",
"□  Every figure consistent everywhere it appears.",
"□  Attachments assembled per the form's own list, in order.",
"□  Identifiers redacted per Chapter 6; amounts and dates untouched.",
"□  Confidential information procedure followed, if your state has one.",
"□  Certification matches your state's style: notarized, or signed under penalty of perjury.",
"□  Complete copy made: form, attachments, certificates.",
"□  Service arranged, and the certificate of service completed if required."
]
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "Somewhere in the middle of the work, most parents notice something worth pausing on. The form is not asking for anything they do not already have. Every question lands on a line of the record, every attachment is already in its cell, and the document that once looked like a test reads like a table of contents. That is not luck. It is what the previous six chapters were for."
},
{
"t": "p",
"x": "One task remains, and it is the quietest one. The record that carried you here now has to stay alive for the rest of the case. The disclosure may become part of the court file. The record remains yours."
}
],
"ch8": [
{
"t": "p",
"x": "The loud work is finished. The record was built, the evidence was gathered, and the disclosure has been filed and served. What remains is the quietest chapter in this book, and in some ways the one that pays the longest."
},
{
"t": "p",
"x": "Many parents think of disclosure as a project with an ending. It is better understood as a record with a beginning. Maintained, the record keeps answering questions for as long as the case lasts and after. Abandoned, it slowly becomes a snapshot of a household that no longer exists. The difference between those outcomes is a small, regular habit, and this chapter describes it."
},
{
"t": "h2",
"x": "The Case Is Not Over When the Form Is Filed"
},
{
"t": "p",
"x": "Filing a disclosure feels like crossing a finish line, and in one sense it is. But most family court cases continue past that moment, through temporary orders, mediation sessions, settlement discussions, and sometimes hearings. Every one of those events asks financial questions, and they are the same questions the record already answers."
},
{
"t": "p",
"x": "A mediation session runs on the same income and expense figures the disclosure reported. A settlement discussion weighs the same assets and debts. A hearing may examine any number the disclosure contains, and the document behind that number is either in its cell or it is a scramble. The record was never really built for the form. The form was one customer. The case is the client."
},
{
"t": "p",
"x": "There is a quieter benefit as well, and by now it will sound familiar. Consistency across events is credibility. When the figures a parent brings to mediation match the disclosure filed two months earlier, adjusted only where life actually changed, every later conversation starts from trust in the numbers."
},
{
"t": "h2",
"x": "The Maintenance Habit"
},
{
"t": "p",
"x": "Maintenance asks far less than building did. The structure exists, the lines are drawn, and the habit is a small one. When a new statement arrives, it goes to its cell, the same month-by-month filing Chapter 5 established. On a regular rhythm, once a month works for most parents, a short sweep keeps the record current."
},
{
"t": "box",
"title": "The Maintenance Sweep",
"items": [
"□  File the documents that arrived since the last sweep, each to its cell.",
"□  Update any balance that changed meaningfully: accounts, debts, retirement.",
"□  Note any change in income, expenses, or child-related costs, and its date.",
"□  Check outstanding requests: has the slow institution answered? Follow up in writing if not.",
"□  Scan the grid for new empty cells, and turn each into a retrieval task."
]
},
{
"t": "p",
"x": "The sweep earns its keep the first time anyone asks a financial question mid-case. The answer comes from the current record, not from a weekend of reconstruction. Maintenance is usually measured in minutes. Reconstruction is often measured in evenings. That arithmetic is the entire argument for the habit."
},
{
"t": "h2",
"x": "When Finances Change Mid-Case"
},
{
"t": "p",
"x": "Chapter 7 made a promise about amendments, and here it is kept. Some changes deserve more than the routine sweep, because they change the financial picture itself. Beginning or ending a job. A substantial change in income. Buying or selling property. Opening or closing accounts. A new recurring expense. A change in health insurance. A business beginning or ending. An inheritance or settlement. Most states expect a filed disclosure to be updated or amended when something of this size changes, and some build a second, final disclosure into the process."
},
{
"t": "p",
"x": "An updated disclosure is also not always your idea. When enough time has passed or circumstances appear to have changed, the other parent can request a new one, and courts routinely allow it. That request arrives on its schedule, not yours. A maintained record is what keeps a demanded disclosure from becoming a second reconstruction project."
},
{
"t": "p",
"x": "For a parent with a maintained record, an amendment is the smallest version of work this book has already taught. The change is already recorded, dated, and documented, because the sweep caught it when it happened. The amendment is the same translation Chapter 7 described, applied to a few lines instead of all of them. File and serve it the way the original was filed and served, and keep the copy with the rest of the court papers."
},
{
"t": "p",
"x": "What to avoid is the alternative. A disclosure that quietly drifts out of date becomes a liability, because the other side may discover the change before the court hears it from you. A prompt amendment is a routine event. A discovered discrepancy is not. The sequence never changes, whatever the change is. Documents first. Record second. Forms last."
},
{
"t": "h2",
"x": "Graduation"
},
{
"t": "p",
"x": "Cases end. When yours does, the record earns a different job instead of retirement."
},
{
"t": "p",
"x": "Keep it. Judgments and orders rest on the financial picture the record documents, and future questions tend to return to it. Support orders can be modified when circumstances change materially, and a modification request is, at its core, a comparison, the financial picture then against the financial picture now. The parent who kept the record holds both halves of that comparison. Tax records have their own retention rules, and several years of the core documents is a common practice; your state's requirements and a tax professional's guidance outrank any general rule."
},
{
"t": "p",
"x": "And notice what you now hold. Before this system, your financial information existed in many places. Your employer knew your income. Your bank knew your balances. Your insurance company knew your premiums. Your mortgage company knew your loan. Perhaps for the first time, you know all of it, in one place. That understanding now belongs to you."
},
{
"t": "p",
"x": "Then close the binder. The maintenance habit can relax to almost nothing once the case ends, a place where new judgments, orders, and year-end statements land, nothing more. What does not relax is what you now know. The skills this book taught, seeing a financial life whole, organizing by obligation across time, backing every number with a document, were never really about family court. The case required them. You keep them."
},
{
"t": "h2",
"x": "Closing Thought"
},
{
"t": "p",
"x": "This book began with a sentence that has been waiting eight chapters to return. The forms are not the work; they are the result of the work. You have now seen the whole shape of that sentence. Financial disclosure is not really about paperwork. It is the process of understanding your own financial life well enough to account for it and explain it honestly, and the record you built is what makes that honesty effortless."
},
{
"t": "p",
"x": "The Financial Disclosure System ends the way it hoped to, with a parent who no longer needs it. Whatever the outcome of your case, it will rest on facts you organized and evidence you preserved. The record is yours. The skills are yours. The understanding is yours. It was never the court's to keep."
}
]
};


const REFLECTIONS = {
  ch1: [
    "If you had to describe your complete financial picture today, including every source of income, every monthly expense, every account and debt, how much could you state with confidence, and how much would be a guess?",
    "How were financial records handled in your household? Whatever the arrangement was, which parts feel most familiar to you, and which feel most out of reach?",
    "What worries you most about the disclosure process right now?",
  ],
  ch2: [
    "When you think about financial disclosure, do you see it primarily as paperwork to complete, or as an opportunity to organize your financial picture?",
    "Of the six components, which feels most straightforward for your situation, and which feels most uncertain?",
    "If your disclosure were compared today against your actual records, where do you think the differences would appear?",
  ],
  ch3: [
    "Where is your case today? Not yet filed, recently filed, or already moving? Given that, how much calendar room do you realistically have?",
    "What part of your financial record could you begin organizing today, without waiting for additional instructions?",
    "When you think about beginning, what feels like the biggest obstacle? Knowing where to start, finding the documents, organizing them, or simply making time?",
  ],
  ch4: [
    "Which of your income sources would be hardest to state as a monthly figure, and what period of records would make an honest average possible?",
    "Thinking through your household expenses, which figures do you actually know, and which are guesses that a year of statements could replace?",
    "Is there an asset or debt you would hesitate to list? What would change if you recorded it now, on your own terms, rather than explaining it later?",
  ],
  ch5: [
    "Where do your financial documents live today? Count the places, including devices, accounts, drawers, and apps. What would it take to give them one home?",
    "If someone asked where one of your financial numbers came from, which numbers could you answer in under a minute, and which would require searching?",
    "What is the simplest version of this record you would actually maintain, and what could you set up this week?",
  ],
  ch6: [
    "Looking at your record's empty cells, which documents can you retrieve today from portals and files you already control?",
    "Which single document do you expect to be the slowest to obtain, and what written request could you send this week to start the clock?",
    "Is any part of your income undocumented today? What trail, such as deposits, transfers, or invoices, could reconstruct it fairly?",
  ],
  ch7: [
    "Which of the five packages did your state hand you, and what did the form's own instructions confirm or correct about the placeholder ranges from your timeline?",
    "Which fields on your state's form will require estimates, and how will you identify them as estimates?",
    "If someone asked you to update this disclosure six months from now, what parts of your financial record would already be ready?",
  ],
  ch8: [
    "What will your maintenance rhythm realistically be, and where in your week or month does it fit?",
    "What is the most likely financial change in your near future, and what would updating the record and the disclosure look like when it happens?",
    "Looking back at where you started, what part of your financial life do you understand now that you did not understand then?",
  ],
};

// ---------------- Workspace helpers ----------------
const CYCLE = { undefined: "have", "": "have", have: "req", req: "na", na: "" };

function lineCols(line) {
  if (line.cadence) return periodCols(line);
  const w = line.win >= 999 ? 12 : Math.min(line.win, 12);
  const cols = [];
  for (let i = COLS - w; i < COLS; i++) cols.push(monthLabel(i));
  return cols;
}
function winText(line) {
  if (line.cadence) return CADENCE_LABELS[line.cadence] + " — " + (line.win >= 999 ? 3 : line.win) + " month window";
  if (line.win >= 999) return "ongoing — tracking latest 12 months";
  if (line.win > 12) return (line.win / 12) + " years — tracking latest 12 months";
  return "window: " + line.win + (line.win === 1 ? " month" : " months");
}
function colState(line, col) { return line.cells[col.key] || "miss"; }
function cellGlyph(st) { return st === "have" ? "✓" : st === "req" ? "◦" : st === "na" ? "–" : ""; }
function lineStats(line) {
  let acc = 0; const miss = []; const req = [];
  lineCols(line).forEach(col => {
    const st = colState(line, col);
    if (st === "have" || st === "na") acc++;
    else if (st === "req") req.push(col.full);
    else miss.push(col.full);
  });
  return { acc, total: lineCols(line).length, miss, req };
}
function rangeText(items) {
  if (items.length === 1) return items[0];
  return items.length <= 3 ? items.join(", ") : items[0] + " through " + items[items.length - 1];
}
function wsTotals(ws) {
  let acc = 0, total = 0, missN = 0, reqN = 0;
  ws.components.forEach(c => c.lines.forEach(l => {
    const s = lineStats(l); acc += s.acc; total += s.total; missN += s.miss.length; reqN += s.req.length;
  }));
  return { acc, total, missN, reqN, pct: total ? Math.round(100 * acc / total) : 0 };
}

// ---------------- App ----------------
export default function FDS() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isActive, setIsActive] = useState(null);
  const [session, setSession] = useState(() => initSession());
  const [activeSection, setActiveSection] = useState(session.last_active_section || "welcome");
  const [activeTab, setActiveTab] = useState("learn");
  const [saveIndicator, setSaveIndicator] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [wsBarOpen, setWsBarOpen] = useState(false);
  const [addModal, setAddModal] = useState(null);
  const [howOpen, setHowOpen] = useState({});
  const saveTimer = useRef(null);

  const persist = useCallback(async (s) => {
    if (!supabase || !s.user_id) return;
    const row = {
      session_id: s.session_id, user_id: s.user_id, product_id: s.product_id,
      product_version: s.product_version, schema_version: s.schema_version,
      last_active_section: s.last_active_section, last_active_tab: s.last_active_tab,
      completion_status: s.completion_status, completed_at: s.completed_at,
      quick_notes: s.quick_notes, answers: s.answers,
      updated_at: new Date().toISOString(),
    };
    try { await supabase.from("sessions").upsert(row, { onConflict: "session_id" }); } catch (e) {}
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data?.session?.user || null); setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthUser(s?.user || null));
    return () => { sub?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!supabase || !authUser) { setIsActive(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("fds_active").eq("id", authUser.id).single();
        if (!cancelled) setIsActive(data ? !!data.fds_active : false);
      } catch (e) { if (!cancelled) setIsActive(false); }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  useEffect(() => {
    if (!supabase || !authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("sessions").select("*")
          .eq("user_id", authUser.id).eq("product_id", "fds")
          .order("updated_at", { ascending: false }).limit(1);
        if (cancelled) return;
        if (data && data.length > 0) {
          const row = data[0];
          const loaded = {
            ...blankSession(authUser.id), ...row,
            answers: row.answers && row.answers.workspace ? row.answers : { ...(row.answers || {}), workspace: defaultWorkspace() },
          };
          setSession(loaded);
          setActiveSection(loaded.last_active_section || "welcome");
          setActiveTab(loaded.last_active_tab || "learn");
        } else {
          const fresh = blankSession(authUser.id);
          setSession(fresh);
          await persist(fresh);
        }
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [authUser, persist]);

  const update = useCallback((fn) => {
    setSession(prev => {
      const next = fn(structuredClone(prev));
      next.updated_at = new Date().toISOString();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
      setSaveIndicator("Saved " + new Date().toLocaleTimeString());
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 1200);
      return next;
    });
  }, [persist]);

  const go = (sectionId, tab) => {
    const t = tab || SECTION_TABS[sectionId][0];
    setActiveSection(sectionId); setActiveTab(t);
    update(s => { s.last_active_section = sectionId; s.last_active_tab = t; return s; });
    window.scrollTo(0, 0);
  };

  const ws = session.answers.workspace || defaultWorkspace();
  useEffect(() => {
    if (session.answers.workspace && !session.answers.workspace.numbers) {
      update(s2 => { s2.answers.workspace.numbers = defaultNumbers(); return s2; });
    }
  }, [session.session_id]); // eslint-disable-line
  const totals = wsTotals(ws);
  const inWorkspace = ["timeline","record","missing"].includes(activeSection);
  const sec = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];
  const tabs = SECTION_TABS[activeSection] || ["learn"];

  const clickCol = (ci, li, key) => update(s => {
    const line = s.answers.workspace.components[ci].lines[li];
    const next = CYCLE[line.cells[key]];
    if (next) line.cells[key] = next; else delete line.cells[key];
    return s;
  });

  const removeLine = (ci, li) => {
    const name = ws.components[ci].lines[li].name;
    if (window.confirm('Remove "' + name + '" from your record? Its cells go with it.')) {
      update(s => { s.answers.workspace.components[ci].lines.splice(li, 1); return s; });
    }
  };
  const renameLine = (ci, li) => {
    const current = ws.components[ci].lines[li].name;
    const name = window.prompt("Name this line so you can tell accounts apart (e.g., AMEX ...1005, 401k — Maersk):", current);
    if (name && name.trim()) update(s => { s.answers.workspace.components[ci].lines[li].name = name.trim(); return s; });
  };
  const setCadence = (ci, li, cad) => update(s => {
    const line = s.answers.workspace.components[ci].lines[li];
    line.cadence = cad; line.askCadence = false;
    return s;
  });

  // ---------------- styles ----------------
  const S = {
    page: { background: CREAM, minHeight: "100vh", color: NAVY, fontFamily: "'Inter', sans-serif" },
    hdr: { background: NAVY, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    body: { display: "flex", alignItems: "stretch" },
    rail: { width: railCollapsed ? 0 : 250, overflow: "hidden", transition: "width .2s", background: "#fff", borderLeft: "1px solid " + RULE, flexShrink: 0 },
    railInner: { padding: "18px 0 40px", width: 250 },
    layerLabel: { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", color: "#8A93A6", padding: "16px 20px 6px" },
    navItem: (active) => ({ display: "block", width: "100%", textAlign: "left", padding: "9px 20px", fontSize: 13, border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", background: active ? AMBER_LIGHT : "none", color: active ? NAVY : SLATE, fontWeight: active ? 600 : 400, borderRight: active ? "3px solid " + AMBER : "3px solid transparent" }),
    main: { flex: 1, minWidth: 0, maxWidth: 860, margin: "0 auto", padding: "18px 28px 90px" },
    tabsRow: { display: "flex", gap: 4, borderBottom: "1px solid " + RULE, marginBottom: 22 },
    tabBtn: (active) => ({ padding: "10px 18px", fontSize: 13, cursor: "pointer", border: "none", background: "none", fontFamily: "'Inter', sans-serif", borderBottom: active ? "2.5px solid " + AMBER : "2.5px solid transparent", color: active ? NAVY : SLATE, fontWeight: active ? 600 : 400 }),
    doctrine: { borderLeft: "3px solid " + AMBER, paddingLeft: 20, margin: "4px 0 24px" },
    doctrineLabel: { fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: AMBER, marginBottom: 6 },
    doctrineText: { fontFamily: "'Lora', serif", fontSize: 15.5, lineHeight: 1.7, fontStyle: "italic" },
    h2: { fontSize: 15, fontWeight: 600, margin: "26px 0 10px" },
    p: { fontSize: 13.5, color: SLATE, lineHeight: 1.8, margin: "0 0 12px" },
    qLabel: { fontSize: 13, fontWeight: 600, lineHeight: 1.6, margin: "22px 0 8px", color: NAVY },
    ta: { width: "100%", minHeight: 90, padding: 12, border: "1px solid " + RULE, borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, background: "#fff", color: NAVY, lineHeight: 1.7, resize: "vertical" },
    btnNavy: { padding: "9px 18px", background: NAVY, color: "#fff", border: "none", borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter', sans-serif" },
    btnGold: { padding: "7px 14px", background: "rgba(201,151,74,0.12)", border: "1px solid rgba(201,151,74,0.4)", borderRadius: 6, color: AMBER, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter', sans-serif" },
    tinyBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#8A93A6", padding: "0 4px", fontFamily: "'Inter', sans-serif" },
  };

  const Doctrine = ({ label, quote }) => (
    <div style={S.doctrine}>
      <div style={S.doctrineLabel}>{label}</div>
      <div style={S.doctrineText}>{quote}</div>
    </div>
  );

const MiniCell = ({ kind, glyph }) => {
    const st = {
      have: { background: NAVY, borderColor: NAVY, color: "#fff" },
      req: { background: AMBER_LIGHT, borderColor: AMBER, color: AMBER, fontWeight: 700 },
      na: { background: "#EFEAE2", borderColor: "#EFEAE2", color: "#8A93A6" },
      miss: { background: "#fff", borderColor: MISS_RED, color: MISS_RED },
    }[kind];
    return <span style={{ display: "inline-block", width: 26, height: 22, borderRadius: 5, border: "1px solid", fontSize: 11, lineHeight: "20px", textAlign: "center", verticalAlign: "middle", margin: "0 4px", ...st }}>{glyph}</span>;
  };

  // Compact, always-at-hand how-to. Repeats on every workspace view so nobody scrolls to remember.
  const HowTo = ({ id, lines }) => (
    <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 8, marginBottom: 16 }}>
      <button style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: SLATE }}
        onClick={() => setHowOpen(h => ({ ...h, [id]: !h[id] }))}>
        {howOpen[id] ? "▾" : "▸"} How This Works
      </button>
      {howOpen[id] && (
        <div style={{ padding: "0 14px 12px" }}>
          {lines.map((l, i) => <div key={i} style={{ fontSize: 12, color: SLATE, lineHeight: 1.7 }}>· {l}</div>)}
        </div>
      )}
    </div>
  );

  // The workspace bar: present on every page, quiet until asked.
  const WorkspaceBar = () => (
    <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
      <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
        onClick={() => setWsBarOpen(!wsBarOpen)}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", transform: wsBarOpen ? "none" : "rotate(-90deg)", transition: "transform .2s", color: "#8A93A6", fontSize: 10 }}>▼</span>
          Your Workspace
          {totals.missN > 0 && <span style={{ background: AMBER, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 9, padding: "1px 7px" }}>{totals.missN}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 90, height: 6, background: "#EFEAE2", borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
            <span style={{ display: "block", width: totals.pct + "%", height: "100%", background: AMBER }} />
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: AMBER }}>{totals.pct}%</span>
        </span>
      </button>
      {wsBarOpen && (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", flexWrap: "wrap" }}>
          {[["timeline", "Timeline"], ["numbers", "My Numbers"], ["record", "My Record"], ["missing", "What's Missing"], ["summary", "My Summary"]].map(([id, label]) => (
            <button key={id} style={{ ...S.btnGold, ...(activeSection === id ? { background: AMBER, color: "#fff" } : {}) }} onClick={() => go(id)}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );

  // ---------------- workspace views ----------------
  const renderTimeline = () => (
    <div>
      <HowTo id="tl" lines={[
        "Your state has requirements for how far back you must document. The dropdown menus show common ranges to choose from once you have confirmed what your state calls for.",
        "Your state's requirements live in the form's instructions, a court rule, or with the clerk. Chapter 7 shows where to look.",
        "If your state has no income tax, choose My State Has No Income Tax on that line and move on. Nine states have none.",
      ]} />
      <Doctrine label="DEFINE YOUR TIMELINE FIRST" quote="The worksheet turns disclosure from a mood into a checklist." />
      {ws.timeline.map((t, i) => (
        <div key={t.doc} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid " + RULE, borderRadius: 8, padding: "12px 16px", marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 150 }}>{t.doc}</div>
          <span style={{ fontSize: 11, color: "#8A93A6", width: 200 }}>{t.hint}</span>
          <select value={t.win} style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, padding: "6px 8px", border: "1px solid " + RULE, borderRadius: 6, background: "#FBFAF7" }}
            onChange={e => update(s => { s.answers.workspace.timeline[i].win = e.target.value; return s; })}>
            <option value="">Not confirmed yet</option>
            {t.opts.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div style={{ marginTop: 18 }}>
        <button style={S.btnNavy} onClick={() => go("record")}>Continue to My Record →</button>
      </div>
    </div>
  );

  const Cell = ({ st, col, onClick }) => {
    const styles = {
      have: { background: NAVY, borderColor: NAVY, color: "#fff" },
      req: { background: AMBER_LIGHT, borderColor: AMBER, color: AMBER, fontWeight: 700 },
      na: { background: "#EFEAE2", borderColor: "#EFEAE2", color: "#8A93A6" },
      miss: { background: "#fff", borderColor: MISS_RED, color: MISS_RED },
    }[st];
    return (
      <div title={col.full} onClick={onClick}
        style={{ width: 38, height: 30, borderRadius: 6, border: "1px solid", fontSize: 12, lineHeight: "28px", userSelect: "none", textAlign: "center", cursor: "pointer", ...styles }}>
        {cellGlyph(st)}
      </div>
    );
  };

  const renderRecord = () => (
    <div>
      <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 8, marginBottom: 16 }}>
        <button style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: SLATE }}
          onClick={() => setHowOpen(h => ({ ...h, rec: !h.rec }))}>
          {howOpen.rec ? "▾" : "▸"} How This Works
        </button>
        {howOpen.rec && (
          <div style={{ padding: "0 14px 12px", fontSize: 12, color: SLATE, lineHeight: 2 }}>
            <div>· One line per obligation or account. Click a cell to cycle through its status:</div>
            <div style={{ paddingLeft: 12 }}>
              <MiniCell kind="have" glyph="✓" /> In The Record → <MiniCell kind="req" glyph="◦" /> Requested → <MiniCell kind="na" glyph="–" /> Not Applicable → <MiniCell kind="miss" glyph="" /> Missing (a fourth click clears the cell back to Missing)
            </div>
            <div>· Rename lines with the ✎ icon so accounts become distinct (AMEX ...1005, 401k — Second Job).</div>
            <div>· Remove lines that do not fit your financial picture with the × icon. An absent line, considered and removed, is a completed answer.</div>
            <div>· Click a component heading to collapse it. A completed component earns a green ✓ Complete badge.</div>
          </div>
        )}
      </div>
      <Doctrine label="WHY THIS MATTERS" quote={QUOTES[1]} />
      {ws.components.map((comp, ci) => {
        let acc = 0, total = 0;
        comp.lines.forEach(l => { const st = lineStats(l); acc += st.acc; total += st.total; });
        const pct = total ? Math.round(100 * acc / total) : 0;
        const closed = !!ws.collapsed[ci];
        return (
          <div key={comp.name} style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px", padding: "13px 18px", cursor: "pointer" }}
              onClick={() => update(s => { s.answers.workspace.collapsed[ci] = !s.answers.workspace.collapsed[ci]; return s; })}>
              <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "inline-block", transform: closed ? "rotate(-90deg)" : "none", transition: "transform .2s", color: "#8A93A6", fontSize: 11 }}>▼</span>
                {comp.name}
                {pct === 100 && <span style={{ background: DONE_GREEN, color: "#fff", fontSize: 10, fontWeight: 600, borderRadius: 9, padding: "2px 9px" }}>✓ Complete</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: SLATE, whiteSpace: "nowrap" }}>
                <div style={{ width: 64, height: 6, background: "#EFEAE2", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: AMBER, borderRadius: 3 }} />
                </div>
                <span style={{ fontWeight: 600, color: AMBER }}>{pct}%</span>
              </div>
            </div>
            {!closed && (
              <div style={{ borderTop: "1px solid #F0EBE3", padding: "10px 18px 14px" }}>
                {COMPONENT_DESCS[comp.name] && <div style={{ fontSize: 11.5, color: "#8A93A6", marginBottom: 10 }}>{COMPONENT_DESCS[comp.name]}</div>}
                {comp.name === "Court Papers" ? comp.lines.map((line, li) => {
                  const key = monthLabel(COLS - 1).key;
                  const onFile = line.cells[key] === "have";
                  return (
                    <div key={line.id || li} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div onClick={() => clickCol(ci, li, key)} title={onFile ? "On file" : "Not yet on file"}
                        style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid", cursor: "pointer", textAlign: "center", lineHeight: "22px", fontSize: 13,
                          background: onFile ? NAVY : "#fff", borderColor: onFile ? NAVY : RULE, color: onFile ? "#fff" : "transparent" }}>✓</div>
                      <span style={{ flex: 1, fontSize: 12.5 }}>{line.name}</span>
                      <span style={{ fontSize: 11, color: onFile ? DONE_GREEN : "#8A93A6" }}>{onFile ? "On File" : "Not Yet"}</span>
                      <button style={S.tinyBtn} title="Rename" onClick={() => renameLine(ci, li)}>✎</button>
                      <button style={S.tinyBtn} title="Remove" onClick={() => removeLine(ci, li)}>×</button>
                    </div>
                  );
                }) : comp.lines.map((line, li) => {
                  const cols = lineCols(line);
                  return (
                    <div key={line.id || li} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{line.name}</span>
                        <button style={S.tinyBtn} title="Rename this line" onClick={() => renameLine(ci, li)}>✎</button>
                        <button style={S.tinyBtn} title="Remove this line" onClick={() => removeLine(ci, li)}>×</button>
                        <span style={{ fontSize: 10, color: "#8A93A6", marginLeft: 6 }}>{winText(line)}</span>
                      </div>
                      {line.askCadence && !line.cadence ? (
                        <div style={{ background: AMBER_LIGHT, border: "1px solid rgba(201,151,74,0.35)", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>How are you paid? The cells will match your paychecks.</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {Object.entries(CADENCE_LABELS).map(([cad, label]) => (
                              <button key={cad} style={S.btnGold} onClick={() => setCadence(ci, li, cad === "monthly" ? null : cad)}>{label}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {cols.map(col => (
                            <div key={col.key} style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#8A93A6", marginBottom: 2 }}>{col.short}</div>
                              <Cell st={colState(line, col)} col={col} onClick={() => clickCol(ci, li, col.key)} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button style={{ fontSize: 12, color: AMBER, background: "none", border: "none", cursor: "pointer", padding: "6px 0 2px", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                  onClick={(e) => { e.stopPropagation(); setAddModal(ci); }}>+ Add A Line</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );


  const setNumItem = (gid, idx, key, val) => update(s2 => {
    s2.answers.workspace.numbers[gid][idx][key] = val; return s2;
  });
  const addNumItem = (gid) => {
    const label = window.prompt("Name this line item (e.g., AMEX ...1005, Second Job — DoorDash):");
    if (label && label.trim()) update(s2 => {
      s2.answers.workspace.numbers[gid].push({ id: generateId(), label: label.trim(), a: "", b: "" });
      return s2;
    });
  };
  const renameNumItem = (gid, idx) => {
    const cur = ws.numbers[gid][idx].label;
    const label = window.prompt("Rename this line item:", cur);
    if (label && label.trim()) setNumItem(gid, idx, "label", label.trim());
  };
  const removeNumItem = (gid, idx) => {
    if (window.confirm('Remove "' + ws.numbers[gid][idx].label + '"? A removed line, considered and removed, is a completed answer.')) {
      update(s2 => { s2.answers.workspace.numbers[gid].splice(idx, 1); return s2; });
    }
  };

  const renderNumbers = () => {
    const N = ws.numbers || defaultNumbers();
    const totIncome = groupSum(N.income, "a");
    const totDeduct = groupSum(N.deductions, "a");
    const totExpense = EXPENSE_GROUPS.reduce((t, g) => t + groupSum(N[g], "a"), 0) + groupSum(N.debts, "b");
    const netIncome = totIncome - totDeduct;
    const surplus = netIncome - totExpense;
    const totAssets = groupSum(N.assets, "a");
    const totDebtBal = groupSum(N.debts, "a");
    const moneyInput = (gid, idx, key, val) => (
      <input value={val} inputMode="decimal" placeholder="$"
        onChange={e => setNumItem(gid, idx, key, e.target.value)}
        style={{ width: 92, padding: "6px 8px", border: "1px solid " + RULE, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 12.5, background: "#FBFAF7", textAlign: "right" }} />
    );
    return (
      <div>
        <HowTo id="num" lines={[
          "These line items mirror what state affidavits ask for, so transferring to your state's form is a copy, not a scramble.",
          "Enter monthly figures. Convert irregular amounts to monthly averages, the way Chapter 4 teaches.",
          "Every line you do not use is fine empty. Rename with the pencil, remove with the ×, add what is missing.",
          "Estimates are welcome. Note them in the name (e.g., Groceries — est.) and refine as statements arrive.",
        ]} />
        <Doctrine label="UNDERSTANDING COMES BEFORE CALCULATION" quote="Disclosure simply records the facts as they stand." />
        <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, padding: "16px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 26px", fontSize: 12.5 }}>
            <span>Gross Income <strong style={{ color: NAVY }}>{fmtMoney(totIncome)}</strong>/mo</span>
            <span>Deductions <strong style={{ color: NAVY }}>{fmtMoney(totDeduct)}</strong>/mo</span>
            <span>Net Income <strong style={{ color: NAVY }}>{fmtMoney(netIncome)}</strong>/mo</span>
            <span>Expenses <strong style={{ color: NAVY }}>{fmtMoney(totExpense)}</strong>/mo</span>
            <span>{surplus >= 0 ? "Surplus" : "Deficit"} <strong style={{ color: surplus >= 0 ? DONE_GREEN : MISS_RED }}>{fmtMoney(Math.abs(surplus))}</strong>/mo</span>
            <span>Assets <strong style={{ color: NAVY }}>{fmtMoney(totAssets)}</strong></span>
            <span>Debts <strong style={{ color: NAVY }}>{fmtMoney(totDebtBal)}</strong></span>
          </div>
        </div>
        {NUM_GROUPS.map(g => {
          const items = N[g.id] || [];
          const closed = !!ws.collapsed["n_" + g.id];
          const gTotal = g.kind === "m2" ? groupSum(items, "b") : groupSum(items, "a");
          return (
            <div key={g.id} style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px", padding: "13px 18px", cursor: "pointer" }}
                onClick={() => update(s2 => { s2.answers.workspace.collapsed["n_" + g.id] = !s2.answers.workspace.collapsed["n_" + g.id]; return s2; })}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", transform: closed ? "rotate(-90deg)" : "none", transition: "transform .2s", color: "#8A93A6", fontSize: 11 }}>▼</span>
                  {g.name}
                </div>
                <div style={{ fontSize: 12, color: SLATE }}>{g.kind === "m2" ? "Payments " : "Total "}<strong style={{ color: AMBER }}>{fmtMoney(gTotal)}</strong></div>
              </div>
              {!closed && (
                <div style={{ borderTop: "1px solid #F0EBE3", padding: "8px 18px 14px" }}>
                  {g.kind === "m2" && (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, fontSize: 10, color: "#8A93A6", marginBottom: 4 }}>
                      <span style={{ width: 92, textAlign: "right" }}>{g.colA}</span>
                      <span style={{ width: 92, textAlign: "right" }}>{g.colB}</span>
                      <span style={{ width: 40 }} />
                    </div>
                  )}
                  {items.map((it, idx) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ flex: 1, minWidth: 160, fontSize: 12.5 }}>{it.label}</span>
                      {moneyInput(g.id, idx, "a", it.a)}
                      {g.kind === "m2" && moneyInput(g.id, idx, "b", it.b)}
                      <span style={{ whiteSpace: "nowrap" }}>
                        <button style={S.tinyBtn} title="Rename" onClick={() => renameNumItem(g.id, idx)}>✎</button>
                        <button style={S.tinyBtn} title="Remove" onClick={() => removeNumItem(g.id, idx)}>×</button>
                      </span>
                    </div>
                  ))}
                  <button style={{ fontSize: 12, color: AMBER, background: "none", border: "none", cursor: "pointer", padding: "6px 0 2px", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                    onClick={() => addNumItem(g.id)}>+ Add An Item</button>
                </div>
              )}
            </div>
          );
        })}
        <p style={{ fontSize: 10.5, color: "#8A93A6", marginTop: 20, textAlign: "center" }}>
          Line items consolidated from financial affidavits across the fifty states. Your state's form governs.
        </p>
      </div>
    );
  };


  const renderSummary = () => {
    const N = ws.numbers || defaultNumbers();
    const totIncome = groupSum(N.income, "a");
    const totDeduct = groupSum(N.deductions, "a");
    const netIncome = totIncome - totDeduct;
    const livingGroups = ["housing","utilities","food","transport","health","personal","supportpaid"];
    const livingRows = livingGroups.map(g => [ (NUM_GROUPS.find(x => x.id === g) || {}).name, groupSum(N[g], "a") ]).filter(r => r[1] > 0);
    const totLiving = livingGroups.reduce((t, g) => t + groupSum(N[g], "a"), 0) + groupSum(N.debts, "b");
    const debtPay = groupSum(N.debts, "b");
    const totChild = groupSum(N.children, "a");
    const totAssets = groupSum(N.assets, "a");
    const totDebtBal = groupSum(N.debts, "a");
    const netWorth = totAssets - totDebtBal;
    const line = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" };
    const head = { fontSize: 13, fontWeight: 700, color: NAVY, margin: "18px 0 6px", borderBottom: "1px solid " + RULE, paddingBottom: 4 };
    const docsRows = [];
    ws.components.forEach(comp => comp.lines.forEach(l => {
      const st = lineStats(l);
      docsRows.push({ name: l.name, comp: comp.name, done: st.miss.length === 0 && st.req.length === 0, part: st.acc, total: st.total });
    }));
    return (
      <div>
        <HowTo id="sum" lines={[
          "This summary assembles itself from My Numbers and My Record as you work. Nothing here is entered directly.",
          "Use Print / Save As PDF to produce a copy you can share with an attorney, a mediator, or anyone who needs your financial picture.",
          "This is your working summary, not a court form. Your state's own paperwork is completed from it, as Chapter 7 describes.",
        ]} />
        <Doctrine label="THE PICTURE, ASSEMBLED" quote="The forms are temporary. The record is the asset." />
        <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, padding: "22px 26px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Financial Disclosure Summary</div>
            <div style={{ fontSize: 10.5, color: "#8A93A6" }}>Prepared with the Polaris Financial Disclosure System · {new Date().toLocaleDateString()}</div>
          </div>
          <div style={head}>Income</div>
          <div style={line}><span>Monthly Gross Income</span><strong>{fmtMoney(totIncome)}</strong></div>
          <div style={line}><span>Monthly Deductions</span><strong>{fmtMoney(totDeduct)}</strong></div>
          <div style={line}><span>Monthly Net Income</span><strong>{fmtMoney(netIncome)}</strong></div>
          <div style={head}>Living Expenses</div>
          {livingRows.map(([n, v], i) => <div key={i} style={line}><span>{n}</span><span>{fmtMoney(v)}</span></div>)}
          {debtPay > 0 && <div style={line}><span>Payments To Creditors</span><span>{fmtMoney(debtPay)}</span></div>}
          <div style={{ ...line, fontWeight: 700 }}><span>Total Monthly Living Expenses</span><span>{fmtMoney(totLiving)}</span></div>
          <div style={head}>Children's Expenses</div>
          <div style={{ ...line, fontWeight: 700 }}><span>Total Monthly Children's Expenses</span><span>{fmtMoney(totChild)}</span></div>
          <div style={head}>Assets And Liabilities</div>
          <div style={line}><span>Total Assets</span><strong>{fmtMoney(totAssets)}</strong></div>
          <div style={line}><span>Total Liabilities</span><strong>{fmtMoney(totDebtBal)}</strong></div>
          <div style={{ ...line, fontWeight: 700 }}><span>Net Worth (Assets − Liabilities)</span><span style={{ color: netWorth >= 0 ? DONE_GREEN : MISS_RED }}>{fmtMoney(netWorth)}</span></div>
          <div style={head}>Supporting Documents</div>
          {docsRows.map((d, i) => (
            <div key={i} style={{ ...line, fontSize: 12.5 }}>
              <span>{d.done ? "✓ " : "◦ "}{d.name} <span style={{ color: "#8A93A6" }}>· {d.comp}</span></span>
              <span style={{ color: d.done ? DONE_GREEN : AMBER }}>{d.done ? "Complete" : d.part + " of " + d.total}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button style={S.btnNavy} onClick={() => window.print()}>Print / Save As PDF</button>
        </div>
      </div>
    );
  };


  const renderReflections = () => {
    const allQ = [];
    SECTIONS.filter(x => x.id.startsWith("ch")).forEach(ch => {
      (REFLECTIONS[ch.id] || []).forEach((q, i) => {
        allQ.push({ ch: ch.label, q, a: session.answers[ch.id + "_q" + (i + 1)] || "" });
      });
    });
    const answered = allQ.filter(x => x.a.trim()).length;
    let lastCh = null;
    return (
      <div>
        <HowTo id="refl" lines={[
          "Every reflection you write in the chapters gathers here, in one place.",
          "This page is yours alone. It is not part of the Financial Disclosure Summary and is never shared unless you choose to share it.",
          "Print / Save As PDF if you want a copy, or a way to show someone where you started.",
        ]} />
        <Doctrine label="WHERE YOU STARTED" quote="There are no right answers. The goal is to notice where you are starting from." />
        <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, padding: "22px 26px" }}>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>My Reflections</div>
            <div style={{ fontSize: 10.5, color: "#8A93A6" }}>{answered} of {allQ.length} answered · {new Date().toLocaleDateString()}</div>
          </div>
          {allQ.map((x, i) => {
            const showCh = x.ch !== lastCh; lastCh = x.ch;
            return (
              <div key={i}>
                {showCh && <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: "20px 0 4px", borderBottom: "1px solid " + RULE, paddingBottom: 4 }}>{x.ch}</div>}
                <div style={{ fontSize: 12, color: "#8A93A6", margin: "10px 0 4px", lineHeight: 1.6 }}>{x.q}</div>
                <div style={{ fontSize: 13, color: x.a.trim() ? NAVY : "#B9C0CC", lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: x.a.trim() ? "'Lora', serif" : "'Inter', sans-serif" }}>
                  {x.a.trim() || "Not answered yet."}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button style={S.btnNavy} onClick={() => window.print()}>Print / Save As PDF</button>
        </div>
      </div>
    );
  };

  const renderMissing = () => {
    const items = [];
    ws.components.forEach(comp => comp.lines.forEach(line => {
      const st = lineStats(line);
      if (st.miss.length) items.push({ type: "miss", line: line.name, comp: comp.name, text: "Missing " + rangeText(st.miss) + " — " + st.miss.length + " of " + st.total + "." });
      if (st.req.length) items.push({ type: "req", line: line.name, comp: comp.name, text: "Requested, awaiting arrival: " + rangeText(st.req) + ". Follow up in writing if it has been a while." });
    }));
    return (
      <div>
        <HowTo id="miss" lines={[
          "This list is generated from your record. Fill cells there and items disappear here.",
          "Missing means no document and no request yet. Requested means the ask is out and noted.",
        ]} />
        <Doctrine label="COMPLETENESS YOU CAN SEE" quote="Missing paperwork usually creates delay. It rarely creates impossibility." />
        <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, padding: "16px 20px", marginBottom: 16, fontSize: 13 }}>
          <strong style={{ color: AMBER }}>{totals.acc} of {totals.total}</strong> tracked periods are accounted for.{" "}
          <strong style={{ color: AMBER }}>{totals.missN}</strong> missing{totals.reqN ? <>, <strong style={{ color: AMBER }}>{totals.reqN}</strong> requested and on the way.</> : "."}{" "}
          Every item below is a specific, finite errand.
        </div>
        {items.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid " + RULE, borderLeft: "3px solid " + DONE_GREEN, borderRadius: 8, padding: 18, fontSize: 13.5 }}>
            <strong>Every window is accounted for.</strong> Every line of the record runs its full window with no empty cells. Gathering, for now, is done.
          </div>
        ) : items.map((it, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid " + RULE, borderLeft: "3px solid " + (it.type === "req" ? AMBER : MISS_RED), borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{it.line} <span style={{ color: "#8A93A6", fontWeight: 400 }}>· {it.comp}</span></div>
            <div style={{ fontSize: 12.5, color: SLATE }}>{it.text}</div>
          </div>
        ))}
      </div>
    );
  };

  // ---------------- learn / reflect ----------------
  const renderLearn = () => {
    if (activeSection === "welcome") {
      return (
        <div>
          <p style={S.p}>If you have been asked to complete a financial disclosure, financial affidavit, or financial declaration as part of your family court case, you probably have questions. What information do you need? Where do you find it? How detailed should your answers be? How do you organize everything without feeling overwhelmed?</p>
          <p style={S.p}>The Polaris Financial Disclosure System was created to answer those questions and guide you through the process one step at a time.</p>
          <p style={S.p}>Although every state uses different forms and terminology, courts across the country are ultimately trying to understand the same thing: your complete financial picture. We built this system by examining financial disclosure requirements from all fifty states and identifying the common information courts consistently require. Whatever your state calls its paperwork, the underlying purpose is remarkably similar.</p>
          <p style={S.p}>The chapters that follow are organized in a logical sequence that helps you understand the process, gather the necessary information, and build your financial picture one piece at a time. Rather than approaching your disclosure as a stack of forms to complete, you will work through each section methodically so that, by the end, you have everything needed to prepare an honest, comprehensive, and defensible financial disclosure.</p>
          <div style={{ background: "#fff", border: "1px solid " + RULE, borderRadius: 10, margin: "18px 0", overflow: "hidden" }}>
            <button style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: NAVY }}
              onClick={() => setHowOpen(h => ({ ...h, included: !h.included }))}>
              {howOpen.included ? "▾" : "▸"} What's Included In This System
            </button>
            {howOpen.included && (
              <div style={{ padding: "0 16px 14px" }}>
                {[
                  "Eight teaching chapters in three parts, moving from understanding to building to completing.",
                  "A short reflection at the end of every chapter. Your answers save automatically.",
                  "A Financial Disclosure Summary, assembled from everything you enter, ready to share with whoever needs to see it.",
                  "Your Workspace: a timeline of what your state requires, a month-by-month record of your documents, and a what's-missing list generated from it.",
                  "Progress saved on this device, and to your account when you are signed in.",
                ].map((t, i) => <div key={i} style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.8 }}>· {t}</div>)}
              </div>
            )}
          </div>
          <p style={S.p}>By the last chapter, the reason for this system's order will feel obvious: documents first, record second, forms last. For now, the only step is the first one.</p>
          <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={S.btnNavy} onClick={() => go("ch1")}>Begin With Chapter 1 →</button>
            <button style={S.btnGold} onClick={() => { setWsBarOpen(true); go("timeline"); }}>Take A Look At Your Workspace</button>
          </div>
        </div>
      );
    }
    const chap = CHAPTERS_FULL[activeSection];
    if (!chap) return null;
    return (
      <div>
        <Doctrine label={sec.label.toUpperCase()} quote={CHAPTER_STUBS[activeSection] || QUOTES[0]} />
        {chap.map((b, i) => {
          if (b.t === "h2") return <h3 key={i} style={S.h2}>{b.x}</h3>;
          if (b.t === "lb") return <p key={i} style={S.p}><strong style={{ color: NAVY }}>{b.l}</strong>{b.x}</p>;
          if (b.t === "box") return (
            <div key={i} style={{ background: "#fff", border: "1px solid " + RULE, borderLeft: "3px solid " + AMBER, borderRadius: 10, padding: "14px 18px", margin: "18px 0" }}>
              {b.title ? <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{b.title}</div> : null}
              {b.items.map((it, j) => <div key={j} style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.8, marginBottom: 6 }}>{it}</div>)}
            </div>
          );
          if (b.t === "table") return (
            <div key={i} style={{ overflowX: "auto", margin: "18px 0" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} style={{ border: "1px solid " + RULE, padding: "6px 10px", background: ri === 0 ? "#DEE9F2" : "#fff", fontWeight: ri === 0 ? 600 : 400, color: NAVY }}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          return <p key={i} style={S.p}>{b.x}</p>;
        })}
        <div style={{ marginTop: 22 }}>
          <button style={S.btnGold} onClick={() => setActiveTab("reflect")}>Continue To Reflect →</button>
        </div>
      </div>
    );
  };

  const renderReflect = () => {
    const qs = REFLECTIONS[activeSection] || [];
    return (
      <div>
        <Doctrine label={sec.label.toUpperCase() + " — REFLECTION"} quote="There are no right answers. The goal is to notice where you are starting from." />
        {qs.map((q, i) => {
          const key = activeSection + "_q" + (i + 1);
          return (
            <div key={key}>
              <div style={S.qLabel}>{q}</div>
              <textarea style={S.ta} value={session.answers[key] || ""}
                onChange={e => update(s => { s.answers[key] = e.target.value; return s; })} />
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------- add-line modal ----------------
  const AddModal = () => {
    const [name, setName] = useState("");
    const [win, setWin] = useState("12");
    const [cad, setCad] = useState("");
    if (addModal === null) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(27,43,75,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 26, width: 400, maxWidth: "92vw" }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Add A Line</h3>
          <div style={{ fontSize: 12, color: "#8A93A6", marginBottom: 12 }}>to {ws.components[addModal].name}</div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, margin: "12px 0 4px" }}>OBLIGATION / SOURCE</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., AMEX ...1005 · Roth IRA · Pay Stubs — Second Job"
            style={{ width: "100%", padding: "9px 10px", border: "1px solid " + RULE, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 13, background: "#FBFAF7" }} />
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, margin: "12px 0 4px" }}>DOCUMENT WINDOW</label>
          <select value={win} onChange={e => setWin(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", border: "1px solid " + RULE, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 13, background: "#FBFAF7" }}>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
            <option value="24">2 years</option>
            <option value="36">3 years</option>
            <option value="999">Ongoing obligation (track the latest 12 months)</option>
          </select>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, margin: "12px 0 4px" }}>PAY RECORDS? HOW OFTEN ARE YOU PAID (optional)</label>
          <select value={cad} onChange={e => setCad(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", border: "1px solid " + RULE, borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 13, background: "#FBFAF7" }}>
            <option value="">Not pay records / monthly documents</option>
            <option value="weekly">Weekly paychecks</option>
            <option value="biweekly">Every two weeks</option>
            <option value="semimonthly">Twice a month</option>
          </select>
          <div style={{ fontSize: 11, color: "#8A93A6", marginTop: 8, lineHeight: 1.5 }}>
            The window is how far back documents must reach, not how long the obligation lasts.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={{ padding: "8px 16px", background: "none", color: SLATE, border: "none", fontSize: 12.5, cursor: "pointer", fontFamily: "'Inter', sans-serif" }} onClick={() => setAddModal(null)}>Cancel</button>
            <button style={S.btnNavy} onClick={() => {
              if (name.trim()) update(s => {
                s.answers.workspace.components[addModal].lines.push({ id: generateId(), name: name.trim(), win: +win, cells: {}, cadence: cad || null });
                return s;
              });
              setAddModal(null);
            }}>Add Line</button>
          </div>
        </div>
      </div>
    );
  };

  // ---------------- shell (rail on the RIGHT) ----------------
  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#C9974A" strokeWidth="1.2" fill="none" />
            <path d="M16 4 L16 28 M4 16 L28 16" stroke="#C9974A" strokeWidth="1" opacity="0.4" />
            <path d="M16 2 L18 10 L16 8 L14 10 Z" fill="#C9974A" />
            <circle cx="16" cy="16" r="4" fill="none" stroke="#C9974A" strokeWidth="1.2" />
            <circle cx="16" cy="16" r="1.5" fill="#C9974A" />
          </svg>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", color: AMBER }}>POLARIS PARENTING PROJECT</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Financial Disclosure System</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{saveIndicator || "Saved locally"}</span>
          <button onClick={() => setRailCollapsed(!railCollapsed)}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>≡</button>
        </div>
      </div>
      <div style={S.body}>
        <div style={S.main}>
          <WorkspaceBar />
          <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>{sec.label}</h1>
          <div style={{ fontSize: 11, color: "#8A93A6", marginBottom: 14 }}>{LAYER_LABELS[sec.layer]}</div>
          {tabs.length > 1 && (
            <div style={S.tabsRow}>
              {tabs.map(t => (
                <button key={t} style={S.tabBtn(t === activeTab)} onClick={() => { setActiveTab(t); update(s => { s.last_active_tab = t; return s; }); }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          {activeTab === "work" && activeSection === "timeline" && renderTimeline()}
          {activeTab === "work" && activeSection === "record" && renderRecord()}
          {activeTab === "work" && activeSection === "numbers" && renderNumbers()}
          {activeTab === "work" && activeSection === "summary" && renderSummary()}
          {activeTab === "work" && activeSection === "reflections" && renderReflections()}
          {activeTab === "work" && activeSection === "missing" && renderMissing()}
          {activeTab === "learn" && renderLearn()}
          {activeTab === "reflect" && renderReflect()}
        </div>
        <div style={S.rail}>
          <div style={S.railInner}>
            {RAIL_LAYERS.map(layer => (
              <div key={layer}>
                <div style={S.layerLabel}>{LAYER_LABELS[layer].toUpperCase()}</div>
                {SECTIONS.filter(s2 => s2.layer === layer).map(s2 => (
                  <button key={s2.id} style={S.navItem(s2.id === activeSection)} onClick={() => go(s2.id)}>
                    {s2.short}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <AddModal />
    </div>
  );
}
