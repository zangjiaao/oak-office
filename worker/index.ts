export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, name: "oak-office" });
    }
    return new Response(null, { status: 404 });
  },
};
