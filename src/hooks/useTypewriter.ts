import { useEffect, useRef, useState } from "react";
import { useInView } from "./useInView";

export function useTypewriter(text: string, speed = 80) {
  const [displayed, setDisplayed] = useState("");
  const started = useRef(false);
  const { ref, inView } = useInView({ threshold: 0.3 });

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }
  }, [inView, text, speed]);

  return { displayed, ref };
}
