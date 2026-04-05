export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { addCropAction, addCropPage } from "@/server/farmer";

export async function GET(request: Request) {
  return addCropPage(request as any);
}

export async function POST(request: Request) {
  return addCropAction(request as any);
}
