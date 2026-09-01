// Static HTML content pages served from GET /guides/:slug. Same self-contained
// dark styling as the landing page, no external assets. These target search
// queries like "monitor OTP delivery" and give the API real context.

const SHARED_STYLE = `
  :root {
    --bg: #0b0d12; --bg-raised: #14171e; --border: #262b35;
    --text: #e9ebef; --text-dim: #98a1af; --accent: #8ab4ff;
    --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.65; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 3.5rem 1.5rem 6rem; }
  .logo { font-family: var(--mono); font-size: 0.9rem; }
  .logo a { color: var(--accent); text-decoration: none; }
  h1 { font-size: clamp(1.6rem, 4vw, 2.2rem); line-height: 1.2; margin: 1.2rem 0 0.5rem; text-wrap: balance; }
  .meta { color: var(--text-dim); font-size: 0.95rem; margin-bottom: 2.5rem; }
  h2 { font-size: 1.15rem; margin: 2.5rem 0 0.8rem; }
  h3 { font-size: 1rem; margin: 1.6rem 0 0.4rem; }
  p { margin: 0 0 1rem; }
  ul, ol { color: var(--text-dim); padding-left: 1.3rem; }
  li { margin-bottom: 0.4rem; }
  a { color: var(--accent); }
  pre { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 10px; padding: 1.1rem 1.3rem; overflow-x: auto; font-family: var(--mono); font-size: 0.83rem; color: #d7e2f5; }
  code { font-family: var(--mono); font-size: 0.85rem; }
  p code, li code { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 4px; padding: 0.1em 0.4em; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; margin: 1rem 0; }
  th, td { text-align: left; padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--text-dim); font-weight: 500; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .comment { color: var(--text-dim); }
  footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.88rem; }
`;

function page(opts: {
  slug: string;
  title: string;
  description: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} — otp-watch</title>
<meta name="description" content="${opts.description}">
<link rel="canonical" href="https://otpwatch.flo-voice1.com/guides/${opts.slug}">
<meta property="og:title" content="${opts.title}">
<meta property="og:description" content="${opts.description}">
<meta property="og:url" content="https://otpwatch.flo-voice1.com/guides/${opts.slug}">
<meta property="og:type" content="article">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(opts.title)},"description":${JSON.stringify(opts.description)},"url":"https://otpwatch.flo-voice1.com/guides/${opts.slug}","author":{"@type":"Organization","name":"otp-watch","url":"https://otpwatch.flo-voice1.com"},"publisher":{"@type":"Organization","name":"otp-watch","url":"https://otpwatch.flo-voice1.com"}}
</script>
<style>${SHARED_STYLE}</style>
</head>
<body>
<div class="wrap">
  <div class="logo"><a href="/">otp-watch</a> / guides</div>
  <h1>${opts.title}</h1>
  <p class="meta">${opts.description}</p>
  ${opts.body}
  <footer>
    <a href="/">← otp-watch</a> · Synthetic monitoring for whether your verification SMS or email actually arrives.
  </footer>
</div>
</body>
</html>`;
}

const MONITORING_OTP_DELIVERY = page({
  slug: "monitoring-otp-delivery",
  title: "How to monitor whether your OTP codes actually get delivered",
  description:
    "Uptime monitors tell you your API returned 200. They don't tell you the verification SMS or email reached the user. Here's how to close that gap.",
  body: `
  <p>If your login uses a one-time code sent by SMS or email, there is a failure
  mode that almost nothing in a normal monitoring stack catches: the code is
  generated, your auth provider returns <code>200</code>, your status page stays
  green — and the message never reaches the user. A carrier starts filtering your
  sender, a bounce gets your domain blocked, an SMS route silently degrades, a
  template trips a spam rule. Nobody can log in, and the first signal you get is a
  support ticket hours later.</p>

  <h2>Why the usual monitoring misses it</h2>
  <table>
    <thead><tr><th>What it checks</th><th>What it can't tell you</th></tr></thead>
    <tbody>
      <tr><td>HTTP uptime check (Pingdom, UptimeRobot, Better Stack)</td><td>Only that your endpoint answered. A <code>200</code> from "send code" says nothing about delivery.</td></tr>
      <tr><td>Your SMS/email provider's own dashboard</td><td>Their <em>send</em> stats. "Sent" or even "delivered to carrier" is not "landed in the user's inbox / phone". And it can't see a problem that starts one hop downstream.</td></tr>
      <tr><td>Browser synthetic checks (Checkly, Playwright in CI)</td><td>They can drive your login form, but they can't actually receive a real SMS or read a real external inbox to confirm the code arrived.</td></tr>
      <tr><td>Status pages</td><td>Aggregate, lagging, and usually only updated once humans already know something broke.</td></tr>
    </tbody>
  </table>

  <h2>What actually works: receive the message, like a user would</h2>
  <p>The only reliable check is an end-to-end one: hold a real target, trigger your
  real verification send to it on a schedule, and confirm the message shows up
  within a few seconds.</p>
  <ol>
    <li><strong>Get a real target</strong> — a real phone number or a real email address you control.</li>
    <li><strong>Trigger your own send</strong> — call your production "send verification code" path against that target, from a cron job or CI.</li>
    <li><strong>Wait for arrival</strong> — poll the target for a new message, with a timeout (e.g. 60s).</li>
    <li><strong>Alert on failure</strong> — if it didn't arrive, page someone. A failed scheduled job <em>is</em> the alert.</li>
  </ol>

  <h2>Doing it yourself</h2>
  <p>You can build this with a rented number or a disposable inbox plus a cron job.
  The shape:</p>
  <pre><span class="comment"># pseudo-cron, every 15 min</span>
target=$(rent_a_number_or_inbox)
trigger_your_app_verification_send "$target"
sleep 60
got_code=$(poll_target_for_new_message "$target")
[ -z "$got_code" ] && alert "OTP delivery check FAILED for $target"</pre>
  <p>The fiddly parts are renting a real number programmatically, matching the
  inbound message to the right check, and keeping the whole thing cheap if you run
  it often.</p>

  <h2>Doing it with otp-watch</h2>
  <p><a href="/">otp-watch</a> is that check as a small API. Email checks are free;
  SMS monitors are €29/month for a dedicated number with unlimited checks.</p>
  <pre># one-off email check
curl -X POST https://otpwatch.flo-voice1.com/checks \\
  -H 'authorization: Bearer ow_...' \\
  -H 'content-type: application/json' -d '{"channel":"email"}'
<span class="comment"># => {"id":"chk_...","target":"a1b2c3@receivemail.dev","status":"pending"}</span>

# trigger your app's verification email to that address, then:
curl https://otpwatch.flo-voice1.com/checks/chk_... -H 'authorization: Bearer ow_...'
<span class="comment"># => {"status":"received","latencyMs":4200}   (or "timed_out")</span></pre>
  <p>Point your CI or cron at it, fail the job on <code>timed_out</code>, and your
  existing alerting does the rest. See the <a href="/">endpoints and pricing</a> on
  the front page.</p>

  <h2>FAQ</h2>
  <h3>How often should I check?</h3>
  <p>Every 15–30 minutes is enough to catch a delivery outage well before your
  users flood support, without generating meaningful cost or load.</p>
  <h3>Won't this send me real verification codes constantly?</h3>
  <p>Yes — to a throwaway target you own, not to a real user. The codes are
  discarded; only "did it arrive, and how fast" matters.</p>
  <h3>What about measuring delivery in specific countries?</h3>
  <p>otp-watch uses UK numbers today. Multi-country delivery testing (across
  carriers and regions) is a different, heavier category — enterprise telecom
  testing services do that. otp-watch is the lightweight "is my flow working at
  all, right now" check.</p>
`,
});

export const GUIDES: Record<string, string> = {
  "monitoring-otp-delivery": MONITORING_OTP_DELIVERY,
};

export const GUIDE_SLUGS = Object.keys(GUIDES);
