import {
  PublicShopDetail,
  ProductCategory,
  PublishedShopDetail,
  PublishedShopProduct,
  PublishedShopProductPreview
} from "@shop-claw/shared/types";
import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedShopDetail } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const params = await context.params;
  return params.shopId;
}

export async function GET(_request: Request, context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const shopId = await readParams(context);
  const detail = await getPublishedShopDetail(shopId);

  if (!detail) {
    return Response.json(withTraceId(null, "店铺不存在"), { status: 404 });
  }

  return Response.json(withTraceId(toPublicShopDetail(detail)));
}

function toPublicShopDetail(detail: PublishedShopDetail): PublicShopDetail {
  const products = [...detail.products].sort((left, right) => {
    const datePriority = Date.parse(right.current.updatedAt) - Date.parse(left.current.updatedAt);

    if (datePriority !== 0) {
      return datePriority;
    }

    if (left.current.price === 0) {
      return 1;
    }

    if (right.current.price === 0) {
      return -1;
    }

    return left.current.price - right.current.price || left.current.rawName.localeCompare(right.current.rawName, "zh-CN");
  });

  return {
    shop: detail.shop,
    categories: [...new Set(products.map((product) => product.category))] as ProductCategory[],
    products: products.map(toProductPreview),
    publishedAt: detail.publishedAt
  };
}

function toProductPreview(product: PublishedShopProduct): PublishedShopProductPreview {
  return {
    shopId: product.shopId,
    sourceId: product.sourceId,
    productKey: product.productKey,
    category: product.category,
    specLabel: product.specLabel,
    current: product.current,
    priceTrend: product.priceTrend,
    missingStreak: product.missingStreak,
    priceSampleCount: product.priceHistory.length
  };
}
