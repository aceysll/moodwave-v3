import { useState, useRef, useEffect, useCallback } from "react";

const SPOTIFY_CLIENT_ID = "96840892a29d4622892cddfecbfc4d1c";
const SPOTIFY_SCOPES = "playlist-modify-private playlist-modify-public";

// ── Utilities ──────────────────────────────────────────────────
function formatDuration(ms) {
  if (!ms) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatListeners(n) {
  if (!n) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Track Card ─────────────────────────────────────────────────
function TrackCard({ track, index, accentColor, onSelect, selected }) {
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!track.preview) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      document.querySelectorAll("audio").forEach((a) => a.pause());
      document.querySelectorAll(".playing-indicator").forEach((el) => el.classList.remove("playing"));
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
    <div
      onClick={() => onSelect(track)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 14px", borderRadius: 12,
        background: selected
          ? `rgba(${hexToRgb(accentColor)}, 0.15)`
          : hover ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        border: selected
          ? `1px solid rgba(${hexToRgb(accentColor)}, 0.4)`
          : "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
        transition: "all 0.18s",
        position: "relative",
      }}
    >
      {/* Index */}
      <div style={{
        width: 20, textAlign: "center", flexShrink: 0,
        fontSize: 11, color: "rgba(255,255,255,0.2)", fontWeight: 500,
      }}>
        {index + 1}
      </div>

      {/* Art */}
      <div
        onClick={togglePlay}
        style={{
          width: 44, height: 44, borderRadius: 8, flexShrink: 0,
          background: track.image
            ? `url(${track.image}) center/cover`
            : `rgba(${hexToRgb(accentColor)}, 0.2)`,
          cursor: track.preview ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}
      >
        {track.preview && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: playing || hover ? 1 : 0,
            transition: "opacity 0.2s",
            fontSize: 14,
          }}>
            {playing ? "⏸" : "▶"}
          </div>
        )}
        {!track.image && <span style={{ fontSize: 16, opacity: 0.5 }}>♪</span>}
        {track.preview && <audio ref={audioRef} src={track.preview} />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: selected ? "#fff" : "rgba(255,255,255,0.9)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: 2,
        }}>
          {track.name}
        </div>
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {track.artist}
          {formatListeners(track.listeners) && (
            <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 6 }}>
              · {formatListeners(track.listeners)} listeners
            </span>
          )}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {track.duration && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            {formatDuration(track.duration)}
          </span>
        )}
        {track.url && (
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11, color: accentColor,
              opacity: 0.7, fontWeight: 700,
            }}
          >
            ↗
          </a>
        )}
        {selected && (
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            background: accentColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: "#fff",
          }}>✓</div>
        )}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const [mood, setMood]               = useState("");
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState("");
  const [offset, setOffset]           = useState(0);
  const [currentMood, setCurrentMood] = useState("");

  // Selection
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  const [selectAll, setSelectAll]           = useState(true);

  // Spotify auth
  const [spotifyToken, setSpotifyToken]   = useState(null);
  const [spotifyUser, setSpotifyUser]     = useState(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistUrl, setPlaylistUrl]     = useState(null);
  const [playlistError, setPlaylistError] = useState("");

  // Visuals
  const [bgColor, setBgColor]   = useState("#0a0a14");
  const [particles, setParticles] = useState([]);

  const inputRef = useRef(null);

  // Generate floating particles on mood change
  useEffect(() => {
    if (!result) return;
    const p = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 8 + 6,
      delay: Math.random() * 4,
    }));
    setParticles(p);
  }, [result?.mood?.color]);

  // Listen for Spotify OAuth callback
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "SPOTIFY_AUTH_SUCCESS") {
        setSpotifyToken(e.data.access_token);
        fetchSpotifyUser(e.data.access_token);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const fetchSpotifyUser = async (token) => {
    try {
      const res = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSpotifyUser(data);
    } catch (_) {}
  };

  const connectSpotify = () => {
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${window.location.origin}/callback`,
      scope: SPOTIFY_SCOPES,
    });
    window.open(
      `https://accounts.spotify.com/authorize?${params}`,
      "spotify-auth",
      "width=480,height=640"
    );
  };

  const search = async (newMood, newOffset = 0) => {
    const q = newMood || mood;
    if (!q.trim() || loading) return;

    if (newOffset === 0) {
      setLoading(true);
      setResult(null);
      setSelectedTracks(new Set());
      setPlaylistUrl(null);
      setPlaylistError("");
    } else {
      setLoadingMore(true);
    }
    setError("");
    setCurrentMood(q);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: q.trim(), offset: newOffset }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (newOffset === 0) {
        setResult(data);
        const allUris = new Set(data.tracks.map((t) => t.uri).filter(Boolean));
        setSelectedTracks(allUris);
        if (data.mood?.color) setBgColor(data.mood.color);
      } else {
        setResult((prev) => ({
          ...prev,
          tracks: [...(prev?.tracks || []), ...data.tracks],
        }));
        data.tracks.forEach((t) => {
          if (t.uri) setSelectedTracks((s) => new Set([...s, t.uri]));
        });
      }
      setOffset(newOffset + 25);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
    setLoadingMore(false);
  };

  const toggleTrack = (track) => {
    if (!track.uri) return;
    setSelectedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(track.uri)) next.delete(track.uri);
      else next.add(track.uri);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedTracks(new Set());
      setSelectAll(false);
    } else {
      const allUris = new Set(result?.tracks?.map((t) => t.uri).filter(Boolean));
      setSelectedTracks(allUris);
      setSelectAll(true);
    }
  };

  const savePlaylist = async () => {
    if (!spotifyToken || selectedTracks.size === 0) return;
    setSavingPlaylist(true);
    setPlaylistError("");
    setPlaylistUrl(null);

    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: spotifyToken,
          trackUris: [...selectedTracks],
          playlistName: currentMood,
          moodLabel: result?.mood?.label || currentMood,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlaylistUrl(data.playlistUrl);
    } catch (e) {
      setPlaylistError("Couldn't save playlist. Try reconnecting Spotify.");
    }
    setSavingPlaylist(false);
  };

  const accentColor = result?.mood?.color || bgColor !== "#0a0a14" ? bgColor : "#a084ff";
  const rgb = hexToRgb(accentColor || "#a084ff");

  return (
    <div style={{
      minHeight: "100vh",
      background: `
        radial-gradient(ellipse at 10% 10%, rgba(${rgb}, 0.35) 0%, transparent 45%),
        radial-gradient(ellipse at 90% 85%, rgba(${rgb}, 0.22) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 50%, rgba(${rgb}, 0.08) 0%, transparent 70%),
        #080810
      `,
      color: "#fff",
      fontFamily: "'Inter', system-ui, sans-serif",
      transition: "background 2s ease",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Floating particles */}
      {particles.map((p) => (
        <div key={p.id} style={{
          position: "fixed",
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          borderRadius: "50%",
          background: accentColor,
          opacity: 0.3,
          animation: `float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
          pointerEvents: "none",
        }} />
      ))}

      <style>{`
        @keyframes float {
          from { transform: translateY(0px) scale(1); opacity: 0.2; }
          to { transform: translateY(-30px) scale(1.4); opacity: 0.45; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { outline: none; border-color: rgba(${rgb}, 0.5) !important; }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px 120px", position: "relative", zIndex: 1 }}>

        {/* Nav */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "24px 0 0",
        }}>
          <div
            onClick={() => {
              setResult(null);
              setMood("");
              setError("");
              setOffset(0);
              setSelectedTracks(new Set());
              setPlaylistUrl(null);
              setPlaylistError("");
              // keep bgColor and particles so the mood color lingers on home
            }}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <span style={{
              fontSize: 22,
              filter: `drop-shadow(0 0 8px rgba(${rgb}, 0.6))`,
            }}>〜</span>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Moodwave
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {spotifyUser ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "5px 12px", borderRadius: 20,
                background: "rgba(30,215,96,0.12)",
                border: "1px solid rgba(30,215,96,0.25)",
                fontSize: 11, color: "#1ed760", fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1ed760", display: "inline-block" }} />
                {spotifyUser.display_name || "Connected"}
              </div>
            ) : (
              <button onClick={connectSpotify} style={{
                padding: "5px 12px", borderRadius: 20, border: "none",
                background: "rgba(30,215,96,0.15)",
                color: "#1ed760", fontSize: 11, fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.04em",
              }}>
                Connect Spotify
              </button>
            )}
            <a href="https://buildbyace.vercel.app" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.02em" }}>
              by ace ↗
            </a>
          </div>
        </nav>

        {/* Hero */}
        {!result && !loading && (
          <div style={{ animation: "fadeIn 0.6s ease" }}>
            <div style={{ textAlign: "center", padding: "64px 0 44px" }}>
              <div style={{
                display: "inline-block", marginBottom: 24,
                padding: "5px 16px", borderRadius: 20,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.1em",
              }}>
                MUSIC FOR YOUR MOOD
              </div>
              <h1 style={{
                fontSize: "clamp(32px, 10vw, 56px)",
                fontWeight: 900, letterSpacing: "-0.035em",
                lineHeight: 1.05, marginBottom: 16,
              }}>
                How are you<br />
                <span style={{ color: "rgba(255,255,255,0.2)" }}>feeling right now?</span>
              </h1>
              <p style={{
                fontSize: 15, color: "rgba(255,255,255,0.35)",
                lineHeight: 1.8, maxWidth: 360, margin: "0 auto",
              }}>
                Type a mood, a vibe, an artist, or anything.
                Get music that actually fits.
              </p>
            </div>

            {/* Example mood pills */}
            <div style={{ marginBottom: 48 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.2)", textTransform: "uppercase",
                marginBottom: 14, textAlign: "center",
              }}>
                Try something like...
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {[
                  "drunk Drake", "late night crying", "gym hype",
                  "Sunday morning chill", "heartbreak but make it danceable",
                  "nostalgic 2010s", "focus mode", "driving at 2am",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => { setMood(example); search(example, 0); }}
                    style={{
                      padding: "8px 16px", borderRadius: 20,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.55)", fontSize: 12,
                      fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.1)";
                      e.target.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                      e.target.style.color = "rgba(255,255,255,0.55)";
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 10, marginBottom: 20,
            }}>
              {[
                { icon: "🎭", title: "Describe anything", desc: "A mood, an artist, a feeling, a time of day." },
                { icon: "🧠", title: "AI reads the vibe", desc: "Extracts tags and artists that match what you mean." },
                { icon: "📡", title: "Real listener data", desc: "Last.fm surfaces tracks millions of people actually play." },
                { icon: "🎧", title: "Save to Spotify", desc: "Connect once and save any result as a playlist." },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{
                  padding: "16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "rgba(255,255,255,0.8)" }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mood result header */}
        {result && (
          <div style={{ paddingTop: 36, marginBottom: 28, animation: "fadeIn 0.5s ease" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 8,
            }}>
              {result.mood.detectedArtist ? `Based on ${result.mood.detectedArtist}` : "Mood detected"}
            </div>
            <div style={{
              fontSize: "clamp(26px, 8vw, 44px)", fontWeight: 900,
              letterSpacing: "-0.03em", lineHeight: 1.1,
              color: accentColor,
              textShadow: `0 0 40px rgba(${rgb}, 0.4)`,
              marginBottom: 14,
            }}>
              {result.mood.label}
            </div>

            {/* Tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {result.mood.tags?.map((tag) => (
                <span key={tag} style={{
                  padding: "4px 12px", borderRadius: 20,
                  background: `rgba(${rgb}, 0.12)`,
                  border: `1px solid rgba(${rgb}, 0.3)`,
                  fontSize: 11, fontWeight: 600, color: accentColor,
                  letterSpacing: "0.05em",
                }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Similar artists */}
            {result.mood.similarArtists?.length > 0 && (
              <div style={{
                padding: "12px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                marginBottom: 4,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.2)", marginBottom: 8, textTransform: "uppercase",
                }}>
                  Similar artists
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {result.mood.similarArtists.map((a) => (
                    <span key={a.name} style={{
                      fontSize: 13, fontWeight: 500,
                      color: "rgba(255,255,255,0.55)",
                    }}>
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
          display: "flex", gap: 8, marginBottom: 32,
          position: result ? "sticky" : "relative",
          top: result ? 16 : "auto", zIndex: 20,
        }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(mood, 0)}
              placeholder={result ? "Try another mood or artist..." : "e.g. drunk Drake, late night crying, gym hype..."}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14,
                background: "rgba(255,255,255,0.07)",
                border: `1px solid rgba(255,255,255,0.1)`,
                color: "#fff", fontSize: 14,
                backdropFilter: "blur(20px)",
                transition: "border-color 0.2s",
              }}
            />
          </div>
          <button
            onClick={() => search(mood, 0)}
            disabled={loading || !mood.trim()}
            style={{
              padding: "14px 20px", borderRadius: 14, border: "none",
              background: loading || !mood.trim()
                ? "rgba(255,255,255,0.07)"
                : accentColor,
              color: "#fff", fontSize: 18, fontWeight: 800,
              cursor: loading || !mood.trim() ? "not-allowed" : "pointer",
              transition: "background 0.3s",
              flexShrink: 0,
              boxShadow: !loading && mood.trim() ? `0 0 20px rgba(${rgb}, 0.4)` : "none",
            }}
          >
            {loading ? "…" : "→"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", animation: "fadeIn 0.3s ease" }}>
            <div style={{
              fontSize: 40, marginBottom: 16,
              animation: "pulse 1.5s ease infinite",
              filter: `drop-shadow(0 0 12px rgba(${rgb}, 0.6))`,
            }}>〜</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
              Reading your mood...
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(255,77,109,0.1)",
            border: "1px solid rgba(255,77,109,0.2)",
            fontSize: 13, color: "#ff4d6d", marginBottom: 24,
          }}>
            {error}
          </div>
        )}

        {/* Tracks */}
        {result?.tracks?.length > 0 && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>

            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 14, flexWrap: "wrap", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.25)", textTransform: "uppercase",
                }}>
                  {result.tracks.length} tracks
                </span>
                <button onClick={toggleSelectAll} style={{
                  padding: "3px 10px", borderRadius: 8, border: "none",
                  background: "rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                }}>
                  {selectedTracks.size === result.tracks.filter(t => t.uri).length ? "Deselect all" : "Select all"}
                </button>
                {selectedTracks.size > 0 && (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    {selectedTracks.size} selected
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                tap art to preview · tap row to select
              </span>
            </div>

            {/* Track list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              {result.tracks.map((track, i) => (
                <TrackCard
                  key={`${track.name}-${i}`}
                  track={track}
                  index={i}
                  accentColor={accentColor}
                  onSelect={toggleTrack}
                  selected={selectedTracks.has(track.uri)}
                />
              ))}
            </div>

            {/* Load more */}
            <button
              onClick={() => search(currentMood, offset)}
              disabled={loadingMore}
              style={{
                width: "100%", padding: "12px", borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600,
                cursor: loadingMore ? "wait" : "pointer",
                marginBottom: 24, transition: "all 0.2s",
              }}
            >
              {loadingMore ? "Finding more..." : "+ Find more tracks"}
            </button>

            {/* Playlist section */}
            <div style={{
              padding: "20px", borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Save as Spotify playlist
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.6 }}>
                {selectedTracks.size} track{selectedTracks.size !== 1 ? "s" : ""} selected.
                {" "}The playlist will be named{" "}
                <span style={{ color: accentColor }}>"Moodwave: {result.mood.label}"</span>.
              </div>

              {playlistUrl ? (
                <a href={playlistUrl} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "block", textAlign: "center", padding: "13px",
                    borderRadius: 10, background: "#1ed760", color: "#000",
                    fontWeight: 800, fontSize: 13, letterSpacing: "0.02em",
                  }}>
                  ✓ Open playlist in Spotify ↗
                </a>
              ) : spotifyUser ? (
                <button
                  onClick={savePlaylist}
                  disabled={savingPlaylist || selectedTracks.size === 0}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 10, border: "none",
                    background: savingPlaylist || selectedTracks.size === 0
                      ? "rgba(30,215,96,0.2)"
                      : "#1ed760",
                    color: savingPlaylist || selectedTracks.size === 0 ? "rgba(255,255,255,0.4)" : "#000",
                    fontWeight: 800, fontSize: 13, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {savingPlaylist ? "Saving..." : `Save ${selectedTracks.size} tracks to Spotify`}
                </button>
              ) : (
                <button onClick={connectSpotify} style={{
                  width: "100%", padding: "13px", borderRadius: 10, border: "none",
                  background: "rgba(30,215,96,0.15)",
                  border: "1px solid rgba(30,215,96,0.3)",
                  color: "#1ed760", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>
                  Connect Spotify to save playlist
                </button>
              )}

              {playlistError && (
                <div style={{ fontSize: 12, color: "#ff4d6d", marginTop: 10 }}>
                  {playlistError}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
