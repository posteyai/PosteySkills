# Flow: Video Everywhere

Part of the `postey` skill. Loaded when the user hands over a video.

## When to run

The user shares a video URL (YouTube, a public reel, a hosted file) or an uploaded video and wants
it posted: "post this everywhere," "make a post from this video," "caption this for my platforms."

## Steps

1. **Check accounts.** Call `get_accounts`. Note connected platforms and the target account.
2. **Get the words.** Call `transcribe_video` with the video URL. If transcription is unavailable
   for this source, ask the user to paste the transcript or describe what is said, and continue.
3. **Understand the video.** From the transcript, identify the single strongest moment, the core
   claim, and any concrete numbers. This seeds the captions; it is never pasted as the caption.
4. **Write per-platform captions.** One hand-crafted caption per connected platform following
   `platform-archetypes.md`: long-form narrative for X, operator how-to for LinkedIn, comment-hook
   for Instagram, and so on. Run every caption through the checks in `caption-playbook.md` and
   `hook-formulas.md`. If a brand profile exists, its voice and banned lists apply.
5. **Upload the media.** Use `upload_media` with the video URL (hosted flow). Note platform
   boundaries and tell the user when one matters: over 60 seconds publishes as a regular YouTube
   video rather than a Short; some platforms need a smaller encode and may reject oversized files.
6. **Create one draft.** A single `create_post` covering every connected platform via
   `additional_platforms`, captions attached per platform, media included, status DRAFT.
7. **Verify.** Fetch each platform with `get_specific_post_content`: caption present, media
   attached, right format. Fix before presenting.
8. **Tag and hand over.** Agent tag plus topic tags (reuse existing ones). Reply with the share
   link, the platform list, and any placement flags from step 5.

## Rules

- Draft only. Publishing waits for the user's explicit go.
- The transcript is the seed, not the script: never paste transcript text as a caption.
- A user-supplied hook is the literal first line on every platform.
- Never route the video through third-party file hosts; media goes straight into Postey.

## Degradations

- No transcription available and no transcript provided: caption from the user's description of
  the video, and say that is what happened.
- Audio-free or music-only video: caption from the visuals the user describes; skip quote pulls.
- One platform connected: single-platform draft, still verified, tagged, and share-linked.
