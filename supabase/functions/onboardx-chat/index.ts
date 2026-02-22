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
  monthlyIncome: number;
  employmentType: string;
  age?: number;
  documentsVerified: boolean;
  faceVerified: boolean;
}

interface RiskResult {
  probability: number;
  level: "Low" | "Medium" | "High";
  dti: number;
  explanation: string;
}

function calculateRisk(inputs: RiskInputs): RiskResult {
  const b0 = -1.5;

  const incomeScore = inputs.monthlyIncome > 80000 ? -1.2
    : inputs.monthlyIncome > 40000 ? -0.5
    : inputs.monthlyIncome > 20000 ? 0.2
    : inputs.monthlyIncome > 10000 ? 0.8
    : 1.5;

  const employmentScore: Record<string, number> = {
    salaried: -0.8,
    business: 0.1,
    freelancer: 0.6,
    student: 1.2,
  };
  const empScore = employmentScore[inputs.employmentType.toLowerCase()] ?? 0.3;

  const verifyScore = (inputs.documentsVerified ? -0.4 : 0.3) + (inputs.faceVerified ? -0.3 : 0.2);

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

// ── PAN format validation ─────────────────────────────────────────────────────
function validatePANFormat(pan: string): { valid: boolean; reason: string } {
  const panRegex = /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/;
  if (!panRegex.test(pan.toUpperCase())) {
    return { valid: false, reason: `PAN "${pan}" has invalid format. Must be ABCDE1234F (5 letters, 4 digits, 1 letter). 4th letter must indicate holder type (P=Individual, C=Company, etc).` };
  }
  return { valid: true, reason: "PAN format is valid." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, fileData, faceVerifyMode, riskData, documentVerifyMode } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── Risk scoring endpoint ──────────────────────────────────────────────────
    if (riskData) {
      const result = calculateRisk(riskData);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Document verification mode ─────────────────────────────────────────────
    if (documentVerifyMode) {
      const { imageBase64, mimeType, qrData, documentType } = documentVerifyMode;

      // PAN format check if PAN number extracted
      let panCheck: { valid: boolean; reason: string } | null = null;
      if (documentVerifyMode.panNumber) {
        panCheck = validatePANFormat(documentVerifyMode.panNumber);
      }

      const verifyPrompt = `You are a KYC document forensic analyst. Analyze the uploaded ${documentType || "identity document"} image for authenticity.

Perform ALL these checks:

1. **DOCUMENT TYPE DETECTION**: Identify if this is a PAN card, Aadhaar card, or other document.

2. **IMAGE TAMPERING DETECTION**:
   - Check for signs of digital editing (inconsistent fonts, misaligned text, color anomalies, blurred edges around text/photo)
   - Check if the photo appears digitally pasted or manipulated
   - Check for pixelation or resolution inconsistencies between areas
   - Check for copy-paste artifacts or cloning marks

3. **FORMAT & LAYOUT VALIDATION**:
   - For PAN: Verify correct NSDL/UTI layout, Income Tax Department logo, hologram area, correct font
   - For Aadhaar: Verify UIDAI logo, correct layout, emblem of India, proper formatting
   - Check print quality indicators (professional vs home-printed)

4. **PHYSICAL SECURITY FEATURES** (visible in image):
   - Micro text presence/absence
   - Holographic elements (if visible)
   - Ghost image (for Aadhaar)
   - Proper embossing indicators
   - Issue/print date formatting

5. **DATA CONSISTENCY**:
   - Does the name format match standard government document formatting?
   - Are dates in correct format?
   - Is the ID number format valid?
${panCheck ? `\n6. **PAN FORMAT CHECK**: ${panCheck.reason}` : ""}
${qrData ? `\n7. **QR CODE DATA**: The following data was extracted from the QR code on the document: "${qrData}". Verify if this data is consistent with the visible document details. If the QR data contains demographic info, cross-check name/DOB/address against the printed text.` : ""}

Respond ONLY with a raw JSON object (no markdown, no code blocks):
{
  "documentType": "PAN" | "Aadhaar" | "Unknown",
  "isAuthentic": boolean,
  "confidenceScore": number (0-100),
  "tamperedAreas": string[] (list of suspicious areas, empty if none),
  "formatValid": boolean,
  "securityFeatures": { "detected": string[], "missing": string[] },
  "extractedData": { "name": string | null, "idNumber": string | null, "dob": string | null, "gender": string | null },
  "qrConsistent": boolean | null (null if no QR data provided),
  "riskFlags": string[] (list of red flags),
  "overallVerdict": "GENUINE" | "SUSPICIOUS" | "LIKELY_FAKE",
  "reason": string (max 50 words summarizing the analysis)
}`;

      const verifyMessages = [
        { role: "system", content: verifyPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this ${documentType || "document"} for authenticity.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ];

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: verifyMessages,
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Document verify error:", response.status, t);
        return new Response(JSON.stringify({ error: "Document verification failed" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || "";

      // Try to parse as JSON
      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      return new Response(JSON.stringify({ verification: parsed, raw: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Send account details via email ────────────────────────────────────────
    const { sendEmail } = body;
    if (sendEmail) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        return new Response(JSON.stringify({ error: "Email service not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { to, accountDetails } = sendEmail;
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #8b0000, #cc0000); padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; letter-spacing: 2px;">Onboard<span style="color: #ff6666;">X</span></h1>
            <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Your Digital Banking Partner</p>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #22c55e; margin-top: 0;">🎉 Account Created Successfully!</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; color: #999; border-bottom: 1px solid #222;">Account Number</td><td style="padding: 10px; color: #fff; font-weight: bold; border-bottom: 1px solid #222;">${accountDetails.accountNumber}</td></tr>
              <tr><td style="padding: 10px; color: #999; border-bottom: 1px solid #222;">IFSC Code</td><td style="padding: 10px; color: #fff; font-weight: bold; border-bottom: 1px solid #222;">${accountDetails.ifsc}</td></tr>
              <tr><td style="padding: 10px; color: #999; border-bottom: 1px solid #222;">Branch</td><td style="padding: 10px; color: #fff; border-bottom: 1px solid #222;">OnboardX Digital Branch, Mumbai</td></tr>
              <tr><td style="padding: 10px; color: #999; border-bottom: 1px solid #222;">Account Type</td><td style="padding: 10px; color: #fff; border-bottom: 1px solid #222;">${accountDetails.accountType}</td></tr>
              ${accountDetails.monthlyIncome ? `<tr><td style="padding: 10px; color: #999; border-bottom: 1px solid #222;">Monthly Income</td><td style="padding: 10px; color: #fff; border-bottom: 1px solid #222;">₹${accountDetails.monthlyIncome}</td></tr>` : ""}
              ${accountDetails.riskLevel ? `<tr><td style="padding: 10px; color: #999;">Risk Level</td><td style="padding: 10px; color: #fff;">${accountDetails.riskLevel}</td></tr>` : ""}
            </table>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">This is an automated email from OnboardX. Please save these details for your records.</p>
          </div>
        </div>`;

      try {
        const emailResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "OnboardX <onboarding@resend.dev>",
            to: [to],
            subject: "🎉 Your OnboardX Bank Account Details",
            html: htmlBody,
          }),
        });

        if (!emailResp.ok) {
          const errText = await emailResp.text();
          console.error("Resend error:", emailResp.status, errText);
          return new Response(JSON.stringify({ success: false, error: "Failed to send email" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Email send error:", err);
        return new Response(JSON.stringify({ success: false, error: "Email service error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
  • If the user is a STUDENT: DO NOT ask for monthly income. Skip directly to face verification. Students get a Student Savings Account and a Secured Student Card. Never suggest high-value loans for students.
  • For all others: Ask for their monthly income in INR to assess their financial profile.
STEP 5 — Say face verification is next and that the camera will open.
STEP 6 — After face verification succeeds, say you are running risk scoring.
  • For students: Say "Limited credit history detected. Recommending secured student products." instead of a generic risk level.
STEP 7 — Onboarding is complete! Generate and display the account details directly in the chat in this exact format:

🎉 Welcome to OnboardX! Your account has been created successfully.

📋 Account Details:
• Account Number: [generate a random 12-digit number]
• IFSC Code: ONBX0001234
• Branch: OnboardX Digital Branch, Mumbai
• Account Type: [based on employment type — e.g. Savings Account, Current Account, Student Savings Account]
• Account Holder: [use name from documents]

DOCUMENT VERIFICATION CONTEXT: When document verification results are provided, incorporate the findings:
- If verdict is "GENUINE": Acknowledge documents are verified.
- If verdict is "SUSPICIOUS": Warn the user about suspicious elements and ask them to re-upload a clearer/original document.
- If verdict is "LIKELY_FAKE": Reject the document and explain why. Ask user to upload a genuine document.
- Always mention if QR code verification passed or failed for Aadhaar.
- Always mention if PAN format validation passed or failed.

Keep replies SHORT (1-3 sentences), warm, professional, use emojis occasionally 🎉. Stay strictly on banking onboarding. Never break character. Do NOT ask for email or phone number at any point.`;

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
