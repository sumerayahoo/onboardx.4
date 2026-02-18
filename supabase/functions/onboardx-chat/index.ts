import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, fileData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are OnboardX, a friendly AI banking onboarding assistant. Help users open a bank account in under 3 minutes. Guide them step by step:
1) Ask if they are freelancer/salaried/business/student
2) Ask to upload PAN card via the + button
3) Ask to upload Aadhaar
4) Mention face verification is next
5) Mention risk scoring
6) Confirm account creation

When a user uploads a document, acknowledge it warmly, pretend to verify it, and give positive feedback if it looks like a valid document. Extract mock details like name and PAN number.

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
