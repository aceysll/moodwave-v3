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
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { mood, offset = 0 } = await request.json();
    if (!mood) return new Response("No mood provided", { status: 400 });

    const LASTFM_KEY = process.env.LASTFM_API_KEY;

    // ── Step 1: Groq mood analysis with artist detection ─────────
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are a music curator. Given a mood, feeling, or music description, return a JSON object with:
- "tags": array of 4-6 Last.fm music tags matching the mood/vibe
- "artists": array of 3-5 seed artist names. IMPORTANT: if the user mentions a specific artist by name, always include them first
- "color": a hex color representing this mood visually
- "label": a 2-4 word poetic label for the mood
- "detectedArtist": the name of any specific artist mentioned by the user, or null if none
Examples:
- "drunk drake" -> detectedArtist: "Drake", artists: ["Drake", "The Weeknd", "PartyNextDoor"]
- "kanye workout" -> detectedArtist: "Kanye West", artists: ["Kanye West", "Jay-Z", "Travis Scott"]  
- "sad and rainy" -> detectedArtist: null, artists based on mood only
Return ONLY valid JSON, no markdown.`,
          },
          { role: "user", content: mood },
        ],
      }),
    });

    const groqData = await groqRes.json();
    const raw = groqData.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    const moodProfile = JSON.parse(raw);
    const { tags, artists, color, label, detectedArtist } = moodProfile;

    const LASTFM_KEY2 = LASTFM_KEY;
    const trackSet = new Map();

    // ── Step 2: If specific artist detected, get their tracks first
    if (detectedArtist) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(detectedArtist)}&api_key=${LASTFM_KEY2}&format=json&limit=20`;
        const res = await fetch(url);
        const data = await res.json();
        const tracks = data?.toptracks?.track || [];
        for (const t of tracks) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          trackSet.set(key, {
            name: t.name,
            artist: t.artist.name,
            listeners: parseInt(t.listeners || 0),
            priority: 1,
          });
        }
      } catch (_) {}
    }

    // ── Step 3: Tag-based discovery ──────────────────────────────
    for (const tag of tags.slice(0, 3)) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_KEY2}&format=json&limit=20&page=${Math.floor(offset / 20) + 1}`;
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
              priority: 2,
            });
          }
        }
      } catch (_) {}
    }

    // ── Step 4: Seed artist tracks ───────────────────────────────
    for (const artist of artists.slice(0, 3)) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY2}&format=json&limit=10`;
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
              priority: 3,
            });
          }
        }
      } catch (_) {}
    }

    // ── Step 5: Similar artists ──────────────────────────────────
    const similarArtists = [];
    try {
      const seedArtist = detectedArtist || artists[0];
      const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(seedArtist)}&api_key=${LASTFM_KEY2}&format=json&limit=6`;
      const res = await fetch(url);
      const data = await res.json();
      const similar = data?.similarartists?.artist || [];
      for (const a of similar) {
        similarArtists.push({ name: a.name });
      }
    } catch (_) {}

    // Sort: priority first, then by listeners
    const candidates = [...trackSet.values()]
      .sort((a, b) => a.priority - b.priority || b.listeners - a.listeners)
      .slice(offset, offset + 25);

    // ── Step 6: Spotify enrichment ───────────────────────────────
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
            image: item.album.images?.[1]?.url || item.album.images?.[0]?.url || null,
            preview: item.preview_url || null,
            url: item.external_urls?.spotify || null,
            uri: item.uri,
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
        mood: { label, color, tags, similarArtists, detectedArtist },
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
