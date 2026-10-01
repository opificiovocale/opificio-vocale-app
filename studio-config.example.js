// Copiare come studio-config.js solo quando esiste il progetto Supabase.
// Questi due valori sono pubblici lato browser; NON usare mai service_role qui.
window.OPIFICIO_STUDIO_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-PUBLIC-ANON-KEY"
};
