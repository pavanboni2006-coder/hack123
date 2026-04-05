export type CropDraft = {
  name: string;
  category: string;
  quality: string;
  state: string;
  district: string;
  village: string;
  pincode: string;
  quantity: string;
  harvest_date: string;
  price: string;
  unit: string;
  min_order_quantity: string;
  delivery_radius_km: string;
  tags: string;
  description: string;
  price_trend: string;
  demand_score: string;
  same_day_available: boolean;
  organic: boolean;
};

export const FARMER_CATEGORY_OPTIONS = [
  "Vegetables",
  "Fruits",
  "Grains",
  "Rice Varieties",
  "Pulses",
  "Spices",
  "Dairy Products",
  "Milk",
  "Eggs",
  "Meat",
  "Honey",
  "Organic Products",
  "Farming Products",
  "Others",
];

export const FARMER_QUALITY_OPTIONS = [
  "A-Grade (Export)",
  "B-Grade (Premium)",
  "Organic Certified",
  "Standard",
];

export const FARMER_STATE_OPTIONS = [
  "Telangana",
  "Andhra Pradesh",
  "Karnataka",
  "Tamil Nadu",
  "Maharashtra",
  "Kerala",
  "Odisha",
];

export const FARMER_PRICE_TRENDS = ["Stable", "Rising", "Soft"];

export function createEmptyCropDraft(overrides: Partial<CropDraft> = {}): CropDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    category: "Vegetables",
    quality: "Standard",
    state: "Telangana",
    district: "",
    village: "",
    pincode: "",
    quantity: "",
    harvest_date: today,
    price: "",
    unit: "kg",
    min_order_quantity: "1",
    delivery_radius_km: "30",
    tags: "",
    description: "",
    price_trend: "Stable",
    demand_score: "50",
    same_day_available: false,
    organic: false,
    ...overrides,
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true" || formData.get(key) === "1";
}

export function buildCropDraftFromFormData(formData: FormData): CropDraft {
  return createEmptyCropDraft({
    name: getString(formData, "name"),
    category: getString(formData, "category") || "Vegetables",
    quality: getString(formData, "quality") || "Standard",
    state: getString(formData, "state") || "Telangana",
    district: getString(formData, "district"),
    village: getString(formData, "village"),
    pincode: getString(formData, "pincode"),
    quantity: getString(formData, "quantity"),
    harvest_date: getString(formData, "harvest_date") || new Date().toISOString().slice(0, 10),
    price: getString(formData, "price"),
    unit: getString(formData, "unit") || "kg",
    min_order_quantity: getString(formData, "min_order_quantity") || "1",
    delivery_radius_km: getString(formData, "delivery_radius_km") || "30",
    tags: getString(formData, "tags"),
    description: getString(formData, "description"),
    price_trend: getString(formData, "price_trend") || "Stable",
    demand_score: getString(formData, "demand_score") || "50",
    same_day_available: getBoolean(formData, "same_day_available"),
    organic: getBoolean(formData, "organic"),
  });
}

export function buildCropDraftFromCrop(crop: Record<string, unknown>): CropDraft {
  return createEmptyCropDraft({
    name: String(crop.name || ""),
    category: String(crop.category || "Vegetables"),
    quality: String(crop.quality || "Standard"),
    state: String(crop.state || "Telangana"),
    district: String(crop.district || ""),
    village: String(crop.village || ""),
    pincode: String(crop.pincode || ""),
    quantity: String(crop.quantity ?? ""),
    harvest_date: String(crop.harvest_date || "").slice(0, 10),
    price: String(crop.price ?? ""),
    unit: String(crop.unit || "kg"),
    min_order_quantity: String(crop.min_order_quantity ?? 1),
    delivery_radius_km: String(crop.delivery_radius_km ?? 30),
    tags: Array.isArray(crop.tags) ? crop.tags.join(", ") : String(crop.tags || ""),
    description: String(crop.description || ""),
    price_trend: String(crop.price_trend || "Stable"),
    demand_score: String(crop.demand_score ?? 50),
    same_day_available: Boolean(crop.same_day_available),
    organic: Boolean(crop.organic),
  });
}

export function validateCropDraft(draft: CropDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.length < 3) {
    errors.name = "Enter a crop name with at least 3 characters.";
  }
  if (!FARMER_CATEGORY_OPTIONS.includes(draft.category)) {
    errors.category = "Choose a valid category.";
  }
  if (!FARMER_QUALITY_OPTIONS.includes(draft.quality)) {
    errors.quality = "Choose a valid quality grade.";
  }
  if (!FARMER_STATE_OPTIONS.includes(draft.state)) {
    errors.state = "Choose a supported state.";
  }
  if (draft.district.length < 2) {
    errors.district = "District is required.";
  }
  if (draft.village.length < 2) {
    errors.village = "Village is required.";
  }
  if (!/^\d{6}$/.test(draft.pincode)) {
    errors.pincode = "Enter a valid 6-digit pincode.";
  }
  if (!(Number(draft.quantity) > 0)) {
    errors.quantity = "Quantity must be greater than zero.";
  }
  if (!(Number(draft.price) > 0)) {
    errors.price = "Price must be greater than zero.";
  }
  if (!(Number(draft.min_order_quantity) > 0)) {
    errors.min_order_quantity = "Minimum order quantity must be at least 1.";
  }
  if (!(Number(draft.delivery_radius_km) >= 0)) {
    errors.delivery_radius_km = "Delivery radius cannot be negative.";
  }
  if (draft.description && draft.description.length > 900) {
    errors.description = "Keep description under 900 characters.";
  }
  return errors;
}

export function categoryPriceHint(category: string): string {
  const hints: Record<string, string> = {
    Vegetables: "Fresh vegetables usually perform better with same-day pricing and smaller MOQs.",
    Fruits: "Highlight ripeness, packaging, and delivery radius for fruit buyers.",
    Grains: "Add storage quality, moisture condition, and bulk pricing notes for grains.",
    "Rice Varieties": "Rice listings convert better with grade, harvest season, and milling detail.",
    Pulses: "Mention cleaning quality and packaging size for pulse buyers.",
    Spices: "Spice buyers expect aroma, moisture, and source notes.",
    "Organic Products": "Organic buyers usually look for proof, farm practices, and premium pricing context.",
  };
  return hints[category] || "Use clear pricing, recent harvest details, and proof photos to improve buyer confidence.";
}

export function enrichCropForDashboard(crop: Record<string, unknown>) {
  const quantity = Number(crop.quantity || 0);
  const price = Number(crop.price || 0);
  const demandScore = Number(crop.demand_score || 50);
  const stockStatus = quantity <= 0 ? "Out of stock" : quantity < 25 ? "Low stock" : quantity < 100 ? "Healthy stock" : "Bulk ready";
  const stockProgress = Math.max(0, Math.min(100, Math.round((quantity / 150) * 100)));
  const healthScore = Math.max(45, Math.min(98, Math.round((demandScore * 0.45) + (quantity > 0 ? 25 : 0) + (price > 0 ? 10 : 0) + (crop.quality_proof ? 8 : 0) + (crop.image_url ? 8 : 0) + (crop.description ? 4 : 0))));
  const tagList = Array.isArray(crop.tags)
    ? crop.tags.filter(Boolean).map((item) => String(item))
    : String(crop.tags || "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    ...crop,
    stock_status: stockStatus,
    stock_progress: stockProgress,
    health_score: healthScore,
    inventory_value: Math.round(quantity * price),
    tag_list: tagList,
    location_label: [crop.village, crop.district, crop.state].filter(Boolean).join(", "),
  };
}

export function filterAndSortCrops(crops: Array<Record<string, unknown>>, filters: { q: string; category: string; stock: string; sort: string; }) {
  const query = filters.q.trim().toLowerCase();
  const filtered = crops.filter((crop) => {
    const text = [crop.name, crop.category, crop.quality, crop.state, crop.district, crop.village, ...(Array.isArray(crop.tag_list) ? crop.tag_list : [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const categoryMatch = filters.category === "all" || String(crop.category || "") === filters.category;
    const stockMatch = filters.stock === "all"
      || (filters.stock === "low" && Number(crop.quantity || 0) < 25)
      || (filters.stock === "ready" && Number(crop.quantity || 0) >= 25)
      || (filters.stock === "organic" && Boolean(crop.organic));
    const queryMatch = !query || text.includes(query);
    return categoryMatch && stockMatch && queryMatch;
  });

  filtered.sort((left, right) => {
    switch (filters.sort) {
      case "price_desc":
        return Number(right.price || 0) - Number(left.price || 0);
      case "price_asc":
        return Number(left.price || 0) - Number(right.price || 0);
      case "quantity_desc":
        return Number(right.quantity || 0) - Number(left.quantity || 0);
      case "health_desc":
        return Number(right.health_score || 0) - Number(left.health_score || 0);
      default:
        return String(left.name || "").localeCompare(String(right.name || ""));
    }
  });

  return filtered;
}

export function defaultCropFilters(searchParams: URLSearchParams) {
  return {
    q: searchParams.get("q") || "",
    category: searchParams.get("category") || "all",
    stock: searchParams.get("stock") || "all",
    sort: searchParams.get("sort") || "name_asc",
  };
}
