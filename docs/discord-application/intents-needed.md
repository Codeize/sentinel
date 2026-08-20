# Which intents Deadlock actually needs

Last verified: 2026-08-20

| Intent          | Needed | Verdict                                                                 |
| --------------- | ------ | ----------------------------------------------------------------------- |
| Presence        | No     | Not requested, nothing reads presence data. Leave unchecked.            |
| Server Members  | Yes    | Load bearing across most features.                                      |
| Message Content | Yes    | Two features depend on it, one of them breaks destructively without it. |

The intent list is declared in `src/main.ts`.

## Presence: not needed

`GuildPresences` is not in the intent list and nothing in the codebase reads presence,
status, or activity data. Verify with:

```bash
grep -rn "\.presence\|presenceUpdate\|GuildPresences" src/
```

Only hits should be the client's own `presence` option in `src/main.ts`, which sets the
bot's own status and does not require the intent.

## Server Members: needed

Required for the `GUILD_MEMBER_ADD`, `GUILD_MEMBER_UPDATE` and `GUILD_MEMBER_REMOVE`
events, plus the full `guild.members.fetch()` the bot runs at startup to populate the
cache that ban sync and role sync read from.

Consumers:

-   `src/listeners/banSync/checkBanOnJoin.ts` (add)
-   `src/listeners/banSync/loadBansOnReady.ts` (startup member fetch)
-   `src/listeners/roleSync/syncRolesOnJoin.ts` (add, dormant, see below)
-   `src/listeners/roleSync/syncRoleChanges.ts` (update, dormant, see below)
-   `src/listeners/roleSync/syncRolesOnReady.ts` (startup member fetch, dormant, see below)
-   `src/modules/custom_roles/listeners/premiumSubscribe.ts` (update, regain path)
-   `src/modules/custom_roles/listeners/premiumUnsubscribe.ts` (update, revoke path)
-   `src/modules/custom_roles/listeners/premiumMemberComesBack.ts` (add)
-   `src/modules/custom_roles/listeners/premiumMemberRemove.ts` (remove)
-   `src/modules/custom_roles/listeners/restoreGiftedRoleOnJoin.ts` (add)
-   `src/modules/visible_rank_roles/listeners/syncRankRolesOnMembers.ts` (update)
-   `src/modules/notifications/listeners/notificationRoleAdd.ts` (update)
-   `src/listeners/clientReady.ts` (startup member fetch)
-   `src/tasks/checkPremiumMemberAbilities.ts` (nightly reconciliation member fetch)

Re-check with:

```bash
grep -rn "GuildMemberAdd\|GuildMemberUpdate\|GuildMemberRemove\|members.fetch()" src/
```

### Dormant: cross-guild role syncing

The three `src/listeners/roleSync/` listeners filter on `RoleSyncType.AcrossGuilds`, and no such rows exist in
production as of 2026-08-20. The code runs but never matches anything, so it is not used as a justification in the
application. Check with `/role-sync list` before the next application, and add it back if it is in use by then.

This is separate from visible rank roles, which use `RoleSyncType.VisibleRank` rows via
`src/modules/visible_rank_roles/` and are in active use. Both types share the `role_syncs` table.

## Message Content: needed

Two consumers.

**Clan custom commands.** `src/modules/custom_roles/listeners/clanCustomCommand.ts`
reads `message.content` to take the first word and match it against registered `!`
triggers. This is the only place user message text is read at all.

**Media-only channels.** `src/listeners/mediaOnlyChannels/onlyMessagesWithMedia.ts`
reads `message.attachments`. This is the non-obvious one: Discord gates `attachments`
behind the Message Content intent along with `content`, `embeds` and `components`.
Without the intent, `attachments` arrives empty for every message the bot did not
author, so the feature does not degrade, it inverts, and the bot deletes every message
in a media-only channel. Do not drop this intent while that feature exists.

Nothing stores user message content. The `trigger`, `responseText` and
`responseMediaUrl` on `ClanCustomCommand` all come from `/custom-command set` options,
not from scraped messages.

Re-check with:

```bash
grep -rn "message\.content\|\.attachments" src/
```

Ignore hits on `originalMessage.content`, `interaction.message.embeds` and
`autoPin.content`. Those are the bot's own messages or interaction payloads, which are
never gated.

## Note on message commands

`src/main.ts` sets `loadMessageCommandListeners: true` while `UtilsBot.fetchPrefix`
returns `null`. There is no text prefix, but Sapphire's mention prefix is enabled by
default, so `@Deadlock <command>` still reaches the `messageRun` handlers in
`src/commands/eval.ts`, `src/commands/votekick.ts` and
`src/modules/visible_rank_roles/commands/togglerank.ts`. These are gated to hardcoded
user IDs.

Messages that mention the bot are exempt from message content gating, so these work with
or without the intent. Do not set `loadMessageCommandListeners: false` expecting a no-op;
it would disable all three.
