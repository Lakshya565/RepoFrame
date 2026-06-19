from app.schemas.profile import UserContextInput
from app.services.file_content_service import RepoEvidenceCollection

# Prompt-formatting helpers shared by more than one generation/verification
# service (profile generation and claim verification both render the user context
# and the selected evidence the same way). Keeping them here removes the identical
# copies that previously lived in each service.


# Formats the questionnaire answers for a prompt, marking blanks explicitly with
# "(not provided)" so a model never treats an empty answer as a fact it can lean
# on, and knows which non-repo details it genuinely lacks.
def format_user_context(user_context: UserContextInput) -> str:
    def value(text: str) -> str:
        stripped = text.strip()
        return stripped if stripped else "(not provided)"

    collaboration = user_context.collaboration or "(not provided)"

    return (
        f"- Project purpose: {value(user_context.purpose)}\n"
        f"- Built solo or as a team: {collaboration}\n"
        f"- User's personal contribution: {value(user_context.contribution)}\n"
        f"- Target user or client: {value(user_context.target_user)}\n"
        f"- Hardest technical part: {value(user_context.hardest_part)}\n"
        f"- Impact or results: {value(user_context.impact)}"
    )


# Renders the bounded selected evidence as labeled inline excerpts, flagging any
# file whose excerpt was truncated. The evidence is already trimmed to the limits
# by collect_file_evidence, so this only presents it. empty_text is returned when
# there is no evidence (callers phrase it for their own prompt).
def format_evidence_excerpts(
    evidence: RepoEvidenceCollection, empty_text: str
) -> str:
    if not evidence.selected_files:
        return empty_text

    blocks = []
    for file in evidence.selected_files:
        suffix = " (truncated)" if file.truncated else ""
        blocks.append(f"### {file.path} [{file.source_type}]{suffix}\n{file.content}")
    return "\n\n".join(blocks)
