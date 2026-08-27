export function Notes() {
  return (
    <main className="notes">
      <section className="card">
        <h2>The sliding window</h2>
        <p>
          Each admitted request stores its arrival timestamp. A new request is
          admitted only when fewer than <code>limit</code> timestamps fall inside{' '}
          <code>(now - windowMs, now]</code>. A request lives in{' '}
          <code>[t, t + windowMs)</code>, so it stops counting at exactly{' '}
          <code>t + windowMs</code> — no boundary bursts, no approximation.
          Rejected requests are never recorded, so a rejection can&apos;t extend a
          previous request&apos;s lifetime.
        </p>
        <pre>
          {`live  = { t in history | t > now - windowMs }
allowed = live.length < limit`}
        </pre>
      </section>

      <section className="card">
        <h2>Why not the other algorithms?</h2>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Exact?</th>
              <th>Why it was set aside here</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fixed window counter</td>
              <td>No</td>
              <td>Doubles throughput at bucket boundaries.</td>
            </tr>
            <tr>
              <td>Sliding window counter</td>
              <td>Approximate</td>
              <td>Smooths fixed buckets but hedges the count.</td>
            </tr>
            <tr>
              <td>Token bucket</td>
              <td>By design</td>
              <td>Smooths over bursts; kept as the second policy here.</td>
            </tr>
            <tr>
              <td>Sliding window log</td>
              <td>Yes</td>
              <td>The default policy: strict, O(n) per request.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Cost &amp; memory</h2>
        <p>
          Per key the log holds at most <code>limit</code> timestamps, so memory is{' '}
          <code>O(keys × limit)</code>. Trimming scans the live log per request;
          the <code>consume()</code> result also reports <code>remaining</code> and{' '}
          <code>resetAtMs</code>, which is what drives Retry-After headers and
          dashboards.
        </p>
        <p>
          Idle keys can be reclaimed with <code>cleanupIdle()</code> — production
          deployments run it on a timer. The store contract makes a Redis backend
          (sorted set + one Lua script per admit/consume) a drop-in replacement,
          which buys horizontal scale at the cost of a network round-trip per check.
        </p>
      </section>

      <section className="card">
        <h2>Concurrency</h2>
        <p>
          The browser demo is single-threaded, as is a Node.js process for
          synchronous <code>consume()</code> calls. The read-modify-write for a key
          is the one operation that must stay atomic wherever the code runs — in a
          multi-threaded runtime that is a per-key lock (e.g.{' '}
          <code>ConcurrentHashMap.compute</code>), and in a distributed setup it is
          the Lua script at the store. No global lock exists at any layer.
        </p>
      </section>

      <section className="card">
        <h2>Testing</h2>
        <p>
          The suite in <code>src/core/__tests__/</code> uses an injected{' '}
          <code>MockClock</code>, so boundary and expiry cases run in milliseconds
          rather than real time. Beyond hand-picked edges there is a seeded,
          deterministic simulation that fires thousands of requests from several
          clients and asserts the never-exceed-the-limit invariant against an
          independent oracle. Run it with <code>npm test</code>.
        </p>
        <p>
          The full design rationale, Redis mapping, and integration workflow are
          covered in DESIGN.md at the repository root.
        </p>
      </section>
    </main>
  )
}