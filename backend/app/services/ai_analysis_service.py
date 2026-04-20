from __future__ import annotations

import json
from dataclasses import dataclass

import httpx


class AIConfigurationError(RuntimeError):
    pass


@dataclass
class AIAnalysisResult:
    analysis: dict
    summary: str
    raw_output: str
    used_image: bool


class AIAnalysisService:
    def analyze(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        page_title: str | None,
        source_url: str,
        final_url: str | None,
        visible_text: str | None,
        screenshot_path: str | None,
        prompt_template: str | None,
        initial_products: list[dict] | None = None,
        recent_records: list[dict] | None = None,
    ) -> AIAnalysisResult:
        normalized_base_url = self._normalize_base_url(base_url)
        trimmed_text = (visible_text or "").strip()
        if not trimmed_text:
            raise AIConfigurationError("AI analysis requires page text")

        text_payload = trimmed_text[:12000]
        prompt_suffix = prompt_template.strip() if prompt_template else ""
        request_payload = self._build_payload(
            model=model,
            page_title=page_title,
            source_url=source_url,
            final_url=final_url,
            visible_text=text_payload,
            prompt_suffix=prompt_suffix,
            initial_products=initial_products or [],
            recent_records=recent_records or [],
        )
        content = self._send_request(normalized_base_url, api_key, request_payload)
        analysis = self._parse_json_output(content)
        return AIAnalysisResult(
            analysis=analysis,
            summary=self._derive_summary(analysis),
            raw_output=content,
            used_image=False,
        )

    def _normalize_base_url(self, base_url: str) -> str:
        cleaned = base_url.strip().rstrip("/")
        if not cleaned:
            raise AIConfigurationError("Missing AI base URL")
        if cleaned.endswith("/chat/completions"):
            return cleaned
        return f"{cleaned}/chat/completions"

    def _build_payload(
        self,
        *,
        model: str,
        page_title: str | None,
        source_url: str,
        final_url: str | None,
        visible_text: str,
        prompt_suffix: str,
        initial_products: list[dict],
        recent_records: list[dict],
    ) -> dict:
        if not model.strip():
            raise AIConfigurationError("Missing AI model")

        prompt = (
            "你是网页商品文本入库助手。请基于输入内容输出严格 JSON。"
            ' JSON 顶层必须包含 "page_type"、"category"、"summary"、"products"、"notes"、"stability_level"、"stability_summary"、"review_recommendation"。'
            ' 其中 page_type 固定为 "product_list"，category、summary、stability_level、stability_summary、review_recommendation 为字符串，notes 为字符串数组，products 为数组。'
            ' products 中每个对象会直接写入数据库记录，必须包含 "name"、"price"、"stock"、"warranty"、"product_url"、"tags"。'
            " name 对应商品名称，price 对应价格文本，stock 对应库存文本，product_url 对应商品链接，tags 对应简短标签数组。"
            ' warranty 只能输出 "是" 或 "否"。默认按 "否" 处理，只有标题或内容明确出现质保、保修、售后、包赔、包售后等信息时才输出 "是"。tags 必须是字符串数组。'
            ' stability_level 只能输出 "stable"、"watch"、"risk"、"unknown"。'
            " 只根据页面可见文本识别商品，不要虚构不存在的商品，不要把评价、销量、访客数、广告文案、活动倒计时当成商品字段。"
            " 如果同一商品重复出现，只保留信息更完整的一条。字段无法确定时，价格、库存、链接可留空，warranty 默认输出 否。"
        )
        if prompt_suffix:
            prompt = f"{prompt}\n\n附加要求：{prompt_suffix}"

        user_text = (
            f"页面标题: {page_title or ''}\n"
            f"来源 URL: {source_url}\n"
            f"最终 URL: {final_url or ''}\n"
            f"该站点最近记录(最多5条):\n{json.dumps(recent_records, ensure_ascii=False)}\n"
            f"程序初步识别商品:\n{json.dumps(initial_products, ensure_ascii=False)}\n"
            f"页面可见文本开始:\n{visible_text or '无可见文本'}\n页面可见文本结束"
        )

        return {
            "model": model.strip(),
            "temperature": 0.2,
            "stream": False,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_text},
            ],
        }

    def _send_request(self, base_url: str, api_key: str, payload: dict) -> str:
        if not api_key.strip():
            raise AIConfigurationError("Missing AI API key")

        response = httpx.post(
            base_url,
            headers={
                "Authorization": f"Bearer {api_key.strip()}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=90.0,
        )
        response.raise_for_status()
        body = response.json()
        content = body["choices"][0]["message"]["content"]
        if isinstance(content, list):
            text_parts = [item.get("text", "") for item in content if isinstance(item, dict)]
            return "\n".join(part for part in text_parts if part).strip()
        if isinstance(content, str):
            return content.strip()
        raise RuntimeError("AI response content is empty")

    def _parse_json_output(self, output: str) -> dict:
        cleaned = output.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json\n", "", 1).strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise RuntimeError("AI response is not valid JSON")
            parsed = json.loads(cleaned[start : end + 1])

        if not isinstance(parsed, dict):
            raise RuntimeError("AI response JSON must be an object")
        return self._normalize_analysis_output(parsed)

    def _normalize_analysis_output(self, parsed: dict) -> dict:
        normalized = dict(parsed)
        normalized["page_type"] = "product_list"
        normalized["category"] = self._normalize_text(parsed.get("category"))
        normalized["summary"] = self._normalize_text(parsed.get("summary"))
        normalized["notes"] = self._normalize_string_list(parsed.get("notes"))
        normalized["stability_level"] = self._normalize_stability_level(parsed.get("stability_level"))
        normalized["stability_summary"] = self._normalize_text(parsed.get("stability_summary"))
        normalized["review_recommendation"] = self._normalize_text(parsed.get("review_recommendation"))
        normalized["products"] = self._normalize_products(parsed.get("products"))
        return normalized

    def _normalize_products(self, value: object) -> list[dict]:
        if not isinstance(value, list):
            return []

        products: list[dict] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            product = {
                "name": self._normalize_text(item.get("name")),
                "price": self._normalize_text(item.get("price")),
                "stock": self._normalize_text(item.get("stock")),
                "warranty": self._normalize_warranty(
                    value=item.get("warranty"),
                    name=item.get("name"),
                    notes=item.get("notes"),
                    tags=item.get("tags"),
                ),
                "product_url": self._normalize_text(item.get("product_url")),
                "tags": self._normalize_string_list(item.get("tags")),
                "notes": self._normalize_text(item.get("notes")),
            }
            if product["name"]:
                products.append(product)
        return products

    def _normalize_string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        items: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            cleaned = item.strip()
            if cleaned and cleaned not in items:
                items.append(cleaned)
        return items

    def _normalize_text(self, value: object) -> str:
        if not isinstance(value, str):
            return ""
        return value.strip()

    def _normalize_warranty(self, *, value: object, name: object = None, notes: object = None, tags: object = None) -> str:
        normalized = self._normalize_text(value)
        if normalized in {"是", "否"}:
            return normalized

        haystack = " ".join(
            filter(
                None,
                [
                    self._normalize_text(name),
                    normalized,
                    self._normalize_text(notes),
                    " ".join(self._normalize_string_list(tags)),
                ],
            )
        )
        lowered = haystack.lower()
        if any(keyword in lowered for keyword in ["无质保", "不保", "无保修"]):
            return "否"
        if any(keyword in haystack for keyword in ["质保", "保修", "售后", "包赔", "包售后"]):
            return "是"
        return "否"

    def _normalize_stability_level(self, value: object) -> str:
        normalized = self._normalize_text(value)
        if normalized in {"stable", "watch", "risk", "unknown"}:
            return normalized
        return "unknown"

    def _derive_summary(self, analysis: dict) -> str:
        summary = analysis.get("summary")
        if isinstance(summary, str) and summary.strip():
            return summary.strip()
        products = analysis.get("products")
        if isinstance(products, list) and products:
            return f"共识别 {len(products)} 个商品"
        return ""
