import { makeMerchantHandlers } from "@/lib/x402/merchantRoute";
import { DEMO_APPROVAL_AMOUNT_BASE_UNITS } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = makeMerchantHandlers(DEMO_APPROVAL_AMOUNT_BASE_UNITS);
export const GET = handlers.GET;
export const POST = handlers.POST;
