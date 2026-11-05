import { useEffect, useRef, useState } from "react";
import { drawOffice } from "./draw";
import { actorsAt } from "./scene";

export function OfficeStage({ time }: { time: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 2 || size.h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOffice(ctx, size.w, size.h, actorsAt(time), Math.floor(time / 80));
  }, [size, time]);

  return (
    <div className="stage" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
