import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import {
  buildCropDraftFromCrop,
  buildCropDraftFromFormData,
  categoryPriceHint,
  createEmptyCropDraft,
  defaultCropFilters,
  enrichCropForDashboard,
  FARMER_CATEGORY_OPTIONS,
  FARMER_PRICE_TRENDS,
  FARMER_QUALITY_OPTIONS,
  FARMER_STATE_OPTIONS,
  filterAndSortCrops,
  validateCropDraft,
} from "@/lib/farmer-form";
import { redirectWithFlash } from "@/lib/http";
import { renderTemplate } from "@/lib/template";

import { authFailureRedirect, requireSession } from "@/server/session";
import { copyFormData, getString } from "@/server/utils";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getFormOptions() {
  return {
    categories: FARMER_CATEGORY_OPTIONS,
    qualities: FARMER_QUALITY_OPTIONS,
    states: FARMER_STATE_OPTIONS,
    priceTrends: FARMER_PRICE_TRENDS,
  };
}

function listingHighlights(crops: Array<Record<string, unknown>>) {
  const lowStock = crops.filter((crop) => Number(crop.quantity || 0) < 25).length;
  const organic = crops.filter((crop) => Boolean(crop.organic)).length;
  const sameDay = crops.filter((crop) => Boolean(crop.same_day_available)).length;
  return [
    {
      title: "Low stock listings",
      value: lowStock,
      tone: lowStock ? "warning" : "success",
      description: lowStock ? "Top up these listings before peak demand." : "All active listings have comfortable stock.",
    },
    {
      title: "Organic tagged",
      value: organic,
      tone: organic ? "success" : "default",
      description: organic ? "Premium-ready listings for higher intent buyers." : "Add organic signals where relevant to improve trust.",
    },
    {
      title: "Same-day ready",
      value: sameDay,
      tone: sameDay ? "info" : "default",
      description: sameDay ? "Fast-fulfilment listings are highlighted to buyers." : "Enable same-day availability for nearby demand.",
    },
  ];
}

function cropStats(crops: Array<Record<string, unknown>>) {
  const totalInventory = crops.reduce((sum, crop) => sum + Number(crop.quantity || 0), 0);
  const estimatedValue = crops.reduce((sum, crop) => sum + Number(crop.inventory_value || 0), 0);
  const avgHealth = crops.length
    ? Math.round(crops.reduce((sum, crop) => sum + Number(crop.health_score || 0), 0) / crops.length)
    : 0;

  return { totalInventory, estimatedValue, avgHealth };
}

function renderCropPage(
  request: NextRequest,
  templateName: string,
  endpoint: string,
  draft: ReturnType<typeof createEmptyCropDraft>,
  errors: Record<string, string> = {},
  crop: Record<string, unknown> | null = null,
  pageTitle = "Add crop",
) {
  return renderTemplate(request, templateName, {
    draft,
    errors,
    crop,
    form_options: getFormOptions(),
    price_hint: categoryPriceHint(draft.category),
    page_title: pageTitle,
  }, endpoint, Object.keys(errors).length ? 422 : 200);
}

export async function farmerDashboardPage(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const { response, data } = await apiFetch("/api/marketplace/farmer/dashboard", { method: "GET" }, sessionOrResponse.token);
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/", "error", String(data.message || "Unable to load farmer dashboard"));
  }

  const crops = asArray<Record<string, unknown>>(data.crops).map(enrichCropForDashboard);
  const orders = asArray<Record<string, unknown>>(data.orders);
  const filters = defaultCropFilters(request.nextUrl.searchParams);
  const filteredCrops = filterAndSortCrops(crops, filters);

  return renderTemplate(
    request,
    "farmer.html",
    {
      crops,
      filtered_crops: filteredCrops,
      orders,
      is_verified: Boolean(data.is_verified),
      metrics: asRecord(data.metrics),
      top_selling_crops: asArray(data.top_selling_crops),
      demand_hotspots: asArray(data.demand_hotspots),
      smart_alerts: asArray(data.smart_alerts),
      crop_filters: filters,
      crop_stats: cropStats(crops),
      listing_highlights: listingHighlights(crops),
      form_options: getFormOptions(),
      draft: createEmptyCropDraft(),
      price_hint: categoryPriceHint("Vegetables"),
      filtered_count: filteredCrops.length,
    },
    "farmer_dashboard",
  );
}

export async function addCropPage(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  return renderCropPage(request, "add_crop.html", "add_crop", createEmptyCropDraft(), {}, null, "Add crop listing");
}

export async function addCropAction(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const formData = copyFormData(await request.formData());
  const draft = buildCropDraftFromFormData(formData);
  const errors = validateCropDraft(draft);
  if (Object.keys(errors).length) {
    return renderCropPage(request, "add_crop.html", "add_crop", draft, errors, null, "Add crop listing");
  }

  const { response, data } = await apiFetch(
    "/api/marketplace/farmer/crops",
    {
      method: "POST",
      body: formData,
    },
    sessionOrResponse.token,
  );
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }

  if (!response.ok || !data.success) {
    return renderCropPage(
      request,
      "add_crop.html",
      "add_crop",
      draft,
      { general: String(data.message || "Unable to add crop") },
      null,
      "Add crop listing",
    );
  }

  return redirectWithFlash(request, "/farmer/dashboard", "success", String(data.message || "Crop added successfully!"));
}

export async function editCropPage(request: NextRequest, cropId: string): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const { response, data } = await apiFetch(`/api/marketplace/farmer/crops/${cropId}`, { method: "GET" }, sessionOrResponse.token);
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success || !data.crop) {
    return redirectWithFlash(request, "/farmer/dashboard", "error", String(data.message || "Crop not found"));
  }

  const crop = enrichCropForDashboard(asRecord(data.crop));
  return renderCropPage(request, "edit_crop.html", "edit_crop", buildCropDraftFromCrop(crop), {}, crop, "Edit crop listing");
}

export async function editCropAction(request: NextRequest, cropId: string): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const formData = copyFormData(await request.formData());
  const draft = buildCropDraftFromFormData(formData);
  const errors = validateCropDraft(draft);
  const baseCrop = { id: cropId, ...draft } as Record<string, unknown>;

  if (Object.keys(errors).length) {
    return renderCropPage(request, "edit_crop.html", "edit_crop", draft, errors, baseCrop, "Edit crop listing");
  }

  const { response, data } = await apiFetch(
    `/api/marketplace/farmer/crops/${cropId}`,
    {
      method: "PATCH",
      body: formData,
    },
    sessionOrResponse.token,
  );
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success) {
    return renderCropPage(
      request,
      "edit_crop.html",
      "edit_crop",
      draft,
      { general: String(data.message || "Unable to update crop") },
      baseCrop,
      "Edit crop listing",
    );
  }

  return redirectWithFlash(
    request,
    "/farmer/dashboard",
    "success",
    String(data.message || (response.ok ? "Crop updated successfully!" : "Unable to update crop")),
  );
}

export async function deleteCropAction(request: NextRequest, cropId: string): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const { response, data } = await apiFetch(
    `/api/marketplace/farmer/crops/${cropId}`,
    { method: "DELETE" },
    sessionOrResponse.token,
  );
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  return redirectWithFlash(
    request,
    "/farmer/dashboard",
    response.ok && data.success ? "success" : "error",
    String(data.message || (response.ok ? "Crop deleted successfully" : "Unable to delete crop")),
  );
}

export async function updateOrderStatusAction(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["farmer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const formData = await request.formData();
  const { response, data } = await apiFetch(
    "/api/orders/farmer/update-status",
    {
      method: "POST",
      body: {
        order_id: getString(formData, "order_id"),
        status: getString(formData, "status"),
        location: getString(formData, "location"),
        tracking_code: getString(formData, "tracking_code"),
      },
    },
    sessionOrResponse.token,
  );
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  return redirectWithFlash(
    request,
    "/farmer/dashboard",
    response.ok && data.success ? "success" : "error",
    String(data.message || (response.ok ? "Order updated" : "Unable to update order")),
  );
}
