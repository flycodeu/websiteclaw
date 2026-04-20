from __future__ import annotations

import json
import re

from playwright.sync_api import Locator, Page


PRICE_PATTERN = re.compile(r"(?:¥|￥|\$)?\s*\d+(?:\.\d{1,2})?")
STOCK_PATTERN = re.compile(r"(库存充足|库存少量|库存不足|库存一般|缺货|售罄|补货中|有货|现货|剩余\d+[件个张份]?)", re.IGNORECASE)
WARRANTY_PATTERN = re.compile(r"(质保|保修|售后|无质保|不保|包赔|包售后)", re.IGNORECASE)
TAG_PATTERN = re.compile(r"(满减|热卖|热销|推荐|优惠|库存|缺货|售罄|保价|保障|渠道|无质保)", re.IGNORECASE)


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _normalize_price(value: str | None) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return ""
    match = PRICE_PATTERN.search(cleaned)
    if not match:
        return cleaned
    return match.group(0).replace(" ", "")


def _normalize_stock(value: str | None) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return ""
    match = STOCK_PATTERN.search(cleaned)
    if match:
        return _clean_text(match.group(1))
    return cleaned[:32]


def _normalize_warranty(value: str | None) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return "否"
    lowered = cleaned.lower()
    if any(keyword in lowered for keyword in ["无质保", "不保", "无保修"]):
        return "否"
    if any(keyword in cleaned for keyword in ["质保", "保修", "售后", "包赔", "包售后"]):
        return "是"
    return "否"


def _merge_notes(*values: str | None) -> str | None:
    items: list[str] = []
    for value in values:
        cleaned = _clean_text(value)
        if cleaned and cleaned not in items:
            items.append(cleaned)
    return "；".join(items) if items else None


def _derive_warranty_and_notes(*, name: str, warranty_text: str, tags: list[str], notes: str | None = None) -> tuple[str, str | None]:
    parts = [name, warranty_text, *tags]
    haystack = " ".join(filter(None, parts))
    lowered = haystack.lower()
    if any(keyword in lowered for keyword in ["无质保", "不保", "无保修"]):
        verdict = "否"
    elif any(keyword in haystack for keyword in ["质保", "保修", "售后", "包赔", "包售后"]):
        verdict = "是"
    else:
        verdict = "否"

    extra_note = warranty_text if warranty_text and warranty_text not in {"是", "否"} else None
    return verdict, _merge_notes(notes, extra_note)


def _normalize_tags(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    candidates = value if isinstance(value, list) else re.split(r"[，,|/]", value)
    tags: list[str] = []
    for item in candidates:
        cleaned = _clean_text(item)
        if not cleaned or cleaned in tags:
            continue
        if len(cleaned) <= 18:
            tags.append(cleaned)
    return tags


def _extract_category_from_page(page: Page) -> str:
    candidates = [
        ".active",
        ".is-active",
        ".selected",
        "[aria-selected='true']",
        "[class*='active']",
    ]
    for selector in candidates:
        try:
            texts = page.locator(selector).all_inner_texts()
        except Exception:
            continue
        for text in texts:
            cleaned = _clean_text(text)
            if 1 < len(cleaned) <= 20 and "商品" not in cleaned:
                return cleaned
    return ""


def _product_key(site_id: str, category: str, name: str) -> str:
    normalized = re.sub(r"\s+", "", name).lower()
    normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", normalized).strip("-")
    category_part = re.sub(r"\s+", "", category).lower() or "default"
    return f"{site_id}:{category_part}:{normalized}" if normalized else ""


def _normalize_product(raw: dict, *, site_id: str, category: str) -> dict | None:
    name = _clean_text(str(raw.get("name") or ""))
    price = _normalize_price(str(raw.get("price") or ""))
    stock = _normalize_stock(str(raw.get("stock") or ""))
    raw_warranty = _clean_text(str(raw.get("warranty") or ""))
    product_url = _clean_text(str(raw.get("product_url") or ""))
    tags = _normalize_tags(raw.get("tags"))
    notes = _clean_text(str(raw.get("notes") or ""))

    if not name:
        return None

    warranty, notes = _derive_warranty_and_notes(
        name=name,
        warranty_text=raw_warranty,
        tags=tags,
        notes=notes,
    )

    return {
        "product_key": _product_key(site_id, category, name),
        "name": name,
        "price": price,
        "stock": stock,
        "warranty": warranty,
        "product_url": product_url,
        "tags": tags,
        "notes": notes,
    }


def _dedupe_products(products: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    fallback_index = 0
    for product in products:
        key = product.get("product_key") or f"fallback-{fallback_index}"
        fallback_index += 1
        existing = unique.get(key)
        if not existing:
            unique[key] = product
            continue
        merged = dict(existing)
        for field in ["price", "stock", "warranty", "product_url"]:
            if not merged.get(field) and product.get(field):
                merged[field] = product[field]
        merged["tags"] = _normalize_tags([*merged.get("tags", []), *product.get("tags", [])])
        merged["notes"] = _merge_notes(merged.get("notes"), product.get("notes"))
        unique[key] = merged
    return list(unique.values())


def extract_fields(page: Page, visible_text: str, extractor_type: str, rules: dict | None) -> dict:
    site_id = str((rules or {}).get("site_id") or "")
    if extractor_type == "selector_rule":
        extracted = extract_products_by_selectors(page, rules or {}, site_id=site_id)
        if extracted["products"]:
            return extracted
    return extract_products_auto(page, visible_text, site_id=site_id)


def extract_products_auto(page: Page, visible_text: str, *, site_id: str) -> dict:
    category = _extract_category_from_page(page)
    candidates = page.evaluate(
        """
        () => {
          const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
          const pricePattern = /(?:¥|￥|\\$)?\\s*\\d+(?:\\.\\d{1,2})?/;
          const stockPattern = /(库存充足|库存少量|库存不足|库存一般|缺货|售罄|补货中|有货|现货|剩余\\d+[件个张份]?)/i;
          const warrantyPattern = /(质保|保修|售后|无质保|不保|包赔|包售后)/i;
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          };
          const nodes = Array.from(document.querySelectorAll("a, article, li, div"))
            .filter((el) => isVisible(el))
            .slice(0, 1800);
          const items = [];
          for (const el of nodes) {
            const text = clean(el.innerText);
            if (!text || text.length < 4 || text.length > 220 || !pricePattern.test(text)) {
              continue;
            }
            const lines = text
              .split(/\\n+/)
              .map((item) => clean(item))
              .filter(Boolean)
              .slice(0, 10);
            if (lines.length < 2) {
              continue;
            }
            const href = el.href || el.querySelector("a")?.href || "";
            let name = "";
            let price = "";
            let stock = "";
            let warranty = "";
            const tags = [];
            for (const line of lines) {
              if (!price && pricePattern.test(line)) {
                price = clean(line.match(pricePattern)?.[0] || line);
                continue;
              }
              if (!stock && stockPattern.test(line)) {
                stock = clean(line.match(stockPattern)?.[0] || line);
                continue;
              }
              if (!warranty && warrantyPattern.test(line)) {
                warranty = clean(line);
                continue;
              }
              if (!name && line.length >= 2 && line.length <= 80) {
                name = line;
                continue;
              }
              if (line.length <= 18) {
                tags.push(line);
              }
            }
            if (!name) {
              continue;
            }
            items.push({
              name,
              price,
              stock,
              warranty,
              product_url: href,
              tags,
              text_length: text.length,
            });
          }
          return items;
        }
        """
    )
    normalized = [
        product
        for product in (
            _normalize_product(item, site_id=site_id, category=category) for item in (candidates or [])
        )
        if product
    ]
    products = _dedupe_products(normalized)
    return {
        "page_type": "product_list",
        "category": category,
        "products": products,
        "raw_text_excerpt": _clean_text(visible_text)[:800],
        "extraction_strategy": "auto_product_list",
    }


def _locator_text(locator: Locator, selector: str | None) -> str:
    if not selector:
        return ""
    try:
        return _clean_text(locator.locator(selector).first.inner_text(timeout=1500))
    except Exception:
        return ""


def _locator_href(locator: Locator, selector: str | None) -> str:
    try:
        target = locator.locator(selector).first if selector else locator.locator("a").first
        return _clean_text(target.get_attribute("href", timeout=1500))
    except Exception:
        return ""


def extract_products_by_selectors(page: Page, rules: dict, *, site_id: str) -> dict:
    category = ""
    if rules.get("category"):
        try:
            category = _clean_text(page.locator(rules["category"]).first.inner_text(timeout=1500))
        except Exception:
            category = ""
    if not category:
        category = _extract_category_from_page(page)

    card_selector = rules.get("product_card")
    if not card_selector:
        return {
            "page_type": "product_list",
            "category": category,
            "products": [],
            "matched_selectors": {},
            "extraction_strategy": "selector_rule",
        }

    cards = page.locator(card_selector)
    try:
        total = min(cards.count(), 120)
    except Exception:
        total = 0

    products: list[dict] = []
    for index in range(total):
        card = cards.nth(index)
        raw_product = {
            "name": _locator_text(card, rules.get("name")),
            "price": _locator_text(card, rules.get("price")),
            "stock": _locator_text(card, rules.get("stock")),
            "warranty": _locator_text(card, rules.get("warranty")),
            "product_url": _locator_href(card, rules.get("link")),
            "tags": [_locator_text(card, rules.get("tag"))] if rules.get("tag") else [],
        }
        product = _normalize_product(raw_product, site_id=site_id, category=category)
        if product:
            products.append(product)

    return {
        "page_type": "product_list",
        "category": category,
        "products": _dedupe_products(products),
        "matched_selectors": {
            key: rules.get(key)
            for key in ("category", "product_card", "name", "price", "stock", "warranty", "link", "tag")
            if rules.get(key)
        },
        "extraction_strategy": "selector_rule",
    }


def merge_product_results(rule_result: dict, ai_result: dict | None, *, site_id: str) -> dict:
    category = _clean_text(str((ai_result or {}).get("category") or rule_result.get("category") or ""))
    rule_products = [_normalize_product(item, site_id=site_id, category=category) for item in rule_result.get("products", [])]
    rule_products = [item for item in rule_products if item]
    ai_products = [_normalize_product(item, site_id=site_id, category=category) for item in (ai_result or {}).get("products", [])]
    ai_products = [item for item in ai_products if item]

    if not rule_products and not ai_products:
        return {
            "page_type": "product_list",
            "category": category,
            "products": [],
        }

    if not rule_products:
        return {
            "page_type": "product_list",
            "category": category,
            "products": _dedupe_products(ai_products),
        }

    ai_by_key = {product["product_key"]: product for product in ai_products if product.get("product_key")}
    merged: list[dict] = []
    for product in rule_products:
        ai_product = ai_by_key.get(product.get("product_key", ""))
        if not ai_product:
            merged.append(product)
            continue
        merged_product = dict(product)
        for field in ["name", "price", "stock", "warranty", "product_url"]:
            if ai_product.get(field):
                merged_product[field] = ai_product[field]
        merged_product["tags"] = _normalize_tags([*product.get("tags", []), *ai_product.get("tags", [])])
        merged_product["notes"] = _merge_notes(product.get("notes"), ai_product.get("notes"))
        merged.append(merged_product)

    existing_keys = {product.get("product_key") for product in merged}
    for product in ai_products:
        if product.get("product_key") not in existing_keys:
            merged.append(product)

    return {
        "page_type": "product_list",
        "category": category,
        "products": _dedupe_products(merged),
    }


def dump_products(products: list[dict]) -> str:
    return json.dumps(products, ensure_ascii=False, indent=2)
