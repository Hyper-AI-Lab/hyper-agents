// Statistics for `paacm eval report`: pass^k, and paired differences between two
// arms with standard errors clustered by feature area.

// Two-sided 95% critical values of Student's t for 1–30 degrees of freedom.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]
// One-sided z for 80% power.
const Z_POWER = 0.8416
const EPSILON = 1e-9

// Uses the value of the nearest tabulated degrees of freedom below df, which
// errs towards a wider interval.
export function tCritical(df) {
  if (!(df >= 1)) throw new Error('degrees of freedom must be at least 1')
  if (df <= 30) return T95[Math.floor(df) - 1]
  if (df < 40) return 2.042
  if (df < 60) return 2.021
  if (df < 120) return 2.0
  return 1.98
}

function choose(n, k) {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

// Unbiased estimate of the probability that k independent trials all succeed,
// from c successes in n trials (n >= k).
export function passHatK(n, c, k) {
  if (k > n) throw new Error(`pass^${k} needs at least ${k} trials`)
  return choose(c, k) / choose(n, k)
}

export function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

export function correlation(xs, ys) {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

// pairs: [{ cluster, arm, baseline }], one per task, holding each arm's
// per-task success rate. Returns the mean difference (arm − baseline), its
// cluster-robust standard error, a 95% interval with C − 1 degrees of freedom
// (C clusters), the minimum effect detectable with 80% power, and a verdict.
// With fewer than two clusters every task is its own cluster.
export function pairedDifference(pairs) {
  const n = pairs.length
  if (n === 0) return null
  const d = pairs.map((p) => p.arm - p.baseline)
  const m = mean(d)
  let groups = new Map()
  for (const [i, p] of pairs.entries()) groups.set(p.cluster, [...(groups.get(p.cluster) ?? []), i])
  let clusteredBy = 'area'
  if (groups.size < 2) {
    groups = new Map(pairs.map((_, i) => [i, [i]]))
    clusteredBy = 'task'
  }
  const c = groups.size
  const result = { tasks: n, clusters: c, clusteredBy, mean: m, se: null, ci: null, mde: null, correlation: correlation(pairs.map((p) => p.arm), pairs.map((p) => p.baseline)) }
  if (c < 2) return { ...result, verdict: 'too-few-tasks' }
  let s = 0
  for (const idx of groups.values()) s += idx.reduce((acc, i) => acc + (d[i] - m), 0) ** 2
  // Rates are fractions of small trial counts, so differences that are equal on
  // paper can differ by rounding error; below EPSILON they count as equal.
  const raw = Math.sqrt((c / (c - 1)) * s) / n
  const se = raw < EPSILON ? 0 : raw
  const t = tCritical(c - 1)
  const ci = [m - t * se, m + t * se]
  // A zero standard error means every task moved by the same amount, which says
  // nothing about the variance; no interval can be claimed from it.
  const verdict = se === 0 ? (Math.abs(m) < EPSILON ? 'no-difference' : 'no-variance') : ci[0] > 0 || ci[1] < 0 ? 'detected' : 'inconclusive'
  return { ...result, se, ci, mde: (t + Z_POWER) * se, verdict }
}
