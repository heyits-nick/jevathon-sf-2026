"""Automatic research for a shared link, bounded and Jev-decided.

shared link -> Browserbase fetch of the public page -> author caption (code)
-> place proposals (code) -> Jev: which place / is clarification needed
-> Browserbase Search -> Jev: which results are nearby restaurant menus
-> Browserbase menu fetch (<= 3) -> Jev per-dish scoring (shared /score code)
-> Jev: recommendation among researched candidate IDs -> persisted Candidates.

Code only proposes options, validates Jev's answers against offered IDs,
enforces timeouts and the total budget, and does the counting. A failed step
keeps whatever earlier steps produced and says what failed; nothing here
substitutes a heuristic for a Jev decision.
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from sqlmodel import Session, select

from . import caption as caption_mod
from . import jev_client, menu_fetch_client, scoring
from .jev_client import ChoiceAnswer, JevError
from .menu_fetch_client import MenuFetchError
from .models import DecisionTrace, ResearchCandidate, ResearchRun, SavedPost, Trip

log = logging.getLogger(__name__)

MAX_MENUS = 3  # menus kept and scored
MAX_FETCH_ATTEMPTS = 5  # parallel page fetches; a page without priced dishes is not a menu
MAX_SEARCH_RESULTS = 12
RESEARCH_MAX_DISHES = 25
MIN_JEV_CONFIDENCE = 0.6  # on the probability Jev gave its choice; see jev_client.supported
# Capability filter, not a quality judgment: the menu adapter reads public HTML
# only, and these delivery apps render their dish lists with client-side JS.
UNREADABLE_SOURCE_DOMAINS = {"seamless.com", "grubhub.com", "doordash.com", "ubereats.com", "postmates.com"}


def budget_seconds() -> float:
    # Photon waits 55 s and the voice bridge 50 s for a reply; stay inside both.
    return float(os.environ.get("RESEARCH_BUDGET_SECONDS", "45"))


class Budget:
    def __init__(self, seconds: float) -> None:
        self.deadline = time.monotonic() + seconds

    def remaining(self) -> float:
        return self.deadline - time.monotonic()

    def step(self, cap: float, reserve: float = 0.0) -> float:
        """Timeout for the next provider call; raises when nothing is left."""
        available = min(cap, self.remaining() - reserve)
        if available < 1.0:
            raise BudgetExhausted()
        return available


class BudgetExhausted(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def trace(
    session: Session,
    trip_id: str,
    stage: str,
    answer: ChoiceAnswer,
    choice: str | None = None,
    evidence_ids: list[str] | None = None,
    counts_time: bool = True,
) -> None:
    """Persist one real Jev decision (docs/architecture.md: never invent traces).
    Pass counts_time=False for the second and later answers of one batched
    call, so the call's time is summed once (see DecisionTrace)."""
    session.add(
        DecisionTrace(
            trip_id=trip_id,
            stage=stage,
            model=jev_client.current_model(),
            choice=choice if choice is not None else answer.choice,
            confidence=answer.confidence,
            evidence_ids=(evidence_ids or [])[:20],
            duration_ms=answer.duration_ms if counts_time else 0,
        )
    )


# --- Candidate facts (code-computed, used in Jev options and in replies) -----


def dish_counts(candidate: ResearchCandidate) -> tuple[int, int, int, list[str]]:
    """(confident yes, total, unclear, example yes dish names)."""
    dishes = candidate.score_result.get("dishes") or []
    threshold = scoring.yes_min()
    yes = [d for d in dishes if d.get("verdict") == "yes" and d.get("confidence", 0) >= threshold]
    unclear = sum(1 for d in dishes if d.get("verdict") == "unclear")
    return len(yes), len(dishes), unclear, [d["name"] for d in yes[:3]]


def summary(candidate: ResearchCandidate, diet: str) -> str:
    yes, total, unclear, examples = dish_counts(candidate)
    yes_any = sum(1 for d in candidate.score_result.get("dishes") or [] if d.get("verdict") == "yes")
    text = (
        f"{candidate.restaurant}: {yes_any} of {total} menu dishes judged {diet}-compatible "
        f"({yes} with high confidence), {unclear} unclear"
    )
    if examples:
        text += f" (e.g. {', '.join(examples)})"
    if not candidate.source_verified:
        text += " [unverified source: not confirmed as a menu near the place]"
    return text


def fact_line(candidate: ResearchCandidate, diet: str) -> str:
    checked = ""
    evidence = candidate.evidence or []
    if evidence:
        checked = f", checked {evidence[0].get('checked_at', '')[:10]}"
    return f"{summary(candidate, diet)}. Source: {candidate.menu_url}{checked}."


def eligible(candidate: ResearchCandidate) -> bool:
    """Evidence requirement: a source Jev confidently judged a nearby menu, and
    at least one dish Jev judged a confident yes."""
    return candidate.source_verified and dish_counts(candidate)[0] > 0 and not candidate.rejected


UNVERIFIED_REASON = "Unverified source: Jev wasn't confident this page is a restaurant menu near the post's place, so it isn't recommended."


def runs_newest_first(session: Session, trip_id: str) -> list[ResearchRun]:
    """Runs in the order their links were shared, newest first. A run's own
    creation time can lag its link (it starts after the preference check)."""
    return session.exec(
        select(ResearchRun)
        .join(SavedPost, SavedPost.id == ResearchRun.save_id)
        .where(ResearchRun.trip_id == trip_id)
        .order_by(SavedPost.created_at.desc(), ResearchRun.created_at.desc())
    ).all()


def latest_candidates(session: Session, trip_id: str) -> tuple[ResearchRun | None, list[ResearchCandidate]]:
    """Candidates of the most recent run that produced any, in Jev rank order."""
    for run in runs_newest_first(session, trip_id):
        candidates = session.exec(select(ResearchCandidate).where(ResearchCandidate.run_id == run.id)).all()
        if candidates:
            return run, sorted(candidates, key=rank_key)
    return None, []


def rank_key(candidate: ResearchCandidate):
    return (candidate.rank is None, candidate.rank or 0, candidate.created_at)


def option_keys(candidates: list[ResearchCandidate]) -> dict[str, ResearchCandidate]:
    return {f"c{i + 1}": c for i, c in enumerate(candidates)}


# --- Phase 1: shared link -> place ------------------------------------------


async def research_shared_link(session: Session, trip: Trip, save: SavedPost, budget: Budget | None = None) -> str:
    """Runs with the user's message and the SavedPost already committed.
    Returns the reply; persists trip status, traces, and candidates. Pass the
    request's `budget` when earlier steps of the same request already spent some."""
    run = ResearchRun(trip_id=trip.id, save_id=save.id, diet=trip.diet)
    if not _claim_trip(session, trip, run):
        # A link shared after this one (while this request waited, e.g. on the
        # preference check) owns the trip; leave its status and runs alone.
        return _set_aside(session, run)

    budget = budget or Budget(budget_seconds())
    try:
        place, clarification = await _identify_place(session, trip, save, run, budget)
        if clarification:
            return _needs_clarification(session, trip, run, "needs_place", clarification)
        return await _continue_with_place(session, trip, run, budget)
    except JevError:
        return _failed(
            session, trip, run,
            "I saved the link, but Jev (our decision service) was unavailable, so I couldn't research it. "
            "Share the link again to retry.",
        )
    except BudgetExhausted:
        return _failed(session, trip, run, "I saved the link, but research ran out of time before finishing. Share it again to retry.")
    except Exception:  # never leave the trip stuck in "researching"
        log.exception("research failed unexpectedly")
        return _failed(session, trip, run, "I saved the link, but research failed unexpectedly. Share it again to retry.")


def link_failed(session: Session, trip: Trip, save: SavedPost, reply: str) -> str:
    """A shared link that failed before research could start (Jev unavailable
    for its preference text). It still replaces earlier runs waiting on the
    traveler, as a failure during research does; otherwise those runs would
    stay open but be set aside by this newer link as soon as they resumed."""
    run = ResearchRun(trip_id=trip.id, save_id=save.id, diet=trip.diet)
    _claim_trip(session, trip, run)
    return _failed(session, trip, run, reply)


def _claim_trip(session: Session, trip: Trip, run: ResearchRun) -> bool:
    """Make `run` the trip's current research, unless a newer link owns the
    trip. Returns False (changing nothing but adding the run) in that case."""
    session.add(run)
    if _newer_run_exists(session, run):
        return False
    # The newer link replaces any earlier run still waiting on the traveler.
    for stale in session.exec(
        select(ResearchRun).where(
            ResearchRun.trip_id == trip.id,
            ResearchRun.id != run.id,
            ResearchRun.status.in_(("needs_place", "needs_diet")),
        )
    ).all():
        stale.status = "superseded"
        session.add(stale)
    trip.status = "researching"
    trip.clarification = None
    session.add(trip)
    session.commit()
    return True


async def _identify_place(
    session: Session, trip: Trip, save: SavedPost, run: ResearchRun, budget: Budget
) -> tuple[str | None, str | None]:
    """Returns (place, None) or (None, clarification question)."""
    ask = "Which place should I research for this post?"
    try:
        page = await asyncio.wait_for(
            menu_fetch_client.fetch_menu(save.source_url, ""), budget.step(15, reserve=20)
        )
    except (MenuFetchError, asyncio.TimeoutError) as exc:
        reason = exc.message if isinstance(exc, MenuFetchError) else "the page took too long to load"
        return None, f"I saved the link but couldn't read the post's public caption ({reason}). {ask}"

    caption = caption_mod.extract_caption(save.source_url, page.get("raw_text") or "")
    if not caption:
        return None, f"I saved the link but couldn't find the post's caption text on the public page. {ask}"
    run.caption_excerpt = caption[:500]

    proposals = caption_mod.place_candidates(caption)
    if not proposals:
        return None, f"I read the caption, but it doesn't name a place I can look up. {ask}"

    place = await _confirm_place(session, trip, save, run, caption, proposals, budget)
    if place is None:
        mentioned = ", ".join(proposals)
        return None, f"The caption mentions {mentioned}, and I can't tell which single place it's about. {ask}"
    return place, None


async def _confirm_place(
    session: Session, trip: Trip, save: SavedPost, run: ResearchRun, text: str, proposals: list[str], budget: Budget
) -> str | None:
    """Jev decides which proposed place strings (if any) the text is about.
    Persists and returns the place, or None when Jev isn't confident."""
    single, per_candidate = await jev_client.resolve_place(text, proposals, timeout=budget.step(15, reserve=15))
    trace(session, trip.id, "place:single_location", single)
    confirmed = []
    for i, proposal in enumerate(proposals):
        answer = per_candidate[i]
        trace(session, trip.id, "place:candidate", answer, choice=f"{proposal} → {answer.choice}", counts_time=False)
        if answer.choice == "yes" and jev_client.supported(answer, 0.5):
            confirmed.append(proposal)
    if single.choice != "yes" or not jev_client.supported(single, MIN_JEV_CONFIDENCE) or not confirmed:
        return None

    place = ", ".join(confirmed)
    run.place = place
    save.place_name = place
    session.add(run)
    session.add(save)
    session.commit()
    return place


async def _continue_with_place(session: Session, trip: Trip, run: ResearchRun, budget: Budget) -> str:
    if not trip.diet:
        return _needs_clarification(session, trip, run, "needs_diet", pending_question(run, "needs_diet"))
    return await research_place(session, trip, run, budget)


# --- Answers to a waiting run's question ------------------------------------


def waiting_run(session: Session, trip_id: str) -> ResearchRun | None:
    """The trip's newest run, when it is waiting on the traveler for a place or diet."""
    runs = runs_newest_first(session, trip_id)
    newest = runs[0] if runs else None
    return newest if newest is not None and newest.status in ("needs_place", "needs_diet") else None


def pending_question(run: ResearchRun, status: str | None = None) -> str:
    if (status or run.status) == "needs_place":
        return "Which place should I research for the post you shared?"
    return (
        f"I identified {run.place} from the post's caption. What dietary preference should I "
        "check nearby menus for (for example vegetarian or vegan)?"
    )


async def answer_place(session: Session, trip: Trip, run: ResearchRun, text: str, budget: Budget) -> str | None:
    """A text message while `run` waits for a place. Code proposes place strings
    from the message (and caption places it mentions); Jev decides. Returns None
    when the message proposes no place, so the caller handles it as usual.
    Raises JevError when Jev is unavailable; the run keeps waiting."""
    caption = run.caption_excerpt or ""
    proposals = caption_mod.place_candidates(text)
    lowered = text.lower()
    for mentioned in caption_mod.place_candidates(caption):
        if mentioned.lower() in lowered and mentioned.lower() not in {p.lower() for p in proposals}:
            proposals.append(mentioned)
    if not proposals:
        return None

    save = session.get(SavedPost, run.save_id)
    context = f"{caption}\nAsked which place the post is about, the traveler answered: {text}".strip()
    try:
        place = await _confirm_place(session, trip, save, run, context, proposals, budget)
    except BudgetExhausted:
        place, ran_out = None, True
    else:
        ran_out = False
    if place is None and _newer_run_exists(session, run):
        return _set_aside(session, run)  # a link shared meanwhile replaced this post's question
    if ran_out:
        return f"I ran out of time checking that place. {pending_question(run)}"
    if place is None:
        return f"I still can't tell which single place you mean ({', '.join(proposals)}). {pending_question(run)}"
    return f"Got it: {place}. " + await _continue_with_place(session, trip, run, budget)


# --- Phase 2: place -> researched candidates -> recommendation ---------------


async def research_place(session: Session, trip: Trip, run: ResearchRun, budget: Budget | None = None) -> str:
    if _newer_run_exists(session, run):
        return _set_aside(session, run)
    budget = budget or Budget(budget_seconds())
    place, diet = run.place, trip.diet
    run.diet = diet
    run.status = "researching"
    trip.status = "researching"
    trip.clarification = None
    session.add(run)
    session.add(trip)
    session.commit()
    try:
        return await _research_place(session, trip, run, budget, place, diet)
    except JevError:
        return _failed(session, trip, run, f"I identified {place}, but Jev was unavailable to choose sources. Please retry.")
    except BudgetExhausted:
        return _failed(session, trip, run, f"I identified {place}, but research ran out of time. Please retry.")
    except Exception:
        log.exception("place research failed unexpectedly")
        return _failed(session, trip, run, f"I identified {place}, but research failed unexpectedly. Please retry.")


async def _research_place(session: Session, trip: Trip, run: ResearchRun, budget: Budget, place: str, diet: str) -> str:
    warnings: list[str] = []

    # 1. Literal search; Jev chooses among the returned result IDs.
    queries = [
        f"restaurant menu prices {place}"[:200],
        f"{place} menu with prices"[:200],
        f"{diet} dishes menu prices near {place}"[:200],
        f"lunch menu near {place}"[:200],
    ]
    timeout = budget.step(12, reserve=15)
    searches = await asyncio.gather(
        *(asyncio.wait_for(menu_fetch_client.search_sources(q, 5), timeout) for q in queries), return_exceptions=True
    )
    results: list[dict] = []
    seen_urls: set[str] = set()
    for outcome in searches:
        if isinstance(outcome, BaseException):
            warnings.append("A Browserbase search failed.")
            continue
        for result in outcome.get("results") or []:
            readable = not result["url"].lower().split("?")[0].endswith(".pdf") and (
                caption_mod.base_domain(result["url"]) not in UNREADABLE_SOURCE_DOMAINS
            )
            if readable and result["url"] not in seen_urls and len(results) < MAX_SEARCH_RESULTS:
                seen_urls.add(result["url"])
                results.append({**result, "title_segments": caption_mod.title_segments(result["title"])})
    if not results:
        return _failed(session, trip, run, f"I identified {place}, but restaurant search returned nothing usable. Please retry.", warnings)

    selections = await jev_client.select_sources(place, diet, results, timeout=budget.step(15, reserve=12))
    ranked: list[tuple[float, dict, str]] = []
    for i, result in enumerate(results):
        is_menu, name_answer = selections[i]
        trace(
            session, trip.id, "source_selection", is_menu,
            choice=f"{result['title'][:80]} → {is_menu.choice}", counts_time=i == 0,
        )
        # Jev's call. A weak "yes" is still fetched, at lower priority, but its
        # candidate is marked unverified and never recommended: priced dishes
        # prove a menu, not that the restaurant is near the place.
        if is_menu.choice != "yes":
            continue
        verified = jev_client.supported(is_menu, MIN_JEV_CONFIDENCE)
        segments = result["title_segments"] or [result["title"]]
        name = segments[0] if len(segments) == 1 else result["title"]
        if name_answer is not None:
            trace(session, trip.id, "restaurant_name", name_answer, counts_time=False)
            # Without a confident pick the full title is shown as-is, never a guessed segment.
            if name_answer.choice.startswith("s") and jev_client.supported(name_answer, MIN_JEV_CONFIDENCE):
                name = segments[int(name_answer.choice[1:])]
        ranked.append((jev_client.support(is_menu), result, name, verified))
    ranked.sort(key=lambda item: -item[0])
    chosen: list[tuple[dict, str, bool]] = []
    per_name: dict[str, int] = {}
    for _, result, name, verified in ranked:
        # At most two sources per restaurant (the second is a fallback listing).
        key = _name_key(name)
        if per_name.get(key, 0) < 2 and len(chosen) < MAX_FETCH_ATTEMPTS:
            per_name[key] = per_name.get(key, 0) + 1
            chosen.append((result, name, verified))
    if not chosen:
        return _failed(
            session, trip, run,
            f"I identified {place}, but Jev didn't judge any of {len(results)} search results to be a nearby restaurant menu.",
            warnings,
        )

    # 2. Retrieve up to three menus in parallel, then score each with Jev.
    fetch_timeout = budget.step(20, reserve=10)

    async def fetch(url: str, name: str):
        started = time.monotonic()
        result = await asyncio.wait_for(menu_fetch_client.fetch_menu(url, name), fetch_timeout)
        return result, int((time.monotonic() - started) * 1000)

    fetched = await asyncio.gather(*(fetch(r["url"], name) for r, name, _ in chosen), return_exceptions=True)
    to_score: list[tuple[str, str, dict, int]] = []
    verified_ids: set[str] = set()
    kept_names: set[str] = set()
    for (result, name, verified), outcome in zip(chosen, fetched):
        if _name_key(name) in kept_names or len(to_score) >= MAX_MENUS:
            continue  # already have this restaurant's menu, or enough menus
        if isinstance(outcome, MenuFetchError):
            warnings.append(f"{name}: menu not readable ({outcome.message})")
        elif isinstance(outcome, BaseException):
            warnings.append(f"{name}: menu fetch timed out" if isinstance(outcome, asyncio.TimeoutError) else f"{name}: menu fetch failed")
        elif not outcome[0].get("dishes"):
            warnings.append(f"{name}: no priced dishes found on {result['url']}")
        else:
            candidate_id = str(uuid.uuid4())
            kept_names.add(_name_key(name))
            if verified:
                verified_ids.add(candidate_id)
            to_score.append((candidate_id, name, _namespace_evidence(outcome[0], candidate_id[:8]), outcome[1]))

    score_timeout = budget.step(25, reserve=6) if to_score else 0
    scored = await asyncio.gather(
        *(
            scoring.score_fetched_menu(name, diet, fetch_result, fetch_ms, RESEARCH_MAX_DISHES, score_timeout)
            for _, name, fetch_result, fetch_ms in to_score
        ),
        return_exceptions=True,
    )
    candidates: list[ResearchCandidate] = []
    for (candidate_id, name, fetch_result, _), outcome in zip(to_score, scored):
        if isinstance(outcome, BaseException):
            warnings.append(f"{name}: Jev could not score this menu")
            continue
        score = outcome.model_dump(mode="json")
        candidate = ResearchCandidate(
            id=candidate_id,
            trip_id=trip.id,
            run_id=run.id,
            restaurant=name,
            menu_url=fetch_result.get("menu_url") or "",
            score_result=score,
            evidence=score.get("evidence") or [],
            source_verified=candidate_id in verified_ids,
            recommendation_reason=None if candidate_id in verified_ids else UNVERIFIED_REASON,
        )
        candidates.append(candidate)
        verdicts = [d["verdict"] for d in score["dishes"]]
        session.add(
            DecisionTrace(
                trip_id=trip.id,
                stage="dish_scoring",
                model=jev_client.current_model(),
                choice=f"{name}: {verdicts.count('yes')} yes / {verdicts.count('no')} no / {verdicts.count('unclear')} unclear",
                confidence=score["confidence"],
                evidence_ids=[e["id"] for e in candidate.evidence][:20],
                duration_ms=score["timing_ms"].get("jev_total", 0),
            )
        )
    if not candidates:
        return _failed(session, trip, run, f"I identified {place}, but none of the menus I found could be checked. " + _warning_text(warnings), warnings)

    for candidate in candidates:
        session.add(candidate)
    kept = f" The menus I checked for {place} are saved with the trip."
    if _newer_run_exists(session, run):
        return _set_aside(session, run, kept)

    # 3. Jev chooses the recommendation among eligible researched IDs.
    for older in session.exec(
        select(ResearchCandidate).where(ResearchCandidate.trip_id == trip.id, ResearchCandidate.rank.is_not(None))
    ).all():
        older.rank = None
        session.add(older)
    session.commit()  # hold no SQLite write lock while Jev chooses

    reply = f"From the post's caption I identified {place}. I checked {len(candidates)} nearby menu(s) for {diet} options. "
    try:
        reply += await recommend(session, trip, place, candidates, budget.step(12), scored_diet=diet)
    except (JevError, BudgetExhausted):
        warnings.append("Jev could not complete the recommendation step; the checked menus are saved without a pick.")
        reply += "Jev couldn't finish choosing a recommendation, so the checked menus are saved without a pick. "

    if _newer_run_exists(session, run):
        for candidate in candidates:
            candidate.rank = None
            candidate.recommendation_reason = None if candidate.source_verified else UNVERIFIED_REASON
            session.add(candidate)
        return _set_aside(session, run, kept)

    run.status = "ready"
    run.finished_at = _now()
    run.warnings = warnings
    trip.status = "ready"
    session.add(run)
    session.add(trip)
    session.commit()
    return f"{reply.strip()} {_warning_text(warnings)}".strip()


async def recommend(
    session: Session,
    trip: Trip,
    place: str,
    candidates: list[ResearchCandidate],
    timeout: float,
    stage: str = "recommendation",
    lead: str = "Jev recommends",
    scored_diet: str | None = None,
) -> str:
    """Ranks `candidates` in place via Jev and returns reply text.
    `scored_diet` is the diet the candidates' dishes were judged for."""
    scored_diet = scored_diet or trip.diet
    diet = scored_diet or "your"
    pool = [c for c in candidates if eligible(c)]
    if not pool:
        unverified = [c.restaurant for c in candidates if not c.source_verified and not c.rejected and dish_counts(c)[0] > 0]
        if unverified:
            return (
                f"Jev wasn't confident that {', '.join(unverified)} {'is' if len(unverified) == 1 else 'are'} near {place}, "
                "so I'm not recommending a menu from this research."
            )
        return f"None of those menus had dishes Jev judged {diet}-compatible with high confidence, so I'm not recommending one."
    options = option_keys(pool)
    answer = await jev_client.choose_recommendation(
        place,
        {"diet": scored_diet, "budget": trip.budget},
        {key: summary(c, diet) for key, c in options.items()},
        timeout=timeout,
    )
    if answer.choice == "none" or not jev_client.supported(answer, 0.5):
        trace(session, trip.id, stage, answer, choice="no clear fit")
        listed = "; ".join(summary(c, diet) for c in pool)
        return f"Jev didn't find a clear fit among them. What I found: {listed}."

    top = options[answer.choice]
    probabilities = answer.probabilities or {}
    others = sorted((k for k in options if k != answer.choice), key=lambda k: -probabilities.get(k, 0.0))
    trace(session, trip.id, stage, answer, choice=top.restaurant,
          evidence_ids=[e["id"] for e in top.evidence][:20])
    yes, total, _, examples = dish_counts(top)
    top.rank = 0
    top.recommendation_reason = (
        f"Jev's pick ({answer.confidence:.0%} confidence): {yes} of {total} menu dishes judged {diet}-compatible "
        f"with high confidence{' (e.g. ' + ', '.join(examples) + ')' if examples else ''}. Menu coverage, not a dietary guarantee."
    )
    for position, key in enumerate(others, start=1):
        alt = options[key]
        alt.rank = position
        alt.recommendation_reason = f"Alternative #{position} by Jev's ranking: {summary(alt, diet)}."
    for candidate in pool:
        session.add(candidate)
    reply = f"{lead} {top.restaurant}: {yes} of {total} dishes judged {diet}-compatible with high confidence"
    reply += f" (e.g. {', '.join(examples)})." if examples else "."
    if others:
        reply += " Alternatives: " + "; ".join(f"{options[k].restaurant} ({dish_counts(options[k])[0]} of {dish_counts(options[k])[1]})" for k in others) + "."
    return reply + " "


def _name_key(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _namespace_evidence(fetch_result: dict, prefix: str) -> dict:
    """Evidence IDs from the adapter restart at e1 per page; make them unique per candidate."""
    evidence = [{**e, "id": f"{prefix}-{e['id']}"} for e in fetch_result.get("evidence") or []]
    dishes = [
        {**d, "evidence_ids": [f"{prefix}-{eid}" for eid in d.get("evidence_ids") or []]}
        for d in fetch_result.get("dishes") or []
    ]
    return {**fetch_result, "evidence": evidence, "dishes": dishes}


def _warning_text(warnings: list[str]) -> str:
    return ("Couldn't use: " + "; ".join(warnings) + ".") if warnings else ""


def _newer_run_exists(session: Session, run: ResearchRun) -> bool:
    """A link shared after this run's link owns the trip's status,
    clarification and ranking; this run must no longer write them. Ordered by
    when each link was saved, so a run that started late (its request waited on
    the preference check) can't take over from a link shared after it."""
    save = session.get(SavedPost, run.save_id)
    return session.exec(
        select(SavedPost).where(SavedPost.trip_id == run.trip_id, SavedPost.created_at > save.created_at)
    ).first() is not None


def other_run_recommends(session: Session, run: ResearchRun) -> bool:
    """Another run (a newer link) already holds the trip's recommendation."""
    return session.exec(
        select(ResearchCandidate).where(
            ResearchCandidate.trip_id == run.trip_id,
            ResearchCandidate.run_id != run.id,
            ResearchCandidate.rank == 0,
            ResearchCandidate.rejected == False,  # noqa: E712 (SQL expression)
        )
    ).first() is not None


def _set_aside(session: Session, run: ResearchRun, detail: str = "") -> str:
    run.status = "superseded"
    run.finished_at = _now()
    session.add(run)
    session.commit()
    return (
        "You shared a newer link while I was working on this one, so I'm going with the newer link."
        f"{detail} Share this link again if you want it researched."
    )


def _needs_clarification(session: Session, trip: Trip, run: ResearchRun, status: str, question: str) -> str:
    if _newer_run_exists(session, run):
        return _set_aside(session, run)
    run.status = status
    run.finished_at = _now()
    trip.status = "needs_clarification"
    trip.clarification = question
    session.add(run)
    session.add(trip)
    session.commit()
    return question


def _failed(session: Session, trip: Trip, run: ResearchRun, reply: str, warnings: list[str] | None = None) -> str:
    run.status = "failed"
    run.finished_at = _now()
    run.warnings = warnings or []
    session.add(run)
    if not _newer_run_exists(session, run):
        trip.status = "failed"
        session.add(trip)
    session.commit()
    return reply
