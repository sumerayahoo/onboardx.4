import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, fileData, faceVerifyMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Face verification mode: pass messages directly to vision model
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
              content: "You are a face verification AI. Analyze images for liveness detection and face matching. Always respond ONLY with a raw JSON object (no markdown, no code blocks) with keys: liveness (boolean), match (boolean or null if no document provided), reason (string, max 20 words).",
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

    const systemPrompt = `You are OnboardX, a friendly AI banking onboarding assistant. Help users open a bank account in under 3 minutes. Guide them step by step:
1) Ask if they are freelancer/salaried/business/student
2) Ask to upload PAN card via the + button
3) Ask to upload Aadhaar — IMPORTANT: When both PAN and Aadhaar have been uploaded, cross-check the name on both documents. If the names do not match, immediately say the documents don't match and ask to re-upload. Only continue if names match.
4) After documents verified, say face verification is next and that the camera will open
5) After face verification succeeds, mention risk scoring
6) Confirm account creation

When a user uploads a document image, use vision to extract the name, ID number, and document type. Compare across documents if multiple have been uploaded.

Keep replies SHORT (1-3 sentences), warm, professional, use emojis occasionally. Stay strictly on banking onboarding topic. Never break character.`;

    const contentArray: any[] = [{ type: "text", text: messages[messages.length - 1]?.content || "" }];

    // If file data is included, add it as image
    if (fileData && fileData.base64 && fileData.mimeType) {
      contentArray.unshift({
        type: "image_url",
        image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64}` }
      });
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(0, -1),
      { role: "user", content: fileData ? contentArray : messages[messages.length - 1]?.content }
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
