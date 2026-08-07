// One-off script: creates real Supabase Auth accounts for the demo staff_users
// seeded in supabase/sql/04_seed.sql, and links each to its staff_users row via
// auth_user_id. Run locally once, after filling SUPABASE_SERVICE_ROLE_KEY in
// .env.local:
//
//   node --env-file=.env.local scripts/seed-staff-logins.mjs
//
// Uses the service_role key (Supabase's Admin API) — never commit that key,
// never run this against a database with real customers.
//
// Email domain note: RFC 2606-reserved test domains (.example, .test, .invalid)
// are rejected outright by Supabase's own signup validation — confirmed live
// during this feature's implementation (a .example address failed with
// "Email address ... is invalid" before any auth row was created, while the
// identical flow with a real-MX domain succeeded). These addresses therefore
// use gmail.com with high-entropy, obviously-synthetic local parts — nobody
// owns these, but the domain itself resolves, so Supabase's validation passes.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_PASSWORD = "TlabliDemo123!";

const staff = [
  { name: "Rami Abou Chacra", email: "rami.tlablidemo1@gmail.com" },
  { name: "Nadine Fares", email: "nadine.tlablidemo2@gmail.com" },
  { name: "Karim Haddad", email: "karim.tlablidemo3@gmail.com" },
  { name: "Sara Khalil", email: "sara.tlablidemo4@gmail.com" },
  { name: "Jean Nassar", email: "jean.tlablidemo5@gmail.com" },
  { name: "Elie Matta", email: "elie.tlablidemo6@gmail.com" },
  { name: "Tarek Younes", email: "tarek.tlablidemo7@gmail.com" },
];

for (const person of staff) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: person.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (createError) {
    console.error(`FAILED creating ${person.name} (${person.email}):`, createError.message);
    continue;
  }

  const { error: updateError } = await admin
    .from("staff_users")
    .update({ auth_user_id: created.user.id })
    .eq("name", person.name);

  if (updateError) {
    console.error(`FAILED linking ${person.name}:`, updateError.message);
  } else {
    console.log(`OK: ${person.name} <${person.email}> -> auth_user_id set`);
  }
}

console.log(`\nAll demo accounts share the password: ${DEMO_PASSWORD}`);
