# X Algorithm Notes (Public Sources)

Part of the `postey` skill. Loaded on demand; see SKILL.md "Content Flows".

## 4. X Algorithm Rules Worth Teaching Any Agent

Grounded in public sources: the open-sourced ranking code at `github.com/xai-org/x-algorithm` and `github.com/twitter/the-algorithm`, plus large-scale public analyses of post-performance data (including a study of 18.8M posts across 71,000 accounts). Weight figures are approximate, derived from third-party code reviews; re-check the repositories for updates.

**How ranking works (simplified):** candidates come from accounts you follow plus embedding-similarity retrieval; a transformer model predicts the probability of each user action (like, reply, repost, bookmark, dwell, follow, and negative actions like mute/report); the final score is a weighted sum of those probabilities. An author-diversity penalty limits repetition.

**Approximate engagement weights:**

| Signal | Relative weight |
|---|---|
| Replies | ~13-27x a like (full conversations higher) |
| Reposts | ~20x a like |
| Bookmarks | ~10x a like |
| Likes | baseline (1x) |

Negative actions (mute, block, report, "not interested") subtract. **Early engagement velocity is critical**: initial performance determines further distribution.

**Documented content factors:**
- Rich media (video, images, polls) raises predicted engagement. Video posts significantly outperform text-only.
- Threads generate roughly 3x the impressions of comparable single posts.
- Original content beats pure quote-posts and reposts.
- **External links in the main post cut reach 30-50%** (up to ~94% in some tests). Put the link in the first reply, never the main post.
- Premium subscriptions carry a documented distribution multiplier; smaller accounts see proportionally larger gains.

**Practical levers:** design for high-weight actions (genuine questions, strong opinions, actionable insights that invite replies and bookmarks); attach media; post when the audience is active; reply thoughtfully to early comments; keep a consistent topical niche (helps embedding-based matching); avoid spammy repetition.

**High-intent vs vanity signals:** bookmarks, "how do I do this?" replies, and profile visits convert; likes from peers, generic "great post!" replies, and follower count without activation do not. Content that earns bookmarks: numbered mistake breakdowns, step-by-step playbooks, before/after case studies with metrics, checklists.


