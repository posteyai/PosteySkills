# Postey AI Prompts

Platform-specific prompts for generating titles and captions from video transcripts.
Use these after running `video2post.js` to generate high-quality, platform-native content.

---

## YouTube

### Title
```
Write a YouTube video title for the following transcript. Requirements:
- Maximum 70 characters
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
- End with 5–8 relevant hashtags on their own line
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
- End with 5–10 trending, relevant hashtags
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
- 1–2 hashtags max (only if they add reach, not just to fill space)
- No emojis unless they genuinely add meaning

Transcript:
{{transcript}}
```

### Thread
```
Write an X (Twitter) thread for the following video transcript. Requirements:
- First tweet is the hook — must make people want to read the rest (max 240 chars, leave room for "🧵")
- Each subsequent tweet is one clear, standalone point
- 5–10 tweets total
- Last tweet has a call-to-action (follow, retweet, reply)
- Separate tweets with "---" on its own line
- Conversational but authoritative tone
- 1–2 hashtags on the last tweet only

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
- End with a question to drive comments
- Professional but human tone — avoid corporate jargon
- 3–5 relevant hashtags at the end on their own line
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
- No hashtags (they don't work well on Threads)
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
- 1 hashtag max (only if highly relevant)
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

After running `video2post.js`, pass the `transcript` (and `video_title`) from the JSON output into the relevant prompt above. Then use `drafts:create` with the generated caption:

```bash
# Transcribe
result=$(node ./scripts/video2post.js <url>)
transcript=$(echo $result | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).transcript)")

# Paste transcript into the prompt above, generate caption with AI, then:
node ./scripts/postey.js drafts:create <account_id> --platform YOUTUBE \
  --youtube-title "<generated title>" \
  --youtube-description "<generated description>" \
  --text "<generated description>"
```
