"use client";

import { useEffect, useRef, useState } from "react";
import { photoFromFile, photoFromVideo, type Photo } from "@/lib/client/image";

type Props = {
  title: string;
  facing: "user" | "environment";
  watermark: () => string[];
  maxSide?: number;
  onCapture: (photo: Photo) => void;
  onClose: () => void;
};

// Full-screen camera. Uses the live camera (no gallery) and falls back to the
// phone's camera picker when the browser blocks getUserMedia.
export function CameraSheet({ title, facing, watermark, maxSide, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not available in this browser.");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission denied. Allow camera in phone settings." : "Live camera not available. Use the button below to open the phone camera.");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setPreview(await photoFromVideo(v, watermark(), { maxSide }));
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    try {
      setPreview(await photoFromFile(file, watermark(), { maxSide }));
    } catch {
      setError("Could not read that photo. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-medium">{title}</span>
        <button className="btn btn-ghost text-white hover:bg-white/10 hover:text-white" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.dataUrl} alt="Captured" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={videoRef} playsInline muted className={`max-h-full max-w-full ${facing === "user" ? "-scale-x-100" : ""} ${ready ? "" : "hidden"}`} />
        )}
        {!ready && !preview && <p className="px-6 text-center text-sm text-white/80">{error ?? "Starting camera…"}</p>}
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {preview ? (
          <>
            <button className="btn btn-secondary flex-1 py-3" onClick={() => setPreview(null)}>
              Retake
            </button>
            <button className="btn btn-primary flex-1 py-3" onClick={() => onCapture(preview)}>
              Use photo
            </button>
          </>
        ) : ready ? (
          <button aria-label="Capture" onClick={snap} className="h-16 w-16 rounded-full border-4 border-white bg-white/30 active:bg-white/60" />
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture={facing} className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
            <button className="btn btn-primary w-full py-3" onClick={() => fileRef.current?.click()}>
              Open phone camera
            </button>
          </>
        )}
      </div>
    </div>
  );
}
