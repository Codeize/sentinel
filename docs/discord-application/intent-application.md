# Deadlock - Privileged Intent Application Answers

Last updated: 2026-08-20

Copy-paste answers for each field of Discord's privileged intent application form. Every
text block is written to fit under a 2000 character limit. Re-verify against the current
code before reusing, see `README.md`.

## Dropdown answers

| Field                                          | Answer                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Do you have a public Privacy Policy?           | Yes                                                                                           |
| Where is your Privacy Policy available?        | It is linked in the bot's bio.                                                                |
| Link to your Privacy Policy                    | https://paragon-services.notion.site/Deadlock-Privacy-Policy-3bd72dec53cc802f8ccac54b71fbc415 |
| Storing any API Data off-platform?             | Yes                                                                                           |
| Storing API Data for 30 days or less?          | No                                                                                            |
| Can users opt-out of message content tracking? | No, see note below                                                                            |
| Storing message content off-platform?          | No                                                                                            |
| Message content used to train ML or AI models? | No                                                                                            |

On the opt-out question: no message content is tracked or stored in the first place, so
there is no tracked data to opt out of. Answering Yes would claim an opt-out mechanism
that does not exist. The Message Content justification below opens by explaining this.

---

## Application Details (~1150 chars)

Deadlock is a private utility bot for the Discord servers we operate. It is not public, not listed in any directory, and only we can invite it. The user count comes from a few very large servers, not wide distribution.

Features:

-   Vote kick: members in a voice channel can vote to remove a disruptive user from it. Configurable threshold, time limit, per-user cooldowns, and a moderator log entry for every completed vote.
-   Media-only channels: staff can mark a channel as media-only. Messages posted there without an attachment are removed with a short self-deleting notice.
-   Auto-pinned messages: a staff-written message the bot reposts on an interval so it stays at the bottom of a channel.
-   Polls: slash-command polls with button voting and automatic results when they close.
-   Ban syncing: mirrors bans across the servers we operate.
-   Invite pruning: removes expired or unwanted invites.
-   Notifications: sends a staff-written message once to each member holding a given role.
-   Subscriber perks: subscribers can create a personal custom role, upload a custom emoji, gift a cosmetic role to one other member, and create or join a clan with its own role and private channel.
-   Clan custom commands: a clan can set up its own text shortcuts through a slash command. Its members can then trigger one by typing an exclamation mark followed by the trigger word, and the bot replies with the text or media the clan configured.

---

## Server Members Intent (~1400 chars)

> Why do you need the Guild Members intent?

Most of Deadlock's features react to members joining, leaving, or having their roles changed. None of it is triggered by a command, so none of it is reachable through interactions. Several features also need the full member list at startup to catch up on what happened while the bot was offline.

GUILD_MEMBER_ADD:

-   Ban syncing checks the joining member against the shared ban list and bans them if they are banned in another of our servers.
-   Subscriber perks restore a gifted cosmetic role to a returning member still entitled to it.

GUILD_MEMBER_UPDATE:

-   Subscriber perks are revoked when a member loses the subscriber role: their custom role is deleted, their clan is marked for deletion, the cosmetic role they gifted to another member is taken back, and any self-assigned perk roles are stripped. If they regain the role, a clan that was marked for deletion is restored.
-   Visible rank roles keep the rank a member displays in sync with the rank they hold.
-   Notifications send a member their notification once when they gain the targeted role.

GUILD_MEMBER_REMOVE:

-   Subscriber perks clean up the leaving member's custom role, clan ownership, and gifted role.

Full member fetch at startup and in a nightly reconciliation task, so bans and subscriber perks that drifted while the bot was down get corrected.

Vote kick also resolves the members connected to a voice channel to decide who may vote, and to apply and later remove the temporary voice-block role.

> How do users contact you to request deletion of their activity data?

Users can contact us through modmail on the server, or by email at contact@prgn.gg. Both routes are handled by our staff. This is also stated in our privacy policy.

> Please provide links to screenshots and/or videos that demonstrate your use case

https://youtu.be/MXFUdbOAU0E

---

## Message Content Intent

> Can users opt-out of having their message content data tracked?

**No.** Nothing is tracked, so there is no tracked data to opt out of. Explained in the box below.

> Storing message content off-platform? **No** (verified: no user message text is written to our database)

> Used to train ML or AI models? **No**

> Why do you need the Message Content intent? (~1600 chars)

Deadlock uses this intent for two features.

**Clan custom commands.** Subscribers who own a clan can set up text shortcuts for their clan through a slash command. Members of that clan can then trigger one by typing an exclamation mark followed by the trigger word, such as !roster, and the bot replies with the text or image the clan configured. To do this the bot has to read the first word of a message to see whether it matches a registered trigger. If it does not match, the message is ignored and nothing further happens.

**Media-only channels.** Staff can designate specific channels as media-only, for example art or clip channels. In those channels a message must include an attachment. If someone posts without one, the bot deletes the message and replies with a short notice that deletes itself after ten seconds. This needs the intent because Discord gates the attachments field of MESSAGE_CREATE behind Message Content alongside content. Without it, attachments arrives empty for every message the bot did not author, so the bot cannot tell an image post from a text post, and every message would look attachment-less and be deleted.

In both cases the bot inspects the message only in memory and discards it immediately. It stores the first word only long enough to compare it against the list of registered triggers. No message text is written to our database, sent to a third party, or used for anything else. The trigger words and responses we do store were written by clan owners through a slash command, not collected from anyone's messages.

> Please provide links to screenshots and/or videos that demonstrate your use case

https://youtu.be/FtBOskQhr5k

---

## Screenshots / videos

Recorded 2026-08-20. Re-record before the next application, since the features shown will have moved on.

| Intent          | Link                         |
| --------------- | ---------------------------- |
| Server Members  | https://youtu.be/MXFUdbOAU0E |
| Message Content | https://youtu.be/FtBOskQhr5k |

Discord requires a link per intent. Short screen recordings on Streamable, unlisted YouTube or Imgur are fine.

What to cover when re-recording:

**Server Members**, at least two of:

-   Removing the subscriber role from a test account, bot deletes their custom role and orphans their clan
-   Banning a test account in server A, showing it auto-banned when it joins server B
-   A test account gaining a notification-targeted role and being sent the notification
-   A test account gaining a rank role, bot updates the rank role it displays

**Message Content**, one clip covering both:

-   `/custom-command set` creating a trigger, then typing `!trigger` in chat and the bot replying
-   Text-only message in a media-only channel, deleted with the notice
-   Then an image in the same channel, stays
-   Optionally `/media-only-messages` configuring the channel, showing it is opt-in per channel

---

## Deliberately left out

**Cross-guild role syncing** (`/role-sync`) is implemented and functional, but no pairs are configured in production
as of 2026-08-20, so it is not claimed as a feature or as a justification for the Server Members intent. Describing
an unused feature to a reviewer invites a question you would rather not field. If `/role-sync list` returns entries
next time, add it back to the feature list and to the GUILD_MEMBER_ADD and GUILD_MEMBER_UPDATE justifications.

This does not affect visible rank roles, which use the same table with a different type and are in active use.
