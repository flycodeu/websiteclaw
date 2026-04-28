import publishedData from "../../../data/public/published-shops.json";
import type { PublishedData } from "@shop-claw/shared/types";

const snapshot = publishedData as PublishedData;

export async function getPublishedSnapshot() {
  return snapshot;
}
