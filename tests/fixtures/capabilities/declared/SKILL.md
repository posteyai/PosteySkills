---
name: declared
capabilities:
  owns:
    - post.create
    - post.update
  reads:
    - analytics.top_posts
  prompts:
    - compose-post
routing:
  fallback: mcp-tool
---
body
