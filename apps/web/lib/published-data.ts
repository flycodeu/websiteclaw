import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  PublishedDiffFeed,
  PublishedMeta,
  PublishedProductCatalog,
  PublishedShopDetail,
  PublishedShopIndex
} from "@shop-claw/shared/types";
import { getStoragePaths } from "@shop-claw/shared/store";

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

export async function getPublishedMeta() {
  const { publishedMetaFile } = await getStoragePaths();
  return readJsonFile<PublishedMeta>(publishedMetaFile, createEmptyMeta());
}

export async function getPublishedShopIndex() {
  const { publishedShopsFile } = await getStoragePaths();
  return readJsonFile<PublishedShopIndex>(publishedShopsFile, createEmptyShopIndex());
}

export async function getPublishedProductCatalog() {
  const { publishedProductsFile } = await getStoragePaths();
  return readJsonFile<PublishedProductCatalog>(publishedProductsFile, createEmptyProductCatalog());
}

export async function getPublishedDiffFeed() {
  const { publishedDiffsFile } = await getStoragePaths();
  return readJsonFile<PublishedDiffFeed>(publishedDiffsFile, createEmptyDiffFeed());
}

export async function getPublishedShopDetail(shopId: string) {
  const { publicShopDetailsDirectory } = await getStoragePaths();
  return readJsonFile<PublishedShopDetail | null>(path.join(publicShopDetailsDirectory, `${shopId}.json`), null);
}
