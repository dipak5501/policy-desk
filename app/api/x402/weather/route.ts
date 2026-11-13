import { makeMerchantHandlers } from "@/lib/x402/merchantRoute";
import { DEFAULT_X402_PRICE_BASE_UNITS } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = makeMerchantHandlers(DEFAULT_X402_PRICE_BASE_UNITS);
export const GET = handlers.GET;
export const POST = handlers.POST;
