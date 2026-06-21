export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getSpotifyToken() {
  const creds = btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { mood } = await request.json();
    if (!mood) return new Response("No mood provided", { status: 400 });

    // ── Step 1: Groq extracts mood profile ──────────────────────
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are a music curator. Given a mood or feeling, return a JSON object with:
- "tags": array of 4-6 Last.fm music tags that match this mood (e.g. "indie", "melancholic", "lo-fi", "jazz", "ambient")
- "artists": array of 3-4 seed artist names that fit this mood
- "color": a hex color that represents this mood visually (e.g. "#7c5cfc" for dreamy, "#ff6b35" for energetic)
- "label": a 2-4 word poetic label for the mood (e.g. "golden nostalgia", "electric restlessness")
Return ONLY valid JSON, no markdown, no explanation.`,
          },
          { role: "user", content: mood },
        ],
      }),
    });

    const groqData = await groqRes.json();
    const raw = groqData.choices[0].message.content.trim();
    const moodProfile = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const { tags, artists, color, label } = moodProfile;

    const LASTFM_KEY = process.env.LASTFM_API_KEY;
    const trackSet = new Map();

    // ── Step 2: Last.fm tag search ───────────────────────────────
    for (const tag of tags.slice(0, 3)) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_KEY}&format=json&limit=15`;
        const res = await fetch(url);
        const data = await res.json();
        const tracks = data?.tracks?.track || [];
        for (const t of tracks) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          if (!trackSet.has(key)) {
            trackSet.set(key, {
              name: t.name,
              artist: t.artist.name,
              listeners: parseInt(t.listeners || 0),
            });
          }
        }
      } catch (_) {}
    }

    // ── Step 3: Seed artist top tracks ──────────────────────────
    for (const artist of artists.slice(0, 2)) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY}&format=json&limit=8`;
        const res = await fetch(url);
        const data = await res.json();
        const tracks = data?.toptracks?.track || [];
        for (const t of tracks) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          if (!trackSet.has(key)) {
            trackSet.set(key, {
              name: t.name,
              artist: t.artist.name,
              listeners: parseInt(t.listeners || 0),
            });
          }
        }
      } catch (_) {}
    }

    const candidates = [...trackSet.values()]
      .sort((a, b) => b.listeners - a.listeners)
      .slice(0, 25);

    // ── Step 4: Similar artists ──────────────────────────────────
    const similarArtists = [];
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artists[0])}&api_key=${LASTFM_KEY}&format=json&limit=6`;
      const res = await fetch(url);
      const data = await res.json();
      const similar = data?.similarartists?.artist || [];
      for (const a of similar) {
        similarArtists.push({ name: a.name, match: parseFloat(a.match).toFixed(2) });
      }
    } catch (_) {}

    // ── Step 5: Spotify enrichment ───────────────────────────────
    const spotifyToken = await getSpotifyToken();
    const enriched = [];

    for (const track of candidates) {
      try {
        const q = encodeURIComponent(`track:${track.name} artist:${track.artist}`);
        const res = await fetch(
          `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
          { headers: { Authorization: `Bearer ${spotifyToken}` } }
        );
        const data = await res.json();
        const item = data?.tracks?.items?.[0];
        if (item) {
          enriched.push({
            name: item.name,
            artist: item.artists.map((a) => a.name).join(", "),
            album: item.album.name,
            image: item.album.images?.[0]?.url || null,
            preview: item.preview_url || null,
            url: item.external_urls?.spotify || null,
            duration: item.duration_ms,
            listeners: track.listeners,
          });
        }
      } catch (_) {}
      if (enriched.length >= 25) break;
    }

    return new Response(
      JSON.stringify({
        tracks: enriched,
        mood: { label, color, tags, similarArtists },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
