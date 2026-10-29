// Vercel's Supabase integration for this project stores its settings with a BB_ prefix.
// Map them to the names the server reads, without overriding anything set explicitly.
const aliases={DATABASE_URL:'BB_POSTGRES_URL',SUPABASE_URL:'BB_SUPABASE_URL',SUPABASE_PUBLISHABLE_KEY:'BB_SUPABASE_PUBLISHABLE_KEY'};
for(let [name,alias] of Object.entries(aliases))if(!process.env[name]&&process.env[alias])process.env[name]=process.env[alias];
