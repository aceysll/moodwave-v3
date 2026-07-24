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
- "tags": array of 3-5 Last.fm music tags, ordered from MOST specific to least specific relative to what the user typed. If they named a subgenre (e.g. "pop rap", "drill", "boom bap"), that exact tag must be first and should dominate results. Backup tags MUST stay within the same genre family as the specific one, do not include a broader tag just because it shares a word (e.g. for "pop rap", valid backups are "rap", "hip hop", "trap", but NOT plain "pop", since Last.fm's "pop" tag returns mainstream pop unrelated to rap)
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
    const moodTagsLower = tags.map(t => t.toLowerCase());

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

    const weightedTags = tags.slice(0, 4).map((tag, i) => ({ tag, limit: i === 0 ? 30 : 8 }));
    const tagResults = await Promise.allSettled(
      weightedTags.map(({ tag, limit }) =>
        fetch(`https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_KEY}&format=json&limit=${limit}&page=${Math.floor(offset / 20) + 1}`)
          .then(r => r.json())
      )
    );
    for (const result of tagResults) {
      if (result.status !== "fulfilled") continue;
      for (const t of result.value?.tracks?.track || []) {
        const key = `${t.name}::${t.artist.name}`.toLowerCase();
        if (!trackSet.has(key)) {
          trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 2 });
        }
      }
    }

    const genreSeedArtists = artists.slice(0, 3);
    const genreArtistResults = await Promise.allSettled(
      genreSeedArtists.map(artist =>
        fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY}&format=json&limit=10`)
          .then(r => r.json())
      )
    );
    for (const result of genreArtistResults) {
      if (result.status !== "fulfilled") continue;
      for (const t of result.value?.toptracks?.track || []) {
        const key = `${t.name}::${t.artist.name}`.toLowerCase();
        if (!trackSet.has(key)) {
          trackSet.set(key, { name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0), priority: 3 });
        }
      }
    }

    if (topArtists.length > 0) {
      const personalArtists = topArtists.slice(0, 3).filter(a => !genreSeedArtists.includes(a));

      const personalArtistTracks = await Promise.allSettled(
        personalArtists.map(artist =>
          fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_KEY}&format=json&limit=12`)
            .then(r => r.json())
            .then(data => ({ artist, tracks: data?.toptracks?.track || [] }))
        )
      );

      const tagCheckJobs = [];
      for (const result of personalArtistTracks) {
        if (result.status !== "fulfilled") continue;
        const { artist, tracks } = result.value;
        for (const t of tracks) {
          const key = `${t.name}::${t.artist.name}`.toLowerCase();
          if (trackSet.has(key)) continue;
          tagCheckJobs.push({ key, name: t.name, artist: t.artist.name, listeners: parseInt(t.listeners || 0) });
        }
      }

      const tagCheckResults = await Promise.allSettled(
        tagCheckJobs.map(job =>
          fetch(`https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${encodeURIComponent(job.artist)}&track=${encodeURIComponent(job.name)}&api_key=${LASTFM_KEY}&format=json`)
            .then(r => r.json())
            .then(data => ({ job, tagData: data }))
        )
      );

      let matched = 0;
      for (const result of tagCheckResults) {
        if (matched >= 8) break;
        if (result.status !== "fulfilled") continue;
        const { job, tagData } = result.value;
        if (trackSet.has(job.key)) continue;
        const trackTags = (tagData?.toptags?.tag || []).map(tg => tg.name.toLowerCase());
        const fits = trackTags.some(tg => moodTagsLower.some(mt => tg.includes(mt) || mt.includes(tg)));
        if (fits) {
          trackSet.set(job.key, { name: job.name, artist: job.artist, listeners: job.listeners, priority: 4 });
          matched++;
        }
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

    const enrichResults = await Promise.allSettled(
      candidates.map(track => {
        const q = encodeURIComponent(`track:${track.name} artist:${track.artist}`);
        return fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, { headers: { Authorization: `Bearer ${spotifyToken}` } })
          .then(r => r.json())
          .then(data => ({ track, item: data?.tracks?.items?.[0] }));
      })
    );

    const enriched = [];
    for (const result of enrichResults) {
      if (result.status !== "fulfilled") continue;
      const { track, item } = result.value;
      if (!item) continue;
      enriched.push({
        name: item.name, artist: item.artists.map(a => a.name).join(", "),
        album: item.album.name,
        image: item.album.images?.[1]?.url || item.album.images?.[0]?.url || null,
        preview: item.preview_url || null,
        url: item.external_urls?.spotify || null,
        uri: item.uri, duration: item.duration_ms, listeners: track.listeners,
      });
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
