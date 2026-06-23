import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";

const SPOTIFY_CLIENT_ID = "96840892a29d4622892cddfecbfc4d1c";
const SPOTIFY_SCOPES = "playlist-modify-private playlist-modify-public user-top-read";

export function connectSpotify() {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${window.location.origin}/callback`,
    scope: SPOTIFY_SCOPES,
  });
  window.open(`https://accounts.spotify.com/authorize?${params}`, "spotify-auth", "width=500,height=700");
}

export default function App() {
  const [spotifyToken, setSpotifyToken] = useState(() => sessionStorage.getItem("mw_token") || null);
  const [spotifyUser, setSpotifyUser] = useState(() => {
    const u = sessionStorage.getItem("mw_user");
    return u ? JSON.parse(u) : null;
  });
  const [topArtists, setTopArtists] = useState(() => {
    const a = sessionStorage.getItem("mw_top_artists");
    return a ? JSON.parse(a) : [];
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "SPOTIFY_AUTH_SUCCESS") {
        const token = e.data.access_token;
        setSpotifyToken(token);
        sessionStorage.setItem("mw_token", token);
        fetchUserData(token);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  async function fetchUserData(token) {
    try {
      const [userRes, artistsRes] = await Promise.all([
        fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("https://api.spotify.com/v1/me/top/artists?limit=5&time_range=medium_term", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const user = await userRes.json();
      const artistsData = await artistsRes.json();
      const artists = (artistsData.items || []).map(a => a.name);
      setSpotifyUser(user);
      setTopArtists(artists);
      sessionStorage.setItem("mw_user", JSON.stringify(user));
      sessionStorage.setItem("mw_top_artists", JSON.stringify(artists));
    } catch (_) {}
  }

  function disconnect() {
    setSpotifyToken(null);
    setSpotifyUser(null);
    setTopArtists([]);
    sessionStorage.removeItem("mw_token");
    sessionStorage.removeItem("mw_user");
    sessionStorage.removeItem("mw_top_artists");
  }

  const ctx = { spotifyToken, spotifyUser, topArtists, disconnect };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home ctx={ctx} />} />
        <Route path="/results" element={<Results ctx={ctx} />} />
      </Routes>
    </BrowserRouter>
  );
}

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
  const audioRef = useState(null);
  const ref = { current: null };

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!track.preview) return;
    const audio = document.getElementById(`audio-${index}`);
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      document.querySelectorAll("audio").forEach((a) => a.pause());
      setPlaying(false);
      audio.play();
      setPlaying(true);
    }
  };

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
        cursor: "pointer", transition: "all 0.18s",
      }}
    >
      <div style={{ width: 20, textAlign: "center", flexShrink: 0, fontSize: 11, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>
        {index + 1}
      </div>
      <div onClick={togglePlay} style={{
        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
        background: track.image ? `url(${track.image}) center/cover` : `rgba(${hexToRgb(accentColor)}, 0.2)`,
        cursor: track.preview ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {track.preview && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: playing || hover ? 1 : 0, transition: "opacity 0.2s", fontSize: 14,
          }}>
            {playing ? "⏸" : "▶"}
          </div>
        )}
        {!track.image && <span style={{ fontSize: 16, opacity: 0.5 }}>♪</span>}
        {track.preview && <audio id={`audio-${index}`} src={track.preview} onEnded={() => setPlaying(false)} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "#fff" : "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
          {track.name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {track.artist}
          {formatListeners(track.listeners) && (
            <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 6 }}>· {formatListeners(track.listeners)} listeners</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {track.duration && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{formatDuration(track.duration)}</span>}
        {track.url && (
          <a href={track.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: accentColor, opacity: 0.7, fontWeight: 700 }}>↗</a>
        )}
        {selected && (
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>✓</div>
        )}
      </div>
    </div>
  );
}

// ── Home Page ──────────────────────────────────────────────────
function Home({ ctx }) {
  const { spotifyUser, topArtists, disconnect } = ctx;
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [particles, setParticles] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const p = Array.from({ length: 16 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1, duration: Math.random() * 10 + 8, delay: Math.random() * 5,
    }));
    setParticles(p);
  }, []);

  async function search() {
    if (!mood.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: mood.trim(), offset: 0, topArtists }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      sessionStorage.setItem("mw_result", JSON.stringify(data));
      sessionStorage.setItem("mw_mood", mood.trim());
      navigate("/results");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#07070f", color: "#fff",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 24px", position: "relative", overflow: "hidden",
    }}>
      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: "50%",
          background: "rgba(139,92,246,0.4)",
          animation: `float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
          pointerEvents: "none",
        }} />
      ))}

      <style>{`
        @keyframes float { from { transform: translateY(0px) scale(1); opacity: 0.3; } to { transform: translateY(-30px) scale(1.5); opacity: 0.8; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        input { outline: none; box-sizing: border-box; }
        * { box-sizing: border-box; }
        a { text-decoration: none; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 560, animation: "fadeIn 0.6s ease" }}>
        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 64 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
            mood<span style={{ color: "#8b5cf6" }}>wave</span>
          </div>
          {spotifyUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {spotifyUser.display_name}
                {topArtists.length > 0 && <span style={{ color: "#1ed760", marginLeft: 6 }}>· tuned in</span>}
              </div>
              <button onClick={disconnect} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>disconnect</button>
            </div>
          ) : (
            <button onClick={connectSpotify} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(30,215,96,0.3)",
              background: "rgba(30,215,96,0.08)", color: "#1ed760",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              Connect Spotify
            </button>
          )}
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 48, textAlign: "center" }}>
          <h1 style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 16, margin: "0 0 16px" }}>
            What are you<br />
            <span style={{ color: "#8b5cf6" }}>feeling right now?</span>
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, margin: 0 }}>
            Type a mood, vibe, or artist. We find the music.
            {topArtists.length > 0 && (
              <span style={{ display: "block", marginTop: 8, color: "rgba(30,215,96,0.7)", fontSize: 13 }}>
                Personalizing for your taste based on your Spotify history.
              </span>
            )}
          </p>
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="drunk Drake, late night crying, gym hype..."
            style={{
              flex: 1, padding: "16px 20px", borderRadius: 14,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 15,
              backdropFilter: "blur(20px)",
            }}
          />
          <button
            onClick={search}
            disabled={loading || !mood.trim()}
            style={{
              padding: "16px 22px", borderRadius: 14, border: "none",
              background: loading || !mood.trim() ? "rgba(255,255,255,0.07)" : "#8b5cf6",
              color: "#fff", fontSize: 20, fontWeight: 800,
              cursor: loading || !mood.trim() ? "not-allowed" : "pointer",
              transition: "background 0.3s", flexShrink: 0,
              boxShadow: !loading && mood.trim() ? "0 0 24px rgba(139,92,246,0.5)" : "none",
            }}
          >
            {loading ? "…" : "→"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,77,109,0.1)", border: "1px solid rgba(255,77,109,0.2)", fontSize: 13, color: "#ff4d6d" }}>
            {error}
          </div>
        )}

        {/* Suggestions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
          {["late night drive", "sad but make it cute", "gym beast mode", "sunday morning chill", "heartbreak era"].map(s => (
            <button key={s} onClick={() => setMood(s)} style={{
              padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)",
              fontSize: 12, cursor: "pointer", transition: "all 0.15s",
            }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 60, textAlign: "center" }}>
          <a href="https://buildbyace.vercel.app" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>by ace ↗</a>
        </div>
      </div>
    </div>
  );
}

// ── Results Page ───────────────────────────────────────────────
function Results({ ctx }) {
  const { spotifyToken, spotifyUser, topArtists } = ctx;
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(25);
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const [playlistError, setPlaylistError] = useState("");
  const [newMood, setNewMood] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("mw_result");
    const m = sessionStorage.getItem("mw_mood");
    if (!raw) { navigate("/"); return; }
    const data = JSON.parse(raw);
    setResult(data);
    setMood(m || "");
    const uris = new Set(data.tracks.filter(t => t.uri).map(t => t.uri));
    setSelectedTracks(uris);
  }, []);

  const accentColor = result?.mood?.color || "#8b5cf6";
  const rgb = accentColor ? hexToRgb(accentColor) : "139,92,246";

  async function searchNew(m, off) {
    const isLoadMore = off > 0;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: m, offset: off, topArtists }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (isLoadMore) {
        setResult(prev => ({ ...prev, tracks: [...prev.tracks, ...data.tracks] }));
        setOffset(off + 25);
        const newUris = new Set([...selectedTracks, ...data.tracks.filter(t => t.uri).map(t => t.uri)]);
        setSelectedTracks(newUris);
      } else {
        setResult(data);
        setMood(m);
        sessionStorage.setItem("mw_result", JSON.stringify(data));
        sessionStorage.setItem("mw_mood", m);
        setOffset(25);
        setPlaylistUrl(null);
        const uris = new Set(data.tracks.filter(t => t.uri).map(t => t.uri));
        setSelectedTracks(uris);
      }
    } catch (e) { setError(e.message || "Something went wrong."); }
    if (isLoadMore) setLoadingMore(false); else setLoading(false);
  }

  function toggleTrack(track) {
    if (!track.uri) return;
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(track.uri)) next.delete(track.uri); else next.add(track.uri);
      return next;
    });
  }

  async function savePlaylist() {
    if (!spotifyToken || selectedTracks.size === 0) return;
    setSavingPlaylist(true);
    setPlaylistError("");
    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: spotifyToken,
          trackUris: [...selectedTracks],
          playlistName: mood,
          moodLabel: result.mood.label,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlaylistUrl(data.playlistUrl);
    } catch (e) { setPlaylistError(e.message); }
    setSavingPlaylist(false);
  }

  if (!result) return null;

  return (
    <div style={{
      minHeight: "100vh", color: "#fff",
      fontFamily: "'Inter', system-ui, sans-serif",
      background: `radial-gradient(ellipse at 20% 20%, rgba(${rgb}, 0.12) 0%, #07070f 60%)`,
      transition: "background 1s ease",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        input { outline: none; }
        a { text-decoration: none; }
      `}</style>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(7,7,15,0.85)", backdropFilter: "blur(20px)",
      }}>
        <button onClick={() => navigate("/")} style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", background: "none", border: "none", cursor: "pointer" }}>
          mood<span style={{ color: accentColor }}>wave</span>
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {spotifyUser && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{spotifyUser.display_name}</span>}
          {!spotifyUser && (
            <button onClick={connectSpotify} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(30,215,96,0.3)", background: "rgba(30,215,96,0.08)", color: "#1ed760", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Connect Spotify
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Mood header */}
        {result.mood && (
          <div style={{ marginBottom: 32, animation: "fadeIn 0.5s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: accentColor, boxShadow: `0 0 12px rgba(${rgb},0.8)` }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>Now playing for</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px", color: accentColor }}>
              {result.mood.label}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.mood.tags?.map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.2)`, color: `rgba(${rgb.split(",").map(n => parseInt(n) + 60).join(",")},1)` }}>
                  {tag}
                </span>
              ))}
            </div>
            {topArtists.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(30,215,96,0.6)" }}>
                Personalized for your taste
              </div>
            )}
          </div>
        )}

        {/* Search bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 32, position: "sticky", top: 72, zIndex: 10 }}>
          <input
            value={newMood}
            onChange={(e) => setNewMood(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newMood.trim() && searchNew(newMood.trim(), 0)}
            placeholder="Try another mood or artist..."
            style={{
              flex: 1, padding: "13px 18px", borderRadius: 12,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 14, backdropFilter: "blur(20px)",
            }}
          />
          <button onClick={() => newMood.trim() && searchNew(newMood.trim(), 0)} disabled={loading || !newMood.trim()} style={{
            padding: "13px 18px", borderRadius: 12, border: "none",
            background: loading || !newMood.trim() ? "rgba(255,255,255,0.07)" : accentColor,
            color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", flexShrink: 0,
            transition: "background 0.3s",
          }}>
            {loading ? "…" : "→"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,77,109,0.1)", border: "1px solid rgba(255,77,109,0.2)", fontSize: 13, color: "#ff4d6d", marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Tracks */}
        {result.tracks?.length > 0 && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>
                {result.tracks.length} tracks · {selectedTracks.size} selected
              </span>
              <button onClick={() => {
                const uris = result.tracks.filter(t => t.uri).map(t => t.uri);
                if (selectedTracks.size === uris.length) setSelectedTracks(new Set());
                else setSelectedTracks(new Set(uris));
              }} style={{ padding: "3px 10px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {selectedTracks.size === result.tracks.filter(t => t.uri).length ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              {result.tracks.map((track, i) => (
                <TrackCard key={`${track.name}-${i}`} track={track} index={i} accentColor={accentColor} onSelect={toggleTrack} selected={selectedTracks.has(track.uri)} />
              ))}
            </div>

            <button onClick={() => searchNew(mood, offset)} disabled={loadingMore} style={{
              width: "100%", padding: "12px", borderRadius: 12,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600,
              cursor: loadingMore ? "wait" : "pointer", marginBottom: 24, transition: "all 0.2s",
            }}>
              {loadingMore ? "Finding more..." : "+ Find more tracks"}
            </button>

            {/* Playlist */}
            <div style={{ padding: "20px", borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Save as Spotify playlist</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.6 }}>
                {selectedTracks.size} track{selectedTracks.size !== 1 ? "s" : ""} selected. Playlist: <span style={{ color: accentColor }}>"Moodwave: {result.mood.label}"</span>
              </div>

              {playlistUrl ? (
                <a href={playlistUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", padding: "13px", borderRadius: 10, background: "#1ed760", color: "#000", fontWeight: 800, fontSize: 13 }}>
                  Open playlist in Spotify ↗
                </a>
              ) : spotifyUser ? (
                <button onClick={savePlaylist} disabled={savingPlaylist || selectedTracks.size === 0} style={{
                  width: "100%", padding: "13px", borderRadius: 10, border: "none",
                  background: savingPlaylist || selectedTracks.size === 0 ? "rgba(30,215,96,0.2)" : "#1ed760",
                  color: savingPlaylist || selectedTracks.size === 0 ? "rgba(255,255,255,0.4)" : "#000",
                  fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s",
                }}>
                  {savingPlaylist ? "Saving..." : `Save ${selectedTracks.size} tracks to Spotify`}
                </button>
              ) : (
                <button onClick={connectSpotify} style={{
                  width: "100%", padding: "13px", borderRadius: 10,
                  background: "rgba(30,215,96,0.15)", border: "1px solid rgba(30,215,96,0.3)",
                  color: "#1ed760", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>
                  Connect Spotify to save playlist
                </button>
              )}

              {playlistError && <div style={{ fontSize: 12, color: "#ff4d6d", marginTop: 10 }}>{playlistError}</div>}
            </div>

            {/* Similar artists */}
            {result.mood?.similarArtists?.length > 0 && (
              <div style={{ marginTop: 24, padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.2)", marginBottom: 10, textTransform: "uppercase" }}>Similar artists</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {result.mood.similarArtists.map(a => (
                    <span key={a.name} style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>{a.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 48, textAlign: "center" }}>
          <a href="https://buildbyace.vercel.app" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>by ace ↗</a>
        </div>
      </div>
    </div>
  );
}
