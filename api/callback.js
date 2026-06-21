export const config = { runtime: "edge" };

export default async function handler(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return new Response(`
      <html><body><script>
        window.opener?.postMessage({ type: "SPOTIFY_AUTH_ERROR", error: "${error || 'no_code'}" }, "*");
        window.close();
      </script></body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  try {
    const creds = btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/callback`,
      }),
    });

    const data = await res.json();

    return new Response(`
      <html><body><script>
        window.opener?.postMessage({
          type: "SPOTIFY_AUTH_SUCCESS",
          access_token: "${data.access_token}",
          refresh_token: "${data.refresh_token}"
        }, "*");
        window.close();
      </script></body></html>
    `, { headers: { "Content-Type": "text/html" } });

  } catch (e) {
    return new Response(`
      <html><body><script>
        window.opener?.postMessage({ type: "SPOTIFY_AUTH_ERROR", error: "token_exchange_failed" }, "*");
        window.close();
      </script></body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }
}
