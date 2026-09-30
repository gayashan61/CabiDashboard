// ─────────────────────────────────────────────────────────────
//  TilJay CF Pro — configuration
//  Departments, tasks, employees and daily counts are managed in the Admin page (stored in Supabase).
// ─────────────────────────────────────────────────────────────
window.KPI_CONFIG = {
  // Supabase: Project Settings ➜ API Keys ➜ Project URL and the publishable key.
  // The publishable key is meant to be public — the database rules in supabase/schema.sql protect the data.
  // Never put the secret / service_role key here.
  SUPABASE_URL: "https://bbhtejcxjytxmnxfsjxx.supabase.co",
  SUPABASE_KEY: "sb_publishable_xBmWeRYsCp1gP2ChF2_oXw_81jR2Pzy",

  APP_NAME: "TilJay CF Pro",
  COMPANY_NAME: "TilJay Computer Forms Production",

  // Which day the TV screens show as "Today":
  //  "latest" = the most recent day (up to today) that has any counts — good if data is entered at end of shift
  //  "today"  = always the calendar date
  DISPLAY_DAY: "latest",

  // Days counted as working days (0 = Sunday … 6 = Saturday). Used for 7-day averages and day stepping.
  WORK_DAYS: [1, 2, 3, 4, 5, 6],

  // Colours compare each person's count with the average of everyone who did the same task that day (in %):
  //  green  = at or above `good`, amber = at or above `warning`, red = below.
  THRESHOLDS: { good: 100, warning: 80 },

  // TV behaviour
  REFRESH_SECONDS: 60,        // how often TV pages check for new data
  SLIDE_SECONDS: 10,          // how long each slide stays on screen (tv-slides.html)

  // Colour theme: "dark", "light" or "auto" (follows the device setting).
  // Anyone can switch with the sun/moon button; a TV link can force one with ?theme=light or ?theme=dark.
  // Add &kiosk=1 to a TV link to hide the navigation and buttons.
  DEFAULT_THEME: "dark",
};
