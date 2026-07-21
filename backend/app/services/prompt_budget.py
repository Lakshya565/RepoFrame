from collections.abc import Callable

from app.config import MAX_TOTAL_PROMPT_CHARS
from app.services.file_content_service import (
    RepoEvidenceCollection,
    trim_evidence_to_content_budget,
)

# Small headroom for request-shape changes and serialization details that sit
# outside repository evidence. The final low-level guard remains authoritative.
PROMPT_SAFETY_MARGIN_CHARS = 1_000

RequestSizeFn = Callable[[RepoEvidenceCollection], int]


# Finds the largest high-priority evidence prefix whose fully rendered request
# fits. Measuring through the caller makes this account for prompt headings, JSON
# serialization, tool schemas, outputs, and user context rather than estimating
# from raw GitHub file characters alone.
def fit_evidence_to_request_budget(
    evidence: RepoEvidenceCollection,
    request_size: RequestSizeFn,
    *,
    max_request_characters: int = MAX_TOTAL_PROMPT_CHARS,
    safety_margin_characters: int = PROMPT_SAFETY_MARGIN_CHARS,
) -> RepoEvidenceCollection:
    target = max(max_request_characters - safety_margin_characters, 0)
    if request_size(evidence) <= target:
        return evidence

    best = trim_evidence_to_content_budget(evidence, 0)

    # Request size is monotonic while one file is being shortened, but completing
    # that file removes its "(truncated)" label and creates a tiny discontinuity.
    # Search each file segment separately and check every full-file boundary so the
    # fitter still finds the largest valid prefix exactly.
    segment_start = 0
    for evidence_file in evidence.selected_files:
        segment_end = segment_start + len(evidence_file.content)
        low = segment_start + 1
        high = segment_end - 1
        while low <= high:
            midpoint = (low + high) // 2
            candidate = trim_evidence_to_content_budget(evidence, midpoint)
            if request_size(candidate) <= target:
                best = candidate
                low = midpoint + 1
            else:
                high = midpoint - 1

        full_file_candidate = trim_evidence_to_content_budget(evidence, segment_end)
        if request_size(full_file_candidate) <= target:
            best = full_file_candidate
        segment_start = segment_end

    return best
