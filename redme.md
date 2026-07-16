# queuectl

A CLI-based background job queue system. Handles job execution, automatic retries with exponential backoff, and a dead letter queue (DLQ) for jobs that keep failing. Built for a backend developer internship assignment.

## Tech stack

- Node.js (v18+)
- better-sqlite3 for storage
- commander for the CLI

I went with SQLite over a full external DB (Mongo/Postgres) because this is a single-machine CLI tool — there's no reason to make someone spin up a database server just to run `queuectl`. SQLite in WAL mode handles concurrent reads/writes from multiple worker processes just fine, and the whole thing is a single file with zero setup.

## Setup

```bash
git clone <repo-url>
cd queuectl
npm install
```

That's it. No `.env`, no external services. The SQLite file gets created automatically at `data/jobs.db` the first time you run a command.

## Usage

### Enqueue a job

Two ways to do this. Flags are recommended, especially on Windows/PowerShell:

```bash
node src/index.js enqueue --command "echo hello" --id job1
```

You can also pass raw JSON, but on Windows this runs into shell-quoting issues (PowerShell mangles nested double quotes when handing them off to node.exe), so use the flag form there:

```bash
node src/index.js enqueue '{"id":"job1","command":"sleep 2"}'
```

Optional flags: `--max-retries <n>` overrides the config default for that one job.

### Start / stop workers

```bash
node src/index.js worker start --count 3
node src/index.js worker stop
```

Workers run as detached background processes. `worker start` returns immediately after spawning them — it doesn't block your terminal. PIDs are tracked in `data/workers.pid.json` so `worker stop` and `status` know what's running.

Worker output doesn't print to your terminal (they're detached, so there's no console attached to them). Everything gets logged to `data/logs/worker.log` instead — tail that file if you want to watch what a worker is doing in real time.

### Check status

```bash
node src/index.js status
```

Shows a count of jobs in each state plus how many workers are currently alive.

### List jobs

```bash
node src/index.js list
node src/index.js list --state pending
node src/index.js list --state dead
```

### Dead Letter Queue

```bash
node src/index.js dlq list
node src/index.js dlq retry <jobId>
```

`dlq retry` moves a job back to pending and resets its attempt count, so it gets a fresh set of retries.

### Config

```bash
node src/index.js config get
node src/index.js config set max-retries 5
node src/index.js config set backoff-base 3
```

Config lives in `src/config/config.json`. Keys: `max_retries`, `backoff_base`, `poll_interval_ms`, `job_timeout_ms`, `db_path`.

## Job lifecycle

pending -> processing -> completed
-> failed (retryable, goes back to pending with a delay)
-> dead (max_retries exhausted, moved to DLQ)

## Architecture

src/
├── cli/          commander setup + one file per subcommand
├── worker/       process execution + the poll loop + spawning/killing workers
├── queue/        core state machine (enqueue, claim, complete, fail) + retry/DLQ logic
├── storage/      SQLite access — this is the only place SQL lives
├── models/       job shape + state constants
├── config/       config.json + a small manager to read/write it
└── utils/        logger, backoff math, id generation

The idea is that `queueManager.js` is the only thing that talks to storage directly, and CLI commands / the worker loop only ever call into `queueManager`, `retryManager`, or `dlqManager`. Nothing outside `storage/` writes raw SQL.

### How locking works

This was the trickiest part. Multiple worker processes poll the same SQLite file and need to grab jobs without ever picking up the same one twice.

`claimNextJob()` does this inside a single SQLite transaction:
1. `SELECT` one pending job that's due to run.
2. `UPDATE ... SET state = 'processing' WHERE id = ? AND state = 'pending'`.
3. Check `result.changes` — if it's `0`, some other worker already grabbed that row between steps 1 and 2, so we just return `null` and the caller polls again.

That `WHERE state = 'pending'` in the UPDATE is what actually prevents double-processing. The SELECT alone doesn't guarantee anything — two workers could both select the same row before either updates it. The atomicity comes from the UPDATE's WHERE clause combined with SQLite's transaction guarantees, not from the SELECT.

### Retry + backoff

`delay = backoff_base ^ attempts` seconds. On failure, a job's `run_at` gets pushed into the future by that much, and it goes back to `pending`. It won't be picked up again until `run_at` has passed. Once `attempts > max_retries`, instead of retrying it gets moved straight to `dead`.

### Graceful shutdown

`worker stop` sends `SIGTERM`. On Linux/Mac the worker catches that, finishes whatever job it's currently running, then exits — it won't pick up new jobs after the signal but won't abandon one mid-flight either. On Windows this doesn't work as cleanly for the reason above (the OS just kills it).

## Assumptions & trade-offs

- **SQLite, not an external DB.** Keeps the whole thing self-contained — no Docker, no separate service to start.
- **Commands run through the shell** (`child_process.exec`), so anything you'd type in a terminal works as a job command. This also means job commands have the same access as whoever runs `queuectl` — there's no sandboxing.
- **No job priority queue.** Jobs run in `run_at` order (basically FIFO, adjusted by retry delays). Wasn't in the required scope.
- **Requeuing a stale job doesn't count against `max_retries`.** If a worker crashes mid-job, I didn't want that to burn one of the job's retry attempts — it wasn't really a failure of the *job*, it was a failure of the *worker*.
- **No distributed locking beyond SQLite's own transactions.** This is fine for multiple worker *processes* on one machine (which is the assignment's scope) but wouldn't hold up across multiple machines sharing the same DB file. Would need a real DB with row-level locking (Postgres, Mongo with `findOneAndUpdate`) for that.
- **Job timeout / stale recovery uses a fixed threshold**, not a per-job override. Good enough for this scope; a production version would probably let each job specify its own expected max runtime.

## Testing

```bash
npm test
```

Runs against Node's built-in test runner (`node --test`), no extra dependencies needed for this. Three files:

- `tests/queue.test.js` — enqueue → claim → complete, duplicate id rejection, missing-command validation
- `tests/retry.test.js` — a job failing repeatedly, retrying with backoff, landing in the DLQ once retries are exhausted, and retrying it back out of the DLQ
- `tests/concurrency.test.js` — enqueues 20 jobs and has three simulated workers race to claim them, then asserts no job was ever claimed by more than one worker

Each test uses its own temp SQLite file and cleans up after itself, so they don't interfere with your real `data/jobs.db`.

## Manual verification

If you want to sanity-check the whole flow by hand:

```bash
node src/index.js enqueue --command "echo hello" --id job1
node src/index.js enqueue --command "exit 1" --id fail1 --max-retries 2
node src/index.js worker start --count 1

# wait a few seconds for retries/backoff to play out

node src/index.js status
node src/index.js list
node src/index.js dlq list
node src/index.js worker stop
```

`job1` should end up `completed`. `fail1` should retry twice with increasing delays and then land in `dead`.

## Known limitations

- Job timeout / stale recovery is a fixed global value, not per-job.
- No priority queues or scheduled/delayed jobs beyond the retry backoff delay itself.
- No web dashboard — everything's CLI/log-file based.
- Graceful shutdown behaves slightly differently on Windows vs. Linux/Mac for the reasons described above; stale job recovery covers the gap.

## Demo Video

Full CLI walkthrough (enqueue, worker start/stop, retries, backoff, DLQ, config, tests): [Watch here](<https://drive.google.com/file/d/1o7yOr-tIweVXzCFmwUpQ26OiOfU5FZX_/view?usp=sharing>)