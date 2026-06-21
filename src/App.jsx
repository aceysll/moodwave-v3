import { useState, useRef, useEffect } from "react";

function formatDuration(ms) {
  if (!ms) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatListeners(n) {
  if (!n) return "";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function TrackCard({ track, accentColor }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!track.preview) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      document.querySelectorAll("audio").forEach((a) => a.pause());
      audioRef.current?.play();
      setPlaying(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => setPlaying(false);
    audio.addEventListener("ended", onEnd);
    return () => audio.removeEventListener("ended", onEnd);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Art / play */}
      <div
        onClick={togglePlay}
        style={{
          width: 48, height: 48, borderRadius: 8, flexShrink: 0,
          background: track.image ? `url(${track.image}) center/cover` : "rgba(255,255,255,0.08)",
          cursor: track.preview ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}
      >
        {track.preview && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, opacity: playing ? 1 : 0,
            transition: "opacity 0.2s",
          }}>
            {playing ? "⏸" : "▶"}
          </div>
        )}
        {!track.image && <span style={{ fontSize: 18, opacity: 0.3 }}>♪</span>}
        {track.preview && <audio ref={audioRef} src={track.preview} />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: "#fff",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {track.name}
        </div>
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.45)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginTop: 2,
        }}>
          {track.artist}
          {track.listeners > 0 && (
            <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 6 }}>
              · {formatListeners(track.listeners)} listeners
            </span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {track.duration && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {formatDuration(track.duration)}
          </span>
        )}
        {track.url && (
          <a href={track.url} target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: 10, fontWeight: 700, color: accentColor,
              letterSpacing: "0.04em", opacity: 0.8,
            }}>
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [mood, setMood]       = useState("");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [bgColor, setBgColor] = useState("#0a0a12");

  const search = async () => {
    if (!mood.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: mood.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.mood?.color) setBgColor(data.mood.color);
    } catch (e) {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  };

  const accentColor = result?.mood?.color || "#a084ff";

  const gradientBg = result
    ? `radial-gradient(ellipse at 20% 20%, ${accentColor}18 0%, #0a0a12 55%)`
    : "#0a0a12";

  return (
    <div style={{
      minHeight: "100vh", background: gradientBg, color: "#fff",
      fontFamily: "'Inter', system-ui, sans-serif",
      transition: "background 1.8s ease",
    }}>
      <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 20px 100px" }}>

        {/* Nav */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "22px 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>〜</span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>
              Moodwave
            </span>
          </div>
          <a href="https://buildbyace.vercel.app" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            by ace ↗
          </a>
        </nav>

        {/* Hero (only before first search) */}
        {!result && !loading && (
          <div style={{ textAlign: "center", padding: "64px 0 48px" }}>
            <h1 style={{
              fontSize: "clamp(30px, 9vw, 52px)",
              fontWeight: 800, letterSpacing: "-0.03em",
              lineHeight: 1.08, marginBottom: 14,
            }}>
              How are you<br />
              <span style={{ color: "rgba(255,255,255,0.25)" }}>feeling right now?</span>
            </h1>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, maxWidth: 380, margin: "0 auto" }}>
              Describe your mood and get music that actually fits.
              Powered by real listening data from millions of people.
            </p>
          </div>
        )}

        {/* Mood result header */}
        {result && (
          <div style={{ paddingTop: 32, marginBottom: 24 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 6,
            }}>
              Mood detected
            </div>
            <div style={{
              fontSize: "clamp(24px, 7vw, 40px)", fontWeight: 800,
              letterSpacing: "-0.025em", color: accentColor, marginBottom: 12,
            }}>
              {result.mood.label}
            </div>

            {/* Tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {result.mood.tags?.map((tag) => (
                <span key={tag} style={{
                  padding: "3px 10px", borderRadius: 20,
                  background: accentColor + "18",
                  border: `1px solid ${accentColor}35`,
                  fontSize: 11, fontWeight: 600, color: accentColor,
                  letterSpacing: "0.04em",
                }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Similar artists */}
            {result.mood.similarArtists?.length > 0 && (
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.25)", marginBottom: 8, textTransform: "uppercase",
                }}>
                  Similar artists
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {result.mood.similarArtists.map((a) => (
                    <span key={a.name} style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search bar */}
        <div style={{
          display: "flex", gap: 8, marginBottom: 28,
          position: result ? "sticky" : "relative",
          top: result ? 14 : "auto", zIndex: 10,
        }}>
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={result ? "Try another mood..." : "e.g. tired but hopeful, or late night driving..."}
            style={{
              flex: 1, padding: "13px 16px", borderRadius: 12,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 14, outline: "none",
              backdropFilter: "blur(16px)",
            }}
          />
          <button
            onClick={search}
            disabled={loading || !mood.trim()}
            style={{
              padding: "13px 18px", borderRadius: 12, border: "none",
              background: loading || !mood.trim() ? "rgba(255,255,255,0.08)" : accentColor,
              color: "#fff", fontSize: 16, fontWeight: 700,
              cursor: loading || !mood.trim() ? "not-allowed" : "pointer",
              transition: "background 0.3s", flexShrink: 0,
            }}
          >
            {loading ? "…" : "→"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>〜</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
              Finding music for your mood...
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "13px 16px", borderRadius: 10,
            background: "rgba(255,77,109,0.1)",
            border: "1px solid rgba(255,77,109,0.25)",
            fontSize: 13, color: "#ff4d6d", marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Tracks */}
        {result?.tracks?.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.25)", textTransform: "uppercase",
              marginBottom: 12,
            }}>
              {result.tracks.length} tracks · tap art to preview
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.tracks.map((track, i) => (
                <TrackCard key={i} track={track} accentColor={accentColor} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
