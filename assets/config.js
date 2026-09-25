// ─────────────────────────────────────────────────────────────
//  Production KPI Dashboard — configuration
//  Edit this file after deploying the Google Apps Script backend.
// ─────────────────────────────────────────────────────────────
window.KPI_CONFIG = {
  // Paste your Apps Script Web App URL here (ends with /exec).
  // Leave empty to run in DEMO MODE (data is kept in this browser only).
  API_URL: "",

  COMPANY_NAME: "Production Performance",

  // Which day the TV screens show as "Today":
  //  "latest" = the most recent day (up to today) that has any entries — good if data is entered at end of shift
  //  "today"  = always the calendar date
  DISPLAY_DAY: "latest",

  // Days counted as working days (0 = Sunday … 6 = Saturday). Used for weekly averages.
  WORK_DAYS: [1, 2, 3, 4, 5, 6],

  // Colour bands for the performance score (% of daily target)
  THRESHOLDS: { good: 100, warning: 80 },

  // TV behaviour
  REFRESH_SECONDS: 60,        // how often TV pages reload data
  SLIDE_SECONDS: 10,          // how long each slide stays on screen (tv-slides.html)

  // Colour theme: "dark", "light" or "auto" (follows the device setting).
  // Anyone can switch with the sun/moon button; a TV link can force one with ?theme=light or ?theme=dark.
  // Add &kiosk=1 to a TV link to hide the navigation and buttons.
  DEFAULT_THEME: "dark",

  // Department display order. Colours come from the theme (1st = blue, 2nd = green, 3rd = violet, 4th = pink …).
  DEPARTMENTS: [
    { name: "Sheets" },
    { name: "Sets" },
    { name: "TH & 2ply" },
    { name: "Packing" },
  ],

  // Default daily targets per task — used only to seed the Targets tab the first time.
  // Change the real values from the Admin page ➜ Targets.
  DEFAULT_TARGETS: {
    "RT Blank Sheets": 120000,
    "RT Printed Sheets": 120000,
    "P2P Printed 1 Colour": 10000,
    "RT Sheets (Sets)": 100000,
    "Collating": 5000,
    "Numbering": 35000,
    "Gluing": 5000,
    "TH": 60,
    "2ply": 60,
    "Packing": 150,
    "Packing Boxes": 1000,
    "Sample": 250,
    "Cleaning": 100,
    "Sheets PR": 15,
    "10x24 Plate": 3,
    "Polythene Cut": 1000,
    "Polythene Seal": 1000,
  },
};
