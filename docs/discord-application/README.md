# Discord Privileged Intent Application

Reference material for Deadlock's privileged intent application. Discord requires
re-verification periodically, so these answers are kept here to be copy-pasted rather
than rewritten from scratch each time.

**The bot is called Deadlock in anything public facing.** "Flokie Util Bot" is the
original internal project name and "Sentinel" is a later internal rename. Neither is
public, so neither should appear in the application, the privacy policy, or the bot's
Discord listing.

## Files

| File                    | What it is                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| `intents-needed.md`     | Which intents the bot actually needs and the code that proves it |
| `intent-application.md` | Ready-to-paste answers for every field of the application form   |
| `privacy-policy.md`     | Source of the public privacy policy                              |

## The privacy policy

The public copy lives on Notion, at
<https://paragon-services.notion.site/Deadlock-Privacy-Policy-3bd72dec53cc802f8ccac54b71fbc415>,
and is linked from the bot's Discord bio. `privacy-policy.md` is the source. When the
bot's stored data changes, update this file and re-paste it into Notion so the two do
not drift.

## Before applying again

1. Re-check the intents against the current code. `intents-needed.md` lists the exact
   greps. Features get added between applications, and the last round of answers was
   already stale by one feature.
2. Re-read `intent-application.md` against the current feature set. Remove anything no
   longer true, add anything new. A reviewer comparing your description to the bot's
   actual behaviour is the failure mode to avoid.
3. Diff `prisma/schema.prisma` against `privacy-policy.md`. Every model that holds user
   data needs a section. Update Notion afterwards.
4. Record fresh screenshots or videos. Discord requires a link per intent, and the list
   at the bottom of `intent-application.md` says what to capture.
5. Confirm the Notion page is still publicly shared. A privacy policy link that 404s for
   the reviewer is an instant rejection.

## Data deletion requests

Users can reach us through modmail on the server, or at contact@prgn.gg. There is no
in-bot deletion command, so these are handled manually by staff.
