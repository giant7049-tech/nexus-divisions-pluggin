const AUTH_PUBLIC_ROUTES = new Set([
  "/auth/login",
  "/auth/register",
]);

function normalizeRoute(path) {
  if (!path || typeof path !== "string") {
    return "/";
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      return new URL(path).pathname || "/";
    } catch {
      return "/";
    }
  }

  const clean = path.trim();

  if (!clean) {
    return "/";
  }

  const candidate = clean.startsWith("/") ? clean : `/${clean}`;
  return candidate === "" ? "/" : candidate;
}

function shouldRequireAuthentication(path, authenticated) {
  const route = normalizeRoute(path);

  if (authenticated) {
    return false;
  }

  if (AUTH_PUBLIC_ROUTES.has(route) || route.startsWith("/auth/")) {
    return false;
  }

  return true;
}

function resolveAuthRoute(path, authenticated) {
  const route = normalizeRoute(path);

  if (!authenticated && !AUTH_PUBLIC_ROUTES.has(route) && !route.startsWith("/auth/")) {
    return "/auth/login";
  }

  if (authenticated && (route === "/auth/login" || route === "/auth/register")) {
    return "/";
  }

  return route;
}

export {
  AUTH_PUBLIC_ROUTES,
  normalizeRoute,
  shouldRequireAuthentication,
  resolveAuthRoute,
};
