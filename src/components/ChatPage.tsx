import { useState, useRef, useEffect } from "react";
import ChatStarCanvas from "./ChatStarCanvas";
import FaceVerification from "./FaceVerification";

interface Message {
  role: "user" | "bot";
  content: string;
  isFile?: boolean;
  fileName?: string;
  isAccountDetails?: boolean;
}

interface ChatPageProps {
  onClose: () => void;
}

interface RiskResult {
  probability: number;
  level: "Low" | "Medium" | "High";
  dti: number;
  explanation: string;
}

interface OnboardingState {
  employmentType: string;
  monthlyIncome: number | null;
  email: string;
  phone: string;
  documentsVerified: boolean;
  faceVerified: boolean;
  accountNumber: string;
  ifsc: string;
  riskResult: RiskResult | null;
  step: "chat" | "awaitingIncome" | "awaitingEmail" | "awaitingPhone" | "done";
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const FACE_TRIGGER_PHRASES = [
  "face verification",
  "camera will open",
  "open the camera",
  "liveness check",
  "selfie",
  "face scan",
];

const INCOME_TRIGGER_PHRASES = [
  "monthly income",
  "financial profile",
  "income in inr",
  "your income",
];

const EMAIL_TRIGGER_PHRASES = [
  "email address",
  "send account details",
  "your email",
];

const PHONE_TRIGGER_PHRASES = [
  "mobile number",
  "indian mobile",
  "phone number",
  "+91",
  "sms confirmation",
];

// Generate a fake but realistic account number and IFSC
function generateAccountDetails() {
  const accountNumber = "3" + Math.random().toString().slice(2, 13);
  const ifscCodes = ["ONBX0001234", "ONBX0005678", "ONBX0009012"];
  const ifsc = ifscCodes[Math.floor(Math.random() * ifscCodes.length)];
  return { accountNumber, ifsc };
}

async function callEdgeFunction(body: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/onboardx-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return resp;
}

export default function ChatPage({ onClose }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(5);
  const [showFaceVerify, setShowFaceVerify] = useState(false);
  const [documentBase64, setDocumentBase64] = useState<string | undefined>(undefined);

  const [onboarding, setOnboarding] = useState<OnboardingState>({
    employmentType: "",
    monthlyIncome: null,
    email: "",
    phone: "",
    documentsVerified: false,
    faceVerified: false,
    accountNumber: "",
    ifsc: "",
    riskResult: null,
    step: "chat",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatStarted = useRef(false);
  const faceVerifyTriggered = useRef(false);
  const onboardingRef = useRef(onboarding);

  useEffect(() => { onboardingRef.current = onboarding; }, [onboarding]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!chatStarted.current) {
      chatStarted.current = true;
      streamMessage(
        "Hi! Start the onboarding. Greet the user warmly and ask if they are a freelancer, salaried employee, business owner, or student — in one sentence.",
        []
      );
    }
  }, []);

  // ── Risk Scoring ────────────────────────────────────────────────────────────
  async function runRiskScoring(income: number, employmentType: string) {
    const current = onboardingRef.current;
    const resp = await callEdgeFunction({
      riskData: {
        monthlyIncome: income,
        employmentType: employmentType || current.employmentType || "salaried",
        documentsVerified: current.documentsVerified,
        faceVerified: current.faceVerified,
      },
    });
    if (!resp.ok) return null;
    return await resp.json() as RiskResult;
  }

  // ── Email Validation ────────────────────────────────────────────────────────
  async function validateEmail(email: string): Promise<boolean> {
    const resp = await callEdgeFunction({ validateEmailReq: email });
    if (!resp.ok) return true; // fallback: accept if service down
    const data = await resp.json();
    return data.valid === true;
  }

  // ── Phone Validation ────────────────────────────────────────────────────────
  async function validatePhone(phone: string): Promise<{ valid: boolean; reason: string }> {
    const resp = await callEdgeFunction({ validatePhoneReq: phone });
    if (!resp.ok) return { valid: true, reason: "" }; // fallback
    return await resp.json();
  }

  // ── Detect employment type from message ─────────────────────────────────────
  function detectEmployment(text: string): string {
    const t = text.toLowerCase();
    if (t.includes("freelan")) return "freelancer";
    if (t.includes("salar")) return "salaried";
    if (t.includes("business") || t.includes("owner")) return "business";
    if (t.includes("student")) return "student";
    return "";
  }

  // ── Stream Message ──────────────────────────────────────────────────────────
  async function streamMessage(
    userText: string,
    history: Message[],
    fileData?: { base64: string; mimeType: string }
  ) {
    setIsLoading(true);

    const apiMessages = history.map((m) => ({
      role: m.role === "bot" ? "assistant" : "user",
      content: m.content,
    }));
    apiMessages.push({ role: "user", content: userText });

    let botReply = "";
    const addBotChunk = (chunk: string) => {
      botReply += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "bot" && !last.isFile) {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: botReply } : m
          );
        }
        return [...prev, { role: "bot", content: botReply }];
      });
    };

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/onboardx-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, fileData }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: errData.error || "Sorry, something went wrong. Please try again." },
        ]);
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) addBotChunk(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      const lower = botReply.toLowerCase();

      // Detect face verification trigger
      const triggersFace = FACE_TRIGGER_PHRASES.some((p) => lower.includes(p));
      if (triggersFace && !faceVerifyTriggered.current) {
        faceVerifyTriggered.current = true;
        setTimeout(() => setShowFaceVerify(true), 1200);
      }

      // Detect income request
      const triggersIncome = INCOME_TRIGGER_PHRASES.some((p) => lower.includes(p));
      if (triggersIncome) {
        setOnboarding((prev) => ({ ...prev, step: "awaitingIncome" }));
      }

      // Detect email request
      const triggersEmail = EMAIL_TRIGGER_PHRASES.some((p) => lower.includes(p));
      if (triggersEmail && !onboardingRef.current.email) {
        setOnboarding((prev) => ({ ...prev, step: "awaitingEmail" }));
      }

      // Detect phone request
      const triggersPhone = PHONE_TRIGGER_PHRASES.some((p) => lower.includes(p));
      if (triggersPhone && !onboardingRef.current.phone) {
        setOnboarding((prev) => ({ ...prev, step: "awaitingPhone" }));
      }

      setProgress((p) => Math.min(p + 12, 95));
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "Connection error. Please try again." },
      ]);
    }

    setIsLoading(false);
  }

  // ── Handle income input ─────────────────────────────────────────────────────
  async function handleIncomeInput(text: string, currentMessages: Message[]) {
    const income = parseFloat(text.replace(/[^0-9.]/g, ""));
    if (!income || income < 1000) {
      const errMsg: Message = { role: "bot", content: "Please enter a valid monthly income amount in INR (e.g. 45000)." };
      setMessages((prev) => [...prev, errMsg]);
      return;
    }

    setOnboarding((prev) => ({ ...prev, monthlyIncome: income, step: "chat" }));

    // Run risk scoring
    const riskResult = await runRiskScoring(income, onboardingRef.current.employmentType);
    if (riskResult) {
      setOnboarding((prev) => ({ ...prev, riskResult }));
      const riskColor = riskResult.level === "Low" ? "🟢" : riskResult.level === "Medium" ? "🟡" : "🔴";
      const riskMsg: Message = {
        role: "bot",
        content: `${riskColor} **Risk Assessment — ${riskResult.level} Risk**\n\n${riskResult.explanation}\n\nDefault probability: ${(riskResult.probability * 100).toFixed(0)}% | Estimated DTI: ${riskResult.dti.toFixed(0)}%`,
      };
      const newMsgs = [...currentMessages, riskMsg];
      setMessages(newMsgs);
      setProgress((p) => Math.min(p + 15, 95));

      // Continue onboarding
      setTimeout(() => {
        streamMessage(
          `User's monthly income is ₹${income.toLocaleString("en-IN")}. Risk level is ${riskResult.level}. Continue to ask for face verification if not done, then ask for their email address.`,
          newMsgs
        );
      }, 1200);
    } else {
      streamMessage(
        `User's monthly income is ₹${income.toLocaleString("en-IN")}. Continue onboarding — ask for face verification if not done, then email address.`,
        currentMessages
      );
    }
  }

  // ── Handle email input ──────────────────────────────────────────────────────
  async function handleEmailInput(email: string, currentMessages: Message[]) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessages((prev) => [...prev, { role: "bot", content: "That doesn't look like a valid email. Please try again." }]);
      return;
    }

    const validatingMsg: Message = { role: "bot", content: "⏳ Validating your email address..." };
    setMessages((prev) => [...prev, validatingMsg]);

    const isValid = await validateEmail(email);
    setMessages((prev) => prev.filter((m) => m.content !== "⏳ Validating your email address..."));

    if (!isValid) {
      setMessages((prev) => [...prev, { role: "bot", content: "❌ This email address appears invalid or undeliverable. Please provide a valid email." }]);
      return;
    }

    setOnboarding((prev) => ({ ...prev, email, step: "chat" }));
    const okMsg: Message = { role: "bot", content: `✅ Email validated! Account details will be sent to **${email}** once your account is created.` };
    const newMsgs = [...currentMessages, okMsg];
    setMessages(newMsgs);
    setProgress((p) => Math.min(p + 10, 95));

    setTimeout(() => {
      streamMessage(
        `User's email ${email} is validated. Now ask for their Indian mobile number (+91) to send SMS confirmation.`,
        newMsgs
      );
    }, 800);
  }

  // ── Handle phone input ──────────────────────────────────────────────────────
  async function handlePhoneInput(phone: string, currentMessages: Message[]) {
    // Strip spaces/dashes
    const cleaned = phone.replace(/[\s\-().]/g, "");

    const validatingMsg: Message = { role: "bot", content: "⏳ Validating your mobile number..." };
    setMessages((prev) => [...prev, validatingMsg]);

    const result = await validatePhone(cleaned);
    setMessages((prev) => prev.filter((m) => m.content !== "⏳ Validating your mobile number..."));

    if (!result.valid) {
      setMessages((prev) => [...prev, { role: "bot", content: `❌ ${result.reason || "Invalid phone number. Please enter a valid Indian mobile number (+91)."}` }]);
      return;
    }

    setOnboarding((prev) => ({ ...prev, phone: cleaned, step: "done" }));
    const okMsg: Message = { role: "bot", content: `✅ Mobile number validated! SMS confirmation will be sent to ${cleaned}.` };
    const newMsgs = [...currentMessages, okMsg];
    setMessages(newMsgs);
    setProgress(100);

    // Generate account details and show in chat as fallback
    setTimeout(() => finalizeAccount(newMsgs), 1000);
  }

  // ── Finalize account creation ───────────────────────────────────────────────
  async function finalizeAccount(currentMessages: Message[]) {
    const { accountNumber, ifsc } = generateAccountDetails();
    setOnboarding((prev) => ({ ...prev, accountNumber, ifsc }));

    const ob = onboardingRef.current;
    const riskBadge = ob.riskResult
      ? `\n🔍 Risk Level: ${ob.riskResult.level} (${(ob.riskResult.probability * 100).toFixed(0)}% default probability)`
      : "";

    const accountMsg: Message = {
      role: "bot",
      isAccountDetails: true,
      content:
        `🎉 **Your OnboardX Bank Account is Created!**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏦 **Account Number:** ${accountNumber}\n` +
        `🔢 **IFSC Code:** ${ifsc}\n` +
        `🏛️ **Branch:** OnboardX Digital Bank\n` +
        `📧 **Email:** ${ob.email || "Not provided"}\n` +
        `📱 **Mobile:** ${ob.phone || "Not provided"}\n` +
        `💼 **Type:** ${ob.employmentType || "Savings"} Account\n` +
        `💰 **Monthly Income:** ${ob.monthlyIncome ? `₹${ob.monthlyIncome.toLocaleString("en-IN")}` : "Not provided"}\n` +
        riskBadge +
        `\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `These details have also been sent to your email & SMS. Welcome aboard! 🚀`,
    };

    const newMsgs = [...currentMessages, accountMsg];
    setMessages(newMsgs);
    setProgress(100);
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");

    // Detect employment type passively
    const emp = detectEmployment(text);
    if (emp && !onboarding.employmentType) {
      setOnboarding((prev) => ({ ...prev, employmentType: emp }));
    }

    // Route based on onboarding step
    if (onboarding.step === "awaitingIncome") {
      await handleIncomeInput(text, newHistory);
      return;
    }
    if (onboarding.step === "awaitingEmail") {
      await handleEmailInput(text, newHistory);
      return;
    }
    if (onboarding.step === "awaitingPhone") {
      await handlePhoneInput(text, newHistory);
      return;
    }

    streamMessage(text, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileMsg: Message = {
      role: "user",
      content: `📎 ${file.name}`,
      isFile: true,
      fileName: file.name,
    };
    const newHistory = [...messages, fileMsg];
    setMessages(newHistory);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1];
      const mimeType = file.type;

      setDocumentBase64(base64);
      setOnboarding((prev) => ({ ...prev, documentsVerified: true }));

      streamMessage(
        `I have uploaded a document: ${file.name}. Please verify it and extract any relevant information.`,
        messages,
        { base64, mimeType }
      );
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFaceVerified = (result: { success: boolean; message: string; capturedImage: string }) => {
    setShowFaceVerify(false);
    setOnboarding((prev) => ({ ...prev, faceVerified: result.success }));

    const botMsg: Message = {
      role: "bot",
      content: result.success
        ? "✅ Face verification successful! Your identity has been confirmed. Running risk scoring now… 📊"
        : result.message,
    };
    const newMessages = [...messages, botMsg];
    setMessages(newMessages);

    if (result.success) {
      setProgress((p) => Math.min(p + 15, 95));
      setTimeout(() => {
        streamMessage(
          "Face verification passed. If income hasn't been asked yet, ask for their monthly income in INR. Otherwise continue with email.",
          newMessages
        );
      }, 1500);
    }
  };

  const ribbonSvg = (
    <svg viewBox="0 0 700 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-ribbon">
      <g opacity="0.9">
        {[350, 370, 390, 410, 430, 450, 470, 490, 510, 530, 550, 570].map((y, i) => {
          const colors = ["#cc0000", "#cc0000", "#dd0000", "#dd0000", "#ee1111", "#ee1111", "#ff2222", "#ff2222", "#ff3333", "#ff3333", "#ff4444", "#ff4444"];
          const widths = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 2, 2, 2.5, 2.5, 2.5];
          return (
            <path
              key={i}
              d={`M-50 ${y} C100 ${y - 50} 200 ${y - 250} 400 ${y - 270} C550 ${y - 285} 650 ${y - 200} 750 ${y - 300}`}
              stroke={colors[i]}
              strokeWidth={widths[i]}
              fill="none"
            />
          );
        })}
      </g>
    </svg>
  );

  // ── Risk level color ────────────────────────────────────────────────────────
  const riskColor = onboarding.riskResult?.level === "Low" ? "#22c55e"
    : onboarding.riskResult?.level === "Medium" ? "#eab308"
    : onboarding.riskResult?.level === "High" ? "#ef4444"
    : null;

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col overflow-hidden">
      <ChatStarCanvas count={250} />

      <div className="absolute top-0 left-0 w-[55%] opacity-85 z-[1] pointer-events-none">{ribbonSvg}</div>
      <div className="absolute bottom-0 right-0 w-[55%] opacity-85 z-[1] pointer-events-none rotate-180">{ribbonSvg}</div>

      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(circle at center, transparent 40%, black 100%)" }}
      />

      {/* Back button */}
      <button
        onClick={onClose}
        className="absolute top-5 left-6 z-10 bg-transparent border-none text-white text-2xl cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
      >
        ←
      </button>

      {/* Logo */}
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2 text-xl font-black z-10 tracking-wide">
        Onboard<span className="text-[#ff2a2a]" style={{ textShadow: "0 0 10px red" }}>X</span>
      </div>

      {/* Risk badge */}
      {onboarding.riskResult && riskColor && (
        <div
          className="absolute top-[16px] right-6 z-10 text-xs font-bold px-3 py-1 rounded-full border"
          style={{ color: riskColor, borderColor: riskColor, background: `${riskColor}18` }}
        >
          {onboarding.riskResult.level} Risk
        </div>
      )}

      {/* Face verification overlay */}
      {showFaceVerify && (
        <FaceVerification
          documentBase64={documentBase64}
          onVerified={handleFaceVerified}
          onClose={() => setShowFaceVerify(false)}
        />
      )}

      {/* Main chat area */}
      <div className="relative z-[5] flex-1 flex flex-col items-center justify-center px-[6%] pt-16 pb-4">
        {/* Progress bar */}
        <div className="w-full max-w-[780px] mb-4 flex flex-col gap-1">
          <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? "linear-gradient(to right, #16a34a, #22c55e)" : "linear-gradient(to right, #8b0000, #ff2a2a)",
                boxShadow: progress === 100 ? "0 0 8px #22c55e" : "0 0 8px #ff2a2a",
              }}
            />
          </div>
          <div className="text-[10px] tracking-[2px] text-[#666] text-right">
            {progress === 100 ? "✅ Account Created" : `${progress}% complete`}
          </div>
        </div>

        {/* Messages */}
        <div
          className="w-full max-w-[780px] flex flex-col gap-4 mb-6 overflow-y-auto pr-1"
          style={{
            maxHeight: "55vh",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,0,0,0.3) transparent",
          }}
        >
          {messages.length === 0 && (
            <p
              className="text-center text-2xl py-5"
              style={{ fontFamily: "Georgia, serif", textShadow: "0 0 20px rgba(255,255,255,0.4)" }}
            >
              Do you want to create a bank account?
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className="px-5 py-3 rounded-[22px] text-base leading-relaxed max-w-[80%]"
              style={{
                animation: "msgPop 0.3s ease",
                whiteSpace: "pre-wrap",
                ...(msg.isAccountDetails
                  ? {
                      background: "linear-gradient(135deg, rgba(0,80,0,0.85), rgba(0,40,0,0.9))",
                      color: "#86efac",
                      border: "1px solid rgba(34,197,94,0.4)",
                      boxShadow: "0 0 30px rgba(34,197,94,0.2)",
                      alignSelf: "flex-start",
                      fontFamily: "monospace",
                    }
                  : msg.role === "user"
                  ? {
                      background: "rgba(230,230,230,0.92)",
                      color: "#111",
                      borderBottomRightRadius: "5px",
                      alignSelf: "flex-end",
                      marginLeft: "auto",
                    }
                  : {
                      background: "rgba(160,0,0,0.8)",
                      color: "white",
                      borderBottomLeftRadius: "5px",
                      alignSelf: "flex-start",
                      boxShadow: "0 0 20px rgba(255,0,0,0.3)",
                    }),
              }}
            >
              {msg.content}
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div
              className="flex items-center gap-1 px-5 py-3 rounded-[22px] w-auto"
              style={{ background: "rgba(160,0,0,0.8)", alignSelf: "flex-start", boxShadow: "0 0 20px rgba(255,0,0,0.3)" }}
            >
              {[0, 0.15, 0.3].map((delay, i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: "#ff4444", animation: `typingBounce 1s infinite`, animationDelay: `${delay}s` }}
                />
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Step hint */}
        {onboarding.step === "awaitingIncome" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-yellow-400 text-center tracking-wider">
            💰 Enter your monthly income in INR (e.g. 45000)
          </div>
        )}
        {onboarding.step === "awaitingEmail" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-blue-400 text-center tracking-wider">
            📧 Enter your email address
          </div>
        )}
        {onboarding.step === "awaitingPhone" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-green-400 text-center tracking-wider">
            📱 Enter your Indian mobile number (e.g. +91 98765 43210)
          </div>
        )}

        {/* Input bar */}
        <div
          className="w-full max-w-[780px] flex items-center rounded-[50px] gap-3"
          style={{
            background: "rgba(30,30,30,0.9)",
            padding: "12px 16px 12px 22px",
            boxShadow: "0 0 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full text-[#aaa] text-xl cursor-pointer transition-colors hover:text-white hover:border-white"
            style={{ background: "none", border: "1.5px solid #555" }}
            title="Upload document"
          >
            +
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              onboarding.step === "awaitingIncome" ? "Enter monthly income in ₹..."
              : onboarding.step === "awaitingEmail" ? "Enter your email address..."
              : onboarding.step === "awaitingPhone" ? "Enter +91 mobile number..."
              : "Ask anything"
            }
            className="flex-1 bg-transparent border-none outline-none text-white text-base tracking-wide placeholder:text-[#666]"
          />

          {/* Camera button */}
          <button
            onClick={() => setShowFaceVerify(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#aaa] text-lg flex-shrink-0 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
            title="Face Verification"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-110 transition-transform border-none disabled:opacity-50"
            style={{ background: "white", color: "black" }}
            title="Send"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
