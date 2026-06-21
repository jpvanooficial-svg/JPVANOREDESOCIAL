// Web Audio API Synthesizer for high-precision real-time sound effects
// Completely asset-free, safe, with adjustable volume settings configured in localStorage

export type AudioTone = "bubble_pop" | "harmonic_sweep" | "arpeggio" | "bell_chime" | "electronic_ping" | "none" | string;

export const playTone = (tone: AudioTone, volumePct: number = 0.5) => {
  if (tone === "none") return;

  if (typeof tone === "string" && (tone.startsWith("http") || tone.startsWith("/") || tone.includes("data:audio") || tone.includes("base64"))) {
    try {
      const audio = new Audio(tone);
      audio.volume = volumePct;
      audio.play().catch(err => console.warn("Erro ao reproduzir som customizado:", err));
      return;
    } catch (e) {
      console.warn("Custom playback fail:", e);
    }
  }

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);

    if (tone === "bubble_pop") {
      // Warm quick retro bubble double pop
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3 * volumePct, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.4 * volumePct, ctx.currentTime + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.26);
    } else if (tone === "harmonic_sweep") {
      // Sweet organic major third slide
      osc.type = "triangle";
      osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
      osc.frequency.exponentialRampToValueAtTime(415.30, ctx.currentTime + 0.15); // G#4
      
      gainNode.gain.linearRampToValueAtTime(0.25 * volumePct, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.32);
    } else if (tone === "arpeggio") {
      // Energetic up-sweep arpeggio
      osc.type = "sine";
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      notes.forEach((freq, i) => {
        const time = ctx.currentTime + i * 0.06;
        osc.frequency.setValueAtTime(freq, time);
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.2 * volumePct, time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.07);
      });
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (tone === "bell_chime") {
      // Glass bell chime chord
      osc.type = "sine";
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "triangle";

      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc2.frequency.setValueAtTime(554.37, ctx.currentTime); // C#5
      
      gainNode.gain.linearRampToValueAtTime(0.2 * volumePct, ctx.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(0.15 * volumePct, ctx.currentTime + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
      osc2.stop(ctx.currentTime + 0.22);
    } else if (tone === "electronic_ping") {
      // Soft high sweet electronic ping
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gainNode.gain.linearRampToValueAtTime(0.25 * volumePct, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.42);
    }
  } catch (error) {
    console.warn("Audio Context error:", error);
  }
};

export const playNotificationSound = (
  type: "like" | "comment" | "follow" | "message" | "test",
  overrideTone?: AudioTone
) => {
  // Check if sound is disabled in user local setting
  const isSoundEnabled = localStorage.getItem("jpvano_sound_enabled") !== "false";
  if (!isSoundEnabled) return;

  const volumePct = parseFloat(localStorage.getItem("jpvano_sound_volume") || "0.5");

  if (overrideTone) {
    playTone(overrideTone, volumePct);
    return;
  }

  // Get configured tone or its legacy mapping
  let tone: AudioTone = "bubble_pop";
  if (type === "like") {
    tone = (localStorage.getItem("jpvano_tone_like") || "bubble_pop") as AudioTone;
  } else if (type === "comment") {
    tone = (localStorage.getItem("jpvano_tone_comment") || "harmonic_sweep") as AudioTone;
  } else if (type === "follow") {
    tone = (localStorage.getItem("jpvano_tone_follow") || "arpeggio") as AudioTone;
  } else if (type === "message") {
    tone = (localStorage.getItem("jpvano_tone_message") || "bell_chime") as AudioTone;
  } else if (type === "test") {
    tone = "electronic_ping";
  }

  playTone(tone, volumePct);
};
