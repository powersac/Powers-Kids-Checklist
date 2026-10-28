# Powers Kids Checklist, hosted

One app, four links, a real shared database. Alex's link only checks off
Alex's chores. Sam's link only checks off Sam's. The two parent links
(Parent and Partner) are both admin: they can do everything both kids can
do, plus edit the task list, set the rate, mark weeks paid, and start over.
When anyone checks something off, it shows up for everyone else within
fifteen seconds.

## What you are deploying

- **A Cloudflare Worker** that serves the app (the built React PWA) and a
  small API.
- **A KV namespace** holding one JSON blob: the rate, the task list, every
  day's checks, and which weeks have been paid.

The free tier covers this many times over. Two kids and two parents tapping
a checklist a few times a day is a rounding error against 100,000 reads a day.

## Setup, once, about ten minutes

You need a free Cloudflare account, Node installed, and the app already
built (`npm run build` in the repo root, which produces `dist/`).

**1. Log in**

    cd worker
    npx wrangler login

**2. Make the database**

    npx wrangler kv namespace create STATE

It prints an id. Open `wrangler.jsonc` and paste it over
`PASTE_YOUR_KV_NAMESPACE_ID`.

**3. Generate four long random tokens**

Run this four times (once per person) and save the output somewhere safe,
like a password manager, not a text file on the desktop:

    node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

**4. Set the four secrets**

Run each one and paste the matching token when prompted:

    npx wrangler secret put ALEX_TOKEN
    npx wrangler secret put SAM_TOKEN
    npx wrangler secret put PARENT_TOKEN
    npx wrangler secret put PARTNER_TOKEN

**5. Deploy**

    npx wrangler deploy

It prints your URL, something like
`https://powers-kids-checklist.<your-subdomain>.workers.dev`.

**6. Open your link**

    https://powers-kids-checklist.<your-subdomain>.workers.dev/<ALEX_TOKEN>

Everyone gets their own token in the URL: Alex, Sam, Parent, and Partner.
There is nothing to seed. The first time any link is opened, the Worker
notices the database is empty and fills in the default chore list
automatically (clean, no demo data). Add each link to the home screen: three
dots or the share icon, then Add to Home Screen. It behaves like an app
after that.

## Day to day

- Alex's phone only ever changes Alex's checks; Sam's phone only Sam's. If
  either phone tries to touch the other kid's row (it shouldn't from the
  normal app UI, but just in case), the server refuses it.
- The app checks in with the server every 15 seconds while open, and
  immediately when you switch back to it. You don't have to refresh by hand.
- **What a conflict looks like:** if two phones change something at almost
  the exact same moment, the second one's change is briefly rejected, the
  app quietly picks up the first change, and retries automatically. You
  should never actually see this; it resolves itself in well under a
  second. If a change truly fails (no connection, etc.), the app shows a
  small error and leaves things as they were until it can reach the server
  again.
- The parent links also get to rename tasks, change amounts, add or remove
  tasks, reassign which kid a task applies to, change the per-task rate,
  mark a week paid, and reset.
- **Start over:** from either parent link, use Parent > Settings > Reset all
  data. It wipes to the clean default list: no checks, no paid weeks,
  original rate. To force it from the command line instead:

      npx wrangler kv key delete --binding=STATE state --remote

  That deletes the stored state entirely; the next request re-seeds it
  clean, same as day one.

**Rotate a link.** `npx wrangler secret put PARENT_TOKEN` (or `PARTNER_TOKEN`,
`ALEX_TOKEN`, `SAM_TOKEN`) with a new value. The old link stops working
immediately, which is useful if a link ever gets shared somewhere it
shouldn't have.

## Security, honestly

The link is the password. Anyone who has it can read and change that kid's
checklist; anyone with a parent link can change anything, including money
amounts. That's a fine trade for a family chore chart and a bad one for
anything sensitive, so don't reuse these tokens anywhere else and don't put
anything else behind this Worker. The pages ask not to be indexed and not to
pass the URL on in referrer headers. Generate tokens with the command above
(or something equally random) rather than a word you'd remember, because a
guessable link is not a real access control. Treat each link the way you'd
treat a house key, the parent links especially, since those are the ones
that can touch the rate and the task list.

## Changing the code

- `src/ops.ts`: the checklist rules and default task list (pure functions,
  no Cloudflare APIs).
- `src/api.ts`: `/api/state` and `/api/mutate`, covering routing, token and
  role checks, the permission table, and JSON responses. Also pure: it takes
  a `store` object instead of talking to KV directly.
- `src/index.ts`: the real Worker. It wires up the KV binding and the static
  assets binding, and is the only file that touches actual Cloudflare APIs.

Run the tests before you deploy:

    npm test          # permission matrix, concurrency race, bad input, op shapes
    npx tsc --noEmit  # type check

Optional local smoke test against Miniflare's local KV/assets emulation,
no real Cloudflare account required:

    npx wrangler dev --local
