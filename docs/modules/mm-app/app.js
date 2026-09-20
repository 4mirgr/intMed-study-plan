const { useState, useEffect } = React;

/* ---------------------------------------------------------------
   storage shim (replaces window.storage with localStorage)
--------------------------------------------------------------- */
const storage = {
  get: async (key) => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    } catch (e) { return null; }
  },
  set: async (key, value) => {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
};

/* ---------------------------------------------------------------
   inline icon components (replace lucide-react)
--------------------------------------------------------------- */
function Icon({ children, size = 16, strokeWidth = 2, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}
function ChevronDown(props) {
  return (
    <Icon {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  );
}
function Check(props) {
  return (
    <Icon {...props}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  );
}
function ArrowRight(props) {
  return (
    <Icon {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  );
}
function AlertTriangle(props) {
  return (
    <Icon {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  );
}
function CircleDot(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}
function LayoutList(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <line x1="14" y1="4" x2="21" y2="4" />
      <line x1="14" y1="9" x2="21" y2="9" />
      <line x1="14" y1="15" x2="21" y2="15" />
      <line x1="14" y1="20" x2="21" y2="20" />
    </Icon>
  );
}
function GitBranch(props) {
  return (
    <Icon {...props}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Icon>
  );
}
function Plus(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}
function Minus(props) {
  return (
    <Icon {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

/* ---------------------------------------------------------------
   helpers
--------------------------------------------------------------- */
const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const toFa = (n) => String(n).split("").map((d) => FA[+d] ?? d).join("");

const TAG_STYLE = {
  positive: { bg: "#F7E6E4", fg: "#9A3B33", dot: "#B84A3F" },
  negative: { bg: "#E7EEE6", fg: "#3F6B45", dot: "#5C8A63" },
  unknown: { bg: "#F0ECE2", fg: "#8A7C55", dot: "#B7A968" },
  warn: { bg: "#FBF1E4", fg: "#8A5B1F", dot: "#C9A227" },
};

/* ---------------------------------------------------------------
   CARD-TYPE TOPICS  (flat lists — criteria, causes, differentials)
--------------------------------------------------------------- */
const CARD_TOPICS = [
  {
    id: "dyscrasia-types",
    title: "انواع Plasma Cell Dyscrasia",
    subtitle: "MGUS تا POEMS",
    items: [
      {
        id: "mgus",
        title: "MGUS",
        subtitle: "Monoclonal Gammopathy of Undetermined Significance",
        tag: "negative",
        tagLabel: "CRAB منفی",
        lead: "معمولاً بدون علامت، تصادفی کشف می‌شود. اکثر بیماران به MM پیش نمی‌روند.",
        rows: [
          ["SPEP", "< 3 g/dL"],
          ["پلاسماسل مغز استخوان", "< ۱۰٪"],
          ["نسبت light chain", "< 8:1"],
          ["CRAB", "منفی"],
        ],
        plan: "بدون درمان — فقط F/U سالانه.",
        warn: {
          title: "فاکتورهای High-Risk (۴ مورد)",
          bullets: [
            "M component subtype = non-IgG",
            "نسبت K/L نامتناسب",
            "M component > 1.5 g",
            "پلاسماسل مغز استخوان بالا",
          ],
          note: "در این زیرگروه گاهی ± Rituximab مطرح می‌شود.",
        },
      },
      {
        id: "smoldering",
        title: "Smoldering Myeloma",
        tag: "negative",
        tagLabel: "CRAB منفی",
        lead: "بدون علامت بالینی، ولی ریسک پیشرفت به MM بیشتر از MGUS است.",
        rows: [
          ["SPEP", "≥ 3 g/dL (IgG یا IgA)"],
          ["UPEP", "≥ 15 mg (pro light chain)"],
          ["نسبت light chain", "≥ 20:1"],
          ["پلاسماسل مغز استخوان", "۱۰٪ تا ۶۰٪"],
        ],
        plan: "درمان نمی‌شود — پیگیری نزدیک‌تر از MGUS.",
      },
      {
        id: "solitary",
        title: "Solitary Plasmacytoma",
        tag: "negative",
        tagLabel: "CRAB منفی",
        lead: "درگیری مغز استخوان نداریم؛ گاهی ابتدا توسط ارتوپدی یا نوروسرجری تشخیص داده می‌شود.",
        rows: [
          ["UPEP / SPEP", "منفی"],
          ["درگیری BM", "ندارد"],
          ["Focal lesion", "یک site، > ۳cm (۶۰٪ موارد)"],
          ["نسبت k/L", "> 100"],
        ],
        plan: "الگوریتم برخورد کامل در بخش «الگوریتم‌ها» آمده.",
      },
      {
        id: "nonsecretory",
        title: "Non-secretory Myeloma",
        tag: "positive",
        tagLabel: "CRAB مثبت",
        lead: "بیماری فعال بالینی دارد، اما در الکتروفورز اثری از M component دیده نمی‌شود.",
        rows: [["UPEP و SPEP", "فلت — بدون spike"]],
      },
      {
        id: "multiple-plasm",
        title: "Multiple Plasmacytoma",
        tag: "unknown",
        tagLabel: "نامشخص",
        incomplete: true,
      },
      {
        id: "poems-summary",
        title: "POEMS Syndrome",
        tag: "unknown",
        tagLabel: "نامشخص",
        lead: "معمولاً MM نیست.",
        note: "جزئیات کامل ۵ حرف POEMS در بخش «الگوریتم‌ها» آمده.",
      },
    ],
  },
  {
    id: "renal-causes",
    title: "علل نارسایی کلیه در MM",
    subtitle: "۸ علت شایع",
    items: [
      { id: "r1", title: "۱ — هایپرکلسمی", rows: [["مکانیزم", "↑Ca"]] },
      { id: "r2", title: "۲ — رسوب آمیلوئید در توبول", incomplete: false },
      { id: "r3", title: "۳ — هایپراوریسمی", rows: [["مکانیزم", "↑ Uric Acid"]] },
      { id: "r4", title: "۴ — ماده‌ی حاجب (Contrast)" },
      { id: "r5", title: "۵ — عفونت راجعه" },
      { id: "r6", title: "۶ — Bisphosphonate" },
      { id: "r7", title: "۷ — NSAID" },
      {
        id: "r8",
        title: "۸ — نفوذ کلیوی توسط میلوما",
        note: "منجر به Myeloma Cast Nephropathy می‌شود.",
      },
    ],
  },
  {
    id: "bone-findings",
    title: "یافته‌های استخوانی و آزمایشگاهی",
    items: [
      {
        id: "b1",
        title: "مکانیزم ضایعات استخوانی",
        lead: "فعالیت استئوکلاست‌ها افزایش می‌یابد و هم‌زمان فعالیت استئوبلاست توسط سلول‌های تومورال مهار می‌شود.",
      },
      {
        id: "b2",
        title: "ALP",
        rows: [["مقدار", "معمولاً نرمال (NL)"]],
        note: "چون استئوبلاست فعال نیست، ALP بالا نمی‌رود — برخلاف بسیاری از ضایعات استخوانی دیگر.",
      },
      {
        id: "b3",
        title: "Bone scan / رادیوایزوتوپ",
        tag: "negative",
        tagLabel: "به‌درد نمی‌خورد",
        lead: "ضایعات MM لیتیک هستند نه اسکلروتیک؛ برای ردیابی باید از Skeletal Survey / X-ray استفاده کرد، نه اسکن ایزوتوپ.",
      },
    ],
  },
  {
    id: "m-component-ddx",
    title: "تشخیص افتراقی M-component",
    subtitle: "افزایش پروتئین سرم — واقعی یا غیرواقعی؟",
    items: [
      {
        id: "polyclonal",
        title: "علل افزایش پروتئین بدون M component واقعی",
        tag: "negative",
        tagLabel: "پلی‌کلونال",
        bullets: ["سیروز", "لنفوم", "سارکوئیدوز"],
      },
      {
        id: "monoclonal-nonmm",
        title: "علل M component واقعی، غیر از میلوما",
        tag: "warn",
        tagLabel: "بررسی شود",
        bullets: ["Cold Agglutinin Disease", "RA", "CML", "CLL"],
      },
      {
        id: "workflow",
        title: "مسیر بررسی",
        rows: [
          ["غربالگری", "SPEP , UPEP"],
          ["تعیین نوع دقیق", "Immunofixation"],
        ],
        note: "Immunofixation زنجیره‌ی سنگین (IgG/IgA/IgM) و سبک (kappa/lambda) را مشخص می‌کند.",
      },
    ],
  },
  {
    id: "dvt-prophylaxis",
    title: "پروفیلاکسی DVT با ایمیدهای دارویی",
    subtitle: "لنالیدوماید / تالیدومید",
    items: [
      {
        id: "low",
        title: "ریسک پایین",
        tag: "negative",
        tagLabel: "ASA کافی است",
      },
      {
        id: "high",
        title: "ریسک بالا",
        tag: "positive",
        tagLabel: "آنتی‌کوآگولانت کامل",
        lead: "در صورت وجود فاکتور خطر ترومبوتیک همراه.",
      },
    ],
  },
  {
    id: "infection",
    title: "عفونت و پروفیلاکسی ایمنی",
    items: [
      {
        id: "gcsf",
        title: "پاسخ به G-CSF",
        lead: "اگر بیمار در Remission نباشد، پاسخ به G-CSF ضعیف است — چون نفوذ تومورال، ظرفیت گرانولوسیتوپوئز مغز استخوان را محدود می‌کند.",
      },
      {
        id: "ab-prophylaxis",
        title: "پروفیلاکسی آنتی‌بیوتیکی",
        tag: "negative",
        tagLabel: "جایگاهی ندارد",
        lead: "در بیمار MM تحت درمان، اصلاً جایگاهی برای پروفیلاکسی آنتی‌بیوتیکی روتین وجود ندارد.",
      },
      {
        id: "ivig",
        title: "IVIG",
        incomplete: true,
        note: "این خط از جزوه به‌سختی خوانا بود — لطفاً محتوایش را تکمیل کن.",
      },
    ],
  },
  {
    id: "rta",
    title: "RTA نوع ۲ (فانکونی) در MM",
    subtitle: "Proximal RTA",
    items: [
      {
        id: "fanconi",
        title: "سه‌گانه‌ی تشخیصی",
        bullets: ["گلوکوزوری (+)", "فسفاتوری (+)", "آمینواسیدوری (+)"],
        note: "این سه با هم = Fanconi Syndrome = Proximal RTA Type 2",
      },
      {
        id: "labs",
        title: "یافته‌های آزمایشگاهی",
        rows: [
          ["Urine pH", "< 5.5"],
          ["بی‌کربنات سرم", "پایین"],
        ],
      },
    ],
  },
  {
    id: "workup",
    title: "Investigation پایه در MM",
    items: [
      {
        id: "base-labs",
        title: "آزمایش‌های پایه",
        bullets: ["β2-microglobulin", "CBC، Cr، Alb، LDH", "SPEP، UPEP", "Skull X-ray", "Urine 24hr"],
      },
      {
        id: "confirm",
        title: "تأیید نهایی",
        bullets: ["BMB", "BMA"],
      },
      {
        id: "warn-imaging",
        title: "هشدار",
        tag: "warn",
        tagLabel: "⚠",
        lead: "ALP و Bone Scan / رادیوایزوتوپ در ردیابی ضایعات MM کمک‌کننده نیستند.",
      },
    ],
  },
  {
    id: "prognosis",
    title: "پیش‌آگهی و هدف درمانی",
    items: [
      {
        id: "prog-factors",
        title: "مهم‌ترین فاکتورهای پیش‌آگهی",
        rows: [
          ["۱", "β2-microglobulin"],
          ["۲", "Albumin"],
        ],
      },
      {
        id: "cd138",
        title: "هدف درمانی آنتی‌بادی",
        rows: [["Anti-CD138", "= Daratumumab"]],
      },
      {
        id: "al-amyloid",
        title: "AL Amyloidosis",
        incomplete: true,
        note: "طبق جزوه، مرتبط با MM ذکر شده — دقت رابطه‌ی علّی را با منبع دیگری چک کن (این خط در دست‌خط خیلی خلاصه بود).",
      },
    ],
  },
];

/* ---------------------------------------------------------------
   TREE-TYPE TOPICS  (branching algorithms)
--------------------------------------------------------------- */
const TREE_TOPICS = [
  {
    id: "crab",
    title: "CRAB",
    subtitle: "معیارهای آسیب پایان‌ارگان",
    lead: "این ۴ حرف مشخص می‌کنند بیمار MM علامت‌دار است یا نه، و کدام ارگان درگیر است.",
    note: "CD138 مثبت = نشانگر پلاسماسل → تأیید تشخیص MM",
    branches: [
      { id: "c", label: "C", bullets: ["↑Ca — هایپرکلسمی"] },
      { id: "r", label: "R", bullets: ["Renal Failure — نارسایی کلیه"] },
      { id: "a", label: "A", bullets: ["Anemia — کم‌خونی"] },
      { id: "b", label: "B", bullets: ["Bone lesion / Bone pain — ضایعه یا درد استخوانی"] },
    ],
  },
  {
    id: "hyperviscosity",
    title: "Hyperviscosity Syndrome",
    subtitle: "ارتباط با Waldenström",
    lead: "می‌تواند در MM دیده شود، ولی کلاسیک‌ترین ارتباطش با Waldenström Macroglobulinemia (IgM بالا) است.",
    branches: [
      {
        id: "sx",
        label: "علائم بالینی",
        bullets: ["LOC", "Vertigo", "اختلال شناختی", "تاری دید", "خون‌ریزی بینی یا لثه (اختلال عملکرد پلاکت/انعقاد)"],
      },
      {
        id: "findings",
        label: "یافته‌های همراه",
        bullets: ["IgM بالا (M component)", "لنفادنوپاتی یا ارگانومگالی", "Rouleaux formation مثبت در PBS"],
      },
      {
        id: "neuropathy",
        label: "مکانیزم نوروپاتی",
        tag: "warn",
        bullets: [
          "نفوذ آمیلوئید به عصب محیطی",
          "یا Anti-MAG — آنتی‌بادی IgM مونوکلونال ضد میلین",
        ],
        note: "جدا از این دو، تالیدومید و بورتزومیب هم خودشان می‌توانند عارضه‌ی نوروپاتی دارویی بدهند.",
      },
    ],
  },
  {
    id: "waldenstrom-dx",
    title: "Waldenström — تشخیص افتراقی",
    lead: "شبیه CLL است و می‌تواند به سمت لنفوم پیش برود.",
    branches: [
      {
        id: "rouleaux-causes",
        label: "علل Rouleaux formation در PBS",
        bullets: ["Multiple Myeloma", "Waldenström", "Sepsis"],
        note: "RBC > 7 به‌هم‌چسبیده در PBS.",
      },
      {
        id: "immunophenotype",
        label: "ایمونوفنوتایپ",
        bullets: ["CD5 ⊖", "CD20 ⊕", "CD22 ⊕", "CD19 ⊕"],
        note: "CD5 منفی — نکته‌ی افتراقی کلیدی از CLL که CD5 مثبت است.",
      },
      {
        id: "supporting",
        label: "یافته‌های تکمیلی",
        bullets: ["MYD88 mutation ⊕", "شایع‌تر در مردان مسن", "Coombs گاهی ⊕", "Bone lesion معمولاً ⊖ (برخلاف MM)"],
      },
      {
        id: "bmb",
        label: "BMB",
        bullets: ["Lymphoplasmacytic infiltration > 10٪"],
      },
    ],
  },
  {
    id: "waldenstrom-tx",
    title: "Waldenström — درمان",
    branches: [
      {
        id: "regimens",
        label: "رژیم‌های خط اول",
        bullets: ["Ibrutinib + Rituximab", "یا Fludarabine + Cladribine"],
      },
      {
        id: "plasmapheresis",
        label: "نکته‌ی مهم قبل از Rituximab",
        tag: "warn",
        bullets: ["اگر IgM بسیار بالاست، حتماً پلاسمافرز قبل از Rituximab انجام شود"],
        note: "برای پیشگیری از IgM flare و تشدید hyperviscosity.",
      },
    ],
  },
  {
    id: "poems",
    title: "POEMS Syndrome",
    note: "⚠️ دست‌خط این بخش کم‌خوان بود — پنج شاخه با تعریف استاندارد پزشکی POEMS پر شده، نه لزوماً عین متن جزوه‌ی تو. حتماً با نکاتی که خودت نوشتی مطابقت بده.",
    branches: [
      { id: "p", label: "P", bullets: ["Polyneuropathy — پلی‌نوروپاتی"] },
      { id: "o", label: "O", bullets: ["Organomegaly — ارگانومگالی"] },
      { id: "e", label: "E", bullets: ["Endocrinopathy — اختلال غدد درون‌ریز"] },
      { id: "m", label: "M", bullets: ["M-protein — M component"] },
      { id: "s", label: "S", bullets: ["Skin changes — تغییرات پوستی"] },
    ],
  },
  {
    id: "solitary-algo",
    title: "الگوریتم Solitary Plasmacytoma",
    branches: [
      { id: "bmb-neg", label: "قدم ۱: BMB منفی", bullets: ["→ رادیوتراپی روی همان site"] },
      { id: "bmb-pos", label: "قدم ۱: BMB مثبت", bullets: ["→ شیمی‌درمانی + رادیوتراپی"] },
      {
        id: "progress",
        label: "در صورت پیشرفت",
        bullets: ["اگر به MM تبدیل شود، درمان مثل MM کامل (شامل پیوند) انجام می‌شود"],
      },
    ],
  },
  {
    id: "aki-mm-algo",
    title: "برخورد با AKI در بیمار MM",
    lead: "اولین قدم استراتژیک: تعیین اینکه بیمار کاندیدای پیوند مغز استخوان هست یا نه.",
    branches: [
      {
        id: "step1",
        label: "مرحله ۱ — حمایتی",
        bullets: ["Hydration", "+ Glucocorticoid", "+ Zoledronic Acid یا Denosumab (برای هایپرکلسمی)"],
      },
      {
        id: "step2",
        label: "مرحله ۲ — Induction (۴ تا ۶ کورس)",
        bullets: ["Lenalidomide + Bortezomib + Dexamethasone", "± Daratumumab"],
        note: "هدف: Bone Marrow Remission",
      },
      {
        id: "step3",
        label: "مرحله ۳ — پیوند",
        bullets: ["پیوند اتولوگ مغز استخوان → Complete Remission"],
        tag: "warn",
        note: "⚠️ Melphalan برای کاندیدای پیوند مناسب نیست — به مغز استخوان آسیب گسترده می‌زند و مانع پیوند می‌شود.",
      },
      {
        id: "response",
        label: "شاخص‌های پاسخ به درمان",
        bullets: ["کاهش M-component", "کاهش light chain آزاد در ادرار"],
      },
    ],
  },
];

/* ---------------------------------------------------------------
   shared UI bits
--------------------------------------------------------------- */
function Tag({ tag, label }) {
  const s = TAG_STYLE[tag] || TAG_STYLE.unknown;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {label}
    </span>
  );
}

function CardItem({ item, index, reviewed, onToggle }) {
  const [open, setOpen] = useState(false);
  const hasBody =
    item.lead || item.rows?.length || item.bullets?.length || item.plan || item.warn || item.note || item.incomplete;

  return (
    <div
      className="rounded-2xl border"
      style={{ borderColor: reviewed ? "#C9A227" : "#DDD5C4", backgroundColor: "#FFFEFB" }}
    >
      <button
        onClick={() => hasBody && setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-right"
        disabled={!hasBody}
      >
        <span
          className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
          style={{ backgroundColor: "#1B2A4A", color: "#F4EFE3" }}
        >
          {toFa(index + 1)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm" style={{ color: "#1B2A4A" }}>
              {item.title}
            </h3>
            {item.incomplete && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "#B7823A" }}>
                <AlertTriangle size={11} strokeWidth={2.5} />
                ناقص
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "#8A8270" }}>
              {item.subtitle}
            </p>
          )}
        </div>
        {item.tagLabel && <Tag tag={item.tag} label={item.tagLabel} />}
        {hasBody && (
          <ChevronDown
            size={16}
            className="shrink-0 transition-transform"
            style={{ color: "#8A8270", transform: open ? "rotate(180deg)" : "none" }}
          />
        )}
      </button>

      {open && hasBody && (
        <div className="px-4 pb-4 pt-1 border-t space-y-2.5" style={{ borderColor: "#EFE9DA" }}>
          {item.lead && (
            <p className="text-sm leading-6 pt-2" style={{ color: "#3A3529" }}>
              {item.lead}
            </p>
          )}

          {item.rows?.length > 0 && (
            <div className="grid gap-1.5">
              {item.rows.map(([k, v], i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: "#F7F4EC" }}
                >
                  <span style={{ color: "#6B6350" }}>{k}</span>
                  <span className="font-mono font-medium" dir="ltr" style={{ color: "#1B2A4A" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          )}

          {item.bullets?.length > 0 && (
            <ul className="space-y-1">
              {item.bullets.map((b, i) => (
                <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: "#4A3E28" }}>
                  <CircleDot size={11} className="mt-1 shrink-0" style={{ color: "#C9A227" }} />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {item.warn && (
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#FBF1E4", border: "1px solid #EBD9B4" }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: "#8A5B1F" }}>
                {item.warn.title}
              </p>
              <ul className="space-y-1">
                {item.warn.bullets.map((b, i) => (
                  <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: "#4A3E28" }}>
                    <CircleDot size={11} className="mt-1 shrink-0" style={{ color: "#B7823A" }} />
                    {b}
                  </li>
                ))}
              </ul>
              {item.warn.note && (
                <p className="text-xs mt-2 pt-2 border-t" style={{ color: "#8A5B1F", borderColor: "#EBD9B4" }}>
                  {item.warn.note}
                </p>
              )}
            </div>
          )}

          {item.plan && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "#EAF0EC", color: "#3F6B45" }}>
              <b>برخورد: </b>
              {item.plan}
            </p>
          )}

          {item.note && (
            <p className="text-xs italic" style={{ color: "#8A8270" }}>
              {item.note}
            </p>
          )}

          {item.incomplete && !item.lead && !item.note && (
            <p className="text-sm italic" style={{ color: "#B7823A" }}>
              این بخش در جزوه فقط عنوان بود — جزئیاتش را تکمیل کن.
            </p>
          )}

          <button
            onClick={() => onToggle(item.id)}
            className="flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1.5"
            style={{ backgroundColor: reviewed ? "#1B2A4A" : "#F0ECE2", color: reviewed ? "#F4EFE3" : "#6B6350" }}
          >
            <Check size={12} strokeWidth={3} />
            {reviewed ? "مرور شد" : "علامت‌گذاری"}
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ open }) {
  return (
    <span
      className="flex items-center justify-center w-5 h-5 rounded shrink-0"
      style={{ backgroundColor: "#EFE9DA", color: "#1B2A4A" }}
    >
      {open ? <Minus size={11} strokeWidth={3} /> : <Plus size={11} strokeWidth={3} />}
    </span>
  );
}

function TreeBranch({ branch }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative pr-6">
      <span className="absolute top-0 bottom-0" style={{ right: 8, width: 1, backgroundColor: "#DDD5C4" }} />
      <span className="absolute" style={{ right: 8, top: 17, width: 14, height: 1, backgroundColor: "#DDD5C4" }} />
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 py-2 text-right">
        <Toggle open={open} />
        <span className="font-bold text-sm" style={{ color: "#1B2A4A" }}>
          {branch.label}
        </span>
        {branch.tag === "warn" && <AlertTriangle size={13} style={{ color: "#B7823A" }} />}
      </button>
      {open && (
        <div className="pr-7 pb-3 space-y-1.5">
          {branch.bullets?.map((b, i) => (
            <p key={i} className="text-sm leading-6" style={{ color: "#3A3529" }}>
              {b}
            </p>
          ))}
          {branch.note && (
            <p className="text-xs italic pt-1" style={{ color: "#8A8270" }}>
              {branch.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TreeTopicView({ topic, reviewed, onToggle }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#FFFEFB", border: "1px solid #DDD5C4" }}>
      <div className="flex items-center gap-2.5 mb-1">
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: "#1B2A4A", color: "#F4EFE3" }}
        >
          <GitBranch size={15} />
        </span>
        <h2 className="font-extrabold text-base" style={{ color: "#1B2A4A" }}>
          {topic.title}
        </h2>
      </div>
      {topic.subtitle && (
        <p className="text-xs mb-2" style={{ color: "#8A8270" }}>
          {topic.subtitle}
        </p>
      )}
      {topic.lead && (
        <p className="text-sm leading-6 mb-3" style={{ color: "#3A3529" }}>
          {topic.lead}
        </p>
      )}

      <div className="space-y-0.5">
        {topic.branches.map((b) => (
          <TreeBranch key={b.id} branch={b} />
        ))}
      </div>

      {topic.note && (
        <p className="text-xs italic mt-3 pt-3 border-t" style={{ color: "#8A8270", borderColor: "#EFE9DA" }}>
          {topic.note}
        </p>
      )}

      <button
        onClick={() => onToggle(topic.id)}
        className="mt-4 flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1.5"
        style={{ backgroundColor: reviewed ? "#1B2A4A" : "#F0ECE2", color: reviewed ? "#F4EFE3" : "#6B6350" }}
      >
        <Check size={12} strokeWidth={3} />
        {reviewed ? "مرور شد" : "علامت‌گذاری کل الگوریتم به‌عنوان مرورشده"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   home screen
--------------------------------------------------------------- */
function TopicRow({ icon, title, subtitle, progress, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-right"
      style={{ backgroundColor: "#FFFEFB", border: "1px solid #DDD5C4" }}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#F0ECE2", color: "#1B2A4A" }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm" style={{ color: "#1B2A4A" }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs mt-0.5 truncate" style={{ color: "#8A8270" }}>
            {subtitle}
          </p>
        )}
      </div>
      {progress != null && (
        <span className="text-[11px] font-mono shrink-0" dir="ltr" style={{ color: progress === 1 ? "#5C8A63" : "#8A8270" }}>
          {Math.round(progress * 100)}%
        </span>
      )}
    </button>
  );
}

/* ---------------------------------------------------------------
   App
--------------------------------------------------------------- */
function App() {
  const [active, setActive] = useState(null); // { type, id }
  const [cardReviewed, setCardReviewed] = useState({});
  const [treeReviewed, setTreeReviewed] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await storage.get("mm-app-card-reviewed");
        if (c?.value) setCardReviewed(JSON.parse(c.value));
      } catch (e) {}
      try {
        const t = await storage.get("mm-app-tree-reviewed");
        if (t?.value) setTreeReviewed(JSON.parse(t.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const toggleCard = async (itemId) => {
    const next = { ...cardReviewed, [itemId]: !cardReviewed[itemId] };
    setCardReviewed(next);
    try {
      await storage.set("mm-app-card-reviewed", JSON.stringify(next));
    } catch (e) {}
  };

  const toggleTree = async (topicId) => {
    const next = { ...treeReviewed, [topicId]: !treeReviewed[topicId] };
    setTreeReviewed(next);
    try {
      await storage.set("mm-app-tree-reviewed", JSON.stringify(next));
    } catch (e) {}
  };

  const cardProgress = (topic) => {
    const total = topic.items.length;
    const done = topic.items.filter((i) => cardReviewed[i.id]).length;
    return total ? done / total : 0;
  };

  const totalItems =
    CARD_TOPICS.reduce((s, t) => s + t.items.length, 0) + TREE_TOPICS.length;
  const totalDone =
    Object.values(cardReviewed).filter(Boolean).length + Object.values(treeReviewed).filter(Boolean).length;

  const wrapStyle = {
    backgroundColor: "#F4EFE3",
    fontFamily: "'Vazirmatn', Tahoma, sans-serif",
    minHeight: "100vh",
  };

  if (!loaded) {
    return <div dir="rtl" style={wrapStyle} />;
  }

  /* ---------- topic detail screen ---------- */
  if (active) {
    const topic =
      active.type === "card"
        ? CARD_TOPICS.find((t) => t.id === active.id)
        : TREE_TOPICS.find((t) => t.id === active.id);

    return (
      <div dir="rtl" style={wrapStyle}>
        <div style={{ backgroundColor: "#1B2A4A" }} className="px-4 pt-5 pb-4 sticky top-0 z-10">
          <button
            onClick={() => setActive(null)}
            className="flex items-center gap-1.5 text-xs font-medium mb-3"
            style={{ color: "#B9C2D6" }}
          >
            <ArrowRight size={14} />
            بازگشت به فهرست
          </button>
          <h1 className="text-lg font-extrabold" style={{ color: "#F4EFE3" }}>
            {topic.title}
          </h1>
        </div>

        <div className="px-4 py-5 max-w-xl mx-auto">
          {active.type === "card" ? (
            <div className="space-y-3">
              {topic.items.map((item, i) => (
                <CardItem key={item.id} item={item} index={i} reviewed={!!cardReviewed[item.id]} onToggle={toggleCard} />
              ))}
            </div>
          ) : (
            <TreeTopicView topic={topic} reviewed={!!treeReviewed[topic.id]} onToggle={toggleTree} />
          )}
        </div>
      </div>
    );
  }

  /* ---------- home screen ---------- */
  return (
    <div dir="rtl" style={wrapStyle}>
      <div style={{ backgroundColor: "#1B2A4A" }} className="px-5 pt-6 pb-5">
        <div className="text-[11px] font-mono tracking-wide mb-2" style={{ color: "#C9A227" }} dir="ltr">
          M.M — MULTIPLE MYELOMA NOTEBOOK
        </div>
        <h1 className="text-xl font-extrabold" style={{ color: "#F4EFE3" }}>
          مرور جزوه‌ی مالتیپل میلوما
        </h1>
        <p className="text-sm mt-1" style={{ color: "#B9C2D6" }}>
          {toFa(CARD_TOPICS.length)} فهرست + {toFa(TREE_TOPICS.length)} الگوریتم
        </p>
        <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(244,239,227,0.15)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(totalDone / totalItems) * 100}%`, backgroundColor: "#C9A227" }}
          />
        </div>
        <p className="text-xs mt-1.5" style={{ color: "#B9C2D6" }}>
          {toFa(totalDone)} از {toFa(totalItems)} مورد مرور شد
        </p>
      </div>

      <div className="px-4 py-5 max-w-xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <LayoutList size={14} style={{ color: "#8A8270" }} />
            <h2 className="text-xs font-bold" style={{ color: "#8A8270" }}>
              فهرست‌ها و معیارها — نمای کارتی
            </h2>
          </div>
          <div className="space-y-2">
            {CARD_TOPICS.map((t) => (
              <TopicRow
                key={t.id}
                icon={<LayoutList size={16} />}
                title={t.title}
                subtitle={t.subtitle}
                progress={cardProgress(t)}
                onClick={() => setActive({ type: "card", id: t.id })}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <GitBranch size={14} style={{ color: "#8A8270" }} />
            <h2 className="text-xs font-bold" style={{ color: "#8A8270" }}>
              الگوریتم‌ها و برخوردهای بالینی — نمای درختی
            </h2>
          </div>
          <div className="space-y-2">
            {TREE_TOPICS.map((t) => (
              <TopicRow
                key={t.id}
                icon={<GitBranch size={16} />}
                title={t.title}
                subtitle={t.subtitle}
                progress={treeReviewed[t.id] ? 1 : 0}
                onClick={() => setActive({ type: "tree", id: t.id })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="text-center pb-8 pt-2 text-xs" style={{ color: "#A69C82" }}>
        این نسخه، ۸ صفحه‌ی دست‌نویس رو کامل پوشش می‌ده — موارد «ناقص» یا «نامطمئن» رو خودت تکمیل/تأیید کن
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
