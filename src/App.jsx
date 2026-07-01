import { useState, useEffect, useRef, useCallback } from "react";

const SCHEMA_VERSION = "1.0";
const PRODUCT_VERSION = "mps_v1";
const STORAGE_KEY = "mps_session_v1";

// --- Supabase connection (shared project with PPPS) ---
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

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function blankSession(userId) {
  return {
    user_id: userId || generateId(),
    session_id: generateId(),
    product_id: "mps",
    product_version: PRODUCT_VERSION,
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_active_section: "welcome",
    last_active_tab: "learn",
    completion_status: "not_started",
    completed_at: null,
    quick_notes: "",
    answers: {},
  };
}

function initSession() {
  return blankSession();
}

const SECTIONS = [
  { id: "welcome",       label: "Getting Started",             short: "How It Works",         layer: "start" },
  { id: "understanding", label: "Understanding Mediation",     short: "Understanding",        layer: "foundation" },
  { id: "current",       label: "Current Reality",             short: "Current Reality",      layer: "foundation" },
  { id: "positions",     label: "From Positions to Problems",  short: "Positions to Problems",layer: "foundation" },
  { id: "priorities",    label: "Priorities & Flexibility",    short: "Priorities",           layer: "foundation" },
  { id: "discussed",     label: "What May Be Discussed",       short: "What May Come Up",     layer: "mapping" },
  { id: "questions",     label: "Open Questions",              short: "Open Questions",       layer: "mapping" },
  { id: "countdown",     label: "The Countdown",               short: "The Countdown",        layer: "countdown" },
  { id: "brief",         label: "Your Mediation Brief",        short: "Your Brief",           layer: "brief" },
];

const LAYER_LABELS = {
  start: "Getting Started",
  foundation: "Part I — Foundation",
  mapping: "Part II — Mapping the Conversation",
  countdown: "Part III — The Countdown",
  brief: "Part IV — Your Brief",
};

const SECTION_TABS = {
  welcome:       ["learn"],
  understanding: ["learn"],
  current:       ["learn", "reflect"],
  positions:     ["learn", "reflect"],
  priorities:    ["learn", "reflect"],
  discussed:     ["learn", "reflect"],
  questions:     ["learn", "reflect"],
  countdown:     ["learn"],
  brief:         ["brief"],
};

const TAB_LABELS = { learn: "Learn", reflect: "Reflect", brief: "Brief" };

// Stable reflection question IDs. Naming: {section}_{topic}.
// The Brief generator (Part IV) references the "discussed_*" (Section 5) and
// "questions_*" (Section 6) IDs directly, so these keys must not change.
const QUESTIONS = {
  current: [
    { id: "current_schedule_followed", text: "What schedule is actually being followed, and on which days?" },
    { id: "current_daily_routines",    text: "Who handles the daily routines, like drop-offs, pickups, and appointments?" },
    { id: "current_decisions_made",    text: "How are decisions being made right now, and by whom?" },
    { id: "current_communication",     text: "What does communication between you and the other parent look like?" },
    { id: "current_recurring_conflicts", text: "What conflicts keep coming up?" },
    { id: "current_how_developed",     text: "How did the current arrangement come to exist? Was it the result of an agreement, a court order, a practical necessity, a gradual evolution over time, or something else?" },
  ],
  positions: [
    { id: "positions_outcome",          text: "Describe one outcome you would like to see come from mediation." },
    { id: "positions_reason_beneath",   text: "Why does that outcome matter to you? What concern, problem, or circumstance is it meant to address?" },
    { id: "positions_actual_problem",   text: "Try to describe the issue without referring to what the other parent did wrong. What problem are you trying to solve?" },
    { id: "positions_other_parent_view",text: "Without agreeing or disagreeing, describe how you think the other parent would explain the same issue." },
    { id: "positions_child_interest",   text: "Describe the child's need or interest involved in this issue. Try to describe it in a way that stands on its own, without making either parent the center of the answer." },
    { id: "positions_improvement",      text: "If this issue were resolved well, what would be different for the child?" },
  ],
  priorities: [
    { id: "priorities_issue",         text: "Choose one issue that may be discussed during mediation." },
    { id: "priorities_protect",       text: "Look past the specific arrangement for a moment. What priority sits underneath it? What matters most about this issue?" },
    { id: "priorities_still_work",    text: "Are there other arrangements that could protect that same priority? If so, what are they?" },
    { id: "priorities_essential",     text: "What part of this issue feels most important to preserve?" },
    { id: "priorities_child_or_me",   text: "Is it essential because of what it does for your child, or because of how it would feel to lose it? There is no wrong answer. The point is only to know which." },
    { id: "priorities_room_to_move",  text: "What part of this issue could you hold more loosely without sacrificing what matters most?" },
  ],
  discussed: [
    { id: "discussed_expected_issues",      text: "What issues do you expect to come up? List the ones you can see coming. Do not worry about wording or completeness." },
    { id: "discussed_priority_issues",      text: "Which of these matter most to you? Mark the ones that carry the most weight. These anchor your brief later." },
    { id: "discussed_connections",          text: "Do any of these connect to each other? Sometimes two issues are really one issue seen from two angles." },
    { id: "discussed_surface_vs_underneath",text: "Pick one issue. Is the disagreement underneath it the same as the disagreement on its surface?" },
  ],
  questions: [
    { id: "questions_what_you_know",   text: "What do you actually know? The things you are confident are true, that you could stand behind if asked." },
    { id: "questions_assumptions",     text: "What are you assuming? Look at what you expect the other parent wants or intends. Which of these do you know, and which have you filled in?" },
    { id: "questions_unknowns",        text: "What do you not know yet? The open questions, the things that would need answering before some issues could be settled." },
    { id: "questions_useful_to_find",  text: "What would be useful to find out before mediation? Of those unknowns, which could you answer ahead of time, and which are worth raising early in the session?" },
  ],
};

// Intro shown at the top of each Reflect section, tuned to that section's purpose.
const REFLECT_INTRO = {
  current:    "Think through these questions as honestly and objectively as you can. The clearer your picture of what is actually happening, the more useful your brief will be.",
  positions:  "Answer these as honestly as you can, including the parts that are hard to put into words. The goal is to understand your own reasoning, not to defend it.",
  priorities: "There are no right answers here, only yours. Use these to sort what you most want to protect from what you can hold more loosely.",
  discussed:  "Jot down what you can see coming, a few words on each line is plenty. The goal is to look ahead at the conversation you expect, not to script it.",
  questions:  "Separate what you know from what you are assuming. Naming an assumption as an assumption is what makes it easier to set aside when new information arrives.",
};

// Short transitions shown at the end of each Reflect section (processing → what's next).
const LOOKING_AHEAD = {
  current:    "Next, you'll look at the conclusions you've drawn from this picture, and what happens when they meet the other parent's.",
  positions:  "Next, you'll sort what matters most to you from what you can hold more loosely.",
  priorities: "The foundation is in place. Next, you'll begin mapping the conversation itself.",
  discussed:  "Next, you'll separate what you actually know from what you've been assuming.",
  questions:  "That completes the work of preparing the conversation. Next, the focus shifts to preparing for the day itself.",
};

// ---------- Shared presentational components ----------
function Orientation({ children }) {
  return (
    <div style={{borderLeft:`3px solid ${AMBER}`,paddingLeft:20,marginBottom:26}}>
      <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:15,lineHeight:1.85,color:NAVY,fontStyle:"italic"}}>{children}</div>
    </div>
  );
}

function SH({ children }) {
  return <div style={{fontSize:13,fontWeight:600,color:NAVY,margin:"22px 0 7px",letterSpacing:"0.02em"}}>{children}</div>;
}

function P({ children }) {
  return <p style={{fontSize:13.5,color:SLATE,lineHeight:1.8,margin:"0 0 11px"}}>{children}</p>;
}

function SectionDivider() {
  return <div style={{height:1,background:RULE,margin:"24px 0"}}></div>;
}

function Callout({ children }) {
  return (
    <div style={{border:`1px solid ${RULE}`,borderRadius:8,padding:"13px 16px",margin:"12px 0",background:"#fff"}}>
      <div style={{fontSize:13,color:SLATE,lineHeight:1.8}}>{children}</div>
    </div>
  );
}

function Bullets({ items }) {
  return (
    <div style={{background:"#fff",border:`1px solid ${RULE}`,borderRadius:8,padding:"12px 16px",margin:"8px 0 12px"}}>
      {items.map((item,i) => (
        <div key={i} style={{display:"flex",gap:8,fontSize:13,color:SLATE,lineHeight:1.7,marginBottom:i<items.length-1?4:0}}>
          <span style={{color:AMBER,flexShrink:0}}>—</span><span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function KeyTakeaways({ items }) {
  return (
    <div style={{background:NAVY,borderRadius:10,padding:"15px 18px",margin:"22px 0 0"}}>
      <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:11}}>KEY TAKEAWAYS</div>
      {items.map((item,i) => (
        <div key={i} style={{display:"flex",gap:9,marginBottom:i<items.length-1?7:0}}>
          <div style={{color:AMBER,fontSize:13,flexShrink:0,marginTop:1}}>✓</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.87)",lineHeight:1.65}}>{item}</div>
        </div>
      ))}
    </div>
  );
}

function ReflectSection({ sectionId, session, onAnswer, onFlag, intro }) {
  const questions = QUESTIONS[sectionId] || [];
  const answered = questions.filter(q => (session.answers[q.id]||"").trim().length > 0).length;
  const topRef = useRef(null);
  useEffect(() => { if (topRef.current) topRef.current.scrollIntoView({behavior:"smooth"}); }, [sectionId]);
  return (
    <div ref={topRef}>
      <Orientation>{intro || REFLECT_INTRO[sectionId] || "Think through these questions as honestly as you can. The clearer your answers, the more useful your mediation brief will be."}</Orientation>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <P>A few words on each line is enough. Flag anything you want to be sure comes up in mediation.</P>
        <div style={{fontSize:13,color:AMBER,fontWeight:500,whiteSpace:"nowrap",marginLeft:16}}>{answered}/{questions.length} answered</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {questions.map((q) => {
          const val = session.answers[q.id] || "";
          const flagged = session.answers[q.id+"__flag"] || false;
          return (
            <div key={q.id} style={{padding:"15px 17px",border:`1px solid ${flagged?AMBER:RULE}`,borderRadius:8,background:flagged?AMBER_LIGHT:"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                <div style={{fontSize:13.5,color:NAVY,fontWeight:500,lineHeight:1.5,flex:1}}>{q.text}</div>
                <button tabIndex={-1} onClick={()=>onFlag(q.id,!flagged)} title={flagged?"Remove flag":"Flag for discussion"} style={{marginLeft:11,background:"none",border:"none",cursor:"pointer",fontSize:15,color:flagged?AMBER:"#ccc",padding:0,lineHeight:1,flexShrink:0}}>⚑</button>
              </div>
              <textarea value={val} onChange={e=>onAnswer(q.id,e.target.value)} placeholder="Your thoughts..." rows={3} style={{width:"100%",border:`1px solid ${RULE}`,borderRadius:6,padding:"9px 11px",fontSize:13,color:SLATE,fontFamily:"Inter,sans-serif",resize:"vertical",background:"#fafaf9",boxSizing:"border-box",outline:"none"}} />
              {flagged&&<div style={{fontSize:11,color:AMBER,marginTop:5,fontWeight:500}}>⚑ Flagged for discussion</div>}
            </div>
          );
        })}
      </div>
      {LOOKING_AHEAD[sectionId] && (
        <div style={{marginTop:26,paddingTop:16,borderTop:`1px solid ${RULE}`}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:AMBER,marginBottom:5}}>LOOKING AHEAD</div>
          <div style={{fontSize:13,color:SLATE,lineHeight:1.7}}>{LOOKING_AHEAD[sectionId]}</div>
        </div>
      )}
    </div>
  );
}

// ---------- Reusable disclosure / interaction components ----------
function Disclose({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{margin:"10px 0"}}>
      <button onClick={()=>setOpen(!open)} style={{display:"inline-flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:600,color:AMBER}}>
        <span style={{fontSize:9,transform:open?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block",lineHeight:1}}>▶</span>
        {open ? "Close" : (label || "Read More")}
      </button>
      {open && <div style={{marginTop:10}}>{children}</div>}
    </div>
  );
}

function CheckItem({ ckey, label, why, checked, onCheck }) {
  const [openWhy, setOpenWhy] = useState(false);
  return (
    <div style={{borderBottom:`1px solid ${RULE}`,padding:"9px 0"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <button
          onClick={()=>onCheck(ckey, !checked)}
          aria-label={checked?"Uncheck":"Check"}
          style={{flexShrink:0,marginTop:1,width:18,height:18,borderRadius:4,border:`1.5px solid ${checked?AMBER:"#cbb"}`,background:checked?AMBER:"#fff",color:"#fff",fontSize:11,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",padding:0}}
        >
          {checked ? "✓" : ""}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div onClick={()=>onCheck(ckey, !checked)} style={{fontSize:13,color:checked?"#9aa":NAVY,lineHeight:1.5,cursor:"pointer",textDecoration:checked?"line-through":"none"}}>{label}</div>
          {why && (
            <button onClick={()=>setOpenWhy(!openWhy)} style={{marginTop:3,display:"inline-flex",alignItems:"center",gap:5,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"Inter,sans-serif",fontSize:11,color:SLATE}}>
              <span style={{fontSize:8,transform:openWhy?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block",lineHeight:1}}>▶</span>
              {openWhy ? "Close" : "Why this matters"}
            </button>
          )}
          {openWhy && why && <div style={{marginTop:5,fontSize:12,color:SLATE,lineHeight:1.65,background:"#F7F5F0",borderRadius:6,padding:"8px 10px"}}>{why}</div>}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ item, answers, onCheck }) {
  const hasChecks = !!item.checks;
  // Separation by color, matching PPPS: green for actionable checklists, blue for guidance.
  const wrap = hasChecks
    ? {background:"#F5F9F5",border:"1px solid #C8DFC8",borderRadius:9,padding:"14px 16px",marginBottom:12}
    : {background:"#F0F4F8",border:"1px solid #D6E0EC",borderRadius:9,padding:"14px 16px",marginBottom:12};
  return (
    <div style={wrap}>
      <div style={{fontSize:14,fontWeight:600,color:NAVY,marginBottom:3}}>{item.h}</div>
      <div style={{fontSize:12.5,color:SLATE,lineHeight:1.6,fontStyle:"italic"}}>{item.goal}</div>
      {hasChecks && (
        <div style={{marginTop:10}}>
          {item.checks.map(c => (
            <CheckItem key={c.key} ckey={c.key} label={c.label} why={c.why} checked={!!answers[c.key]} onCheck={onCheck} />
          ))}
        </div>
      )}
      {item.more && (
        <Disclose label="Read more">
          {item.more.map((para,i)=>(<P key={i}>{para}</P>))}
        </Disclose>
      )}
    </div>
  );
}

// Expandable item with a visible header + one-line lead, detail on demand.
// Used for "situational" content, the parent sees the header and decides to open it.
function ExpandItem({ title, lead, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{border:`1px solid ${open?AMBER:RULE}`,borderRadius:8,background:open?AMBER_LIGHT:"#fff",marginBottom:8,overflow:"hidden"}}>
      <div onClick={()=>setOpen(!open)} style={{padding:"12px 15px",cursor:"pointer",display:"flex",gap:11,alignItems:"flex-start"}}>
        <span style={{fontSize:10,color:open?AMBER:"#bbb",flexShrink:0,marginTop:3,transform:open?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",lineHeight:1,display:"inline-block"}}>▶</span>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13.5,fontWeight:600,color:NAVY}}>{title}</div>
          {lead && <div style={{fontSize:12.5,color:SLATE,lineHeight:1.55,marginTop:2}}>{lead}</div>}
        </div>
      </div>
      {open && <div style={{padding:"0 16px 8px 37px"}}>{children}</div>}
    </div>
  );
}

// ---------- Getting Started ----------
function WelcomeScreen() {
  const steps = [
    ["Read", "Learn concepts section by section. Each one introduces a single part of the mediation process before moving to reflection."],
    ["Reflect", "Answer a few short questions. Your responses are saved automatically and become the foundation of your mediation brief."],
    ["Quick Notes", "Located in the bottom-right corner, this is a place to capture thoughts as they come to you. Save ideas so you can revisit them later."],
    ["Build Your Brief", "Your brief develops as you work. As you complete reflection, your responses are organized into a draft you can review, edit, and prepare for mediation."],
  ];
  return (
    <div style={{maxWidth:580}}>
      <Orientation>Mediation is often the first time many parents sit down to actively work toward a resolution together. It is a chance to shape the long-term arrangement directly, rather than leaving it to be decided for you.</Orientation>
      <P>A lot of parents are not sure what to expect from it, or how to get ready for a conversation that can matter this much. That is not a failure. It is simply where most people arrive.</P>
      <P>This system is designed to help you prepare at your own pace. As you move through each section, the workspace helps you organize your thoughts, keep track of your questions, and gradually build a mediation brief, so the day itself does not have to be the first time you have worked everything through.</P>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:AMBER,margin:"28px 0 6px"}}>HOW IT WORKS</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {steps.map(([title,desc],i)=>(
          <div key={title} style={{display:"flex",gap:13,padding:"12px 0",borderTop:i>0?`1px solid ${RULE}`:"none"}}>
            <div style={{width:23,height:23,borderRadius:"50%",background:AMBER,color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
            <div>
              <div style={{fontSize:13.5,fontWeight:600,color:NAVY,marginBottom:2}}>{title}</div>
              <div style={{fontSize:12.5,color:SLATE,lineHeight:1.6}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Part I — Foundation ----------
function UnderstandingLearn() {
  return (
    <div>
      <div style={{background:NAVY,color:"#fff",padding:"18px 22px",borderRadius:10,marginBottom:24,lineHeight:1.8}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:8}}>PART I — FOUNDATION</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>Before mediation, it helps to have a clear view of your own situation: what is happening now, why you want what you want, and what matters most. This first part helps you build that foundation.</div>
      </div>
      <Orientation>Mediation can be hard to picture before you are in it. You may have a date on the calendar and still be unsure who will be there, what the day will ask of you, or what is actually expected. This section helps you get a clearer picture of the process before you walk in.</Orientation>
      <P>When mediation becomes part of the discussion, a few questions tend to arise. What actually happens in mediation? What gets covered? Do I have to sit in the same room as the other parent? What do I have to agree to? These are the questions this section is here to answer.</P>

      <SH>What Mediation Is</SH>
      <P>Mediation is a structured conversation designed to help parents discuss unresolved issues and explore whether agreements can be reached. The purpose of mediation is narrower than that of a trial; it is to find out whether you and the other parent can agree on the matters that remain unresolved.</P>
      <P>It is a discussion, not a contest. Parents often arrive prepared to prove they are right, and find there is no one there whose role is to decide a winner. What helps instead is clarity about what matters to you and where you have room to work with the other parent. Mediation is an opportunity to explore agreement, not an obligation to reach one. Ending in what is sometimes called an impasse is a possible outcome, and not necessarily a failure.</P>

      <SH>What Mediation Is Not</SH>
      <P>Mediation is not court or litigation. There is no trial to decide who is right or wrong, and no judge to rule. It tends to be more successful when the focus shifts from proving a point to solving a problem, and from assigning blame for the past to shaping what happens next.</P>
      <div style={{borderLeft:`3px solid ${AMBER}`,background:AMBER_LIGHT,borderRadius:"0 8px 8px 0",padding:"12px 16px",margin:"18px 0"}}>
        <div style={{fontSize:13.5,color:NAVY,lineHeight:1.7}}>Mediation is also confidential by design. What is said or proposed generally cannot be used as evidence in court if you do not reach agreement, which is part of what makes it safe to explore options openly.</div>
      </div>

      <div style={{borderLeft:`3px solid ${AMBER}`,background:AMBER_LIGHT,borderRadius:"0 8px 8px 0",padding:"12px 16px",margin:"18px 0"}}>
        <div style={{fontSize:13.5,color:NAVY,lineHeight:1.7}}>You and the other parent are the decision-makers. No agreement takes effect unless you both agree to it, which gives you real influence over the outcome.</div>
      </div>

      <SH>Three Ways Mediation Happens</SH>
      <P>Mediation can take a few forms, and the one that applies to you shapes what the day actually feels like. If you are not sure which is yours, it is worth confirming in advance.</P>
      <ExpandItem title="In the same room" lead="Both parents, any attorneys, and the mediator together for the discussion.">
        <P>This is what most people picture when they imagine mediation. It can move quickly when communication between parents is workable, but it is only one of several possibilities.</P>
      </ExpandItem>
      <ExpandItem title="In separate rooms" lead="Each parent stays in a different room; the mediator moves between them, carrying proposals back and forth.">
        <P>You may never be in the same room as the other parent at all. Many parents are surprised this option exists, and for those who dread direct contact, it can make the entire process feel manageable. It is sometimes called caucus or shuttle mediation.</P>
      </ExpandItem>
      <ExpandItem title="By video" lead="The session is conducted online, either together or in separate virtual rooms.">
        <P>Depending on the platform and the mediator, parents may meet together or stay in separate virtual rooms, much like the separate-room format in person.</P>
      </ExpandItem>

      <SH>Who May Be Involved</SH>
      <ExpandItem title="The mediator" lead="Manages the process and keeps the conversation productive, but decides nothing.">
        <P>Their role is to facilitate discussion, help clarify misunderstandings, and keep the conversation moving. They may point out areas of agreement and help explore possible solutions, but they do not represent either parent, take sides, or decide anything for you.</P>
      </ExpandItem>
      <ExpandItem title="Your attorney, if you have one" lead="Advises you, evaluates proposals, and protects your legal interests.">
        <P>If you are represented, your attorney may help you understand the legal issues, evaluate proposals, assess risks, and review any agreement. Attorneys and mediators serve different functions: the mediator facilitates the discussion, while the attorney provides advice and advocacy.</P>
      </ExpandItem>
      <ExpandItem title="You" lead="An active participant whose preparation shapes the outcome, whatever your representation.">
        <P>The decisions are partly yours, and no agreement takes effect unless you agree to it. If you are representing yourself, preparation matters even more, because work that would otherwise fall to an attorney falls to you. This system does not provide legal advice, but it can help you think the issues through and prepare for the discussion.</P>
      </ExpandItem>

      <KeyTakeaways items={[
        "Mediation is not court. It is a structured conversation aimed at reaching agreement, not a trial to decide who is right.",
        "It is generally confidential. In most places, what is said cannot be used in court if you do not reach agreement, which makes it safer to discuss openly.",
        "It can take more than one form, the same room, separate rooms, or by video. It is worth knowing which is yours.",
        "You remain one of the people making the decisions. Nothing takes effect unless you agree to it.",
      ]} />
    </div>
  );
}

function CurrentLearn() {
  return (
    <div>
      <Orientation>Most parents enter mediation focused on what they want to change. That is understandable. By the time mediation happens, the disagreements have often existed for months or years. However, before discussing changes, it is important to have a clear view of the situation as it exists today.</Orientation>
      <P>This sounds simple, but it is an easy step to skip. Parents often arrive ready to debate whether an arrangement is fair or reasonable without first agreeing on what is actually happening. In many cases, they are discussing different versions of the same reality.</P>
      <P>The goal of this section is not to decide who is right, and not to decide whether the current arrangement should continue. It is simply to describe and gain clarity over the present situation as best you can, before anyone discusses changing it.</P>

      <SH>Before You Begin</SH>
      <P>The most useful thing you can bring into mediation is an accurate picture of what is actually happening right now. Try to paint that picture objectively, without deciding whether the arrangement is right or wrong. Whether it has caused frustration, or has simply existed for a long time, is not the question at this stage. The goal is to observe and describe.</P>
      <P>As you reflect, you may notice yourself slipping into explanation, often signaled by the word "because." If that happens, you have likely shifted from describing what is happening to explaining why. There will be time later to decide what it all means. For now, understanding the situation as it stands is the goal.</P>

      <SH>Separating the Pattern From Its Origin</SH>
      <P>In general, arrangements develop over time, and understanding that evolution can provide useful context.</P>
      <P>An arrangement's origin can matter, even when two arrangements look identical on paper. Picture two families with the exact same week-on, week-off schedule. In one, both parents sat down and agreed to it. In the other, the schedule developed over time, maybe through temporary orders, or slowly as individual choices collectively steered it toward that pattern, and one parent never felt it accurately reflected what had been intended. Same calendar, very different stories.</P>
      <P>The fact that an arrangement exists does not mean it should continue, and the fact that one parent objects does not mean it should change. Understanding how things came to be simply helps distinguish a disputed arrangement from a settled one, or the reverse.</P>

      <KeyTakeaways items={[
        "Describe the present situation as clearly as you can before arguing about changing it.",
        "Watch for the word “because.” It signals you may have shifted from describing to explaining.",
        "How an arrangement came to exist matters as much as what it is. The same schedule can carry very different stories.",
      ]} />
    </div>
  );
}

function PositionsLearn() {
  return (
    <div>
      <Orientation>The previous section focused on describing your situation as clearly as possible. This one turns to the conclusions you have drawn from it, and what happens when they meet the other parent's.</Orientation>
      <P>The goal here is not to abandon those conclusions or trade them for different ones. It is to understand them well enough to know where they came from and what they rest on.</P>
      <P>Mediation has a way of bringing your point of view into contact with other ways of seeing the same situation. Ideas that feel obvious to you may not seem the same to the other parent. A conclusion that has lived comfortably in your own thinking can sound different the moment it is spoken aloud. The aim is not a stronger position. It is fewer moments where you surprise yourself.</P>

      <SH>When You Are Asked Why</SH>
      <P>At some point the question of why tends to become prominent. A mediator asks it not to challenge you, but because understanding your reasoning is how they help. You may be asked why an arrangement is better, why a change matters, or why something that happened means what you think it means. The question is neutral. It is part of understanding.</P>
      <P>Even so, it can catch you off guard, because many positions begin as wants, and wants are surprisingly hard to explain. "I want more weekday time" is an honest sentiment, but it leaves the conversation nowhere to go except agreement or disagreement. Underneath the want there is usually a reason, and the reason is what a discussion can actually use. "The current schedule moves the children midweek, and the disruption is landing on school nights" points at something specific, and gives both parents something to work on rather than something to win.</P>
      <P>So it is worth taking the positions that matter most to you, in private, and trying to say plainly why you hold them. Not to defend them, just to hear them. Sometimes the reasons come easily and the position feels even sounder than before. Other times you find that part of what felt like certainty was really familiarity, a conclusion that has been with you so long it stopped needing reasons. Both are useful to know before you are asked.</P>

      <SH>When the Other Parent Sees It Differently</SH>
      <P>There is a moment in most mediations when the other parent describes the same situation you just described, and almost nothing about their version matches yours.</P>
      <P>This can be hard to sit with. It can feel like being contradicted about your own life. The instinct is to correct them, to explain why they are wrong, to point out what they left out. However, if you follow that instinct too far, the mediation may become the same argument the two of you have already had many times.</P>
      <P>Preparing for this moment is not about rehearsing a rebuttal. It is about understanding the disagreement well enough that you are not meeting it for the first time in the room. Try, honestly, to state the other parent's view the way they would state it. Not the version that is easiest to dismiss, but the one they would recognize as their own. You are not agreeing they are right. You are making sure you understand what you actually disagree about.</P>
      <div style={{borderLeft:`3px solid ${AMBER}`,background:AMBER_LIGHT,borderRadius:"0 8px 8px 0",padding:"14px 16px",margin:"18px 0"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:AMBER,marginBottom:6}}>GIVE YOURSELF PERMISSION</div>
        <div style={{fontSize:13,color:NAVY,lineHeight:1.75}}>Mediation may be one of the first times the weight of the situation becomes fully real, for you or for the other parent. Temporary orders and informal arrangements are coming to an end, and the reality of a long-term agreement taking their place can feel overwhelming. If a moment lands hard, you do not have to push through it. Taking a few minutes to regroup is a normal and accepted part of mediation.</div>
      </div>
      <P>It helps to know that many disagreements arrive carrying two things at once: a frustration about the past and a concern about the future. "He was late to every exchange last year" is a frustration. It explains why the issue matters to you, and it is often completely fair. But underneath it is usually a concern that can actually be solved: the exchanges need a set time and a plan for when someone is running behind. The frustration tells you why it matters. Mediation can acknowledge the frustration, but it tends to be more useful when the discussion turns to the concern underneath it.</P>
      <P>There is one more reason these disagreements can be harder to untangle than they first appear. Most parents walk into mediation with a firm, sincere belief that they are acting in their child's best interest. The other parent usually walks in with the very same belief. The difficulty is that a child's interest is surprisingly easy to blend with your own without noticing, until "what is best for the child" has quietly become "what is best for the child, as I understand it." This is understandable, and not something careless parents do. It may be one of the most common habits of loving parents. Noticing the possibility does not ask you to change your position. It only helps you see it clearly, before someone else sees it differently.</P>

      <KeyTakeaways items={[
        "Underneath a want there is usually a reason. The reason is what a discussion can actually use.",
        "Prepare for disagreement by being able to state the other parent's view the way they would state it, not the easiest version to dismiss.",
        "Most disagreements carry a frustration about the past and a concern about the future. The concern underneath is usually the part mediation can solve.",
        "“What is best for the child” can quietly become “as I understand it.” Noticing the possibility helps you see your position clearly.",
      ]} />
    </div>
  );
}

function PrioritiesLearn() {
  return (
    <div>
      <Orientation>In mediation, almost everything can start to feel equally important. The schedule, the holidays, the pickup time, the wording of a single clause, all of it arrives at once, and all of it can feel like something you cannot afford to get wrong. That feeling is exhausting, and it works against you. A parent who treats every point as essential has no energy left for the points that actually are.</Orientation>
      <P>This section is about sorting that out ahead of time, while you are calm, so that you walk in knowing the difference between what matters most to you and what you can hold more loosely. That difference is hard to find in the mediation room, with the other parent across from you and the pressure on. It is much easier to find beforehand.</P>
      <P>This is not about lowering your standards or becoming more agreeable. It is about understanding your priorities clearly enough that you can hold the important things firmly and let the smaller things be smaller.</P>

      <SH>What Matters Most</SH>
      <P>When parents first list what they care about, the list is long. Almost everything makes it on. That is normal, and it is the wrong place to stop, because a list where everything matters is the same as a list where nothing does. It gives you no way to choose when you have to.</P>
      <P>The useful work is narrowing the list down. Of everything on that long list, which few things are the ones you would protect even if it meant moving on others? Most parents eventually find the truly essential list is shorter than they expected. The rest matters, but it matters differently, and knowing that in advance is what lets you spend your attention where it counts.</P>
      <P>It also helps to separate two things that often look alike: what you are attached to, and what you are actually trying to protect. A parent may feel strongly about one particular schedule while what they care about underneath is a consistent routine. Another may be set on a specific holiday arrangement while what matters most is real time with extended family. The preference and the priority can overlap, but they are not always the same, and seeing the priority underneath the preference is often where new options appear.</P>
      <P>One more thing worth checking as you narrow the list: is each item essential because of what it does for your child, or because of how it would feel to lose it? Both are real, but they behave differently under pressure. The first tends to remain important. The second can sometimes loosen once you see it clearly.</P>

      <SH>Flexibility Is Not the Same as Giving In</SH>
      <P>Flexibility has a bad reputation in a setting like this. It can sound like weakness, like being the parent who folds. It is worth separating the two, because they are not the same thing at all.</P>
      <P>Giving in is conceding something that matters because the pressure got to be too much. Flexibility is knowing, ahead of time, which things you do not actually need to hold, so that you can let them go easily and without regret. The first happens to you. The second is something you decide. A parent who has done this work is not weaker in the room. They are harder to wear down, because they are not spending themselves defending things they were always willing to move on.</P>
      <P>There is a second kind of flexibility, too, and it is the more useful one. Often, more than one arrangement can satisfy the same underlying priority. A parent who values consistency may find several schedules capable of providing it. A parent who values staying involved in a child's education may find more than one way to stay informed. The priority does not change; only the path to it does. When you know what you are actually trying to protect, it becomes easier to recognize a solution that protects it in a form you had not pictured.</P>
      <P>This kind of flexibility is also what makes agreement possible. Mediation tends to move when each parent can offer something that costs them little and matters to the other. Knowing your own flexible areas in advance means you can recognize those moments when they come, rather than meeting every proposal as a threat.</P>

      <SH>Discomfort Is Not Always Disagreement</SH>
      <P>At some point a proposal may land that sounds reasonable at first and uncomfortable a moment later. Sometimes that discomfort is a genuine conflict with something important to you. Other times it is just the discomfort of an unfamiliar approach to a problem you had only ever pictured solving one way. The difference is not always obvious in the moment, which is exactly why it helps to have thought about your priorities beforehand. It lets you differentiate "this does not protect what matters to me" from "this is not how I imagined it." Both reactions are real, but they are not the same, and only one of them is a potential reason to hold the line.</P>

      <KeyTakeaways items={[
        "A list where everything matters is the same as a list where nothing does. The useful work is narrowing the list down.",
        "Separate the preference from the priority. Seeing what you are actually trying to protect is where new options appear.",
        "Flexibility is deciding in advance what you do not need to hold onto. It makes you harder to wear down, not weaker.",
        "More than one arrangement can protect the same priority. That is what makes agreement possible.",
      ]} />
    </div>
  );
}

// ---------- Part II — Mapping the Conversation ----------
function DiscussedLearn() {
  return (
    <div>
      <div style={{background:NAVY,color:"#fff",padding:"18px 22px",borderRadius:10,marginBottom:24,lineHeight:1.8}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:8}}>PART II — MAPPING THE CONVERSATION</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>So far, the looking you have done has been about your own situation: what is happening, why you want what you want, and what matters most. This part turns the same attention toward the conversation itself. Most parents prepare for mediation by thinking about what they want to say. Fewer stop to consider what is likely to happen once the conversation begins. The point here is to look closely enough at the conversation you are walking into that less of it arrives as a surprise.</div>
      </div>
      <Orientation>Mediation can bring what is underneath a disagreement to the surface. A disagreement that looks like it is about the schedule can turn out to be about transportation. Something that sounds like a communication problem can turn out to be about who makes decisions. Sometimes one issue stays one issue. Sometimes it opens into several, and sometimes several collapse into one thing underneath them all.</Orientation>
      <P>This is normal, and it is worth knowing before you sit down, because a parent who expects the topic to shift and wander is far less rattled when it does. Part of what mediation does is discover what the disagreement is actually about. An issue you walk in certain of can look different once the other parent's perspective is sitting next to yours, not because you were wrong, but because you were only ever holding one part of the picture.</P>
      <P>So the useful work now is to look ahead at what you think will come up, while holding it loosely enough that you can follow the conversation if it goes somewhere you did not expect.</P>

      <KeyTakeaways items={[
        "Mediation often surfaces what is underneath a disagreement. Issues split apart and collapse together as the conversation moves.",
        "Expecting the conversation to move means you are far less rattled when it does.",
        "Look ahead at what you think will come up, but hold it loosely enough to follow the conversation.",
      ]} />
    </div>
  );
}

function QuestionsLearn() {
  return (
    <div>
      <Orientation>As you think about the issues you have identified, you may notice that some parts of the conversation are still uncertain. That is normal.</Orientation>
      <P>Some information is simply unavailable. You may not know the details of a proposal or facts that have not yet been shared. Other uncertainties are harder to recognize because they do not feel like uncertainties at all.</P>
      <P>Some assumptions are easy to catch. Others settle into your thinking so gradually that they stop feeling like assumptions and begin feeling like facts.</P>
      <P>You might walk into mediation certain the other parent wants to change the schedule because they do not care about stability. Twenty minutes later they explain a work schedule you did not know about. The assumption was not malicious, and it was not foolish. It simply filled a gap where information had not yet arrived.</P>
      <P>Much of the friction in mediation comes from responding to what we believe the other person means rather than to what they have actually said.</P>
      <P>You do not need to resolve every uncertainty before mediation begins. It is often enough to recognize the difference between what you know, what you assume, and what remains unanswered. They often feel similar from the inside. Separating them is its own kind of preparation, because an assumption you have recognized as an assumption is much easier to set aside when new information arrives.</P>

      <KeyTakeaways items={[
        "An assumption recognized as an assumption is much easier to set aside when new information arrives.",
        "Much of the friction in mediation comes from responding to what we believe the other person means, not what they said.",
        "You do not need to resolve every uncertainty. Separating what you know, assume, and do not know is itself preparation.",
      ]} />
    </div>
  );
}

// ---------- Part III — The Countdown ----------
const COUNTDOWN_PHASES = [
  {
    label: "72 Hours Out — Prepare",
    lead: "Clear the things most likely to distract you on the day. Anything that depends on time, coordination, or another person belongs here, because those often depend on someone other than you.",
    items: [
      { h:"Speak With Your Attorney", goal:"Make sure you and your attorney are approaching mediation the same way.", more:[
        "Confirm what the session is expected to cover, what documents you should bring, and that the two of you are aligned on your overall approach. If your work in What May Be Discussed or Open Questions surfaced uncertainties, this is the time to raise them.",
        "If you are representing yourself, review the work you have already completed and make sure your questions, priorities, and expected topics are organized and easy to find during the session.",
      ] },
      { h:"Review Your Work", goal:"Get familiar enough with your prep that you can explain it calmly and consistently.", more:[
        "Return to the work you completed in Foundation and Mapping the Conversation. Review the issues you expect to discuss, the priorities you identified, where you have flexibility and where you do not, and the questions that remain unanswered.",
        "The goal is not to rethink your positions. You are not starting over. You are bringing forward work you have already done.",
      ] },
      { h:"Gather Your Documents", goal:"Pull together and organize what you may need, before the day.", checks:[
        { key:"cd72_courtorders",  label:"Existing court orders or agreements", why:"Whatever is currently ordered is the baseline the discussion starts from. Knowing exactly what it says keeps you from re-arguing terms that are already settled." },
        { key:"cd72_parentingplan",label:"Your proposed parenting plan", why:"A proposed plan gives the conversation something concrete to work from instead of starting from a blank page." },
        { key:"cd72_schoolsched",  label:"School and activity schedules", why:"Many scheduling disagreements are really about how a plan lands on real school days. The calendar makes that visible." },
        { key:"cd72_financial",    label:"Financial information", why:"If financial issues come up, having the figures on hand keeps the discussion grounded instead of speculative." },
        { key:"cd72_parentingtime",label:"Records of parenting time", why:"A record of what has actually happened can settle disagreements about the current arrangement before they take up mediation time." },
      ], more:[
        "As you organize these items, ask yourself: What does this document actually show? Does it answer a question, or simply support one part of the discussion? Are there gaps where additional information may still be needed?",
        "Knowing what your materials show and do not show is often as important as having them.",
      ] },
      { h:"Review the Legal Framework", goal:"Understand how your state approaches the issues you expect to discuss.", more:[
        "Understanding how your state approaches parenting time, decision-making, financial support, or other relevant issues provides useful context. If you are unsure whether a particular issue is even open to negotiation, discuss it with your attorney before mediation whenever possible.",
      ] },
      { h:"Confirm the Logistics", goal:"Lock down the practical details so the day itself is about the conversation.", checks:[
        { key:"cd72_log_datetime", label:"Date and time confirmed" },
        { key:"cd72_log_location", label:"Location or video platform confirmed" },
        { key:"cd72_log_childcare",label:"Childcare arranged" },
        { key:"cd72_log_transport",label:"Transportation arranged" },
      ], more:[
        "If the session is virtual, make sure you can access the platform before mediation begins. Plan for the session to take longer than expected.",
      ] },
    ],
  },
  {
    label: "48 Hours Out — Review",
    lead: "Two days out, the work shifts from gathering to confirming. Remove any remaining uncertainty, so nothing you could have settled in advance is still open when you sit down.",
    items: [
      { h:"Confirm With Your Attorney", goal:"Confirm you're aligned on what the session covers and on your priorities.", more:[
        "Confirm you are aligned on what the session will cover and on your priorities going in. Raise anything still unresolved now, while there is time to think it through together. If your attorney will not be in the room with you, make sure you know how to reach them during the session if a question comes up.",
      ] },
      { h:"Practice Explaining Your Position", goal:"Make sure you can put your conclusions into words without strain.", more:[
        "Read back through your work one more time. If any part of what you plan to discuss is difficult to explain clearly, take time to simplify it now. You are not looking for new conclusions. You are making sure the ones you reached still feel sound.",
      ] },
      { h:"Think Through Financial Questions", goal:"Know the financial information likely to come up before it does.", more:[
        "If financial issues may be discussed, make sure you have a general understanding of the information likely to come up. If you have an attorney, confirm that you understand any financial topics you expect to discuss. If you are representing yourself, identify any questions you would like clarified before mediation.",
      ] },
      { h:"Picture the Conversation", goal:"Decide in advance that pauses and surprises don't require an instant response.", more:[
        "Mediation may include pauses, disagreements, or unexpected turns. None of those require an immediate response. Remember that you can pause, ask questions, or request a break if you need one. If you have an attorney, make sure you have already discussed how the two of you will communicate during the session.",
      ] },
      { h:"Reconfirm the Logistics", goal:"Re-check the details so you carry fewer questions into tomorrow.", checks:[
        { key:"cd48_log_details",  label:"Session details reconfirmed" },
        { key:"cd48_log_childcare",label:"Childcare reconfirmed" },
        { key:"cd48_log_transport",label:"Transportation reconfirmed" },
        { key:"cd48_log_tech",     label:"Technology reconfirmed (if virtual)" },
        { key:"cd48_log_attorney", label:"Attorney's contact info easy to reach" },
      ] },
    ],
  },
  {
    label: "24 Hours Out — Ready",
    lead: "By now the work is done. Today is for settling: making sure everything is organized, accessible, and closed. You are not preparing anymore. You are making sure your preparation is within reach.",
    items: [
      { h:"Final Document Check", goal:"Nothing important should be hard to find tomorrow.", more:[
        "Make sure every document you may need is organized and accessible, and that you know where each one is before you need it. If the session is virtual, confirm that anything you might share or refer to is ready to open without searching.",
      ] },
      { h:"Technology", goal:"Resolve anything that isn't working today, not in the first few minutes of the session.", checks:[
        { key:"cd24_tech_link",      label:"Platform confirmed and link saved" },
        { key:"cd24_tech_connection",label:"Connection tested" },
        { key:"cd24_tech_charged",   label:"Device charged" },
        { key:"cd24_tech_share",     label:"Can access or share documents if needed" },
      ] },
      { h:"Final Logistics", goal:"Confirm the last practical details for the day.", checks:[
        { key:"cd24_log_time",     label:"Time confirmed" },
        { key:"cd24_log_location", label:"Location or access details confirmed" },
        { key:"cd24_log_childcare",label:"Childcare confirmed" },
        { key:"cd24_log_transport",label:"Transportation confirmed" },
      ] },
      { h:"When Emotions Rise", goal:"Mediation can bring up more than logistics, and a little preparation for that helps.", more:[
        "Strong feelings are common, and not only from disagreement. Hearing the other parent's account of events can land hard, and so can the reality that a familiar arrangement is about to change, especially for whoever has had the most say until now. Either parent can be caught off guard, and a single moment can derail a session if it is not expected.",
        "Whatever sets it off, you do not have to respond in the moment. You can pause, take a breath, or ask for a break. Listening is not the same as agreeing, and returning to what matters most to you is what turns a reaction into a response.",
      ] },
      { h:"Give Yourself Permission to Stop", goal:"There's a point where more preparation stops helping. Trust the work and rest.", more:[
        "If you have done the work in this system, trust it. Spend the rest of the evening doing something that helps you arrive rested and clear-headed. You are not trying to predict every turn the conversation might take. You are giving yourself the best opportunity to respond thoughtfully when it does.",
      ] },
    ],
  },
];

function CountdownLearn({ session, onCheck }) {
  return (
    <div>
      <div style={{background:NAVY,color:"#fff",padding:"18px 22px",borderRadius:10,marginBottom:24,lineHeight:1.8}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:8}}>PART III — THE COUNTDOWN</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>These final days are about getting ready for the day itself. Work through each step as it comes, and check things off as you go. Your progress saves automatically.</div>
      </div>

      {COUNTDOWN_PHASES.map((phase, pi) => (
        <div key={pi} style={{marginTop:pi>0?44:8,marginBottom:8,paddingTop:pi>0?30:0,borderTop:pi>0?`2px solid ${RULE}`:"none"}}>
          <div style={{fontSize:16,fontWeight:700,color:NAVY,marginBottom:5}}>{phase.label}</div>
          <P>{phase.lead}</P>
          <div style={{marginTop:12}}>
            {phase.items.map((item, ii) => (
              <ActionCard key={ii} item={item} answers={session.answers} onCheck={onCheck} />
            ))}
          </div>
        </div>
      ))}

      <div style={{background:NAVY,color:"#fff",padding:"22px 24px",borderRadius:10,margin:"28px 0 0",lineHeight:1.9}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.12em",color:AMBER,marginBottom:12}}>AS YOU WALK IN</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:15,color:"rgba(255,255,255,0.92)"}}>
          You cannot control how the other parent approaches mediation. You cannot control every proposal that is made or every direction the conversation takes. You can control whether you arrive prepared, clear on what matters to you, and ready to participate thoughtfully. You have already done that work. Now walk in.
        </div>
      </div>
    </div>
  );
}

// ---------- Part IV — Your Brief ----------
function buildBriefDraft(answers, quickNotes) {
  const g = (id) => (answers[id] || "").trim();
  let out = "MEDIATION PREPARATION BRIEF\n\n";

  // Lead with the single most important framing.
  const priority = g("discussed_priority_issues");
  if (priority) out += "WHAT MATTERS MOST TO ME\n" + priority + "\n\n";

  // Anything flagged for discussion, surfaced to the top.
  const flagged = [];
  Object.entries(QUESTIONS).forEach(([sid, qs]) => {
    qs.forEach(q => { if (answers[q.id + "__flag"] && (answers[q.id] || "").trim()) flagged.push(q); });
  });
  if (flagged.length) {
    out += "FLAGGED FOR DISCUSSION\n";
    flagged.forEach(q => { out += "- " + q.text + "\n  " + (answers[q.id] || "").trim() + "\n"; });
    out += "\n";
  }

  // The full record of every answer, organized by section.
  Object.entries(QUESTIONS).forEach(([sid, qs]) => {
    const answered = qs.filter(q => (answers[q.id] || "").trim().length > 0);
    if (!answered.length) return;
    const label = (SECTIONS.find(s => s.id === sid)?.label || sid).toUpperCase();
    out += label + "\n";
    answered.forEach(q => { out += "- " + q.text + "\n  " + answers[q.id].trim() + "\n"; });
    out += "\n";
  });

  if (answers.brief_include_notes && (quickNotes || "").trim()) {
    out += "MY NOTES\n" + (quickNotes || "").trim() + "\n\n";
  }
  return out.trim();
}

function BriefSection({ session, onBrief, onCheck }) {
  const draft = buildBriefDraft(session.answers, session.quick_notes);
  const includeNotes = !!session.answers.brief_include_notes;
  const hasNotes = (session.quick_notes || "").trim().length > 0;
  const stored = session.answers.brief_edited_text;
  const value = (stored != null && stored !== "") ? stored : draft;

  // Flagged items pulled across all reflection sections
  const flagged = [];
  Object.entries(QUESTIONS).forEach(([sid, qs]) => {
    qs.forEach(q => { if (session.answers[q.id+"__flag"]) flagged.push({ sid, q, val: session.answers[q.id]||"" }); });
  });

  const hasAny = Object.values(QUESTIONS).flat().some(q => (session.answers[q.id]||"").trim().length > 0);

  return (
    <div>
      <div style={{background:NAVY,color:"#fff",padding:"18px 22px",borderRadius:10,marginBottom:24,lineHeight:1.8}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:8}}>PART IV — YOUR BRIEF</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>Everything you have worked through, gathered into one document you can edit and take into mediation.</div>
      </div>
      <Orientation>Your brief is assembled from the work you have done, especially the issues that matter most and the questions you still want answered. It is a starting point, not a script. Edit it freely so it sounds like you, then print or save it to bring into the room.</Orientation>

      {!hasAny && (
        <Callout>Your brief will fill in as you complete the reflection questions, especially in What May Be Discussed and Open Questions. Answer a few of those, then come back here.</Callout>
      )}

      {flagged.length > 0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:AMBER,marginBottom:9}}>FLAGGED FOR DISCUSSION</div>
          {flagged.map(({sid,q,val},i)=>(
            <div key={i} style={{padding:"9px 12px",background:AMBER_LIGHT,border:`1px solid ${AMBER}`,borderRadius:6,marginBottom:7}}>
              <div style={{fontSize:11,color:AMBER,fontWeight:600,marginBottom:3}}>⚑ {SECTIONS.find(s=>s.id===sid)?.short}</div>
              <div style={{fontSize:11,color:SLATE,fontStyle:"italic",marginBottom:3}}>{q.text}</div>
              {val && <div style={{fontSize:12.5,color:NAVY}}>{val}</div>}
            </div>
          ))}
        </div>
      )}

      {hasNotes && (
        <div onClick={()=>onCheck("brief_include_notes", !includeNotes)} style={{display:"flex",alignItems:"center",gap:9,padding:"10px 12px",border:`1px solid ${includeNotes?AMBER:RULE}`,background:includeNotes?AMBER_LIGHT:"#fff",borderRadius:8,cursor:"pointer",marginBottom:12}}>
          <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${includeNotes?AMBER:"#cbb"}`,background:includeNotes?AMBER:"#fff",color:"#fff",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{includeNotes?"✓":""}</div>
          <div style={{fontSize:12.5,color:NAVY}}>Include my Quick Notes in the brief <span style={{color:SLATE}}>(added as a “My Notes” section, then rebuild)</span></div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",color:"#444"}}>YOUR BRIEF (EDITABLE)</div>
        <button onClick={()=>onBrief(draft)} style={{fontSize:11,color:AMBER,background:"none",border:`1px solid ${RULE}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:500}}>
          Rebuild from my answers
        </button>
      </div>
      <textarea
        value={value}
        onChange={e=>onBrief(e.target.value)}
        rows={22}
        style={{width:"100%",border:`1px solid ${RULE}`,borderRadius:8,padding:"16px 18px",fontSize:14,color:NAVY,fontFamily:"Georgia,'Times New Roman',serif",lineHeight:1.75,resize:"vertical",background:"#fff",boxSizing:"border-box",outline:"none",whiteSpace:"pre-wrap"}}
      />
      <div style={{display:"flex",gap:9,marginTop:12}}>
        <button onClick={()=>window.print()} style={{flex:1,padding:"11px",background:NAVY,color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Print / Save as PDF</button>
      </div>
      <div style={{fontSize:11,color:"#aaa",marginTop:14,lineHeight:1.6}}>
        Editing replaces the generated text. Use "Rebuild from my answers" to regenerate it from your latest reflections (this overwrites your edits).
      </div>
    </div>
  );
}

function CompletionPage({ onViewBrief }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 32px",textAlign:"center",maxWidth:560,margin:"0 auto"}}>
      <div style={{width:64,height:64,borderRadius:"50%",background:AMBER,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,fontSize:28}}>✓</div>
      <div style={{fontSize:22,fontWeight:600,color:NAVY,marginBottom:12}}>Your preparation is complete.</div>
      <div style={{fontSize:14,color:SLATE,lineHeight:1.8,marginBottom:32}}>
        Everything you have worked through can now be assembled into your mediation brief, the document to bring into the room with you.
      </div>
      <button onClick={onViewBrief} style={{padding:"14px 32px",background:NAVY,color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:16,width:"100%",maxWidth:320}}>
        View My Brief
      </button>
      <div style={{fontSize:13,color:SLATE,lineHeight:1.7,marginTop:16}}>
        You can return to any section at any time to revise your answers. Your responses are saved automatically.
      </div>
      <div style={{fontSize:12,color:"#aaa",marginTop:24,lineHeight:1.6}}>
        This system is for educational and preparation purposes only. It does not constitute legal advice and does not replace an attorney, mediator, or other legal professional.
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const submit = async () => {
    setMsg("");
    if (!email || !password) { setMsg("Enter your email and password."); return; }
    if (!supabase) { setMsg("Connection unavailable. Refresh and try again."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { setMsg(error.message); }
        else { setSignupSuccess(true); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setMsg(error.message); }
      }
    } catch (e) {
      setMsg("Something went wrong. Try again.");
    }
    setBusy(false);
  };
  if (signupSuccess) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F6F1",padding:"24px",fontFamily:"Inter,sans-serif"}}>
        <div style={{width:"100%",maxWidth:380,background:"#fff",border:`1px solid ${RULE}`,borderRadius:14,padding:"36px 28px",boxShadow:"0 4px 24px rgba(27,43,75,0.08)",textAlign:"center"}}>
          <div style={{fontFamily:"Georgia,serif",fontSize:22,color:NAVY,marginBottom:14}}>Check Your Email</div>
          <div style={{fontSize:14,color:SLATE,lineHeight:1.5,marginBottom:8}}>
            We sent a confirmation link to <strong style={{color:NAVY}}>{email}</strong>.
          </div>
          <div style={{fontSize:14,color:SLATE,lineHeight:1.5,marginBottom:24}}>
            Open it to confirm your account, then return here to sign in. The link may take a minute to arrive. Check your spam folder if you do not see it.
          </div>
          <button onClick={()=>{setSignupSuccess(false);setMode("signin");setMsg("");setPassword("");}}
            style={{width:"100%",padding:"12px",background:NAVY,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F6F1",padding:"24px",fontFamily:"Inter,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380,background:"#fff",border:`1px solid ${RULE}`,borderRadius:14,padding:"32px 28px",boxShadow:"0 4px 24px rgba(27,43,75,0.08)"}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:AMBER,textAlign:"center",marginBottom:4}}>POLARIS PARENTING PROJECT</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:21,color:NAVY,marginBottom:6,textAlign:"center"}}>Mediation Preparation System</div>
        <div style={{fontSize:13,color:SLATE,textAlign:"center",marginBottom:24}}>
          {mode === "signup" ? "Create your account using the same email address you used at checkout." : "Sign in to continue your work."}
        </div>
        <label style={{display:"block",fontSize:11,fontWeight:700,letterSpacing:"0.08em",color:"#444",marginBottom:5}}>EMAIL</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"
          style={{width:"100%",border:`1px solid ${RULE}`,borderRadius:8,padding:"10px 12px",fontSize:14,color:NAVY,marginBottom:16,outline:"none",fontFamily:"Inter,sans-serif"}} />
        <label style={{display:"block",fontSize:11,fontWeight:700,letterSpacing:"0.08em",color:"#444",marginBottom:5}}>PASSWORD</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==="signup"?"new-password":"current-password"}
          onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
          style={{width:"100%",border:`1px solid ${RULE}`,borderRadius:8,padding:"10px 12px",fontSize:14,color:NAVY,marginBottom:8,outline:"none",fontFamily:"Inter,sans-serif"}} />
        {msg && <div style={{fontSize:12,color:mode==="signin"?"#B23A3A":"#2C7A4B",margin:"8px 0 4px"}}>{msg}</div>}
        <button onClick={submit} disabled={busy}
          style={{width:"100%",padding:"12px",background:NAVY,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:busy?"default":"pointer",marginTop:12,fontFamily:"Inter,sans-serif",opacity:busy?0.7:1}}>
          {busy ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
        {mode === "signup" && <div style={{fontSize:11,color:SLATE,textAlign:"center",marginTop:10,lineHeight:1.4}}>
          You will receive an email to confirm your account before you can sign in.
        </div>}
        <div style={{textAlign:"center",marginTop:18,fontSize:13,color:SLATE}}>
          {mode === "signup" ? "Already have an account? " : "Need an account? "}
          <span onClick={()=>{setMode(mode==="signup"?"signin":"signup");setMsg("");}}
            style={{color:AMBER,fontWeight:600,cursor:"pointer"}}>
            {mode === "signup" ? "Sign in" : "Create one"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MPS() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isActive, setIsActive] = useState(null); // null=unknown, false=locked, true=paid
  const [session, setSession] = useState(() => initSession());
  const [activeSection, setActiveSection] = useState(session.last_active_section || "welcome");
  const [activeTab, setActiveTab] = useState("learn");
  const [showCompletion, setShowCompletion] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const contentRef = useRef(null);
  const saveTimer = useRef(null);

  const persist = useCallback(async (s) => {
    if (!supabase || !s.user_id) return;
    const row = {
      session_id: s.session_id,
      user_id: s.user_id,
      product_id: s.product_id,
      product_version: s.product_version,
      schema_version: s.schema_version,
      last_active_section: s.last_active_section,
      last_active_tab: s.last_active_tab,
      completion_status: s.completion_status,
      completed_at: s.completed_at,
      quick_notes: s.quick_notes,
      answers: s.answers,
      updated_at: new Date().toISOString(),
    };
    try {
      await supabase.from("sessions").upsert(row, { onConflict: "session_id" });
    } catch (e) {}
  }, []);

  // Watch auth state: who is logged in
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data?.session?.user || null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setAuthUser(s?.user || null);
    });
    return () => { sub?.subscription?.unsubscribe?.(); };
  }, []);

  // When logged in, check whether this account is activated for MPS (paid)
  useEffect(() => {
    if (!supabase || !authUser) { setIsActive(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("mps_active")
          .eq("id", authUser.id)
          .single();
        if (cancelled) return;
        setIsActive(data ? !!data.mps_active : false);
      } catch (e) {
        if (!cancelled) setIsActive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  // When a user logs in, load their saved MPS session (or start fresh).
  // Scoped to product_id = "mps" so PPPS rows in the shared table are ignored.
  useEffect(() => {
    if (!supabase || !authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("user_id", authUser.id)
          .eq("product_id", "mps")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (data && data.length > 0) {
          const row = data[0];
          const loaded = {
            ...blankSession(authUser.id),
            ...row,
            answers: row.answers || {},
            quick_notes: row.quick_notes || "",
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

  const autosave = useCallback((s) => {
    setSaveIndicator("Saving...");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist(s);
      setSaveIndicator("Saved");
      setTimeout(() => setSaveIndicator(""), 2500);
    }, 700);
  }, [persist]);

  const handleAnswer = useCallback((qid, val) => {
    setSession(prev => {
      const next = {...prev, answers: {...prev.answers, [qid]: val}};
      const allQs = Object.values(QUESTIONS).flat();
      const done = allQs.filter(q => (next.answers[q.id]||"").trim().length > 0).length;
      next.completion_status = done === 0 ? "not_started" : done === allQs.length ? "complete" : "in_progress";
      if (done === allQs.length && !next.completed_at) {
        next.completed_at = new Date().toISOString();
        setShowCompletion(true);
      }
      autosave(next);
      return next;
    });
  }, [autosave]);

  const handleFlag = useCallback((qid, val) => {
    setSession(prev => {
      const next = {...prev, answers: {...prev.answers, [qid+"__flag"]: val}};
      autosave(next);
      return next;
    });
  }, [autosave]);

  const handleCheck = useCallback((key, val) => {
    setSession(prev => {
      const next = {...prev, answers: {...prev.answers, [key]: val}};
      autosave(next);
      return next;
    });
  }, [autosave]);

  const handleBrief = useCallback((val) => {
    setSession(prev => {
      const next = {...prev, answers: {...prev.answers, brief_edited_text: val}};
      autosave(next);
      return next;
    });
  }, [autosave]);

  const handleNotes = useCallback((val) => {
    setSession(prev => {
      const next = {...prev, quick_notes: val};
      autosave(next);
      return next;
    });
  }, [autosave]);

  const navigateToSection = useCallback((sectionId) => {
    setActiveSection(sectionId);
    const tabs = SECTION_TABS[sectionId] || ["learn"];
    setActiveTab(tabs[0]);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, []);

  useEffect(() => {
    setSession(prev => {
      const next = {...prev, last_active_section: activeSection, last_active_tab: activeTab};
      persist(next);
      return next;
    });
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeSection, activeTab]);

  const getOverall = () => {
    const qs = Object.values(QUESTIONS).flat();
    const done = qs.filter(q => (session.answers[q.id]||"").trim().length > 0).length;
    return { done, total: qs.length, pct: Math.round(done/qs.length*100) };
  };
  const getSectionProgress = (sid) => {
    const qs = QUESTIONS[sid];
    if (!qs) return null;
    const done = qs.filter(q => (session.answers[q.id]||"").trim().length > 0).length;
    return { done, total: qs.length };
  };

  const tabs = SECTION_TABS[activeSection] || ["learn"];
  const sectionIdx = SECTIONS.findIndex(s => s.id === activeSection);
  const prevSection = sectionIdx > 0 ? SECTIONS[sectionIdx-1] : null;
  const nextSection = sectionIdx < SECTIONS.length-1 ? SECTIONS[sectionIdx+1] : null;
  const { pct } = getOverall();

  const handleNext = () => {
    if (nextSection) { navigateToSection(nextSection.id); }
    else { setShowCompletion(true); }
  };

  const renderContent = () => {
    if (showCompletion) return <CompletionPage onViewBrief={() => { setShowCompletion(false); navigateToSection("brief"); }} />;
    if (activeSection === "welcome") return <WelcomeScreen />;
    if (activeSection === "understanding") return <UnderstandingLearn />;
    if (activeSection === "countdown") return <CountdownLearn session={session} onCheck={handleCheck} />;
    if (activeSection === "brief") return <BriefSection session={session} onBrief={handleBrief} onCheck={handleCheck} />;
    if (activeTab === "reflect") return <ReflectSection sectionId={activeSection} session={session} onAnswer={handleAnswer} onFlag={handleFlag} />;
    if (activeSection === "current") return <CurrentLearn />;
    if (activeSection === "positions") return <PositionsLearn />;
    if (activeSection === "priorities") return <PrioritiesLearn />;
    if (activeSection === "discussed") return <DiscussedLearn />;
    if (activeSection === "questions") return <QuestionsLearn />;
    return null;
  };

  const layers = ["start","foundation","mapping","countdown","brief"];
  const sectionsByLayer = layers.map(layer => ({
    layer, label: LAYER_LABELS[layer],
    sections: SECTIONS.filter(s => s.layer === layer),
  }));

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (supabase && !authReady) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F6F1",fontFamily:"Inter,sans-serif",color:SLATE,fontSize:14}}>
        Loading...
      </div>
    );
  }
  if (supabase && !authUser) {
    return <AuthScreen />;
  }
  if (supabase && authUser && isActive === null) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F6F1",fontFamily:"Inter,sans-serif",color:SLATE,fontSize:14}}>
        Loading...
      </div>
    );
  }
  if (supabase && authUser && isActive === false) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F6F1",padding:"24px",fontFamily:"Inter,sans-serif"}}>
        <div style={{width:"100%",maxWidth:420,background:"#fff",border:`1px solid ${RULE}`,borderRadius:14,padding:"36px 30px",boxShadow:"0 4px 24px rgba(27,43,75,0.08)",textAlign:"center"}}>
          <div style={{fontFamily:"Georgia,serif",fontSize:22,color:NAVY,marginBottom:14}}>Access Is Being Activated</div>
          <div style={{fontSize:14,color:SLATE,lineHeight:1.55,marginBottom:14}}>
            Thank you for your purchase. Your account is being activated, which usually takes a few hours.
          </div>
          <div style={{fontSize:14,color:SLATE,lineHeight:1.55,marginBottom:24}}>
            You will receive an email as soon as your access is ready. You can close this page and return anytime by signing in.
          </div>
          <div style={{fontSize:12,color:SLATE,marginBottom:18,paddingTop:18,borderTop:`1px solid ${RULE}`}}>
            If you have not completed your purchase yet, your access will activate once payment is confirmed.
          </div>
          <button onClick={async()=>{await supabase.auth.signOut();}}
            style={{fontSize:13,color:SLATE,background:"none",border:`1px solid ${RULE}`,borderRadius:8,padding:"9px 18px",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"Inter,sans-serif",background:"#F8F6F1",overflow:"hidden",position:"relative"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* Header */}
        <div style={{padding:isMobile?"9px 12px":"11px 16px",background:"#fff",borderBottom:`1px solid ${RULE}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?6:10,minWidth:0}}>
            <div style={{width:30,height:30,borderRadius:7,background:NAVY,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:AMBER,fontSize:15}}>◓</span>
            </div>
            <div style={{minWidth:0}}>
              {!isMobile&&<div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:AMBER}}>POLARIS PARENTING PROJECT</div>}
              <div style={{fontSize:12,fontWeight:600,color:NAVY,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Mediation Preparation System</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?5:8,flexShrink:0}}>
            {saveIndicator&&<div style={{fontSize:11,color:"#bbb"}}>{saveIndicator}</div>}
            {supabase&&authUser&&<button onClick={async()=>{await supabase.auth.signOut();}} style={{fontSize:11,color:SLATE,background:"none",border:`1px solid ${RULE}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Sign out</button>}
            <button
              onClick={()=>setRailCollapsed(!railCollapsed)}
              title={railCollapsed?"Show progress":"Hide progress"}
              style={{padding:"6px 10px",background:"#fff",border:`1px solid ${RULE}`,borderRadius:6,cursor:"pointer",fontSize:11,color:SLATE,fontFamily:"Inter,sans-serif"}}
            >
              {railCollapsed?"Progress ▶":"Progress ▼"}
            </button>
            <button onClick={()=>{ setShowCompletion(false); navigateToSection("brief"); }} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",background:activeSection==="brief"?NAVY:"#fff",border:`1.5px solid ${activeSection==="brief"?NAVY:RULE}`,borderRadius:8,cursor:"pointer",color:activeSection==="brief"?"#fff":SLATE,fontSize:12,fontWeight:500,fontFamily:"Inter,sans-serif"}}>
              <span style={{fontSize:13}}>◎</span>Brief
            </button>
          </div>
        </div>
        {/* Tabs */}
        {!showCompletion && tabs.length > 1 && (
          <div style={{background:"#fff",borderBottom:`1px solid ${RULE}`,display:"flex",padding:"0 16px",flexShrink:0}}>
            {tabs.map(tab => (
              <button key={tab} onClick={()=>setActiveTab(tab)} style={{padding:"11px 16px",background:"none",border:"none",borderBottom:`2.5px solid ${activeTab===tab?AMBER:"transparent"}`,color:activeTab===tab?NAVY:SLATE,fontWeight:activeTab===tab?600:400,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:-1}}>
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}
        {/* Content */}
        <div ref={contentRef} style={{flex:1,overflowY:"auto",padding:showCompletion?"0":"20px 20px 72px"}}>
          {!showCompletion && (
            <div style={{maxWidth:680,marginBottom:16}}>
              <div style={{fontSize:11,color:"#bbb",marginBottom:2}}>Section {sectionIdx+1} of {SECTIONS.length}</div>
              <div style={{fontSize:18,fontWeight:600,color:NAVY}}>{SECTIONS[sectionIdx]?.label}</div>
            </div>
          )}
          <div style={{maxWidth:showCompletion?"none":680}}>
            {renderContent()}
          </div>
          {!showCompletion && (
            <div style={{maxWidth:680,display:"flex",justifyContent:"space-between",marginTop:36,paddingTop:18,borderTop:`1px solid ${RULE}`}}>
              {prevSection
                ?<button onClick={()=>navigateToSection(prevSection.id)} style={{padding:"9px 16px",background:"#fff",border:`1px solid ${RULE}`,borderRadius:8,cursor:"pointer",color:SLATE,fontSize:13,fontFamily:"Inter,sans-serif"}}>← {prevSection.short}</button>
                :<div/>}
              {nextSection
                ?<button onClick={handleNext} style={{padding:"9px 16px",background:NAVY,border:"none",borderRadius:8,cursor:"pointer",color:"#fff",fontSize:13,fontWeight:500,fontFamily:"Inter,sans-serif"}}>{nextSection.short} →</button>
                :<div/>}
            </div>
          )}
        </div>
        {/* Disclaimer */}
        {!showCompletion && (
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(27,43,75,0.94)",color:"rgba(255,255,255,0.6)",fontSize:10,textAlign:"center",padding:"6px 16px",lineHeight:1.5,zIndex:50}}>
            This system is for educational and preparation purposes only. It does not constitute legal advice and does not replace an attorney, mediator, or other legal professional.
          </div>
        )}
      </div>
      {/* RIGHT RAIL */}
      {!railCollapsed && (
        <div style={{width:210,background:"#fff",borderLeft:`1px solid ${RULE}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${RULE}`}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color:"#444",marginBottom:2}}>YOUR PROGRESS</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:11,color:NAVY,fontWeight:500}}>Mediation Preparation</div>
              <div style={{fontSize:11,color:AMBER,fontWeight:600}}>{pct}%</div>
            </div>
            <div style={{height:3,background:RULE,borderRadius:2}}>
              <div style={{height:"100%",width:pct+"%",background:AMBER,borderRadius:2,transition:"width 0.3s"}}></div>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
            {sectionsByLayer.map(({layer, label, sections}) => (
              <div key={layer}>
                <div style={{padding:"7px 13px 2px",fontSize:9,fontWeight:700,letterSpacing:"0.08em",color:"#aaa",textTransform:"uppercase"}}>{label}</div>
                {sections.map((s) => {
                  const prog = getSectionProgress(s.id);
                  const isActiveSec = s.id === activeSection && !showCompletion;
                  const isDone = prog && prog.done === prog.total && prog.total > 0;
                  const globalIdx = SECTIONS.findIndex(sec => sec.id === s.id);
                  return (
                    <div key={s.id} onClick={()=>{ setShowCompletion(false); navigateToSection(s.id); }} style={{padding:"5px 11px 5px 13px",cursor:"pointer",display:"flex",alignItems:"flex-start",gap:7,background:isActiveSec?"rgba(201,151,74,0.07)":"transparent",borderLeft:`2.5px solid ${isActiveSec?AMBER:"transparent"}`}}>
                      <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,marginTop:1,background:isDone?AMBER:isActiveSec?"rgba(201,151,74,0.2)":"#F0EDE8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:isDone?"#fff":isActiveSec?AMBER:"#bbb",fontWeight:600}}>
                        {isDone?"✓":globalIdx+1}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,color:isActiveSec?AMBER:isDone?"#bbb":NAVY,fontWeight:isActiveSec?600:400,lineHeight:1.35}}>{s.short}</div>
                        {prog&&<div style={{fontSize:9,color:"#ccc",marginTop:1}}>{prog.done}/{prog.total}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{padding:"10px 11px 36px",borderTop:`1px solid ${RULE}`}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color:"#444",marginBottom:4}}>QUICK NOTES</div>
            <textarea value={session.quick_notes} onChange={e=>handleNotes(e.target.value)} placeholder="Park thoughts here as you read..." rows={4} style={{width:"100%",border:`1px solid ${RULE}`,borderRadius:6,padding:"6px 8px",fontSize:11,color:NAVY,fontFamily:"Inter,sans-serif",resize:"none",background:"#FAFAF8",boxSizing:"border-box",outline:"none"}} />
          </div>
        </div>
      )}
    </div>
  );
}
