# Postey AI Prompts

Platform-specific prompts for generating titles and captions from video transcripts.
Use these after running `postey.js video transcribe` to generate high-quality, platform-native content.

> **Static snapshot:** The character limits, media specs, and writing rules below are a
> cached reference for offline use. In Claude Code sessions, read the live MCP resource
> `postey://platform-limits` (or `postey://platforms/{platform}/rules` per-platform) for
> authoritative, always-current platform specifications. The MCP resource is the single
> source of truth; this file is updated manually and may lag behind.
>
> **Style precedence:** for caption style (hashtag counts, CTA style, thread length,
> voice), `references/platform-archetypes.md` is the maintained playbook and wins over
> anything here that disagrees. Keep both in sync when editing either.

---

## YouTube

### Title
```
Write a YouTube video title for the following transcript. Requirements:
- Maximum 100 characters (hard limit); front-load the meaning in the first 70, since search results truncate around there
- Keyword-rich and SEO-friendly
- Create a curiosity gap or strong value proposition
- No clickbait — the title must accurately reflect the content
- Do NOT use emojis
- Do NOT use colons as the first separator (prefer "–" or "|" if needed)

Transcript:
{{transcript}}
```

### Description
```
Write a YouTube video description for the following transcript. Requirements:
- First 2–3 lines are the "above the fold" hook — make them count (viewers see these before clicking "more")
- Summarize the key value/takeaway in plain language
- Add timestamps if the video has clear sections (use format: 0:00 Intro)
- Include 3–5 relevant hashtags at the very end
- Maximum 500 words
- Natural, conversational tone — not a listicle

Video title: {{title}}
Transcript:
{{transcript}}
```

---

## Instagram

### Caption
```
Write an Instagram caption for the following video transcript. Requirements:
- First line is the hook — must stop the scroll (ask a question, make a bold claim, or tease the value)
- 150–300 words
- Use short paragraphs with line breaks for readability
- Include a clear call-to-action (save this, follow for more, comment below, etc.)
- End with 5–10 relevant hashtags on their own line, mixing broad and specific
- Conversational and relatable tone
- No corporate-speak

Transcript:
{{transcript}}
```

---

## TikTok

### Caption
```
Write a TikTok caption for the following video transcript. Requirements:
- Maximum 150 characters for the main hook (shown before "more")
- Hook must be punchy and create immediate curiosity or FOMO
- Use emojis sparingly but effectively (1–3 max)
- End with 5–7 trending, relevant hashtags
- Tone: fast, energetic, casual — like you're talking to a friend

Transcript:
{{transcript}}
```

---

## X (Twitter)

### Single post
```
Write an X (Twitter) post for the following video transcript. Requirements:
- Maximum 280 characters total (including hashtags)
- Lead with the single most compelling insight or hook
- Direct and punchy — no fluff
- No hashtags (they read as a low-quality signal on X; see references/x-algorithm.md)
- No emojis in organic posts

Transcript:
{{transcript}}
```

### Thread
```
Write an X (Twitter) thread for the following video transcript. Requirements:
- First tweet is the hook — must make people want to read the rest (max 240 chars, leave room for "🧵")
- Each subsequent tweet is one clear, standalone point
- 6–15 tweets total — thread only if the content genuinely has that many distinct beats; otherwise write a single post
- Last tweet closes with a value takeaway or a future-moment bookmark ("Bookmark this...") — never generic engagement bait (no follow/retweet/reply asks)
- Separate tweets with "---" on its own line
- Conversational but authoritative tone
- No hashtags

Transcript:
{{transcript}}
```

---

## LinkedIn

### Post
```
Write a LinkedIn post for the following video transcript. Requirements:
- First line is the hook — a bold statement, counterintuitive insight, or relatable struggle (no "I'm excited to share...")
- 150–400 words
- Use short paragraphs (1–3 lines each) with blank lines between them for mobile readability
- Tell a story or share a specific lesson — not a generic list
- End with a soft CTA or a question to drive comments
- Professional but human tone — avoid corporate jargon
- 3–4 lightweight hashtags at the end on their own line
- No emojis unless used once for emphasis

Transcript:
{{transcript}}
```

---

## Threads

### Post
```
Write a Threads post for the following video transcript. Requirements:
- Maximum 500 characters
- Conversational and authentic — Threads rewards genuine voice over polished marketing
- One clear thought or insight per post
- Optional: end with a question to spark replies
- 0–2 hashtags, usually none (they rarely help on Threads)
- Tone: like a thoughtful text message to your audience

Transcript:
{{transcript}}
```

---

## Bluesky

### Post
```
Write a Bluesky post for the following video transcript. Requirements:
- Maximum 300 characters
- Bluesky audience values authenticity, tech-savviness, and nuance
- Lead with the most interesting or surprising insight
- Conversational and direct
- 0–1 hashtags, usually none (the culture is hashtag-light)
- No corporate marketing language

Transcript:
{{transcript}}
```

---

## Multi-platform batch

Use this when generating captions for all platforms at once from a single transcript:

```
I have a video transcript below. Generate platform-optimized captions for each of the following platforms. Follow each platform's native style and constraints exactly.

Platforms needed: {{platforms}}

For YOUTUBE also generate a title.

Transcript:
{{transcript}}

Video original title (if available): {{video_title}}

---

Output format — one section per platform, clearly labelled:

## YOUTUBE TITLE
...

## YOUTUBE DESCRIPTION
...

## INSTAGRAM CAPTION
...

## TIKTOK CAPTION
...

## X POST
...

## LINKEDIN POST
...

## THREADS POST
...

## BLUESKY POST
...
```

---

## Usage in the Postey workflow

After running `postey.js video transcribe`, pass the `transcript` (and `video_title`) from the JSON output into the relevant prompt above. Then use MCP `create_post` with the generated caption:

```bash
# Transcribe
result=$(node ./scripts/postey.js video transcribe <url>)
transcript=$(echo $result | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).transcript)")

# Paste transcript into the prompt above, generate caption with AI, then
# use the MCP create_post tool with the generated content.
```
