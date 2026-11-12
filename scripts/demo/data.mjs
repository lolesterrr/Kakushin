// The demo dataset: fictional organisations, challenges, teams and people. Nothing here is a real company or person.
export const PEOPLE = [
  "Amina Okello", "Brian Mukasa", "Carol Nakato", "David Ssemwogerere", "Esther Atim", "Felix Opio", "Grace Namuli", "Hassan Kibuuka",
  "Irene Akello", "Joel Tumusiime", "Kevin Ochieng", "Lydia Nabirye", "Moses Byaruhanga", "Naomi Achieng", "Oscar Kiggundu", "Patience Nansubuga",
  "Quentin Mwesigwa", "Rita Apio", "Samuel Lubega", "Tabitha Nalwoga", "Umar Ssebunya", "Vivian Auma", "Wilson Okot", "Yusuf Mugisha",
  "Zawadi Namatovu", "Daniel Wasswa",
];
export const JUDGES = ["Dr. Judith Auma", "Peter Kato", "Prof. Sarah Nankya", "Martin Opolot", "Dr. Faith Akol"];

// theme = colour family used for the cover, the deck and nothing else
export const ORGS = [
  { key: "climate", slug: "kampala-climate-lab", name: "Kampala Climate Lab", type: "hub", website: "https://example.org/climate-lab", owner: "Ruth Nambooze" },
  { key: "uni", slug: "lakeview-innovation-lab", name: "Lakeview University Innovation Lab", type: "university", website: "https://example.org/lakeview", owner: "Prof. Anthony Mugerwa" },
  { key: "agri", slug: "nile-agritech-foundation", name: "Nile Agritech Foundation", type: "partner", website: "https://example.org/nile-agritech", owner: "Beatrice Akullo" },
  { key: "health", slug: "savannah-health-collective", name: "Savannah Health Collective", type: "hub", website: "https://example.org/savannah-health", owner: "Dr. Isaac Mutebi" },
  { key: "fintech", slug: "pearl-fintech-forum", name: "Pearl Fintech Forum", type: "hub", website: "https://example.org/pearl-fintech", owner: "Joan Kemigisha" },
];

const Q = [
  { label: "What problem will your team solve?", type: "short_text", required: true, options: [] },
  { label: "Where will you first test your idea?", type: "choice", required: false, options: ["Kampala", "Wakiso", "Mukono", "Gulu", "Mbarara", "Other"] },
];

// stage: open | reviewing | judging | completed
export const CHALLENGES = [
  { org: "climate", title: "Clean Cookstoves Challenge", stage: "completed", topics: ["climate", "energy"], theme: "ember", prizes: "UGX 10M seed fund, mentorship and a place in the next cohort",
    summary: "Design a cleaner, cheaper way to cook for households that still rely on charcoal.",
    description: "Three in four Ugandan households still cook over charcoal or firewood. The smoke harms children, the cost eats a third of a family's income and the trade strips forests.\n\nTeams of up to three build a working prototype and pitch it to a panel. You will be scored on impact, feasibility and the quality of your pitch.",
    teams: [
      ["Moto Moto", "A rocket stove built from recycled drums that halves charcoal use."], ["Kuni Clean", "Pressed briquettes from market waste that burn longer and cleaner."],
      ["Sunbeam Stoves", "A solar cooker with a heat battery for evening cooking."], ["Green Hearth", "A subscription for cleaner stoves paid in small mobile-money steps."], ["Ash & Ember", "A chimney attachment that cuts indoor smoke by 80 percent."] ] },
  { org: "climate", title: "Solar Water Pumps Challenge", stage: "open", topics: ["energy", "agritech"], theme: "sun", prizes: "UGX 8M in grants and a field pilot with two partner farms",
    summary: "Put affordable solar pumping in reach of small farms during the dry season.",
    description: "Diesel pumps are expensive to run and unreliable. Solar pumping can double dry-season harvests, but the upfront cost keeps it out of reach of most smallholders.\n\nBuild a product, a financing model or a service that gets a pump into a farmer's hands.",
    teams: [["Jua Pumps", "A pay-as-you-go solar pump rented by the week."], ["Droplet", "A shared community pump with a mobile tap meter."], ["AquaVolt", "A low-cost controller that turns any pump solar-ready."]] },
  { org: "uni", title: "Campus AI for Education Hackathon", stage: "judging", topics: ["ai", "education"], theme: "indigo", prizes: "Cloud credits, laptops and an internship interview with partner labs",
    summary: "Use AI to help students learn faster, in local languages and on cheap phones.",
    description: "Lectures are crowded, textbooks are expensive and most tools assume fast internet. How could AI help a first-year student catch up, a teacher mark faster or a school in the north reach the same material?\n\nTeams build a working demo within the hackathon window and pitch it live.",
    teams: [["Luganda Tutor", "A voice tutor that explains maths in Luganda and English."], ["MarkMate", "Marks handwritten exam scripts and flags unclear answers."], ["StudyCircle", "Matches students into study groups by weak topics."], ["OfflineLearn", "Downloads revision packs that work with no data."]] },
  { org: "uni", title: "Student Mobility Challenge", stage: "open", topics: ["transport", "social-impact"], theme: "dusk", prizes: "UGX 6M prize pool and a pilot on campus routes",
    summary: "Make getting to and from campus safer, cheaper and more predictable.",
    description: "Thousands of students lose hours every week to unpredictable transport. Late-night travel is a safety risk, and boda fares change by the hour.\n\nPropose a tool or service that improves how students move, and show it working with real routes.",
    teams: [["Ride Circle", "Shared boda rides with verified riders and fixed prices."], ["SafeWalk", "A night walking-buddy network with live location sharing."]] },
  { org: "agri", title: "Smallholder Market Access Challenge", stage: "open", topics: ["agritech", "fintech"], theme: "field", prizes: "UGX 12M seed fund and introductions to three buyers",
    summary: "Connect smallholder farmers to fair prices and reliable buyers.",
    description: "Farmers often sell at the farm gate for a fraction of the market price because they cannot reach buyers or know today's price.\n\nBuild something that gives a farmer better information, a better buyer or a better price.",
    teams: [["Soko Direct", "A buyer marketplace that works over SMS."], ["Bei Bora", "Daily market prices by village, sent to farmers for free."], ["GroupSell", "Helps farmer groups pool harvests to win bigger contracts."], ["FarmLedger", "A simple record book that builds a credit history."]] },
  { org: "agri", title: "Post-Harvest Loss Challenge", stage: "completed", topics: ["agritech", "climate"], theme: "grain", prizes: "UGX 9M and a six-month pilot with partner cooperatives",
    summary: "Cut the share of harvest that rots or spoils before it reaches a buyer.",
    description: "Up to a third of fruit and grain is lost between the farm and the market. Better drying, storage and transport would put money straight back into farmers' pockets.\n\nShow a prototype and the numbers that prove it works.",
    teams: [["DryBox", "A solar dryer for mangoes that fits on a boda."], ["CoolChain", "Rented cold storage in market towns, booked by phone."], ["Hermetic", "Low-cost airtight grain bags with a built-in moisture card."], ["Matooke Max", "A processing line turning surplus bananas into flour."]] },
  { org: "health", title: "Last-Mile Health Records", stage: "reviewing", topics: ["health", "ai"], theme: "teal", prizes: "UGX 10M and a pilot with three health centres",
    summary: "Keep a patient's record with them, even when the clinic has no internet.",
    description: "Patients repeat their history at every clinic, and paper files get lost. A record that follows the patient could save time and lives.\n\nDesign something that works with weak connectivity and respects patient privacy.",
    teams: [["CareCard", "A QR health card that works offline."], ["Mama Record", "Antenatal records that sync when the nurse gets signal."], ["ClinicLink", "Referral notes that travel with the patient."], ["Afya ID", "A simple patient ID for clinics without computers."], ["TriageBot", "Collects symptoms by phone before the visit."]] },
  { org: "health", title: "Community Clinic Supply Chain", stage: "open", topics: ["health", "transport"], theme: "forest", prizes: "UGX 7M and logistics support from partner distributors",
    summary: "Keep essential medicines in stock at small clinics.",
    description: "A stock-out of a basic medicine can close a clinic for days. Ordering is slow, delivery is uncertain and nobody can see what is nearby.\n\nBuild a way for clinics to see, order and track what they need.",
    teams: [["StockWatch", "A shared stock board for clinics in a district."], ["Dawa Route", "Pools clinic orders so one truck serves many."], ["ExpiryAlert", "Warns clinics before medicines expire."]] },
  { org: "fintech", title: "Mobile Money for Market Traders", stage: "open", topics: ["fintech", "social-impact"], theme: "plum", prizes: "UGX 15M seed fund and a sandbox with two mobile-money providers",
    summary: "Help market traders save, borrow and keep records from a basic phone.",
    description: "Millions of traders run on mobile money, yet none of that activity builds a credit record. Daily takings go missing and loans cost too much.\n\nBuild something simple enough for a stall in Owino and trustworthy enough to lend against.",
    teams: [["Duka Books", "Turns mobile-money receipts into a daily ledger."], ["Chama Pay", "A digital savings group with transparent rules."], ["TraderScore", "A credit score based on mobile-money history."]] },
];

export const slugOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const QUESTIONS = Q;
