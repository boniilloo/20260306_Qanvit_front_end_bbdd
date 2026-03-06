import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AdminNotificationRequest {
  requestId: string;
  userId: string;
  companyId: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Edge function started');
    console.log('🔑 RESEND_API_KEY exists:', !!Deno.env.get("RESEND_API_KEY"));
    console.log('🔑 SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
    console.log('🔑 SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    const { requestId, userId, companyId, status, rejectionReason }: AdminNotificationRequest = await req.json();

    console.log('📧 Processing admin notification email:', { requestId, userId, companyId, status });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user email directly from auth.users table using service role
    const { data: userInfo, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userInfo.user) {
      console.error('❌ Error getting user info:', userError);
      throw new Error('Could not retrieve user information');
    }

    const userEmail = userInfo.user.email;

    // Get user profile data
    const { data: profileData } = await supabase
      .from('app_user')
      .select('name, surname')
      .eq('auth_user_id', userId)
      .single();

    const userName = profileData?.name || 'User';

    // Get company data
    const { data: companyData } = await supabase
      .from('company_revision')
      .select('nombre_empresa, slug')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    const companyName = companyData?.nombre_empresa || 'the company';
    const companySlug = companyData?.slug;

    console.log('📊 Email data:', { userEmail, userName, companyName, companySlug });

    // Prepare email content based on status
    let subject: string;
    let htmlContent: string;

    if (status === 'approved') {
      subject = `✅ Admin Request Approved - ${companyName}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px;">🎉 Request Approved!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">Hello ${userName},</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              Great news! Your request to become an administrator of <strong>${companyName}</strong> has been <strong style="color: #10b981;">approved</strong>.
            </p>
            <p style="color: #6b7280; line-height: 1.6;">
              You now have full access to manage your company's information on our platform.
            </p>
          </div>

          <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin-top: 0;">What can you do now?</h3>
            <ul style="color: #374151; line-height: 1.6;">
              <li>Update your company information</li>
              <li>Manage products and services</li>
              <li>Respond to potential customer inquiries</li>
              <li>Access analytics and statistics</li>
            </ul>
          </div>

          ${companySlug ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://app.fqsource.com/my-company" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Manage My Company
            </a>
          </div>
          ` : ''}

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            If you have any questions, please don't hesitate to contact us.<br>
            <strong>FQSource Team</strong>
          </p>
        </div>
      `;
    } else {
      subject = `❌ Admin Request Rejected - ${companyName}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px;">📋 Request Rejected</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">Hello ${userName},</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              We regret to inform you that your request to become an administrator of <strong>${companyName}</strong> has been <strong style="color: #ef4444;">rejected</strong>.
            </p>
          </div>

          ${rejectionReason ? `
          <div style="background: #fef3f2; border-left: 4px solid #ef4444; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #991b1b; margin-top: 0;">Reason for rejection:</h3>
            <p style="color: #7f1d1d; line-height: 1.6;">${rejectionReason}</p>
          </div>
          ` : ''}

          <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin-top: 0;">What can you do next?</h3>
            <ul style="color: #374151; line-height: 1.6;">
              <li>Review the required qualifications</li>
              <li>Provide additional documentation if necessary</li>
              <li>Contact our team for more information</li>
              <li>Submit a new request when you meet the requirements</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://app.fqsource.com/contact" 
               style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Contact Support
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            If you have any questions about this decision, please don't hesitate to contact us.<br>
            <strong>FQSource Team</strong>
          </p>
        </div>
      `;
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: "FQSource <no-reply@fqsource.com>",
      to: [userEmail],
      subject: subject,
      html: htmlContent,
    });

    console.log("✅ Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      emailId: emailResponse.data?.id,
      message: `Email sent to ${userEmail}`
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("❌ Error in send-admin-notification function:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);