import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return new Response(
        JSON.stringify({ error: "Missing fields" }),
        { status: 400 }
      );
    }

    // Supabase admin client (SERVICE ROLE)
    const supabaseAdmin = createClient(
      Deno.env.get("https://soxwifnrwqkbfpvzdfkl.supabase.co")!,
      Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw")!
    );

    // Create auth user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
      });
    }

    // Insert into userscompany table
    const { error: dbError } = await supabaseAdmin
      .from("userscompany")
      .insert({
        auth_user_id: data.user.id,
        company_email: email,
        role,
      });

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 400,
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 500 }
    );
  }
});
