// Served as text/html from GET / when the request looks like a browser.
// API clients (Accept: application/json, or no Accept header) still get JSON.
export const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>otp-watch — is your verification SMS or email actually arriving?</title>
<meta name="description" content="Synthetic monitoring for OTP and verification-message delivery. Rent a real phone number or test inbox, send your own code to it, and get told when delivery breaks or slows down.">
<link rel="canonical" href="https://otpwatch.flo-voice1.com/">
<meta property="og:title" content="otp-watch — monitor whether your OTP actually arrives">
<meta property="og:description" content="Your uptime monitor checks for a 200. It doesn't check if the verification code landed. otp-watch does.">
<meta property="og:url" content="https://otpwatch.flo-voice1.com/">
<meta property="og:type" content="website">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"otp-watch","applicationCategory":"DeveloperApplication","operatingSystem":"Any","description":"Synthetic monitoring for SMS and email verification-message delivery. Rent a real number or test mailbox, trigger your own OTP send to it, then poll for arrival and latency.","offers":[{"@type":"Offer","price":"0","priceCurrency":"EUR","description":"Email delivery checks — free"},{"@type":"Offer","price":"29.00","priceCurrency":"EUR","description":"SMS monitor — per monitored number, per month, unlimited checks"}],"url":"https://otpwatch.flo-voice1.com/"}
</script>
<style>
  :root {
    --bg: #0b0d12;
    --bg-raised: #14171e;
    --border: #262b35;
    --text: #e9ebef;
    --text-dim: #98a1af;
    --accent: #8ab4ff;
    --accent-dim: #22345c;
    --warn: #ffcf8a;
    --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
  header { margin-bottom: 3rem; }
  .logo { font-family: var(--mono); font-size: 0.95rem; color: var(--accent); letter-spacing: 0.02em; }
  h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; margin: 1rem 0 0.75rem; text-wrap: balance; }
  .lede { color: var(--text-dim); font-size: 1.1rem; max-width: 54ch; }
  .badge { display: inline-flex; align-items: center; gap: 0.4em; font-family: var(--mono); font-size: 0.8rem; color: var(--accent); background: var(--accent-dim); border-radius: 999px; padding: 0.3em 0.9em; margin-top: 1.25rem; }
  .badge::before { content: "●"; font-size: 0.6em; }
  section { margin-top: 3.5rem; }
  h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin-bottom: 1rem; }
  h3 { font-size: 1rem; margin: 0 0 0.4rem; }
  p { margin: 0 0 1rem; }
  pre { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 10px; padding: 1.1rem 1.3rem; overflow-x: auto; font-family: var(--mono); font-size: 0.85rem; color: #d7e2f5; }
  pre + pre { margin-top: 0.75rem; }
  .comment { color: var(--text-dim); }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--text-dim); font-weight: 500; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
  td code, p code, li code { font-family: var(--mono); font-size: 0.85rem; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 4px; padding: 0.1em 0.4em; color: var(--accent); }
  ol.steps { padding-left: 1.2rem; display: grid; gap: 0.6rem; color: var(--text-dim); }
  ol.steps strong { color: var(--text); }
  .faq h3 { color: var(--text); margin-top: 1.4rem; }
  .faq p { color: var(--text-dim); }
  .price { display: grid; gap: 1rem; }
  .price .card { border: 1px solid var(--border); border-radius: 10px; padding: 1.1rem 1.3rem; }
  .price .amount { font-size: 1.4rem; font-weight: 650; }
  .price .card p { color: var(--text-dim); margin: 0.3rem 0 0; font-size: 0.92rem; }
  footer { margin-top: 4.5rem; padding-top: 2rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.88rem; }
  a { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">otp-watch</div>
    <h1>Your uptime monitor checks for a 200. It doesn't check if the code arrived.</h1>
    <p class="lede">otp-watch is synthetic monitoring for the one thing your status page can't see: whether the verification SMS or email your users need to log in is actually being delivered, and how fast. Rent a real target, send your own code to it, get told when it breaks.</p>
    <span class="badge">Email checks free · SMS monitors €29/mo</span>
  </header>

  <section>
    <h2>The gap</h2>
    <p>Your auth provider returns <code>200 OK</code>. Your uptime check is green. And yet a carrier filter, a spam-folder change, a suspended sender domain, or a broken SMS route means a chunk of your users never receive their code and simply can't sign in. You find out from a support ticket, days later. otp-watch closes the loop by actually receiving the message end to end, the same way a user would.</p>
  </section>

  <section>
    <h2>Quickstart — a free one-off email check</h2>
    <pre># get an API key
curl -X POST https://otpwatch.flo-voice1.com/keys \\
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
<span class="comment"># => {"key":"ow_..."}</span></pre>
    <pre># start a check — you get back a real disposable address
curl -X POST https://otpwatch.flo-voice1.com/checks \\
  -H 'authorization: Bearer ow_...' \\
  -H 'content-type: application/json' -d '{"channel":"email"}'
<span class="comment"># => {"id":"chk_...","target":"a1b2c3@receivemail.dev","status":"pending"}</span></pre>
    <pre># trigger your app's verification email to that address, then poll:
curl https://otpwatch.flo-voice1.com/checks/chk_... \\
  -H 'authorization: Bearer ow_...'
<span class="comment"># => {"status":"received","latencyMs":4200}   (or "timed_out")</span></pre>
  </section>

  <section>
    <h2>How it works</h2>
    <ol class="steps">
      <li><strong>You ask otp-watch for a target.</strong> A real UK phone number (rented live) or a real disposable email address.</li>
      <li><strong>You trigger your own send.</strong> From your app, your CI job, your signup flow — otp-watch never touches your system.</li>
      <li><strong>You poll for the result.</strong> <code>received</code> with a latency figure, or <code>timed_out</code>. Your own cron or CI job turns that into an alert — a red build <em>is</em> the alert.</li>
    </ol>
  </section>

  <section>
    <h2>SMS monitors</h2>
    <p>A one-off SMS check rents a fresh number each time — fine for a manual test, too expensive to run every 15 minutes. A <strong>monitor</strong> rents one real number for the month and reuses it for unlimited checks against that same number.</p>
    <pre># create a Stripe Checkout session for a monitor
curl -X POST https://otpwatch.flo-voice1.com/monitors/checkout \\
  -H 'authorization: Bearer ow_...'
<span class="comment"># => {"checkoutUrl":"https://checkout.stripe.com/..."}</span>

# after payment, the monitor exists:
curl https://otpwatch.flo-voice1.com/monitors -H 'authorization: Bearer ow_...'

# run a check against it — no new rental:
curl -X POST https://otpwatch.flo-voice1.com/monitors/MON_ID/checks \\
  -H 'authorization: Bearer ow_...'</pre>
  </section>

  <section>
    <h2>Endpoints</h2>
    <table>
      <thead><tr><th>Endpoint</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>POST /keys</code></td><td>Issue an API key. Body <code>{"email":"..."}</code>.</td></tr>
        <tr><td><code>POST /checks</code></td><td>Start a one-off check. Body <code>{"channel":"sms"|"email","timeoutSeconds"?:number}</code>. Returns a real target and a check id.</td></tr>
        <tr><td><code>GET /checks/:id</code></td><td>Poll a check: <code>pending</code> → <code>received</code> (with <code>latencyMs</code>) or <code>timed_out</code>.</td></tr>
        <tr><td><code>POST /monitors/checkout</code></td><td>Get a Stripe Checkout URL for a €29/mo SMS monitor.</td></tr>
        <tr><td><code>GET /monitors</code></td><td>List your active monitors.</td></tr>
        <tr><td><code>POST /monitors/:id/checks</code></td><td>Run a check against an existing monitor's number — no new rental.</td></tr>
        <tr><td><code>POST /monitors/portal</code></td><td>Stripe billing-portal link to cancel or manage a monitor.</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Pricing</h2>
    <div class="price">
      <div class="card">
        <div class="amount">Free</div>
        <p>Email delivery checks. One-off or on your own schedule. Powered by <a href="https://receivemail.dev">receivemail.dev</a>.</p>
      </div>
      <div class="card">
        <div class="amount">€29 / month</div>
        <p>Per SMS monitor. One dedicated real UK number, unlimited checks, cancel anytime from the billing portal. Billed through Stripe.</p>
      </div>
    </div>
  </section>

  <section class="faq">
    <h2>FAQ</h2>
    <h3>Does otp-watch send the verification code?</h3>
    <p>No. It only provides the target and receives what lands there. You trigger the send from your own system, so the whole path — your provider, the carrier, the inbox — is exercised exactly as it is for a real user.</p>
    <h3>Do I need to run a cron job?</h3>
    <p>For continuous monitoring, yes — by design. otp-watch deliberately has no scheduler or alerting in v1. Your CI or cron calls it on whatever interval you want and fails loudly on <code>timed_out</code>. That keeps the service small and lets your existing alerting stack own the paging.</p>
    <h3>Which countries do the SMS numbers cover?</h3>
    <p>UK numbers today (same real-SIM hardware pool as <a href="https://flo-voice1.com">sms-florin</a>). If you need other countries for delivery monitoring, get in touch.</p>
    <h3>How is this different from a normal uptime monitor?</h3>
    <p>An uptime monitor confirms your API answered. otp-watch confirms a human on the other end would have received the code. Those are not the same check, and only the second one tells you your login flow still works.</p>
  </section>

  <section>
    <h2>Guides</h2>
    <p style="color:var(--text-dim)"><a href="/guides/monitoring-otp-delivery">How to monitor whether your OTP codes actually get delivered</a></p>
  </section>

  <footer>
    otp-watch is built on <a href="https://flo-voice1.com">sms-florin</a> (rent a real phone number for SMS/OTP codes) and <a href="https://receivemail.dev">receivemail.dev</a> (disposable inboxes via API). Source and full docs: <a href="https://github.com/flovoice53-tech/otp-watch">github.com/flovoice53-tech/otp-watch</a>.
  </footer>
</div>
</body>
</html>`;
