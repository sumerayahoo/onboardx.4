import { useState, useRef, useEffect } from "react";
import ChatStarCanvas from "./ChatStarCanvas";
import FaceVerification from "./FaceVerification";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "bot";
  content: string;
  isFile?: boolean;
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

type OnboardingStep = "chat" | "awaitingIncome" | "awaitingFace" | "awaitingEmail" | "done";

interface OnboardingState {
  employmentType: string;
  monthlyIncome: number | null;
  documentsVerified: boolean;
  faceVerified: boolean;
  riskResult: RiskResult | null;
  step: OnboardingStep;
  accountNumber: string;
  ifsc: string;
  accountType: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateAccountDetails() {
  const accountNumber = "3" + Math.floor(Math.random() * 90000000000 + 10000000000);
  const ifscCodes = ["ONBX0001234", "ONBX0005678", "ONBX0009012"];
  const ifsc = ifscCodes[Math.floor(Math.random() * ifscCodes.length)];
  return { accountNumber, ifsc };
}

function detectEmployment(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("freelan")) return "freelancer";
  if (t.includes("salar")) return "salaried";
  if (t.includes("business") || t.includes("owner")) return "business";
  if (t.includes("student")) return "student";
  return "";
}

async function callEdgeFunction(body: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/functions/v1/onboardx-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage({ onClose }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(5);
  const [showFaceVerify, setShowFaceVerify] = useState(false);
  const [documentBase64, setDocumentBase64] = useState<string | undefined>();

  const [onboarding, setOnboarding] = useState<OnboardingState>({
    employmentType: "",
    monthlyIncome: null,
    documentsVerified: false,
    faceVerified: false,
    riskResult: null,
    step: "chat",
    accountNumber: "",
    ifsc: "",
    accountType: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatStarted = useRef(false);
  const accountCreated = useRef(false);
  const onboardingRef = useRef(onboarding);

  useEffect(() => { onboardingRef.current = onboarding; }, [onboarding]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!chatStarted.current) {
      chatStarted.current = true;
      streamBot(
        "Greet the user warmly and ask if they are a freelancer, salaried employee, business owner, or student — in one short sentence.",
        []
      );
    }
  }, []);

  // ── Risk Scoring ────────────────────────────────────────────────────────────

  async function runRiskScoring(income: number): Promise<RiskResult | null> {
    const ob = onboardingRef.current;
    try {
      const resp = await callEdgeFunction({
        riskData: {
          monthlyIncome: income,
          employmentType: ob.employmentType || "salaried",
          documentsVerified: ob.documentsVerified,
          faceVerified: ob.faceVerified,
        },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  // ── Finalize account ────────────────────────────────────────────────────────

  function finalizeAccount(currentMessages: Message[]) {
    if (accountCreated.current) return;
    accountCreated.current = true;

    const { accountNumber, ifsc } = generateAccountDetails();
    const ob = onboardingRef.current;

    const accountTypeMap: Record<string, string> = {
      student: "Student Savings Account",
      salaried: "Savings Account",
      freelancer: "Freelancer Current Account",
      business: "Business Current Account",
    };
    const accountType = accountTypeMap[ob.employmentType] || "Savings Account";

    const riskLine = ob.riskResult
      ? `\n🔍 Risk Level: ${ob.riskResult.level} (${(ob.riskResult.probability * 100).toFixed(0)}% default probability)`
      : "";

    const accountMsg: Message = {
      role: "bot",
      isAccountDetails: true,
      content:
        `🎉 Your OnboardX Bank Account is Created!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏦 Account Number: ${accountNumber}\n` +
        `🔢 IFSC Code: ${ifsc}\n` +
        `🏛️  Branch: OnboardX Digital Bank, Mumbai\n` +
        `💼 Account Type: ${accountType}\n` +
        (ob.monthlyIncome ? `💰 Monthly Income: ₹${ob.monthlyIncome.toLocaleString("en-IN")}\n` : "") +
        riskLine +
        `\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Please save these details. Welcome to OnboardX! 🚀`,
    };

    const emailPrompt: Message = {
      role: "bot",
      content: "📧 Would you like to receive these account details on your email? Enter your email address (e.g. yourname@gmail.com) or type 'skip' to finish.",
    };

    setOnboarding((prev) => ({ ...prev, step: "awaitingEmail", accountNumber, ifsc, accountType }));
    setMessages([...currentMessages, accountMsg, emailPrompt]);
    setProgress(95);
  }

  // ── Handle email input ──────────────────────────────────────────────────────

  async function handleEmailInput(text: string, currentMessages: Message[]) {
    if (text.toLowerCase() === "skip") {
      setOnboarding((prev) => ({ ...prev, step: "done" }));
      setMessages([...currentMessages, { role: "bot", content: "✅ No problem! Your account details are shown above. Welcome to OnboardX! 🚀" }]);
      setProgress(100);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(text)) {
      setMessages((prev) => [...prev, { role: "bot", content: "Please enter a valid email (e.g. yourname@gmail.com) or type 'skip'." }]);
      return;
    }

    const ob = onboardingRef.current;
    const sendingMsg: Message = { role: "bot", content: "📤 Sending account details to your email…" };
    setMessages([...currentMessages, sendingMsg]);

    try {
      const resp = await callEdgeFunction({
        sendEmail: {
          to: text,
          accountDetails: {
            accountNumber: ob.accountNumber,
            ifsc: ob.ifsc,
            accountType: ob.accountType,
            monthlyIncome: ob.monthlyIncome ? ob.monthlyIncome.toLocaleString("en-IN") : null,
            riskLevel: ob.riskResult ? `${ob.riskResult.level} (${(ob.riskResult.probability * 100).toFixed(0)}%)` : null,
          },
        },
      });

      const data = await resp.json();

      setMessages((prev) => prev.filter((m) => m.content !== "📤 Sending account details to your email…"));

      if (resp.ok && data.success) {
        setMessages((prev) => [...prev, { role: "bot", content: `✅ Account details sent to ${text}! Check your inbox. Welcome to OnboardX! 🚀` }]);
      } else {
        setMessages((prev) => [...prev, { role: "bot", content: `⚠️ Couldn't send email, but your account details are displayed above. Welcome to OnboardX! 🚀` }]);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.content !== "📤 Sending account details to your email…"));
      setMessages((prev) => [...prev, { role: "bot", content: `⚠️ Email service unavailable, but your account details are shown above. Welcome to OnboardX! 🚀` }]);
    }

    setOnboarding((prev) => ({ ...prev, step: "done" }));
    setProgress(100);
  }

  // ── Stream bot ──────────────────────────────────────────────────────────────

  async function streamBot(
    userText: string,
    history: Message[],
    fileData?: { base64: string; mimeType: string }
  ) {
    setIsLoading(true);

    const apiMessages = [
      ...history.map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: userText },
    ];

    let botReply = "";

    const appendChunk = (chunk: string) => {
      botReply += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "bot" && !last.isFile && !last.isAccountDetails) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: botReply } : m);
        }
        return [...prev, { role: "bot", content: botReply }];
      });
    };

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/onboardx-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, fileData }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        appendChunk(err.error || "Sorry, something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) appendChunk(chunk);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      const lower = botReply.toLowerCase();
      const ob = onboardingRef.current;

      // Detect income request
      if (INCOME_TRIGGER_PHRASES.some((p) => lower.includes(p)) && ob.step === "chat") {
        setOnboarding((prev) => ({ ...prev, step: "awaitingIncome" }));
      }

      // Detect face verify trigger
      if (FACE_TRIGGER_PHRASES.some((p) => lower.includes(p)) && ob.step !== "done") {
        setOnboarding((prev) => ({ ...prev, step: "awaitingFace" }));
        setTimeout(() => setShowFaceVerify(true), 1000);
      }

      setProgress((p) => Math.min(p + 10, 90));
    } catch (e) {
      console.error(e);
      appendChunk("Connection error. Please try again.");
    }

    setIsLoading(false);
  }

  // ── Handle income ───────────────────────────────────────────────────────────

  async function handleIncomeInput(text: string, currentMessages: Message[]) {
    const income = parseFloat(text.replace(/[^0-9.]/g, ""));
    if (!income || income < 500) {
      setMessages((prev) => [...prev, { role: "bot", content: "Please enter a valid monthly income in INR (e.g. 45000)." }]);
      return;
    }

    setOnboarding((prev) => ({ ...prev, monthlyIncome: income, step: "chat" }));
    const isStudent = onboardingRef.current.employmentType === "student";

    if (isStudent) {
      const studentRisk: RiskResult = { probability: 0.65, level: "High", dti: 55, explanation: "Limited credit history. Secured student products recommended." };
      setOnboarding((prev) => ({ ...prev, riskResult: studentRisk }));

      const msg: Message = {
        role: "bot",
        content:
          `🎓 Student Profile Detected\n\n` +
          `🔵 Limited credit history detected. Recommending secured student products.\n\n` +
          `✅ Student Savings Account + Secured Student Card\n` +
          `❌ High-value loans: Not applicable`,
      };
      const newMsgs = [...currentMessages, msg];
      setMessages(newMsgs);
      setProgress((p) => Math.min(p + 10, 90));

      setTimeout(() => {
        streamBot(
          "Student profile and risk noted. Now tell the user face verification is next and the camera will open now.",
          newMsgs
        );
      }, 1000);
      return;
    }

    // Non-student: risk scoring
    const loadingMsg: Message = { role: "bot", content: "⏳ Running risk assessment…" };
    setMessages([...currentMessages, loadingMsg]);

    const riskResult = await runRiskScoring(income);
    setMessages((prev) => prev.filter((m) => m.content !== "⏳ Running risk assessment…"));

    if (riskResult) {
      setOnboarding((prev) => ({ ...prev, riskResult }));
      const emoji = riskResult.level === "Low" ? "🟢" : riskResult.level === "Medium" ? "🟡" : "🔴";
      const riskMsg: Message = {
        role: "bot",
        content:
          `${emoji} Risk Assessment — ${riskResult.level} Risk\n\n` +
          `${riskResult.explanation}\n\n` +
          `Default probability: ${(riskResult.probability * 100).toFixed(0)}% | Estimated DTI: ${riskResult.dti.toFixed(0)}%`,
      };
      const newMsgs = [...currentMessages, riskMsg];
      setMessages(newMsgs);
      setProgress((p) => Math.min(p + 10, 90));

      setTimeout(() => {
        streamBot(
          `Risk scoring done — ${riskResult.level} risk. Now tell the user face verification is next and the camera will open now.`,
          newMsgs
        );
      }, 1000);
    } else {
      setTimeout(() => {
        streamBot(
          "Income noted. Tell the user face verification is next and the camera will open now.",
          currentMessages
        );
      }, 800);
    }
  }

  // ── Face verification result ────────────────────────────────────────────────

  function handleFaceVerified(result: { success: boolean; message: string; capturedImage: string }) {
    setShowFaceVerify(false);
    setOnboarding((prev) => ({ ...prev, faceVerified: result.success }));

    const botMsg: Message = {
      role: "bot",
      content: result.success
        ? "✅ Face verification successful! Creating your account now… 🏦"
        : `❌ ${result.message} Please try the face scan again.`,
    };
    const newMessages = [...messages, botMsg];
    setMessages(newMessages);

    if (result.success) {
      setProgress((p) => Math.min(p + 10, 95));
      setTimeout(() => finalizeAccount(newMessages), 1200);
    } else {
      setOnboarding((prev) => ({ ...prev, step: "awaitingFace" }));
    }
  }

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading || onboarding.step === "done" || onboarding.step === "awaitingFace") return;

    const userMsg: Message = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");

    const emp = detectEmployment(text);
    if (emp && !onboarding.employmentType) {
      setOnboarding((prev) => ({ ...prev, employmentType: emp }));
    }

    if (onboarding.step === "awaitingEmail") {
      await handleEmailInput(text, newHistory);
      return;
    }

    if (onboarding.step === "awaitingIncome") {
      await handleIncomeInput(text, newHistory);
      return;
    }

    streamBot(text, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileMsg: Message = { role: "user", content: `📎 ${file.name}`, isFile: true };
    const newHistory = [...messages, fileMsg];
    setMessages(newHistory);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1];
      const mimeType = file.type;
      setDocumentBase64(base64);
      setOnboarding((prev) => ({ ...prev, documentsVerified: true }));
      setProgress((p) => Math.min(p + 12, 90));
      streamBot(
        `The user uploaded a document: ${file.name}. Extract the name, ID number, and document type. Cross-check with any previously uploaded document.`,
        messages,
        { base64, mimeType }
      );
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived UI ──────────────────────────────────────────────────────────────

  const riskColor =
    onboarding.riskResult?.level === "Low" ? "#22c55e"
    : onboarding.riskResult?.level === "Medium" ? "#eab308"
    : onboarding.riskResult?.level === "High" ? "#ef4444"
    : null;

  const inputPlaceholder =
    onboarding.step === "awaitingEmail" ? "Enter your email (e.g. yourname@gmail.com) or type 'skip'…"
    : onboarding.step === "awaitingIncome" ? "Enter monthly income in ₹ (e.g. 45000)…"
    : onboarding.step === "awaitingFace" ? "Complete face verification — click the camera icon…"
    : onboarding.step === "done" ? "Account created! 🎉"
    : "Type your message…";

  const isInputDisabled = onboarding.step === "done" || onboarding.step === "awaitingFace";

  const ribbonSvg = (
    <svg viewBox="0 0 700 400" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g opacity="0.9">
        {[350, 370, 390, 410, 430, 450, 470, 490, 510, 530, 550, 570].map((y, i) => {
          const colors = ["#cc0000","#cc0000","#dd0000","#dd0000","#ee1111","#ee1111","#ff2222","#ff2222","#ff3333","#ff3333","#ff4444","#ff4444"];
          const widths = [1.5,1.5,1.5,1.5,1.5,1.5,2,2,2,2.5,2.5,2.5];
          return (
            <path key={i}
              d={`M-50 ${y} C100 ${y-50} 200 ${y-250} 400 ${y-270} C550 ${y-285} 650 ${y-200} 750 ${y-300}`}
              stroke={colors[i]} strokeWidth={widths[i]} fill="none"
            />
          );
        })}
      </g>
    </svg>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col overflow-hidden">
      <ChatStarCanvas count={250} />

      <div className="absolute top-0 left-0 w-[55%] opacity-85 z-[1] pointer-events-none">{ribbonSvg}</div>
      <div className="absolute bottom-0 right-0 w-[55%] opacity-85 z-[1] pointer-events-none rotate-180">{ribbonSvg}</div>

      <div className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(circle at center, transparent 40%, black 100%)" }}
      />

      {/* Back */}
      <button onClick={onClose}
        className="absolute top-5 left-6 z-10 bg-transparent border-none text-white text-2xl cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
        ←
      </button>

      {/* Logo */}
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2 text-xl font-black z-10 tracking-wide">
        Onboard<span className="text-[#ff2a2a]" style={{ textShadow: "0 0 10px red" }}>X</span>
      </div>

      {/* Risk badge */}
      {onboarding.riskResult && riskColor && (
        <div className="absolute top-[16px] right-6 z-10 text-xs font-bold px-3 py-1 rounded-full border"
          style={{ color: riskColor, borderColor: riskColor, background: `${riskColor}18` }}>
          {onboarding.employmentType === "student" ? "🎓 Student" : `${onboarding.riskResult.level} Risk`}
        </div>
      )}

      {/* Face verify overlay */}
      {showFaceVerify && (
        <FaceVerification
          documentBase64={documentBase64}
          onVerified={handleFaceVerified}
          onClose={() => {
            setShowFaceVerify(false);
            if (onboardingRef.current.step === "awaitingFace") {
              setOnboarding((prev) => ({ ...prev, step: "chat" }));
            }
          }}
        />
      )}

      {/* Main */}
      <div className="relative z-[5] flex-1 flex flex-col items-center justify-center px-[6%] pt-16 pb-4">

        {/* Progress */}
        <div className="w-full max-w-[780px] mb-4 flex flex-col gap-1">
          <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{
              width: `${progress}%`,
              background: progress === 100 ? "linear-gradient(to right, #16a34a, #22c55e)" : "linear-gradient(to right, #8b0000, #ff2a2a)",
              boxShadow: progress === 100 ? "0 0 8px #22c55e" : "0 0 8px #ff2a2a",
            }} />
          </div>
          <div className="text-[10px] tracking-[2px] text-[#666] text-right">
            {progress === 100 ? "✅ Account Created" : `${progress}% complete`}
          </div>
        </div>

        {/* Messages */}
        <div className="w-full max-w-[780px] flex flex-col gap-4 mb-4 overflow-y-auto pr-1"
          style={{ maxHeight: "55vh", scrollbarWidth: "thin", scrollbarColor: "rgba(255,0,0,0.3) transparent" }}>

          {messages.length === 0 && (
            <p className="text-center text-2xl py-5"
              style={{ fontFamily: "Georgia, serif", textShadow: "0 0 20px rgba(255,255,255,0.4)" }}>
              Do you want to create a bank account?
            </p>
          )}

          {messages.map((msg, i) => (
            <div key={i}
              className="px-5 py-3 rounded-[22px] text-base leading-relaxed max-w-[80%]"
              style={{
                animation: "msgPop 0.3s ease",
                whiteSpace: "pre-wrap",
                ...(msg.isAccountDetails ? {
                  background: "linear-gradient(135deg, rgba(0,80,0,0.85), rgba(0,40,0,0.9))",
                  color: "#86efac",
                  border: "1px solid rgba(34,197,94,0.4)",
                  boxShadow: "0 0 30px rgba(34,197,94,0.2)",
                  alignSelf: "flex-start",
                  fontFamily: "monospace",
                  maxWidth: "90%",
                } : msg.role === "user" ? {
                  background: "rgba(230,230,230,0.92)",
                  color: "#111",
                  borderBottomRightRadius: "5px",
                  alignSelf: "flex-end",
                  marginLeft: "auto",
                } : {
                  background: "rgba(160,0,0,0.8)",
                  color: "white",
                  borderBottomLeftRadius: "5px",
                  alignSelf: "flex-start",
                  boxShadow: "0 0 20px rgba(255,0,0,0.3)",
                }),
              }}>
              {msg.content}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-1 px-5 py-3 rounded-[22px] w-auto"
              style={{ background: "rgba(160,0,0,0.8)", alignSelf: "flex-start", boxShadow: "0 0 20px rgba(255,0,0,0.3)" }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <span key={i} className="w-2 h-2 rounded-full inline-block"
                  style={{ background: "#ff4444", animation: "typingBounce 1s infinite", animationDelay: `${delay}s` }} />
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Step hints */}
        {onboarding.step === "awaitingIncome" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-yellow-400 text-center tracking-wider">
            💰 Enter your monthly income in INR (e.g. 45000)
          </div>
        )}
        {onboarding.step === "awaitingFace" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-blue-400 text-center tracking-wider animate-pulse">
            📸 Click the camera icon to complete face verification
          </div>
        )}
        {onboarding.step === "awaitingEmail" && (
          <div className="w-full max-w-[780px] mb-2 text-xs text-emerald-400 text-center tracking-wider">
            📧 Enter your email to receive account details or type 'skip'
          </div>
        )}

        {/* Input bar */}
        <div className="w-full max-w-[780px] flex items-center rounded-[50px] gap-3"
          style={{
            background: "rgba(30,30,30,0.9)",
            padding: "12px 16px 12px 22px",
            boxShadow: "0 0 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}>

          {/* Upload */}
          <button onClick={() => fileInputRef.current?.click()}
            disabled={onboarding.step === "done"}
            className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full text-[#aaa] text-xl cursor-pointer transition-colors hover:text-white disabled:opacity-30"
            style={{ background: "none", border: "1.5px solid #555" }}
            title="Upload document">
            +
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />

          {/* Text */}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            disabled={isInputDisabled}
            className="flex-1 bg-transparent border-none outline-none text-white text-base tracking-wide placeholder:text-[#555] disabled:opacity-40 disabled:cursor-not-allowed"
          />

          {/* Camera */}
          <button
            onClick={() => setShowFaceVerify(true)}
            disabled={onboarding.step === "done"}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:text-white transition-colors bg-transparent border-none cursor-pointer disabled:opacity-30"
            title="Face Verification"
            style={{
              color: onboarding.step === "awaitingFace" ? "#60a5fa" : "#aaa",
              filter: onboarding.step === "awaitingFace" ? "drop-shadow(0 0 6px #60a5fa)" : "none",
            }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          {/* Send */}
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim() || isInputDisabled}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-110 transition-transform border-none disabled:opacity-30"
            style={{ background: "white", color: "black" }}
            title="Send">
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
