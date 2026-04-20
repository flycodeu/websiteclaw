from dataclasses import dataclass


CHALLENGE_KEYWORDS = [
    "captcha",
    "verify",
    "verification",
    "human verification",
    "security check",
    "robot check",
    "drag the slider",
    "slide to complete",
    "滑块",
    "验证",
    "请完成安全验证",
    "人机",
]


@dataclass
class ChallengeDetectionResult:
    detected: bool
    reason: str | None = None


def detect_challenge(final_url: str | None, title: str | None, visible_text: str | None) -> ChallengeDetectionResult:
    haystack = " ".join(filter(None, [final_url, title, visible_text])).lower()
    for keyword in CHALLENGE_KEYWORDS:
        if keyword.lower() in haystack:
            return ChallengeDetectionResult(True, f"Matched keyword: {keyword}")
    return ChallengeDetectionResult(False)

