import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Create a Supabase client with the Auth admin API key
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '', 
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const handler = async (req: Request): Promise<Response> => {
  console.log('🔍 Auth onboarding function started');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const body = await req.json();
    const eventType = body.type;
    const { email, id: userId } = body.record || {};

    console.log(`📧 Processing webhook: ${eventType}`);

    // Only proceed if this is a signup confirmation event
    if (eventType === 'auth.user.email_confirmed') {
      console.log(`✅ User ${userId} confirmed email: ${email}`);

      // Get user details to personalize the email
      const { data: userData, error: userError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('⚠️ Error fetching user profile:', userError);
      }

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to FQ Source</title>
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background-color: #f7fafc;
      color: #2d3748;
      margin: 0;
      padding: 0;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
      padding: 40px;
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo img {
      width: 140px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      text-align: center;
      color: #1b2c4a;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      margin-top: 20px;
    }
    .button {
      display: block;
      width: fit-content;
      margin: 30px auto;
      padding: 14px 28px;
      background-color: #00ffff;
      color: #000000;
      font-weight: 600;
      text-decoration: none;
      border-radius: 6px;
      text-align: center;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #a0aec0;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://pub-08c7bb3977a54cde91e7645ef8d364c6.r2.dev/FQ_LOGO.png" alt="FQ Source Logo">
    </div>
    <h1>Welcome to FQ Source</h1>
    <p>Hi there,</p>
    <p>
      Thanks for confirming your email and joining FQ Source — the AI-powered platform for discovering trusted industrial suppliers.
    </p>
    <p>
      You're now ready to explore tailored solutions, evaluate suppliers globally, and launch sourcing projects with confidence.
    </p>
    <p>
      🔍 Use the search bar to describe what you're looking for.<br />
      📄 Let our engine recommend top-fit suppliers in seconds.<br />
      🤝 Connect, evaluate, and request quotations easily.
    </p>
    <a href="https://fqsource.com/app" class="button">Start Exploring</a>
    <p>
      🧩 If you're a supplier, this is your moment to stand out.
      Complete your company profile and showcase your solutions to qualified buyers actively searching for providers like you.
    </p>
    <p>
      You're now part of a growing community of industrial professionals using FQ Source to accelerate procurement, validate options, and stay ahead of market shifts.
    </p>
    <p>
      Got questions? We're here to help. Just reply to this email or visit our <a href="https://fqsource.com/help">Help Center</a>.
    </p>
    <div class="footer">
      © FQ Source · Industrial Supplier Intelligence<br />
      Discover smarter. Decide faster.
    </div>
  </div>
</body>
</html>
      `;

      // Send email using Resend
      const emailResponse = await resend.emails.send({
        from: "FQ Source <no-reply@fqsource.com>",
        to: [email],
        subject: "Welcome to FQ Source - Let's Get Started!",
        html: htmlContent,
      });

      console.log('✅ Onboarding email sent successfully:', emailResponse);

      return new Response(JSON.stringify({
        success: true,
        emailId: emailResponse.data?.id
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }

    // Return success for other event types
    console.log(`ℹ️ Event ${eventType} processed but no email sent`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Event processed'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error: any) {
    console.error('❌ Error processing webhook:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
};

serve(handler);