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
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { mood, offset = 0, topArtists = [] } = await request.json();
    if (!mood) return new Response("No mood provided", { status: 400 });

    const LASTFM_KEY = process.env.LASTFM_API_KEY;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are a music curator. Given a mood, feeling, or music description, return a JSON object with:
- "tags": array of 4-6 Last.fm music tags matching the mood/vibe, genre accuracy is critical, do not mix unrelated genres
- "artists": array of 3-5 seed artist names who genuinely fit the mood and genre described. IMPORTANT: if the user mentions a specific artist by name, always include them first
- "color": a hex color representing this mood visually
- "label": a 2-4 word poetic label for the mood
- "detectedArtist": the name of any specific artist mentioned by the user, or null if none
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

    const trackSet = new Map();

    if (detectedArtist) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(detectedArtist)}&api_key=${LASTFM_KEY}&format=json&limit=20`;
        const res = await fetch(url);
        const data = await res.json();
        for (const t of data?.toptracks?.track || []) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 1 });
        }
      } catch (_) {}
    }

    for (const tag of tags.slice(0, 3)) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_KEY}&format=json&limit=20&page=${Math.floor(offset / 20) + 1}`;
        const res = await fetch(url);
        const data = await res.json();
        for (const t of data?.tracks?.track || []) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          if (!trackSet.has(key)) {
            trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 2 });
          }
        }
      } catch (_) {}
    }

    const genreSeedArtists = artists.slice(0, 3);
    for (const artist of genreSeedArtists) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY}&format=json&limit=10`;
        const res = await fetch(url);
        const data = await res.json();
        for (const t of data?.toptracks?.track || []) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          if (!trackSet.has(key)) {
            trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 3 });
          }
        }
      } catch (_) {}
    }

    if (topArtists.length > 0) {
      const personalArtists = topArtists.slice(0, 3).filter(a => !genreSeedArtists.includes(a));
      for (const artist of personalArtists) {
        try {
          const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY}&format=json&limit=8`;
          const res = await fetch(url);
          const data = await res.json();
          for (const t of data?.toptracks?.track || []) {
            const key = `${t.name}::${t.artist.name}`.toLowerCase();
            if (!trackSet.has(key)) {
              trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 4 });
            }
          }
        } catch (_) {}
      }
    }

    const similarArtists = [];
    try {
      const seedArtist = detectedArtist || artists[0];
      const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(seedArtist)}&api_key=${LASTFM_KEY}&format=json&limit=6`;
      const res = await fetch(url);
      const data = await res.json();
      for (const a of data?.similarartists?.artist || []) similarArtists.push({ name: a.name });
    } catch (_) {}

    const ARTIST_CAP = 2;
    const artistCounts = new Map();
    const withinCap = (t) => {
      const key = t.artist.toLowerCase();
      const count = artistCounts.get(key) || 0;
      if (count >= ARTIST_CAP) return false;
      artistCounts.set(key, count + 1);
      return true;
    };

    const genrePool = [...trackSet.values()]
      .filter(t => t.priority <= 3)
      .sort((a, b) => a.priority - b.priority || b.listeners - a.listeners);

    const personalPool = [...trackSet.values()]
      .filter(t => t.priority === 4)
      .sort((a, b) => b.listeners - a.listeners);

    const candidates = [];
    let gi = 0, pi = 0, skipG = Math.floor(offset * (2 / 3)), skipP = Math.floor(offset * (1 / 3));

    while (candidates.length < 25 && (gi < genrePool.length || pi < personalPool.length)) {
      let added = 0;
      while (added < 2 && gi < genrePool.length && candidates.length < 25) {
        const t = genrePool[gi++];
        if (!withinCap(t)) continue;
        if (skipG > 0) { skipG--; continue; }
        candidates.push(t);
        added++;
      }
      if (pi < personalPool.length && candidates.length < 25) {
        const t = personalPool[pi++];
        if (withinCap(t)) {
          if (skipP > 0) skipP--;
          else candidates.push(t);
        }
      }
      if (gi >= genrePool.length && pi >= personalPool.length) break;
    }

    const spotifyToken = await getSpotifyToken();
    const enriched = [];

    for (const track of candidates) {
      try {
        const q = encodeURIComponent(`track:${track.name} artist:${track.artist}`);
        const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, { headers: { Authorization: `Bearer ${spotifyToken}` } });
        const data = await res.json();
        const item = data?.tracks?.items?.[0];
        if (item) {
          enriched.push({
            name: item.name, artist: item.artists.map(a => a.name).join(", "),
            album: item.album.name,
            image: item.album.images?.[1]?.url || item.album.images?.[0]?.url || null,
            preview: item.preview_url || null,
            url: item.external_urls?.spotify || null,
            uri: item.uri, duration: item.duration_ms, listeners: track.listeners,
          });
        }
      } catch (_) {}
      if (enriched.length >= 25) break;
    }

    return new Response(
      JSON.stringify({ tracks: enriched, mood: { label, color, tags, similarArtists, detectedArtist } }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
}
