import { useState } from "react";
import StarCanvas from "../components/StarCanvas";
import IntroOverlay from "../components/IntroOverlay";
import ChatPage from "../components/ChatPage";
import { useInView } from "../hooks/useInView";
import { useTypewriter } from "../hooks/useTypewriter";

const agentCards = [
  { title: "CONVERSATIONAL AGENT", desc: "Guides users through onboarding via natural language chat." },
  { title: "DOCUMENT AGENT", desc: "OCR extraction & validation of PAN, Aadhaar, and more." },
  { title: "FACE VERIFICATION AGENT", desc: "Liveness detection, face matching & anti-spoofing." },
  { title: "RISK SCORING AGENT", desc: "ML-driven risk assessment using Random Forest models." },
  { title: "COMPLIANCE AGENT", desc: "PEP, sanctions, adverse media screening in real-time." },
  { title: "WHATSAPP AGENT", desc: "Seamless onboarding via WhatsApp Business API." },
];

const processSteps = [
  { num: 1, title: "START CHAT", desc: "USER INITIATES VIA WEB OR WHATSAPP", dir: "right" },
  { num: 2, title: "UPLOAD DOCS", desc: "PAN & AADHAAR VERIFIED VIA OCR", dir: "left" },
  { num: 3, title: "FACE VERIFY", desc: "LIVENESS DETECTION + FACE MATCH", dir: "right" },
  { num: 4, title: "RISK SCORE", desc: "ML MODEL ASSESSES RISK LEVEL", dir: "left" },
  { num: 5, title: "ACCOUNT CREATED", desc: "INSTANT VIA CORE BANKING API", dir: "right" },
];

const securityCards = [
  {
    title: "AES-256 ENCRYPTION",
    desc: "ALL DATA ENCRYPTED AT REST AND IN TRANSIT",
    icon: (
      <svg viewBox="0 0 60 70" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <rect x="8" y="30" width="44" height="34" rx="6" stroke="cyan" strokeWidth="3.5" />
        <path d="M18 30V20a12 12 0 0 1 24 0v10" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="30" cy="47" r="5" stroke="cyan" strokeWidth="3" />
        <line x1="30" y1="52" x2="30" y2="58" stroke="cyan" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "JWT + OAUTH 2.0",
    desc: "SECURE TOKEN-BASED AUTHENTICATION",
    icon: (
      <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <circle cx="30" cy="22" r="16" stroke="cyan" strokeWidth="3.5" />
        <circle cx="30" cy="22" r="7" stroke="cyan" strokeWidth="3" />
        <line x1="30" y1="38" x2="30" y2="72" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="30" y1="55" x2="40" y2="55" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="30" y1="65" x2="38" y2="65" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "RATE LIMITING",
    desc: "DDOS PROTECTION WITH INTELLIGENT THROTTLING",
    icon: (
      <svg viewBox="0 0 60 70" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <path d="M30 5 L52 14 L52 34 C52 50 30 62 30 62 C30 62 8 50 8 34 L8 14 Z" stroke="cyan" strokeWidth="3.5" strokeLinejoin="round" />
        <polyline points="20,34 27,42 42,26" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "10K CONCURRENT",
    desc: "HORIZONTALLY SCALABLE MICROSERVICES",
    icon: (
      <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <circle cx="30" cy="30" r="24" stroke="cyan" strokeWidth="3.5" />
        <line x1="30" y1="30" x2="30" y2="14" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="30" y1="30" x2="42" y2="38" stroke="cyan" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="30" cy="30" r="3" fill="cyan" />
      </svg>
    ),
  },
  {
    title: "AUDIT LOGGING",
    desc: "IMMUTABLE COMPLIANCE TRAIL FOR REGULATORS",
    icon: (
      <svg viewBox="0 0 60 70" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <ellipse cx="30" cy="14" rx="22" ry="9" stroke="cyan" strokeWidth="3.5" />
        <path d="M8 14 L8 34 C8 39 18 43 30 43 C42 43 52 39 52 34 L52 14" stroke="cyan" strokeWidth="3.5" />
        <path d="M8 34 L8 54 C8 59 18 63 30 63 C42 63 52 59 52 54 L52 34" stroke="cyan" strokeWidth="3.5" />
      </svg>
    ),
  },
  {
    title: "EXPLAINABLE AI",
    desc: "EVERY RISK DECISION IS TRACEABLE AND AUDITABLE",
    icon: (
      <svg viewBox="0 0 70 45" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
        <path d="M5 22 C15 5 55 5 65 22 C55 39 15 39 5 22 Z" stroke="cyan" strokeWidth="3.5" strokeLinejoin="round" />
        <circle cx="35" cy="22" r="10" stroke="cyan" strokeWidth="3.5" />
        <circle cx="35" cy="22" r="4" fill="cyan" />
      </svg>
    ),
  },
];

function AgentCard({ title, desc, index }: { title: string; desc: string; index: number }) {
  const { ref, inView } = useInView({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className="rounded-[25px] p-[60px_30px] text-center relative overflow-hidden transition-all duration-500 cursor-default"
      style={{
        background: "rgba(0,0,0,0.85)",
        transform: inView ? "translateY(0)" : "translateY(60px)",
        opacity: inView ? 1 : 0,
        transitionDelay: `${index * 80}ms`,
        boxShadow: "0 0 0 1px rgba(255,0,0,0.15)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 30px rgba(255,0,0,0.6)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-10px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px rgba(255,0,0,0.15)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div
        className="absolute bottom-0 left-0 w-full h-[120px] pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(255,0,0,0.7), transparent)" }}
      />
      <h3 className="mb-3 text-lg font-bold tracking-wider">{title}</h3>
      <p className="text-sm leading-relaxed text-[#ddd]">{desc}</p>
    </div>
  );
}

function FlowStep({ step, index }: { step: typeof processSteps[0]; index: number }) {
  const { ref, inView } = useInView({ threshold: 0.1 });
  const isLeft = step.dir === "left";

  return (
    <div
      ref={ref}
      className="grid w-full mb-[50px] transition-all duration-500"
      style={{
        gridTemplateColumns: "1fr 70px 1fr",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateX(0)" : `translateX(${isLeft ? -50 : 50}px)`,
        transitionDelay: `${index * 80}ms`,
      }}
    >
      {/* Left card or empty */}
      {isLeft ? (
        <div
          className="mr-5 rounded-[12px] p-[22px_26px] text-right cursor-default transition-shadow duration-300"
          style={{
            background: "rgba(80,0,0,0.5)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 25px rgba(255,0,0,0.3)",
            gridColumn: 1,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 40px rgba(255,0,0,0.6)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(255,0,0,0.3)")}
        >
          <h3 className="text-base font-black tracking-[2px] mb-2" style={{ textShadow: "0 0 10px white" }}>{step.title}</h3>
          <p className="text-[13px] text-[#ccc] tracking-[1px]">{step.desc}</p>
        </div>
      ) : <div />}

      {/* Bubble */}
      <div
        className="justify-self-center relative w-[52px] h-[52px] rounded-full flex items-center justify-center text-xl italic z-[2] flex-shrink-0"
        style={{
          border: "2px solid #ff2a2a",
          boxShadow: "0 0 15px #ff2a2a, 0 0 40px rgba(255,0,0,0.5)",
          background: "black",
        }}
      >
        {step.num}
      </div>

      {/* Right card or empty */}
      {!isLeft ? (
        <div
          className="ml-5 rounded-[12px] p-[22px_26px] cursor-default transition-shadow duration-300"
          style={{
            background: "rgba(80,0,0,0.5)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 25px rgba(255,0,0,0.3)",
            gridColumn: 3,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 40px rgba(255,0,0,0.6)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(255,0,0,0.3)")}
        >
          <h3 className="text-base font-black tracking-[2px] mb-2" style={{ textShadow: "0 0 10px white" }}>{step.title}</h3>
          <p className="text-[13px] text-[#ccc] tracking-[1px]">{step.desc}</p>
        </div>
      ) : <div />}
    </div>
  );
}

function SecurityCard({ card, index }: { card: typeof securityCards[0]; index: number }) {
  const { ref, inView } = useInView({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className="rounded-[14px] p-[40px_24px_30px] text-center cursor-default transition-all duration-500"
      style={{
        background: "rgba(80,0,0,0.55)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 20px rgba(255,0,0,0.25)",
        transform: inView ? "translateY(0)" : "translateY(40px)",
        opacity: inView ? 1 : 0,
        transitionDelay: `${index * 100}ms`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 35px rgba(255,0,0,0.5)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(255,0,0,0.25)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <div className="w-[60px] h-[60px] mx-auto mb-5 flex items-center justify-center" style={{ filter: "drop-shadow(0 0 8px cyan)" }}>
        {card.icon}
      </div>
      <h3 className="text-[15px] font-black tracking-[2px] mb-2" style={{ textShadow: "0 0 8px white" }}>{card.title}</h3>
      <p className="text-xs text-[#ccc] tracking-[1px] leading-relaxed">{card.desc}</p>
    </div>
  );
}

function SSSSection({ onOpenChat }: { onOpenChat: () => void }) {
  const chatBubbles = [
    { type: "bot", text: "Hello! How may I help you?" },
    { type: "user", text: "I want to open a bank account." },
    { type: "bot", text: "alr let's get started..." },
  ];
  const sssWords = ["SECURE", "SMART", "SEAMLESS"];

  return (
    <section className="flex items-center justify-between px-[8%] py-[100px] gap-[60px] relative overflow-hidden flex-wrap">
      {/* Chat side */}
      <div className="flex-1 flex flex-col gap-6 max-w-[480px]">
        {chatBubbles.map((bubble, i) => {
          const { ref, inView } = useInView({ threshold: 0.1 });
          return (
            <div
              key={i}
              ref={ref}
              className="px-6 py-4 rounded-[22px] text-lg leading-relaxed max-w-[85%] transition-all duration-500"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(20px)",
                transitionDelay: `${i * 200}ms`,
                ...(bubble.type === "bot"
                  ? {
                      background: "rgba(180,0,0,0.85)",
                      color: "white",
                      borderBottomLeftRadius: "4px",
                      alignSelf: "flex-start",
                      boxShadow: "0 0 20px rgba(255,0,0,0.4)",
                    }
                  : {
                      background: "rgba(240,240,240,0.92)",
                      color: "#111",
                      borderBottomRightRadius: "4px",
                      alignSelf: "flex-start",
                      marginLeft: "40px",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    }),
              }}
            >
              {bubble.text}
            </div>
          );
        })}
        <button
          onClick={onOpenChat}
          className="mt-4 self-start px-8 py-3 rounded-[30px] text-base font-bold cursor-pointer transition-transform hover:scale-105"
          style={{
            background: "linear-gradient(90deg,#8b0000,#ff0000)",
            color: "white",
            border: "none",
            boxShadow: "0 0 20px red, 0 0 50px red",
          }}
        >
          Start Chatting →
        </button>
      </div>

      {/* SSS side */}
      <div className="flex-1 flex flex-col items-end gap-0">
        {sssWords.map((word, i) => {
          const { ref, inView } = useInView({ threshold: 0.1 });
          return (
            <div key={word}>
              <div
                ref={ref}
                className="text-[90px] font-black tracking-[6px] leading-none transition-all duration-500"
                style={{
                  textShadow: "0 0 30px white, 0 0 80px rgba(255,255,255,0.5)",
                  opacity: inView ? 1 : 0,
                  transform: inView ? "translateX(0)" : "translateX(40px)",
                  transitionDelay: `${i * 150}ms`,
                }}
              >
                {word}
              </div>
              {i < sssWords.length - 1 && (
                <div
                  className="h-[3px] my-3 self-end"
                  style={{
                    width: "280px",
                    background: "linear-gradient(to left, #ff2a2a, transparent)",
                    boxShadow: "0 0 12px #ff2a2a, 0 0 30px rgba(255,0,0,0.5)",
                    opacity: inView ? 1 : 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RTESection() {
  const { displayed, ref } = useTypewriter("READY TO EXPERIENCE");

  return (
    <section ref={ref} className="px-[6%] py-[120px_6%_140px] text-center relative overflow-hidden">
      <div
        className="text-[52px] font-black tracking-[6px] mb-10 flex items-center justify-center min-h-[70px]"
        style={{
          fontFamily: "Georgia, serif",
          textShadow: "0 0 15px white, 0 0 40px rgba(255,255,255,0.3)",
        }}
      >
        <span>{displayed}</span>
        <span
          className="inline-block w-[3px] h-[52px] bg-white ml-1 align-middle animate-blink"
          style={{ verticalAlign: "middle" }}
        />
      </div>
      <div
        className="text-[140px] font-black tracking-[8px] leading-none animate-flicker"
        style={{ color: "#ff4444" }}
      >
        FUTURE<br />BANKING
      </div>
    </section>
  );
}

const freqBars = Array.from({ length: 60 }, () => ({
  base: `${Math.floor(Math.random() * 26) + 10}px`,
  peak: `${Math.floor(Math.random() * 80) + 40}px`,
  dur: `${(Math.random() * 0.8 + 0.3).toFixed(2)}s`,
  delay: `${(Math.random()).toFixed(2)}s`,
}));

export default function Index() {
  const [showIntro, setShowIntro] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      {/* Intro overlay */}
      {showIntro && <IntroOverlay onDone={() => setShowIntro(false)} />}

      {/* Chat page */}
      {chatOpen && <ChatPage onClose={() => setChatOpen(false)} />}

      {/* Black base layer so body bg shows */}
      <div className="fixed inset-0" style={{ zIndex: 0, background: "black" }} />

      {/* Star canvas — sits above black base, below content */}
      <StarCanvas count={300} />

      {/* Red bottom glow — above stars */}
      <div
        className="fixed pointer-events-none"
        style={{
          zIndex: 2,
          bottom: "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          height: "600px",
          background: "radial-gradient(circle, rgba(255,0,0,0.7), transparent 70%)",
          filter: "blur(120px)",
        }}
      />

      {/* Vignette — above stars, below content */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 3, background: "radial-gradient(circle at center, transparent 50%, black 100%)" }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-[100] px-8 py-4">
        <div className="text-[22px] font-black tracking-wide">
          Onboard<span className="text-[#ff2a2a]" style={{ textShadow: "0 0 10px red" }}>X</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="h-screen flex flex-col items-center justify-center text-center relative" style={{ zIndex: 10 }}>
        {/* Rotating loader rings */}
        <div className="absolute w-[300px] h-[300px] flex items-center justify-center">
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{
              border: "3px solid red",
              boxShadow: "0 0 20px red, 0 0 60px red",
              animation: "rotate 6s linear infinite",
            }}
          />
          <div
            className="absolute w-[180px] h-[180px] rounded-full"
            style={{
              border: "3px solid #ff2a2a",
              boxShadow: "0 0 20px red, 0 0 60px red",
              animation: "rotateReverse 4s linear infinite",
            }}
          />
          <div
            className="hex-shape absolute w-[120px] h-[120px]"
            style={{
              border: "3px solid #ff2a2a",
              boxShadow: "0 0 20px red, 0 0 50px red",
              animation: "rotate 8s linear infinite",
            }}
          />
        </div>

        <h1
          className="text-[110px] font-black tracking-[5px] mt-[340px] animate-fade-up"
          style={{ fontSize: "clamp(50px, 10vw, 110px)" }}
        >
          Onboard<span className="text-[#ff2a2a] red-shadow">X</span>
        </h1>

        <div
          className="mt-8 px-16 py-5 rounded-[10px] animate-fade-up"
          style={{
            background: "rgba(255,0,0,0.15)",
            backdropFilter: "blur(15px)",
            boxShadow: "0 0 30px rgba(255,0,0,0.6)",
          }}
        >
          <p className="text-xl tracking-[3px] italic" style={{ textShadow: "0 0 10px white" }}>
            PERSONALIZED BANKING AI-AGENT
          </p>
        </div>

        <button
          onClick={() => setChatOpen(true)}
          className="mt-10 px-[50px] py-4 text-lg rounded-[30px] cursor-pointer transition-transform hover:scale-110"
          style={{
            background: "linear-gradient(90deg,#8b0000,#ff0000)",
            color: "white",
            border: "none",
            boxShadow: "0 0 20px red, 0 0 50px red",
          }}
        >
          Click here to start your chat!
        </button>
      </section>

      {/* SIX AGENTS */}
      <section className="px-[10%] py-[120px] relative" style={{ zIndex: 10 }}>
        <div className="text-center text-[48px] tracking-[6px] mb-20 white-shadow font-bold">
          SIX SPECIAL AI AGENTS
        </div>
        <div className="grid grid-cols-3 gap-[50px] max-[1000px]:grid-cols-2 max-[600px]:grid-cols-1">
          {agentCards.map((card, i) => (
            <AgentCard key={card.title} title={card.title} desc={card.desc} index={i} />
          ))}
        </div>
      </section>

      {/* PROCESS FLOW */}
      <section className="px-[8%] py-[120px] relative" style={{ zIndex: 10 }}>
        <div
          className="text-center text-[52px] font-black tracking-[6px] mb-[100px]"
          style={{ textShadow: "0 0 20px #ff2a2a, 0 0 60px #ff2a2a", color: "white" }}
        >
          END TO END IN UNDER 3 MINS
        </div>
        <div className="flex flex-col items-center relative max-w-[1000px] mx-auto">
          {processSteps.map((step, i) => (
            <FlowStep key={step.num} step={step} index={i} />
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="px-[8%] py-[80px_8%_120px] text-center relative" style={{ zIndex: 10 }}>
        <div className="absolute top-0 right-0 w-[180px] opacity-90" style={{ filter: "drop-shadow(0 0 12px white)" }}>
          <svg viewBox="0 0 130 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="35" width="75" height="50" rx="7" stroke="white" strokeWidth="4" />
            <circle cx="42" cy="60" r="16" stroke="white" strokeWidth="4" />
            <circle cx="42" cy="60" r="7" stroke="white" strokeWidth="3" />
            <line x1="80" y1="60" x2="115" y2="22" stroke="white" strokeWidth="4" strokeLinecap="round" />
            <rect x="105" y="10" width="18" height="18" rx="3" stroke="white" strokeWidth="4" />
            <rect x="22" y="26" width="22" height="11" rx="3" stroke="white" strokeWidth="3" />
          </svg>
        </div>
        <div
          className="text-[58px] font-black tracking-[8px] mb-[70px]"
          style={{ textShadow: "0 0 20px white, 0 0 60px rgba(255,255,255,0.4)" }}
        >
          POST GRADE SECURITY
        </div>
        <div className="grid grid-cols-3 gap-8 max-w-[1100px] mx-auto max-[900px]:grid-cols-2 max-[580px]:grid-cols-1">
          {securityCards.map((card, i) => (
            <SecurityCard key={card.title} card={card} index={i} />
          ))}
        </div>
      </section>

      {/* SSS + Chat bubbles */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <SSSSection onOpenChat={() => setChatOpen(true)} />
      </div>

      {/* RTE Section */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <RTESection />
      </div>

      {/* FOOTER */}
      <footer className="relative px-[6%] pt-[60px] text-center overflow-hidden" style={{ background: "linear-gradient(to top, rgba(120,0,0,0.4), transparent)", zIndex: 10 }}>
        <div
          className="inline-block rounded-[14px] px-9 py-3 text-[28px] font-black tracking-wide mb-6"
          style={{ background: "#111", border: "1px solid #333", boxShadow: "0 4px 30px rgba(0,0,0,0.6)" }}
        >
          Onboard<span className="text-[#ff2a2a]" style={{ textShadow: "0 0 10px red" }}>X</span>
        </div>
        <div className="text-[13px] tracking-[3px] text-[#aaa] mb-[50px]">
          AI-POWERED BANKING ONBOARDING PLATFORM — PRODUCTION-READY ARCHITECTURE
        </div>
        <div className="flex items-end justify-between gap-0 h-[120px] overflow-hidden w-full">
          {freqBars.map((bar, i) => (
            <div
              key={i}
              className="w-[10px] flex-shrink-0 bg-white rounded-t-[3px] animate-freq"
              style={{
                "--base": bar.base,
                "--peak": bar.peak,
                "--dur": bar.dur,
                animationDelay: bar.delay,
                height: bar.base,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
