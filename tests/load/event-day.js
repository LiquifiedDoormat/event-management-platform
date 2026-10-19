// k6 load test: a representative event-day workload.
//   k6 run -e BASE_URL=https://staging.example.org -e COOKIE=__Host-session tests/load/event-day.js
// Requires tests/load/.tokens.json from scripts/loadtest-seed.ts.
// Run ONLY against local or staging environments, never production.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.COOKIE || "session"; // "__Host-session" on HTTPS deployments
const VIEWERS = Number(__ENV.VIEWERS || 2000);
const DURATION = __ENV.DURATION || "5m";

const data = new SharedArray("tokens", () => [JSON.parse(open("./.tokens.json"))]);
const tokens = () => data[0];
const cookie = (t) => ({ headers: { Cookie: `${COOKIE}=${t}` } });

export const options = {
  scenarios: {
    // Attendees open their homepage, then watch a bus (polling fallback every 15 s).
    attendees: {
      executor: "ramping-vus",
      exec: "attendee",
      startVUs: 0,
      stages: [
        { duration: "1m", target: VIEWERS },
        { duration: DURATION, target: VIEWERS },
        { duration: "30s", target: 0 },
      ],
    },
    // Each bus's coordinator sends a GPS reading every ~6 s.
    gps: {
      executor: "per-vu-iterations",
      exec: "coordinator",
      vus: Number(__ENV.BUSES || 20),
      iterations: 100,
      maxDuration: "15m",
    },
    // A few staff searching directories.
    staff: { executor: "constant-vus", exec: "staff", vus: 5, duration: DURATION },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:customer_home}": ["p(95)<1500"],
    "http_req_duration{name:track_page}": ["p(95)<1500"],
    "http_req_duration{name:live_poll}": ["p(95)<300"],
    "http_req_duration{name:gps_update}": ["p(95)<300"],
    "http_req_duration{name:staff_search}": ["p(95)<1500"],
  },
};

export function attendee() {
  const list = tokens().customers;
  const me = list[(__VU * 7919 + __ITER) % list.length];
  const res = http.get(`${BASE}/en/customer`, { ...cookie(me.token), tags: { name: "customer_home" } });
  check(res, { "home 200": (r) => r.status === 200 });
  const bus = me.busIds[__ITER % me.busIds.length];
  http.get(`${BASE}/en/track/${bus}`, { ...cookie(me.token), tags: { name: "track_page" } });
  for (let i = 0; i < 4; i++) {
    sleep(15);
    const live = http.get(`${BASE}/api/buses/${bus}/live`, { ...cookie(me.token), tags: { name: "live_poll" } });
    check(live, { "live 200": (r) => r.status === 200 });
  }
}

export function coordinator() {
  const list = tokens().coordinators;
  const me = list[(__VU - 1) % list.length];
  const lat = 12.97 + __ITER * 0.0003;
  const res = http.post(
    `${BASE}/api/locations`,
    JSON.stringify({ tripId: me.tripId, latitude: lat, longitude: 77.6, accuracy: 10, recordedAt: Date.now() }),
    {
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: `${COOKIE}=${me.token}` },
      tags: { name: "gps_update" },
    },
  );
  check(res, { "gps accepted": (r) => r.status === 200 });
  sleep(6);
}

const TERMS = ["Attendee 1", "LT Hotel", "77777", "Coordinator"];
export function staff() {
  const q = TERMS[__ITER % TERMS.length];
  const res = http.get(`${BASE}/en/people?q=${encodeURIComponent(q)}`, { ...cookie(tokens().admin), tags: { name: "staff_search" } });
  check(res, { "search 200": (r) => r.status === 200 });
  sleep(3);
}
