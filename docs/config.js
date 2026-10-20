// Public deployment configuration. The Supabase anon key is intentionally public and is
// safe only together with the row-level-security policies in backend/supabase/schema.sql.
// Never put a service-role key here.
window.INTMED_CONFIG = window.INTMED_CONFIG || {
  supabaseUrl: "",
  supabaseAnonKey: "",
  allowLegacyDemo: false,
  legacyAdminWhatsapp: ""
};
