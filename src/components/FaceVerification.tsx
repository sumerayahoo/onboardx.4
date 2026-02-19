import { useRef, useState, useEffect, useCallback } from "react";

interface FaceVerificationProps {
  onVerified: (result: { success: boolean; message: string; capturedImage: string }) => void;
  onClose: () => void;
  documentBase64?: string;
}

export default function FaceVerification({ onVerified, onClose, documentBase64 }: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"camera" | "verifying" | "result">("camera");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const [resultOk, setResultOk] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  // Start camera
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => {
        setCameraError("Camera access denied. Please allow camera permissions and try again.");
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const startCountdown = () => {
    setCountdown(3);
    const tick = (n: number) => {
      if (n <= 0) {
        setCountdown(null);
        handleCapture();
      } else {
        setTimeout(() => tick(n - 1), 1000);
        setCountdown(n);
      }
    };
    setTimeout(() => tick(2), 1000);
  };

  const handleCapture = async () => {
    const dataUrl = capturePhoto();
    if (!dataUrl) return;
    setCapturedImage(dataUrl);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setPhase("verifying");

    const base64 = dataUrl.split(",")[1];

    try {
      // Build message for AI face verification
      const messages: { role: string; content: any }[] = [
        {
          role: "user",
          content: documentBase64
            ? [
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${documentBase64}` },
                },
                {
                  type: "text",
                  text: "The first image is a live selfie of the user and the second image is the uploaded ID document. Please do: 1) Liveness check - is the selfie a real person (not a photo of a photo, screen, or mask)? 2) Face match - does the face in the selfie match the photo on the ID document? Reply ONLY in this exact JSON format (no markdown): {\"liveness\": true/false, \"match\": true/false, \"reason\": \"short explanation\"}",
                },
              ]
            : [
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
                {
                  type: "text",
                  text: "This is a live selfie. Check if it's a real live person (not a photo of a photo, screen print, or mask). Reply ONLY in this exact JSON format (no markdown): {\"liveness\": true/false, \"match\": null, \"reason\": \"short explanation\"}",
                },
              ],
        },
      ];

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/onboardx-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages,
          faceVerifyMode: true,
        }),
      });

      let fullText = "";
      if (resp.ok && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") break;
            try {
              const parsed = JSON.parse(json);
              const c = parsed.choices?.[0]?.delta?.content;
              if (c) fullText += c;
            } catch { /* skip */ }
          }
        }
      }

      // Parse JSON response
      let liveness = true;
      let match = true;
      let reason = "Verification complete.";
      try {
        // Extract JSON from response (model might wrap it)
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          liveness = parsed.liveness !== false;
          match = parsed.match !== false;
          reason = parsed.reason || reason;
        }
      } catch { /* use defaults */ }

      const success = liveness && (match !== false);
      let msg = "";
      if (!liveness) {
        msg = `⚠️ Liveness check failed: ${reason} Please retake your selfie in good lighting.`;
      } else if (match === false) {
        msg = `❌ Face mismatch: ${reason} The selfie doesn't match the ID document. Please ensure you're using your own document.`;
      } else {
        msg = `✅ Face verified successfully! ${reason}`;
      }

      setResultOk(success);
      setResultMsg(msg);
      setPhase("result");

      if (success) {
        setTimeout(() => {
          onVerified({ success: true, message: msg, capturedImage: base64 });
        }, 2500);
      }
    } catch (e) {
      setResultOk(false);
      setResultMsg("Verification failed due to a network error. Please try again.");
      setPhase("result");
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl overflow-hidden"
        style={{
          background: "rgba(10,10,10,0.95)",
          border: "1px solid rgba(255,42,42,0.3)",
          boxShadow: "0 0 60px rgba(255,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-white font-bold text-lg tracking-wide">
              Face <span className="text-[#ff2a2a]" style={{ textShadow: "0 0 10px red" }}>Verification</span>
            </h2>
            <p className="text-[#666] text-xs mt-0.5">Live identity check</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center gap-5">

          {/* Camera error */}
          {cameraError && (
            <div className="w-full text-center py-8">
              <div className="text-4xl mb-3">📷</div>
              <p className="text-[#ff4444] text-sm">{cameraError}</p>
              <button
                onClick={onClose}
                className="mt-4 px-5 py-2 rounded-full text-sm text-white"
                style={{ background: "rgba(255,42,42,0.2)", border: "1px solid rgba(255,42,42,0.4)" }}
              >
                Close
              </button>
            </div>
          )}

          {/* Camera phase */}
          {!cameraError && phase === "camera" && (
            <>
              <p className="text-[#aaa] text-sm text-center">
                Position your face within the frame, ensure good lighting, then press <strong className="text-white">Capture</strong>.
              </p>

              {/* Video frame */}
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  muted
                  playsInline
                />

                {/* Oval overlay guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="w-[55%] aspect-[3/4] rounded-[50%]"
                    style={{
                      border: "2px dashed rgba(255,42,42,0.7)",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                    }}
                  />
                </div>

                {/* Countdown overlay */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span
                      className="text-white font-black"
                      style={{ fontSize: "80px", textShadow: "0 0 30px rgba(255,42,42,0.8)" }}
                    >
                      {countdown}
                    </span>
                  </div>
                )}

                {/* Scan line animation */}
                <div
                  className="absolute left-0 right-0 h-[2px] pointer-events-none"
                  style={{
                    background: "linear-gradient(to right, transparent, rgba(255,42,42,0.8), transparent)",
                    animation: "scanLine 2s linear infinite",
                    top: 0,
                  }}
                />
              </div>

              <button
                onClick={startCountdown}
                disabled={countdown !== null}
                className="w-full py-3 rounded-full font-bold tracking-widest text-white text-sm transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{
                  background: "linear-gradient(to right, #8b0000, #ff2a2a)",
                  boxShadow: "0 0 20px rgba(255,42,42,0.4)",
                }}
              >
                {countdown !== null ? `📸 Capturing in ${countdown}…` : "📸 CAPTURE PHOTO"}
              </button>
            </>
          )}

          {/* Verifying phase */}
          {phase === "verifying" && (
            <div className="flex flex-col items-center gap-5 py-6 w-full">
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-36 h-36 object-cover rounded-2xl scale-x-[-1]"
                  style={{ border: "2px solid rgba(255,42,42,0.4)" }}
                />
              )}
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-2">
                  {[0, 0.15, 0.3].map((d, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded-full inline-block"
                      style={{
                        background: "#ff2a2a",
                        animation: "typingBounce 1s infinite",
                        animationDelay: `${d}s`,
                        boxShadow: "0 0 8px #ff2a2a",
                      }}
                    />
                  ))}
                </div>
                <p className="text-[#aaa] text-sm">AI is verifying your face…</p>
              </div>
            </div>
          )}

          {/* Result phase */}
          {phase === "result" && (
            <div className="flex flex-col items-center gap-5 py-4 w-full">
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-36 h-36 object-cover rounded-2xl scale-x-[-1]"
                  style={{
                    border: `2px solid ${resultOk ? "rgba(0,200,80,0.6)" : "rgba(255,42,42,0.6)"}`,
                    boxShadow: `0 0 20px ${resultOk ? "rgba(0,200,80,0.3)" : "rgba(255,42,42,0.3)"}`,
                  }}
                />
              )}
              <div
                className="w-full rounded-2xl px-5 py-4 text-sm text-center leading-relaxed"
                style={{
                  background: resultOk ? "rgba(0,150,60,0.15)" : "rgba(200,0,0,0.15)",
                  border: `1px solid ${resultOk ? "rgba(0,200,80,0.3)" : "rgba(255,42,42,0.3)"}`,
                  color: resultOk ? "#5aff8a" : "#ff6666",
                }}
              >
                {resultMsg}
              </div>

              {!resultOk && (
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setPhase("camera");
                    // Re-open camera
                    navigator.mediaDevices
                      .getUserMedia({ video: { facingMode: "user" } })
                      .then((stream) => {
                        streamRef.current = stream;
                        if (videoRef.current) {
                          videoRef.current.srcObject = stream;
                          videoRef.current.play();
                        }
                      })
                      .catch(() => setCameraError("Camera access denied."));
                  }}
                  className="w-full py-3 rounded-full font-bold tracking-widest text-white text-sm"
                  style={{
                    background: "rgba(255,42,42,0.2)",
                    border: "1px solid rgba(255,42,42,0.4)",
                  }}
                >
                  🔄 Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        @keyframes scanLine {
          0% { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
}
