import { promises as fs } from "node:fs";
import path from "node:path";
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

export async function getPublishedMeta() {
  return readJsonFile<PublishedMeta>(await getPublicDataFilePath(PUBLIC_META_FILENAME), createEmptyMeta());
}

export async function getPublishedShopIndex() {
  return readJsonFile<PublishedShopIndex>(await getPublicDataFilePath(PUBLIC_SHOPS_FILENAME), createEmptyShopIndex());
}

export async function getPublishedProductCatalog() {
  return readJsonFile<PublishedProductCatalog>(await getPublicDataFilePath(PUBLIC_PRODUCTS_FILENAME), createEmptyProductCatalog());
}

export async function getPublishedDiffFeed() {
  return readJsonFile<PublishedDiffFeed>(await getPublicDataFilePath(PUBLIC_DIFFS_FILENAME), createEmptyDiffFeed());
}

export async function getPublishedShopDetail(shopId: string) {
  return readJsonFile<PublishedShopDetail | null>(await getPublicShopDetailPath(shopId), null);
}
