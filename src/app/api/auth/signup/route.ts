import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_AUTH_EMAIL_REDIRECT_URL = "https://www.webresume.tech/login";
const DEFAULT_AUTH_EMAIL_FROM = "WebResume <noreply@webresume.tech>";

type SignupBody = {
  email?: string;
  password?: string;
  fullName?: string;
  dateOfBirth?: string;
  emailRedirectTo?: string;
};

type MailerConfig = {
  resendApiKey: string;
  from: string;
  replyTo: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    return null;
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return null;
  }

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function resolveAuthEmailRedirectUrl(candidate?: string): string {
  const envValue = process.env.NEXT_PUBLIC_AUTH_EMAIL_REDIRECT_URL?.trim();
  const preferred = (candidate ?? "").trim() || envValue || DEFAULT_AUTH_EMAIL_REDIRECT_URL;

  try {
    const parsed = new URL(preferred);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return DEFAULT_AUTH_EMAIL_REDIRECT_URL;
    }
    return parsed.toString();
  } catch {
    return DEFAULT_AUTH_EMAIL_REDIRECT_URL;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSignupEmailTemplate(params: { fullName: string; confirmUrl: string }) {
  const safeName = escapeHtml(params.fullName || "there");
  const safeConfirmUrl = escapeHtml(params.confirmUrl);

  return {
    subject: "Confirm your WebResume account",
    html: `
      <div style="margin:0;padding:0;background:#f5f7fb;font-family:Segoe UI,Arial,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e7ebf4;overflow:hidden;">
                <tr>
                  <td style="padding:22px 26px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#ffffff;">
                    <div style="font-size:20px;font-weight:700;letter-spacing:.2px;">WebResume</div>
                    <div style="margin-top:4px;font-size:12px;opacity:.9;">Official account verification</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px;">
                    <p style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">Hi ${safeName},</p>
                    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.65;color:#334155;">
                      Welcome to WebResume. Please verify your email to activate your account and continue to your dashboard.
                    </p>
                    <a href="${safeConfirmUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Verify Email</a>
                    <p style="margin:18px 0 8px 0;font-size:12px;color:#64748b;line-height:1.6;">
                      If the button does not work, copy and paste this link into your browser:
                    </p>
                    <p style="margin:0;font-size:12px;word-break:break-all;color:#2563eb;">${safeConfirmUrl}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 26px;background:#f8fafc;border-top:1px solid #e7ebf4;font-size:12px;color:#64748b;">
                    This is an automated message from WebResume. If you did not request this, you can safely ignore it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    text: `Hi ${params.fullName || "there"},\n\nWelcome to WebResume. Verify your account using this link:\n${params.confirmUrl}\n\nIf you did not request this, ignore this email.`,
  };
}

function getMailerConfig(): MailerConfig {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is missing on server.");
  }

  return {
    resendApiKey,
    from: process.env.AUTH_EMAIL_FROM?.trim() || DEFAULT_AUTH_EMAIL_FROM,
    replyTo: process.env.AUTH_EMAIL_REPLY_TO?.trim() || null,
  };
}

async function sendVerificationEmail(params: {
  to: string;
  fullName: string;
  confirmUrl: string;
  mailerConfig: MailerConfig;
}) {
  const { resendApiKey, from, replyTo } = params.mailerConfig;
  const template = buildSignupEmailTemplate({
    fullName: params.fullName,
    confirmUrl: params.confirmUrl,
  });

  const payload: Record<string, unknown> = {
    from,
    to: [params.to],
    subject: template.subject,
    html: template.html,
    text: template.text,
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Email provider rejected request: ${message}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignupBody;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (!fullName) {
      return NextResponse.json({ error: "Name is required for signup." }, { status: 400 });
    }

    if (!dateOfBirth) {
      return NextResponse.json({ error: "Date of birth is required for signup." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Signup infra is not configured on server." }, { status: 500 });
    }

    const redirectTo = resolveAuthEmailRedirectUrl(body.emailRedirectTo);

    let mailerConfig: MailerConfig | null = null;
    try {
      mailerConfig = getMailerConfig();
    } catch {
      mailerConfig = null;
    }

    if (!mailerConfig) {
      const publicClient = getPublicClient();
      if (!publicClient) {
        return NextResponse.json({ error: "Signup infra is not configured on server." }, { status: 500 });
      }

      const { error } = await publicClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            name: fullName,
            date_of_birth: dateOfBirth,
          },
        },
      });

      if (error) {
        const message = error.message || "Unable to create account.";
        const isConflict = /already|exists|registered/i.test(message);
        return NextResponse.json({ error: message }, { status: isConflict ? 409 : 400 });
      }

      return NextResponse.json({
        ok: true,
        message: "Account created! Please verify your email, then log in.",
      });
    }

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        data: {
          name: fullName,
          date_of_birth: dateOfBirth,
        },
        redirectTo,
      },
    });

    if (error) {
      const message = error.message || "Unable to create account.";
      const isConflict = /already|exists|registered/i.test(message);
      return NextResponse.json({ error: message }, { status: isConflict ? 409 : 400 });
    }

    const confirmUrl = data?.properties?.action_link;
    if (!confirmUrl) {
      return NextResponse.json({ error: "Unable to create verification link." }, { status: 500 });
    }

    await sendVerificationEmail({
      to: email,
      fullName,
      confirmUrl,
      mailerConfig,
    });

    return NextResponse.json({
      ok: true,
      message: "Account created! Check your inbox for an official WebResume verification email.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to process signup right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}