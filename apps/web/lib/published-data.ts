import { promises as fs } from "node:fs";
import path from "node:path";
import { unstable_cache } from "next/cache";
import type {
  PublishedDiffFeed,
  PublishedMeta,
  PublishedProductCatalog,
  PublishedShopDetail,
  PublishedShopIndex
} from "@shop-claw/shared/types";

export const PUBLIC_DATA_REVALIDATE_SECONDS = 300;
const PUBLIC_DIRECTORY_SEGMENTS = ["data", "public"] as const;
const PUBLIC_META_FILENAME = "published-meta.json";
const PUBLIC_PRODUCTS_FILENAME = "published-products.json";
const PUBLIC_SHOPS_FILENAME = "published-shops.json";
const PUBLIC_DIFFS_FILENAME = "published-diffs.json";
const PUBLIC_SHOPS_DIRECTORY_NAME = "shops";
const PUBLIC_DATA_DIRECTORY_CANDIDATES = [
  path.join(/* turbopackIgnore: true */ process.cwd(), ...PUBLIC_DIRECTORY_SEGMENTS),
  path.resolve(/* turbopackIgnore: true */ process.cwd(), "../..", ...PUBLIC_DIRECTORY_SEGMENTS),
  path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", ...PUBLIC_DIRECTORY_SEGMENTS)
];

let publicDataDirectoryPromise: Promise<string> | undefined;

function createEmptyMeta(): PublishedMeta {
  return {
    publishedAt: "",
    shopCount: 0,
    liveProductCount: 0,
    archivedProductCount: 0,
    categoryCount: 0,
    categories: []
  };
}

function createEmptyShopIndex(): PublishedShopIndex {
  return {
    shops: [],
    publishedAt: "",
    meta: createEmptyMeta()
  };
}

function createEmptyProductCatalog(): PublishedProductCatalog {
  return {
    items: [],
    categories: [],
    publishedAt: "",
    meta: createEmptyMeta()
  };
}

function createEmptyDiffFeed(): PublishedDiffFeed {
  return {
    items: [],
    publishedAt: ""
  };
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePublicDataDirectory() {
  if (!publicDataDirectoryPromise) {
    publicDataDirectoryPromise = (async () => {
      for (const candidate of PUBLIC_DATA_DIRECTORY_CANDIDATES) {
        if (await pathExists(candidate)) {
          return candidate;
        }
      }

      return PUBLIC_DATA_DIRECTORY_CANDIDATES[0];
    })();
  }

  return publicDataDirectoryPromise;
}

async function getPublicDataFilePath(filename: string) {
  const publicDirectory = await resolvePublicDataDirectory();
  return path.join(publicDirectory, filename);
}

async function getPublicShopDetailPath(shopId: string) {
  const publicDirectory = await resolvePublicDataDirectory();
  return path.join(publicDirectory, PUBLIC_SHOPS_DIRECTORY_NAME, `${shopId}.json`);
}

export function getPublicApiCacheHeaders() {
  return {
    "Cache-Control": `public, max-age=60, s-maxage=${PUBLIC_DATA_REVALIDATE_SECONDS}, stale-while-revalidate=${PUBLIC_DATA_REVALIDATE_SECONDS * 2}`
  };
}

const readPublishedMeta = unstable_cache(
  async () => {
    return readJsonFile<PublishedMeta>(await getPublicDataFilePath(PUBLIC_META_FILENAME), createEmptyMeta());
  },
  ["published-meta"],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS }
);

const readPublishedShopIndex = unstable_cache(
  async () => {
    return readJsonFile<PublishedShopIndex>(await getPublicDataFilePath(PUBLIC_SHOPS_FILENAME), createEmptyShopIndex());
  },
  ["published-shop-index"],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS }
);

const readPublishedProductCatalog = unstable_cache(
  async () => {
    return readJsonFile<PublishedProductCatalog>(
      await getPublicDataFilePath(PUBLIC_PRODUCTS_FILENAME),
      createEmptyProductCatalog()
    );
  },
  ["published-product-catalog"],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS }
);

const readPublishedDiffFeed = unstable_cache(
  async () => {
    return readJsonFile<PublishedDiffFeed>(await getPublicDataFilePath(PUBLIC_DIFFS_FILENAME), createEmptyDiffFeed());
  },
  ["published-diff-feed"],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS }
);

const readPublishedShopDetail = unstable_cache(
  async (shopId: string) => {
    return readJsonFile<PublishedShopDetail | null>(await getPublicShopDetailPath(shopId), null);
  },
  ["published-shop-detail"],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS }
);

export async function getPublishedMeta() {
  return readPublishedMeta();
}

export async function getPublishedShopIndex() {
  return readPublishedShopIndex();
}

export async function getPublishedProductCatalog() {
  return readPublishedProductCatalog();
}

export async function getPublishedDiffFeed() {
  return readPublishedDiffFeed();
}

export async function getPublishedShopDetail(shopId: string) {
  return readPublishedShopDetail(shopId);
}
