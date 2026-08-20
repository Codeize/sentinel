# Deadlock Privacy Policy

## The data we save

### The Scheduled Tasks

Internal bookkeeping for anything the bot has to do later (reposting an auto-pin, ending a poll, resolving a vote kick, deleting an orphaned clan).

-   The name of the task to run
-   The time it should run at
-   The recurrence, if the task repeats
-   The data the task needs to run, which may include a server, channel, user or role ID

### The Media-Only Channels

The channels in which a message must contain an attachment to be allowed.

-   The ID of the channel
-   The ID of the server the channel is in

### The Synced Bans

Bans that are mirrored across the servers configured for ban syncing.

-   The ID of the banned user
-   The ID of the server the ban came from
-   The reason for the ban, if one was given

### The Auto-Pinned Messages

Recurring messages that the bot keeps at the bottom of a channel.

-   The ID of the auto-pinned message entry
-   The text content of the message, as written by the server staff
-   The label and link of the attached button, if there is one
-   The ID of the channel it is posted in
-   The ID of the server it belongs to
-   How often it should be reposted
-   When it was last checked
-   The ID of the last message the bot sent for it

### The Vote Kicks

Each vote to kick a user out of a voice channel.

-   The ID of the vote
-   When the vote was created
-   The ID of the user being voted out
-   The ID of the user who started the vote
-   The IDs of the users who voted in favour of the kick
-   The IDs of the users who voted against the kick
-   The link to the original vote message
-   The ID of the voice channel the vote was started in
-   The reason given for the vote, if any

### The Kick Counters

Per user, so that repeated kicks can be rate-limited.

-   The ID of the user
-   The number of times they were kicked in the past 6 hours
-   When to remove the temporary voice block role from them, if applicable
-   When to reset their kick counter

### The Server Members

Per user, per server, only for members who have interacted with a feature that needs a preference stored.

-   The ID of the user
-   The ID of the server
-   Whether or not they have opted in to displaying their visible rank role

### The Polls

Every poll created through the bot.

-   The ID of the poll
-   The question that was asked
-   The list of answer options
-   When the poll was created
-   When the poll ends, and whether it has ended
-   The ID of the server, channel and message of the poll
-   The ID of the user who created the poll

### The Poll Answers

Each answer, by poll.

-   The ID of the poll
-   The ID of the user who answered
-   The option they picked

### The Role Syncs

The rules describing which role in which server should mirror which other role.

-   The ID of the role sync entry
-   The ID of the origin server and the origin role
-   The ID of the destination server and the destination role
-   Whether the sync is across servers or for visible rank roles

### The Invite Pruning Settings

Which servers should have their invites pruned.

-   The ID of the server

### The Notifications

Messages sent to members of a given role, once per member.

-   The ID of the notification
-   The text content of the notification, as written by the server staff
-   The ID of the channel it is tied to
-   The ID of the server it belongs to
-   The ID of the role that should receive it

### The Sent Notifications

So that a member is never notified twice for the same notification.

-   The ID of the user
-   The ID of the notification
-   When they were notified

### The Premium Settings

Just the premium settings of the bot, for each server.

-   The ID of the server
-   The role that premium members can gift to someone else
-   The category in which clan channels should be created
-   The channel in which clan invites should be sent
-   The channel in which the clan directory should be posted, and the IDs of the directory messages
-   The channel used to log changes to clan custom commands and to host their media
-   The roles whose colors custom roles are not allowed to resemble
-   The roles that subscribers are allowed to self-assign
-   The role used as the starting position for custom roles
-   The roles used as upper and lower boundaries of the custom role region

### The Premium Members

Each premium member, by server.

-   The ID of the server
-   The ID of the premium member
-   The ID of their custom role, if they created one
-   The ID of the user they gifted their giftable role to, if any
-   When they are next allowed to change who they gift the role to

### The Forbidden Role Names

Name patterns that custom roles and clans are not allowed to use, by server.

-   The ID of the server
-   The pattern as written by the server staff, and its processed form

### The Role Abilities

What each role is allowed to do with the premium features, by server.

-   The ID of the server
-   The ID of the role
-   Whether the role can create a custom role
-   Whether the role can create a clan custom command
-   Whether the role can gift the giftable role
-   Whether the role can create a clan
-   Whether the role can upload a custom emoji
-   Whether the role can self-assign a subscriber role
-   Whether these abilities apply across servers

### The Clans

Every setting about the clans.

-   The ID of the server the clan is in
-   The ID of the clan role
-   The ID of the clan channel
-   Whether or not the clan role is claimable
-   The description of the clan, as written by its owner, if there is one
-   Whether or not the clan is visible in the clan directory
-   The ID of the scheduled deletion task, if the clan is pending deletion

### The Clan Members

Each member, by clan.

-   The ID of the server and the ID of the clan role
-   The ID of the member
-   Whether or not they have claimed the clan role

### The Clan Custom Commands

Text shortcuts that a clan can set up, which any of its members can trigger by typing the trigger word in chat.

-   The ID of the custom command
-   The ID of the server and the ID of the clan role it belongs to
-   The trigger word, as chosen by the clan
-   The text the bot should reply with, as written by the clan
-   The link to the media the bot should reply with, if there is one
-   The ID of the clan member who created it
-   When it was created and when it was last edited

### The Clan Icons

We store a fingerprint of each clan role icon so that we only re-upload it to Discord when it actually changes.

-   The ID of the clan role
-   A hash of the current icon

### The Custom Emojis

Emojis uploaded by members with the corresponding premium ability.

-   The ID of the emoji
-   The ID of the server it was uploaded in
-   The ID of the user who uploaded it
-   The name of the emoji
-   When it was uploaded

### The Clan History

An append-only log of everything that happens to a clan, so that staff can look up what happened to a clan even after it is gone.

-   The ID of the event
-   The ID of the server and the ID of the clan role
-   The name of the clan and the ID of its owner at the time of the event
-   The type of event (created, deleted, orphaned, restored, member joined, member left, ownership transferred, renamed, icon changed, description changed, visibility changed, premium role deleted, gifted role revoked, gifted role restored)
-   The ID of the user who triggered the event, or nothing if the bot triggered it on its own
-   The ID of the user the event was about, if applicable
-   A human-readable explanation of why the event happened
-   Any extra details about the event, such as the channel involved or the values before and after a change
-   When the event happened

### The Error Logs

When something goes wrong, we send the error to Sentry, our error monitoring provider, for debugging purposes.

-   The error and where in the bot it happened
-   The ID of the server, and of the related user, role, channel or clan, if applicable
-   A short trail of the operations that led to the error
-   The timestamp of when the error occurred

## How long do we keep it

The settings are saved until the admins of the corresponding servers decide to delete them. Vote kicks, polls and their answers, auto-pinned messages and notifications are kept until they are deleted or the feature is turned off. Kick counters are reset automatically once the cooldown has passed. Clans, their members and their custom commands are kept until the clan is deleted, at which point the clan history is intentionally kept so that staff can still look up what happened. Synced bans are kept until the ban is lifted. Error logs are kept indefinitely for debugging purposes.

## What we do not save

We never store the content of your messages, your voice, your profile, or any personal information.

The bot reads messages for two reasons only, and writes down neither:

-   In channels that server staff have configured as media-only, it checks whether your message has an attachment, to decide whether the message is allowed to stay.
-   In every channel, it checks whether the first word of your message is a clan custom command trigger, so that it can reply with that command's response. If it is not, the message is ignored.

## How to have your data deleted

You can ask us to delete your data at any time, either through modmail on the server, or by email at contact@prgn.gg.
