// Foothill YSA site settings. These values are safe to be public:
// the anon key only allows what the database's row level security allows.
// Until supabaseUrl is filled in, the site runs in DEMO mode with sample data.
window.FYSA_CONFIG = {
  wardName: "Foothill YSA",
  supabaseUrl: "",          // e.g. "https://abcdefghijkl.supabase.co"  (Supabase > Project Settings > API)
  supabaseAnonKey: "",      // the "anon public" key from the same page
  textNumber: "",           // the Twilio number people can text, e.g. "+18015550123"
  costPerText: 0.012,       // rough US cost per 160-character text incl. carrier fees, for estimates
};
