import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Logistic Regression Risk Scoring ──────────────────────────────────────────
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

interface RiskInputs {
  monthlyIncome: number;       // in INR
  employmentType: string;      // freelancer | salaried | business | student
  age?: number;
  documentsVerified: boolean;
  faceVerified: boolean;
}

interface RiskResult {
  probability: number;         // 0.0 – 1.0
  level: "Low" | "Medium" | "High";
  dti: number;                 // estimated debt-to-income ratio
  explanation: string;
}

function calculateRisk(inputs: RiskInputs): RiskResult {
  // Coefficients (b0 + b1*x1 + ...)
  const b0 = -1.5; // intercept

  // Income factor: higher income → lower risk
  const incomeScore = inputs.monthlyIncome > 80000 ? -1.2
    : inputs.monthlyIncome > 40000 ? -0.5
    : inputs.monthlyIncome > 20000 ? 0.2
    : inputs.monthlyIncome > 10000 ? 0.8
    : 1.5;

  // Employment type factor
  const employmentScore: Record<string, number> = {
    salaried: -0.8,
    business: 0.1,
    freelancer: 0.6,
    student: 1.2,
  };
  const empScore = employmentScore[inputs.employmentType.toLowerCase()] ?? 0.3;

  // Verification bonus
  const verifyScore = (inputs.documentsVerified ? -0.4 : 0.3) + (inputs.faceVerified ? -0.3 : 0.2);

  // Estimated DTI (debt-to-income): simplified — students/freelancers assumed higher
  const dti = inputs.employmentType === "student" ? 55
    : inputs.employmentType === "freelancer" ? 42
    : inputs.employmentType === "business" ? 35
    : Math.max(10, 40 - (inputs.monthlyIncome / 5000));

  const z = b0 + incomeScore + empScore + verifyScore;
  const probability = sigmoid(z);

  const level: RiskResult["level"] = probability < 0.35 ? "Low" : probability < 0.65 ? "Medium" : "High";

  const incomeLabel = inputs.monthlyIncome > 80000 ? "high income"
    : inputs.monthlyIncome > 40000 ? "moderate income"
    : inputs.monthlyIncome > 20000 ? "lower-moderate income"
    : "low income";

  const explanation = `Customer has ${(probability * 100).toFixed(0)}% probability of default due to `
    + `${incomeLabel} (₹${inputs.monthlyIncome.toLocaleString("en-IN")}/mo), `
    + `${inputs.employmentType} employment, and estimated DTI of ${dti.toFixed(0)}%.`
    + (inputs.documentsVerified && inputs.faceVerified ? " Identity fully verified." : " Incomplete verification increases risk.");

  return { probability, level, dti, explanation };
}

// ── AbstractAPI Email Validation ──────────────────────────────────────────────
async function validateEmail(email: string, apiKey: string): Promise<{ valid: boolean; reason: string }> {
  try {
    const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Email validation service error:", res.status, errorText);

      // FIX: Do NOT mark email invalid just because API failed
      return {
        valid: true,
        reason: "Validation service temporarily unavailable. Proceeding.",
      };
    }

    const data = await res.json();
    console.log("Email validation response:", data);

    // ── Handle AbstractAPI v2 format ──
    if (data.email_deliverability) {
      const status = data.email_deliverability.status?.toLowerCase();
      const isFormatValid = data.email_deliverability.is_format_valid === true;

      if (!isFormatValid) {
        return { valid: false, reason: "Invalid email format" };
      }

      if (status === "deliverable" || status === "risky") {
        return { valid: true, reason: "Email is valid" };
      }

      return { valid: false, reason: `Email issue: ${status || "unknown"}` };
    }

    // ── Handle AbstractAPI v1 legacy format ──
    const status = data.deliverability?.toLowerCase();
    const isFormatValid = data.is_valid_format?.value === true;

    if (!isFormatValid) {
      return { valid: false, reason: "Invalid email format" };
    }

    if (status === "deliverable" || status === "risky") {
      return { valid: true, reason: "Email is valid" };
    }

    return { valid: false, reason: `Email issue: ${status || "unknown"}` };

  } catch (error) {
    console.error("Email validation failed:", error);

    // FIX: API crash should NOT block onboarding
    return {
      valid: true,
      reason: "Could not automatically verify email. Please ensure it is correct.",
    };
  }
}

// ── AbstractAPI Phone Validation ───────────────────────────────────────────────
async function validatePhone(phone: string, apiKey: string): Promise<{ valid: boolean; isIndian: boolean; reason: string }> {
  try {
    const url = `https://phonevalidation.abstractapi.com/v1/?api_key=${apiKey}&phone=${encodeURIComponent(phone)}`;
    const res = await fetch(url);
    if (!res.ok) return { valid: false, isIndian: false, reason: "Validation service unavailable" };
    const data = await res.json();
    const isIndian = data.country?.code === "IN";
    const valid = data.valid === true;
    if (!isIndian) return { valid: false, isIndian: false, reason: "Only Indian mobile numbers (+91) are accepted." };
    return { valid, isIndian: true, reason: valid ? "Phone is valid" : "Phone number appears invalid" };
  } catch {
    return { valid: false, isIndian: false, reason: "Could not validate phone" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, fileData, faceVerifyMode, riskData, validateEmailReq, validatePhoneReq } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const EMAIL_API_KEY = Deno.env.get("ABSTRACT_EMAIL_API_KEY") || "";
    const PHONE_API_KEY = Deno.env.get("ABSTRACT_PHONE_API_KEY") || "";

    // ── Email validation endpoint ──────────────────────────────────────────────
    if (validateEmailReq) {
      const result = await validateEmail(validateEmailReq, EMAIL_API_KEY);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Phone validation endpoint ──────────────────────────────────────────────
    if (validatePhoneReq) {
      const result = await validatePhone(validatePhoneReq, PHONE_API_KEY);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Risk scoring endpoint ──────────────────────────────────────────────────
    if (riskData) {
      const result = calculateRisk(riskData);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Face verification mode ─────────────────────────────────────────────────
    if (faceVerifyMode) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "system",
              content: `You are a face verification AI. Analyse:
1. LIVENESS: Is the selfie a live real person (not a photo of a photo, screen, mask, or printed image)?
2. MATCH: If a document image is provided, does the face in the selfie match the face in the document?

Respond ONLY with a raw JSON object (no markdown, no code blocks):
{ "liveness": boolean, "match": boolean | null, "reason": string (max 25 words) }`,
            },
            ...messages,
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Face verify AI error:", response.status, t);
        return new Response(JSON.stringify({ error: "Face verification failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ── Main onboarding chat ───────────────────────────────────────────────────
    const systemPrompt = `You are OnboardX, a friendly AI banking onboarding assistant for Indian users. Help users open a bank account quickly. Guide them in this exact order:

STEP 1 — Ask if they are a freelancer, salaried employee, business owner, or student.
STEP 2 — Ask them to upload their PAN card using the + button.
STEP 3 — Ask them to upload their Aadhaar card. IMPORTANT: Cross-check the name on both documents. If names do not match, immediately say the documents don't match and ask to re-upload. Only continue when names match.
STEP 4 — INCOME:
  • If the user is a STUDENT: DO NOT ask for monthly income. Instead, skip directly to face verification. Students get a Student Savings Account and a Secured Student Card. Never suggest high-value loans for students.
  • For all others: Ask for their monthly income in INR to assess their financial profile.
STEP 5 — Say face verification is next and that the camera will open.
STEP 6 — After face verification succeeds, say you are running risk scoring.
  • For students: Say "Limited credit history detected. Recommending secured student products." instead of a generic risk level.
STEP 7 — Ask for their email address to send account details (tell them it will be validated). The email format must be username@domain.com (e.g. john@gmail.com).
STEP 8 — Ask for their Indian mobile number (+91) to send an SMS confirmation (tell them only Indian numbers are accepted).
STEP 9 — Confirm account creation. Share the account details directly in the chat too (account number, IFSC, branch) in case SMS/email doesn't reach them.

Document handling: When a user uploads a document image, use vision to extract the name, ID number, and document type. Compare across documents if multiple have been uploaded.

Keep replies SHORT (1-3 sentences), warm, professional, use emojis occasionally 🎉. Stay strictly on banking onboarding. Never break character.`;

    const contentArray: unknown[] = [{ type: "text", text: messages[messages.length - 1]?.content || "" }];
    if (fileData && fileData.base64 && fileData.mimeType) {
      contentArray.unshift({
        type: "image_url",
        image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64}` },
      });
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(0, -1),
      { role: "user", content: fileData ? contentArray : messages[messages.length - 1]?.content },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("onboardx-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
