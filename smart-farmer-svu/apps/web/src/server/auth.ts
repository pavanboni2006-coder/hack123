import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import {
  clearAdminAuth,
  clearAuth,
  clearPreAuth,
  clearResetAuth,
  getSessionState,
  persistAuth,
  setAdminAuth,
  setPreAuth,
  setResetAuth,
  type SessionUser,
} from "@/lib/auth";
import { COOKIE_NAMES } from "@/lib/cookies";
import { redirect, redirectWithFlash, sanitizeNextUrl } from "@/lib/http";
import { normalizeLanguage } from "@/lib/language";
import { renderTemplate } from "@/lib/template";

import { getString, jsonResponse } from "@/server/utils";

function applyPreferredLanguage(response: NextResponse, user?: SessionUser | null): void {
  if (!user?.preferred_language || !user.preferred_language.trim()) {
    return;
  }
  const preferredLanguage = normalizeLanguage(user.preferred_language);
  response.cookies.set(COOKIE_NAMES.lang, preferredLanguage, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function defaultPostAuthPath(user?: SessionUser | null): string {
  if (!user) {
    return "/";
  }
  if (user.role === "farmer") {
    return "/farmer/dashboard";
  }
  if (user.role === "admin") {
    return "/admin/dashboard";
  }
  return "/marketplace";
}

function getRequestedNextPath(request: NextRequest, fallback?: string | null): string {
  const fromQuery = sanitizeNextUrl(request.nextUrl.searchParams.get("next"));
  const fromFallback = sanitizeNextUrl(fallback || "/");
  return fromQuery !== "/" ? fromQuery : fromFallback;
}

function buildAuthHref(pathname: string, nextPath: string): string {
  return nextPath && nextPath !== "/" ? `${pathname}?next=${encodeURIComponent(nextPath)}` : pathname;
}

function buildAuthTemplateContext(request: NextRequest, mode: string, formAction: string, extra: Record<string, unknown> = {}) {
  const nextPath = getRequestedNextPath(request);
  return {
    mode,
    form_action: formAction,
    next_path: nextPath !== "/" ? nextPath : "",
    login_href: buildAuthHref("/login", nextPath),
    register_href: buildAuthHref("/register", nextPath),
    forgot_password_href: buildAuthHref("/forgot_password", nextPath),
    ...extra,
  };
}

export async function loginPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (session.user) {
    return redirect(request, "/");
  }
  return renderTemplate(request, "auth.html", buildAuthTemplateContext(request, "login", "/login"), "login");
}

export async function loginAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/login/", {
    method: "POST",
    body: {
      email: getString(formData, "email"),
      password: getString(formData, "password"),
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/login", "error", String(data.message || "Invalid email or password"));
  }
  const nextPath = sanitizeNextUrl(getString(formData, "next"));
  const next = redirect(request, buildAuthHref("/verify", nextPath));
  setPreAuth(next, {
    challengeId: String(data.challenge_id),
    email: String(data.email || getString(formData, "email")),
    purpose: String(data.purpose || "login"),
    redirectTo: nextPath !== "/" ? nextPath : undefined,
  });
  return next;
}

export async function verifyPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return redirectWithFlash(request, "/login", "error", "Please login first");
  }
  return renderTemplate(
    request,
    "auth.html",
    buildAuthTemplateContext(request, "verify", "/verify", {
      email: session.preAuth.email,
      next_path: session.preAuth.redirectTo || "",
    }),
    "verify",
  );
}

export async function requestOtpAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return jsonResponse(
      { success: false, message: "Start from login before requesting an OTP.", error_code: "login_required", otp: null },
      400,
    );
  }
  const { response, data } = await apiFetch("/api/auth/request-otp/", {
    method: "POST",
    body: {
      challenge_id: session.preAuth.challengeId,
      email: session.preAuth.email,
      purpose: session.preAuth.purpose,
    },
  });
  return jsonResponse(data, response.status);
}

export async function verifyAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return jsonResponse({ success: false, message: "Please login first", error_code: "login_required" }, 400);
  }
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/verify-otp/", {
    method: "POST",
    body: {
      challenge_id: session.preAuth.challengeId,
      email: getString(formData, "email"),
      otp: getString(formData, "otp"),
      purpose: session.preAuth.purpose,
    },
  });
  if (getString(formData, "response_mode") === "json") {
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success && data.token && data.user) {
      persistAuth(next, String(data.token), data.user as SessionUser);
      applyPreferredLanguage(next, data.user as SessionUser);
      clearPreAuth(next);
      clearResetAuth(next);
      clearAdminAuth(next);
    }
    return next;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/verify", "error", String(data.message || "Incorrect OTP"));
  }
  const nextPath = sanitizeNextUrl(session.preAuth.redirectTo || String(data.redirect || defaultPostAuthPath(data.user as SessionUser)));
  const next = redirect(request, nextPath);
  persistAuth(next, String(data.token), data.user as SessionUser);
  applyPreferredLanguage(next, data.user as SessionUser);
  clearPreAuth(next);
  clearResetAuth(next);
  clearAdminAuth(next);
  return next;
}

export async function registerPage(request: NextRequest): Promise<NextResponse> {
  return renderTemplate(request, "auth.html", buildAuthTemplateContext(request, "register", "/register"), "register");
}

export async function registerAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/register/", {
    method: "POST",
    body: {
      username: getString(formData, "username"),
      email: getString(formData, "email"),
      password: getString(formData, "password"),
      role: getString(formData, "role") || "customer",
      full_name: getString(formData, "full_name"),
      city: getString(formData, "city"),
      state: getString(formData, "state"),
      district: getString(formData, "district"),
      pincode: getString(formData, "pincode"),
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/register", "error", String(data.message || "Registration failed"));
  }
  const nextPath = sanitizeNextUrl(getString(formData, "next"));
  return redirectWithFlash(request, buildAuthHref("/login", nextPath), "success", String(data.message || "Registration successful! Please login."));
}

export async function forgotPasswordPage(request: NextRequest): Promise<NextResponse> {
  return renderTemplate(request, "auth.html", buildAuthTemplateContext(request, "forgot_password", "/forgot_password"), "forgot_password");
}

export async function forgotPasswordAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/forgot-password/", {
    method: "POST",
    body: {
      email: getString(formData, "email"),
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/forgot_password", "error", String(data.message || "Unable to start password reset"));
  }
  const nextPath = sanitizeNextUrl(getString(formData, "next"));
  const next = redirect(request, buildAuthHref("/reset_password/verify", nextPath));
  setResetAuth(next, {
    challengeId: String(data.challenge_id),
    email: String(data.email || getString(formData, "email")),
    purpose: String(data.purpose || "password_reset"),
    verified: false,
    redirectTo: nextPath !== "/" ? nextPath : undefined,
  });
  return next;
}

export async function requestPasswordResetOtpAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return jsonResponse(
      { success: false, message: "Start the password reset flow before requesting a new OTP.", error_code: "password_reset_required", otp: null },
      400,
    );
  }
  const { response, data } = await apiFetch("/api/auth/request-otp/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      email: session.resetAuth.email,
      purpose: session.resetAuth.purpose,
    },
  });
  return jsonResponse(data, response.status);
}

export async function resetVerifyPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return redirectWithFlash(request, "/forgot_password", "error", "Start the password reset flow before requesting a new OTP.");
  }
  return renderTemplate(
    request,
    "auth.html",
    buildAuthTemplateContext(request, "reset_verify", "/reset_password/verify", { email: session.resetAuth.email, next_path: session.resetAuth.redirectTo || "" }),
    "verify_reset_otp",
  );
}

export async function resetVerifyAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return jsonResponse({ success: false, message: "Start the password reset flow first.", error_code: "password_reset_required" }, 400);
  }
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/verify-otp/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      email: getString(formData, "email"),
      otp: getString(formData, "otp"),
      purpose: session.resetAuth.purpose,
    },
  });
  if (getString(formData, "response_mode") === "json") {
    const payload = response.ok && data.success ? { ...data, redirect: String(data.redirect || "/reset_password") } : data;
    const next = jsonResponse(payload, response.status);
    if (response.ok && data.success) {
      setResetAuth(next, { ...session.resetAuth, verified: true });
    }
    return next;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/reset_password/verify", "error", String(data.message || "Incorrect OTP"));
  }
  const next = redirect(request, "/reset_password");
  setResetAuth(next, { ...session.resetAuth, verified: true });
  return next;
}

export async function resetPasswordPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return redirectWithFlash(request, "/forgot_password", "error", "Start the password reset flow before requesting a new OTP.");
  }
  if (!session.resetAuth.verified) {
    return redirectWithFlash(request, "/reset_password/verify", "error", "Complete OTP verification before setting a new password.");
  }
  return renderTemplate(
    request,
    "auth.html",
    buildAuthTemplateContext(request, "reset_password", "/reset_password", { email: session.resetAuth.email, next_path: session.resetAuth.redirectTo || "" }),
    "reset_password",
  );
}

export async function resetPasswordAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth || !session.resetAuth.verified) {
    return redirectWithFlash(request, "/forgot_password", "error", "Complete OTP verification before setting a new password.");
  }
  const formData = await request.formData();
  const { response, data } = await apiFetch("/api/auth/reset-password/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      password: getString(formData, "password"),
      confirm_password: getString(formData, "confirm_password"),
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/reset_password", "error", String(data.message || "Unable to reset password"));
  }
  const next = redirectWithFlash(request, "/login", "success", String(data.message || "Password updated successfully."));
  clearResetAuth(next);
  return next;
}

export async function logoutAction(request: NextRequest): Promise<NextResponse> {
  const next = redirect(request, "/");
  clearAuth(next);
  return next;
}

export async function adminLoginPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (session.user?.role === "admin") {
    return redirect(request, "/admin/dashboard");
  }
  return renderTemplate(request, "admin_login.html", {}, "admin_login");
}

export async function adminLoginAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const action = getString(formData, "action");

  if (action === "send_otp") {
    const { response, data } = await apiFetch("/api/auth/admin/login/", {
      method: "POST",
      body: {
        email: getString(formData, "email"),
        password: getString(formData, "password"),
      },
    });
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success) {
      setAdminAuth(next, {
        challengeId: String(data.challenge_id),
        email: String(data.email || getString(formData, "email")),
        purpose: String(data.purpose || "admin"),
      });
    }
    return next;
  }

  if (action === "verify") {
    const session = getSessionState(request);
    if (!session.adminAuth) {
      return jsonResponse({ success: false, message: "Validate admin credentials first.", error_code: "admin_pre_auth_required", otp: null }, 400);
    }
    const { response, data } = await apiFetch("/api/auth/verify-otp/", {
      method: "POST",
      body: {
        challenge_id: session.adminAuth.challengeId,
        email: getString(formData, "email"),
        otp: getString(formData, "otp"),
        purpose: "admin",
      },
    });
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success && data.token && data.user) {
      persistAuth(next, String(data.token), data.user as SessionUser);
      applyPreferredLanguage(next, data.user as SessionUser);
      clearAdminAuth(next);
    }
    return next;
  }

  return jsonResponse({ success: false, message: "Unsupported admin action.", error_code: "invalid_action", otp: null }, 400);
}
