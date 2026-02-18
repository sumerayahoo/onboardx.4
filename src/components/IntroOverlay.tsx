import { useEffect, useRef, useState } from "react";
import IntroCanvas from "./IntroCanvas";

interface IntroOverlayProps {
  onDone: () => void;
}

export default function IntroOverlay({ onDone }: IntroOverlayProps) {
  const [fading, setFading] = useState(false);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Lock scroll
    document.body.style.overflow = "hidden";

    // Trigger loading bar fill
    const t1 = setTimeout(() => {
      if (fillRef.current) fillRef.current.style.width = "100%";
    }, 50);

    // Fade out after 5s
    const t2 = setTimeout(() => {
      setFading(true);
    }, 5000);

    // Unmount and unlock after fade
    const t3 = setTimeout(() => {
      document.body.style.overflow = "";
      onDone();
    }, 6200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      document.body.style.overflow = "";
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        transition: "opacity 1.2s ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
        background: "#05080f",
      }}
    >
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <IntroCanvas />
      </div>

      {/* Text */}
      <div
        className="relative z-10 text-center pointer-events-none animate-intro-pulse"
      >
        <h1 className="text-[72px] font-black tracking-[6px] m-0"
          style={{ textShadow: "0 0 30px white" }}>
          ONBOARD<span className="text-[#ff1a1a]" style={{ textShadow: "0 0 20px red, 0 0 60px red" }}>X</span>
        </h1>
        <p className="mt-3 tracking-[4px] text-sm text-[#8aa0ff]"
          style={{ textShadow: "0 0 10px #8aa0ff" }}>
          PERSONALIZED BANKING AI-AGENT
        </p>
      </div>

      {/* Loading bar */}
      <div className="absolute bottom-[60px] left-1/2 -translate-x-1/2 w-[320px] z-10 text-center">
        <div className="text-[11px] tracking-[4px] text-[#888] mb-[10px]">INITIALIZING</div>
        <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden">
          <div
            ref={fillRef}
            className="h-full w-0 rounded-full"
            style={{
              background: "linear-gradient(to right, #8b0000, #ff2a2a)",
              boxShadow: "0 0 10px #ff2a2a, 0 0 25px rgba(255,0,0,0.5)",
              transition: "width 5s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
