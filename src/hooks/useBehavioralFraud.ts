import { useRef, useCallback } from "react";

export interface BehavioralFlags {
  suspiciousTypingSpeed: boolean;
  copyPasteDetected: boolean;
  multipleIdAttempts: boolean;
  avgKeystrokeMs: number;
  pasteCount: number;
  idUploadCount: number;
  riskScore: number; // 0-100
  flags: string[];
}

const FAST_TYPING_THRESHOLD_MS = 30; // avg ms between keystrokes — too fast = bot/paste
const MAX_ID_UPLOADS = 3; // more than this = suspicious

export function useBehavioralFraud() {
  const keystrokeTimestamps = useRef<number[]>([]);
  const pasteCount = useRef(0);
  const idUploadCount = useRef(0);
  const uploadedIdNumbers = useRef<Set<string>>(new Set());

  const recordKeystroke = useCallback(() => {
    keystrokeTimestamps.current.push(Date.now());
    // Keep last 50 keystrokes
    if (keystrokeTimestamps.current.length > 50) {
      keystrokeTimestamps.current.shift();
    }
  }, []);

  const recordPaste = useCallback(() => {
    pasteCount.current += 1;
  }, []);

  const recordIdUpload = useCallback((extractedId?: string) => {
    idUploadCount.current += 1;
    if (extractedId) {
      uploadedIdNumbers.current.add(extractedId.toUpperCase().replace(/\s/g, ""));
    }
  }, []);

  const getAvgKeystrokeMs = useCallback((): number => {
    const ts = keystrokeTimestamps.current;
    if (ts.length < 5) return 999; // not enough data
    const diffs: number[] = [];
    for (let i = 1; i < ts.length; i++) {
      diffs.push(ts[i] - ts[i - 1]);
    }
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }, []);

  const analyze = useCallback((): BehavioralFlags => {
    const avgMs = getAvgKeystrokeMs();
    const suspiciousTypingSpeed = avgMs < FAST_TYPING_THRESHOLD_MS && keystrokeTimestamps.current.length >= 10;
    const copyPasteDetected = pasteCount.current >= 2;
    const multipleIdAttempts = idUploadCount.current > MAX_ID_UPLOADS || uploadedIdNumbers.current.size > 2;

    const flags: string[] = [];
    let riskScore = 0;

    if (suspiciousTypingSpeed) {
      flags.push(`Abnormal typing speed (${avgMs.toFixed(0)}ms avg — possible bot/autofill)`);
      riskScore += 30;
    }
    if (copyPasteDetected) {
      flags.push(`Copy-paste detected ${pasteCount.current} times in sensitive fields`);
      riskScore += 20;
    }
    if (multipleIdAttempts) {
      flags.push(`${idUploadCount.current} document uploads with ${uploadedIdNumbers.current.size} different IDs`);
      riskScore += 40;
    }
    if (uploadedIdNumbers.current.size > 2) {
      flags.push("Multiple different ID numbers detected — possible identity fraud");
      riskScore += 10;
    }

    return {
      suspiciousTypingSpeed,
      copyPasteDetected,
      multipleIdAttempts,
      avgKeystrokeMs: avgMs,
      pasteCount: pasteCount.current,
      idUploadCount: idUploadCount.current,
      riskScore: Math.min(riskScore, 100),
      flags,
    };
  }, [getAvgKeystrokeMs]);

  return { recordKeystroke, recordPaste, recordIdUpload, analyze };
}
