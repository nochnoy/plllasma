// Package store is the server's memory: the recordings players send in, the
// slices a live one arrives in, and the messages they write against those
// recordings.
//
// All of it is one SQLite file. A recording is a couple of hundred kilobytes of
// JSON a minute of play (`frontend/src/game/tape.ts`), which is a file's
// business rather than a cluster's, and the machine this runs on is one small
// VPS — so the store is a file, its own migrations, and nothing to run beside
// it. The driver is `modernc.org/sqlite`: SQLite itself translated into Go, so
// the server builds with `CGO_ENABLED=0` and cross-compiles like any other Go
// program.
//
// Two rules of the log live down here rather than in the handlers, because
// they are facts about it rather than about one request:
//
//   - A message belongs somewhere. It hangs on a recording and, when it is
//     about a moment of that recording, on a step of it; with no recording it
//     belongs to the lobby. A step is what a tape is counted in — 20 ms of it,
//     `TAPE_STEP_MS` — which is why the anchor is a step and not a time: both
//     ends of the wire count the same steps of the same run, so a line about
//     "the moment she lets go" lands on that moment in every playback.
//   - A run arrives either whole or as it is played. A whole one is one tape in
//     one write (`SaveRecording`); a live one is a head and then a slice of the
//     run per few seconds of it (`OpenRecording`, `AppendChunk`), so that a run
//     can be watched while it is being played and so that it is not lost to a
//     closed window. Both are one tape by the time a playback reads one
//     (`Tape`), because a tape *is* the concatenation of its slices.
package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	// Imported for its side effect, the way a `database/sql` driver is:
	// `sql.Open("sqlite", …)` is the whole of the link.
	_ "modernc.org/sqlite"
)

// ErrNotFound is what every read of a thing that is not there answers with, so
// that a handler turns it into a 404 without knowing which table was asked.
var ErrNotFound = errors.New("not found")

// ErrSealed is what a slice of a run that takes no more slices answers with: a
// run that was uploaded whole is one file with no room left in it, and a live
// run whose last slice has arrived is over. A handler turns it into a 409 —
// the request was about the right run in the wrong state — rather than into a
// 404.
var ErrSealed = errors.New("the recording takes no more slices")

// ErrForbidden is what a change to a run answered for by the wrong player
// answers with: a run's own line in the chat is its player's to say, and a
// handler turns this into a 403 rather than letting somebody else rewrite what
// the log will show for a run they did not play.
var ErrForbidden = errors.New("the run is not this player's")

// Part is one run of a message's body: `text`, a stretch of what the player
// typed, `gif`, a picture standing in the middle of it, or `run`, a link that
// opens a recording (`frontend/src/chat/messages.ts`). The store does not care
// which — a body is a list of parts rather than a string, and that is the whole
// of what it has to know about one.
type Part struct {
	Kind string `json:"kind"`
	Text string `json:"text,omitempty"`
	File string `json:"file,omitempty"`
	Alt  string `json:"alt,omitempty"`
	Run  string `json:"run,omitempty"`
}

// Recording is a run of the game as its file, plus what a list of recordings
// needs to know about one without reading the tape itself.
type Recording struct {
	// ID is the recording's name on the wire, and the caller's to choose
	// (`SaveRecording`), so that a recording can be named before it is written.
	ID string `json:"id"`
	// Name is what the player called the run.
	Name string `json:"name"`
	// AuthorID is who played the run: one of the site's own players, as this
	// server came to know them at the door (`UpsertUser`). The list reads the
	// nickname rather than the number, which is what `Author` is for.
	AuthorID int64 `json:"-"`
	// Author is the nickname the run was recorded under, read from the row the
	// player's own auth keeps current (`users`) rather than copied down at
	// upload time — a player the site has renamed is renamed here too, the
	// next time anybody lists a run of theirs.
	Author string `json:"author"`
	// Steps is how long the run is, in the tape's own steps.
	Steps int `json:"steps"`
	// StepMs is the length of one of them — 20 for a tape of this format, and
	// carried here so that a list can say how long a run is in seconds without
	// knowing anything about tapes.
	StepMs int `json:"step_ms"`
	// Seed is the world's own randomness for the run (`tape.seed`).
	Seed int64 `json:"seed"`
	// Bytes is the size of the tape's own JSON, as it was sent.
	Bytes int `json:"bytes"`
	// RecordedMs and UploadedMs are when the run was played and when it
	// arrived, in Unix milliseconds.
	RecordedMs int64 `json:"recorded_ms"`
	UploadedMs int64 `json:"uploaded_ms"`
	// Live says the run is still being played: it was opened as a run that
	// arrives in slices, and its last slice is recent enough to believe that
	// whoever was playing it is still there (`OpenRecording`, `playing`).
	Live bool `json:"live"`
	// EndedMs is the moment the run was last heard from — the moment its last
	// slice arrived, or the moment it was opened if it has sent none — and, for
	// a run that was uploaded whole, the moment it was uploaded: made equal to
	// UploadedMs rather than left at zero, so that every run has an end.
	EndedMs int64 `json:"ended_ms"`
	// Label is what the run's own line in the chat says: written by the page
	// that played the run, changed by it as the play goes on (`SetChat`), and
	// read by every window that shows the line the run's message is — the
	// message stores the link, the run stores the words, and what the chat
	// draws is the two read together. Empty until the run's player has said
	// anything, which the window draws its own word for.
	Label string `json:"label"`
	// MessageID is the run's own line in the log: the id of the message that
	// carries the link to this run. It is the back half of the pairing — the
	// message points at the run by its part, the run points at the message by
	// this — and what it is for is whoever wants to ask about the line rather
	// than about the run: to say where the words are said, or to find the one
	// message that is a run's own. Zero until the line is written.
	MessageID int64 `json:"message_id"`
}

// Seconds is how long the run lasts, which is what a list of recordings shows
// and the one number on it that is arithmetic rather than a fact from the tape.
func (r Recording) Seconds() float64 {
	return float64(r.Steps) * float64(r.StepMs) / 1000
}

// Message is one line of the chat.
//
// Tape and AtStep together are where the line belongs: on a recording at a step
// of it, on a recording but about the run as a whole, or in the lobby when
// there is no recording at all. A playback shows a line when it passes its
// step, which is why an anchor that no playback could reach is refused by the
// API rather than stored (`Server.post`).
type Message struct {
	// ID is the server's own, one past the last one written: what both lists
	// are keyed by, and what `after` asks past.
	ID int64 `json:"id"`
	// Tape is the recording it hangs on, or empty in the lobby.
	Tape string `json:"tape,omitempty"`
	// AtStep is the moment of that recording it is about, or nil for a line
	// about the run itself.
	AtStep *int `json:"at_step,omitempty"`
	// UserID is who wrote it: one of the site's own players, as their token was
	// answered for at the door (`users`). Nick and Icon are the same player as
	// the window reads them — filled from that row on the way out (`Messages`),
	// and by the caller on the way in (`AddMessage`) so that the answer to a
	// line just written is shaped like the line the log will answer with.
	UserID int64  `json:"user_id"`
	Nick   string `json:"nick"`
	Icon   string `json:"icon"`
	// Ghost says the line was written as the ghost rather than as the player
	// (`frontend/src/chat/messages.ts`): the author is still who the token says
	// wrote it, and the flag is what lets the window draw the ghost's own name
	// and face over the player's.
	Ghost  bool   `json:"ghost"`
	Parts  []Part `json:"parts"`
	SentMs int64  `json:"sent_ms"`
}

// Store is the database and the few rules the log keeps, in one place.
type Store struct {
	db *sql.DB
}

// schema is the whole of the database: four tables, written as one list of
// statements so that a fresh file and an old one come out of the same list.
//
//   - `users` is the site's own players as this server has met them: a row per
//     player, written at the door (`UpsertUser`) from what the site answered
//     about their token, and kept current by every asking after it. It is a
//     cache of the site's names rather than a copy of its people — the id is
//     the site's own, and the nick and the icon are what the site says today.
//   - `recordings` is the tapes themselves, verbatim, plus the header a list
//     shows. The tape is stored as it was sent rather than as columns of its
//     own: it is the game's file format, and the game's decoder is what reads
//     it (`decodeTape`) — a table of its events would be this server's second
//     opinion about a run. `tape` is empty for a run that arrived in slices:
//     such a run keeps the *head* of its tape instead (`head`), and whether it
//     is still being played (`live`, `ended_ms`). Who played it is `author_id`,
//     one of the users above.
//   - `chunks` is one slice of a live run: a row per few seconds of play, in
//     the order they were played (`seq`). A run's tape is its head and these
//     rows pasted together (`Tape`), which is also why a slice is stored as the
//     JSON it arrived as rather than parsed into anything this server knows the
//     shape of.
//   - `messages` is the log. `tape` is null in the lobby and the recording's id
//     otherwise, so that one table holds both conversations and one query
//     answers either; `at_step` is null for a line about a run as a whole. Who
//     wrote it is `user_id`, never a nickname carried on the wire: the wire
//     carries a token, the token is answered for at the door, and the answer is
//     this table's own row.
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id      INTEGER PRIMARY KEY,
  nick    TEXT NOT NULL,
  icon    TEXT NOT NULL,
  seen_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  steps       INTEGER NOT NULL,
  step_ms     INTEGER NOT NULL,
  seed        INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  recorded_ms INTEGER NOT NULL,
  uploaded_ms INTEGER NOT NULL,
  tape        TEXT NOT NULL,
  head        TEXT NOT NULL DEFAULT '',
  live        INTEGER NOT NULL DEFAULT 0,
  ended_ms    INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL DEFAULT '',
  message_id  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  tape    TEXT REFERENCES recordings(id) ON DELETE CASCADE,
  at_step INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ghost   INTEGER NOT NULL DEFAULT 0,
  parts   TEXT NOT NULL,
  sent_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_tape ON messages (tape, at_step, id);

CREATE TABLE IF NOT EXISTS chunks (
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  steps        INTEGER NOT NULL,
  frames       TEXT NOT NULL,
  edits        TEXT NOT NULL,
  sent_ms      INTEGER NOT NULL,
  PRIMARY KEY (recording_id, seq)
);
`

// schemaVersion says which shape of database this is, and is kept in the file
// itself (`PRAGMA user_version`).
//
// Version 2 is the per-frame tape (`garden-tape/2`): a recording is the rows of
// the run it holds rather than the clicks it was played with, and the old runs —
// of `garden-tape/1`, and of the shapes before it — are files this build refuses
// to play. They are cleared out rather than carried as dead weight: a database
// of an older shape is emptied of its recordings, its slices and the messages
// said about them, and brought up to the schema empty (`purge`). That is the one
// break the store makes on purpose — the alternative would be keeping a second
// codec alive for the sake of files nobody can watch.
//
// Version 3 is the site's own players: a message and a recording belong to a
// `user_id` the token was answered for, and the nicknames and badges they used
// to arrive with are gone from the wire. The old lines are nobody's now that
// nobody's token says them, so the clearing the version always does is the
// whole of the change here too.
const schemaVersion = 3

// purge is what a database of an older shape is brought forward with: the tables
// of the old runs are dropped rather than emptied, because their chunks held the
// old format's own columns, and the schema's `CREATE TABLE IF NOT EXISTS` brings
// every one of them back empty.
const purge = `
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS recordings;
DROP TABLE IF EXISTS users;
` + schema

// Open opens the database at path — the file is made if it is not there — and
// brings it up to the schema above, adding the columns a file written before
// them does not have (`migrations`).
//
// The pragmas are the three things SQLite needs to be a server's database
// rather than one program's file: a busy timeout, so that a second writer waits
// rather than fails; WAL, so that reading the chat does not stop somebody
// writing to it; and foreign keys, so that the two references above are rules
// rather than comments. One connection at a time is deliberate — this is a chat
// for one hall, and a single writer is also the shortest way to be sure that two
// slices of a run never interleave.
//
// The path is written with forward slashes in the connection string, because a
// backslash is nothing special there and a Windows path arrives with plenty.
func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)",
		strings.ReplaceAll(path, `\`, "/"))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("bring %s up to the schema: %w", path, err)
	}
	// A file written before a column was added does not have it, and
	// `CREATE TABLE IF NOT EXISTS` will not put it there: each column that has
	// ever been added to a standing table is added here, with the error for a
	// column that is already there treated as the success it means. Unlike the
	// version's own clearing this keeps what the file holds — a new column is
	// a new fact about the same runs, not a new shape of run.
	for _, added := range [][2]string{
		{"label", "TEXT NOT NULL DEFAULT ''"},
		{"message_id", "INTEGER NOT NULL DEFAULT 0"},
	} {
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE recordings ADD COLUMN %s %s", added[0], added[1])); err != nil {
			if !strings.Contains(err.Error(), "duplicate column name") {
				db.Close()
				return nil, fmt.Errorf("bring %s up to the schema: %w", path, err)
			}
		}
	}
	// A file written by an older shape of this server holds runs of a codec this
	// build refuses to play, and is emptied out once — the version in the file
	// itself says whether that has happened, and a file that says so is left
	// alone from then on whatever its tables look like.
	var version int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		db.Close()
		return nil, fmt.Errorf("read the shape of %s: %w", path, err)
	}
	if version < schemaVersion {
		if _, err := db.Exec(purge); err != nil {
			db.Close()
			return nil, fmt.Errorf("clear the old runs out of %s: %w", path, err)
		}
		if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", schemaVersion)); err != nil {
			db.Close()
			return nil, fmt.Errorf("mark the shape of %s: %w", path, err)
		}
	}
	return &Store{db: db}, nil
}

// Close closes the database. Everything written is already on disk — a tape is
// committed before its recording is answered — so there is nothing else to do.
func (s *Store) Close() error { return s.db.Close() }

// UpsertUser writes down what the site answered about a token: one row per
// player, replaced by every asking after it, so that the nick and the icon a
// window reads beside a line are the site's own words for its author however
// long ago the line was written. `seen` is the asking's own moment, for whoever
// wants to know when this server last heard the site say the player's name.
//
// It is called at the door rather than on every write that hangs off a player:
// the row has to be there before the first message of theirs (the reference
// below insists on it), and the door is the one place every player passes
// through.
func (s *Store) UpsertUser(id int64, nick, icon string, seen int64) error {
	_, err := s.db.Exec(`
		INSERT INTO users (id, nick, icon, seen_ms) VALUES (?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET nick = excluded.nick, icon = excluded.icon, seen_ms = excluded.seen_ms`,
		id, nick, icon, seen)
	if err != nil {
		return fmt.Errorf("write the player down: %w", err)
	}
	return nil
}

// SaveRecording writes a whole run down, tape and all, and answers with the row
// as the list would show it. The id is the caller's, so that a recording can be
// named before it is written, and so that a test's recordings are named rather
// than random.
//
// This is the door for a run that is already over: one tape, one write, one
// row. A run that is still being played is opened instead (`OpenRecording`) and
// grows a slice at a time (`AppendChunk`).
func (s *Store) SaveRecording(r Recording, tape string) (Recording, error) {
	// A run that arrives whole has no head and is not live: its tape is the
	// whole of it, and it was over before it arrived.
	r.Live = false
	if r.EndedMs == 0 {
		r.EndedMs = r.UploadedMs
	}
	_, err := s.db.Exec(`
		INSERT INTO recordings (id, name, author_id, steps, step_ms, seed, bytes, recorded_ms, uploaded_ms, tape, head, live, ended_ms, label, message_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)`,
		r.ID, r.Name, r.AuthorID, r.Steps, r.StepMs, r.Seed, r.Bytes, r.RecordedMs, r.UploadedMs, tape, r.EndedMs, r.Label, r.MessageID)
	if err != nil {
		return Recording{}, fmt.Errorf("save recording %s: %w", r.ID, err)
	}
	return r, nil
}

// Recordings is the whole list, newest first: what the window's own list of
// recordings shows, and what a playback picks from. The tapes themselves are
// not read — a list of a hundred runs should not be a hundred files off a disk
// — and `now` is handed in rather than read off a clock here, because whether a
// live run is still being played is a judgement about time (`playing`).
func (s *Store) Recordings(now int64) ([]Recording, error) {
	rows, err := s.db.Query(`SELECT ` + recordingColumns + `
		FROM recordings r LEFT JOIN users u ON u.id = r.author_id
		ORDER BY r.uploaded_ms DESC, r.id`)
	if err != nil {
		return nil, fmt.Errorf("recordings: %w", err)
	}
	defer rows.Close()
	list := []Recording{}
	for rows.Next() {
		r, err := scanRecording(rows.Scan, now)
		if err != nil {
			return nil, fmt.Errorf("recordings: %w", err)
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// RecordingsByID is the rows of exactly these runs, in the order asked for and
// without the ones this server does not hold: what the chat asks with — its
// window shows lines that link runs, and what those lines say is the runs' own
// labels, which are the runs' business rather than the log's. A list of ids is
// a list of things a reader is already looking at, so a run that is not there
// is simply absent from the answer rather than an error in it.
func (s *Store) RecordingsByID(ids []string, now int64) ([]Recording, error) {
	list := make([]Recording, 0, len(ids))
	for _, id := range ids {
		r, err := readRecording(s.db, id, now)
		if errors.Is(err, ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("recordings by id: %w", err)
		}
		list = append(list, r)
	}
	return list, nil
}

// SetChat says the run's own things about its line in the chat: which line is
// the run's (`MessageID`), and what that line says as the play goes on
// (`Label`) — either may be left alone, and both together are the one call a
// page makes when its run begins, the line after it having just been written.
//
// Only the run's own player may say them: the line is what the log will draw
// for the run, and a label anybody could rewrite is a chat anybody could speak
// in somebody else's name. The caller is the author the token was answered
// for, and the wrong one is `ErrForbidden` rather than a quiet success.
func (s *Store) SetChat(id string, author int64, message *int64, label *string, now int64) (Recording, error) {
	var whose int64
	err := s.db.QueryRow(`SELECT author_id FROM recordings WHERE id = ?`, id).Scan(&whose)
	if errors.Is(err, sql.ErrNoRows) {
		return Recording{}, fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Recording{}, fmt.Errorf("recording %s: %w", id, err)
	}
	if whose != author {
		return Recording{}, fmt.Errorf("recording %s: %w", id, ErrForbidden)
	}
	if message != nil {
		if _, err := s.db.Exec(`UPDATE recordings SET message_id = ? WHERE id = ?`, *message, id); err != nil {
			return Recording{}, fmt.Errorf("recording %s: %w", id, err)
		}
	}
	if label != nil {
		if _, err := s.db.Exec(`UPDATE recordings SET label = ? WHERE id = ?`, *label, id); err != nil {
			return Recording{}, fmt.Errorf("recording %s: %w", id, err)
		}
	}
	return readRecording(s.db, id, now)
}

// Chunk is one slice of a live run: the steps it covers, and what was written
// inside them — the frames, one record a step or a stillness, and the edits,
// each carrying the step it belongs to.
//
// Both lists are JSON off the wire rather than anything this store parses: what
// is inside a frame is the game's business (`frontend/src/game/tape.ts`), and
// a slice becomes part of a tape by having its two lists pasted into one — not
// by being read and written again.
type Chunk struct {
	// Seq is the slice's own number in its run and, with the run, its primary
	// key: it is the caller's, so that a slice whose answer was lost can be sent
	// again without the run growing twice.
	Seq int `json:"seq"`
	// Steps is how many steps of the run the slice covers. A run's length is the
	// sum of its slices' steps, so this is the only place a live run grows.
	Steps int `json:"steps"`
	// Frames is the slice's own records — rows and pauses — or an empty list.
	Frames json.RawMessage `json:"frames"`
	// Edits is the slice's own list of edits, or an empty list.
	Edits json.RawMessage `json:"edits"`
}

// Stream is a live run as one viewer is handed it: the head its tape will have,
// the slices it has after the one the viewer asked past, and the row itself —
// which is what says how long the run is now and whether it is still being
// played.
//
// A viewer that has been watching from the beginning asks for the slices after
// the last one it has, and pastes them onto the tape it is already playing; a
// viewer that has just arrived asks for all of them, which is how a run that
// began before it arrived is still watched from its own beginning.
type Stream struct {
	Recording Recording `json:"recording"`
	// Head is the four things the run's tape says about itself — its format, its
	// step, its seed and its stage — and none of what the slices carry. It is
	// `null` for a run uploaded whole, whose tape is a file rather than a head
	// with slices after it.
	Head json.RawMessage `json:"head"`
	// Chunks is what has arrived since the slice the viewer asked past, in the
	// order it was played, and is empty rather than absent when nothing has.
	Chunks []Chunk `json:"chunks"`
}

// liveGraceMs is how long a live run may go without a slice before this store
// stops calling it live. A window that was closed, a laptop that was shut, a
// network that went: each of them leaves a run that is over as far as anybody
// watching is concerned, though its steps are still there to be played. Two
// minutes is many slices' worth of nothing, so a run is not said to be over
// because one slice was slow.
const liveGraceMs = 2 * 60 * 1000

// recordingColumns is the row of a run as both `Recordings` and `readRecording`
// read it, in the order `scanRecording` expects. The author is the player's own
// row joined in (`users`), which is what keeps a run's byline as current as the
// site's own word for its player.
const recordingColumns = `r.id, r.name, COALESCE(u.nick, ''), r.steps, r.step_ms, r.seed, r.bytes,
	r.recorded_ms, r.uploaded_ms, r.live, r.ended_ms, r.label, r.message_id`

// rower is what reading one row needs of a database, or of a transaction inside
// one: both answer `QueryRow`, so `readRecording` serves either.
type rower interface {
	QueryRow(query string, args ...any) *sql.Row
}

// playing is whether a run is still being played: it was opened live, it has
// not been ended, and its last slice is recent enough to believe that whoever
// was playing it is still there.
func playing(live bool, endedMs, now int64) bool {
	return live && now-endedMs < liveGraceMs
}

// scanRecording reads one row of `recordingColumns` — in that order — into a
// recording, deciding from the clock whether a run that was opened live is
// still being played.
func scanRecording(scan func(...any) error, now int64) (Recording, error) {
	var (
		r    Recording
		live bool
	)
	if err := scan(&r.ID, &r.Name, &r.Author, &r.Steps, &r.StepMs, &r.Seed, &r.Bytes,
		&r.RecordedMs, &r.UploadedMs, &live, &r.EndedMs, &r.Label, &r.MessageID); err != nil {
		return Recording{}, err
	}
	r.Live = playing(live, r.EndedMs, now)
	return r, nil
}

// readRecording is one run's row, as the list would show it, or `ErrNotFound`.
func readRecording(q rower, id string, now int64) (Recording, error) {
	r, err := scanRecording(q.QueryRow(`SELECT `+recordingColumns+`
		FROM recordings r LEFT JOIN users u ON u.id = r.author_id WHERE r.id = ?`, id).Scan, now)
	if errors.Is(err, sql.ErrNoRows) {
		return Recording{}, fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Recording{}, fmt.Errorf("recording %s: %w", id, err)
	}
	return r, nil
}

// raw is a stretch of JSON as a value on the wire. An empty one is `null` rather
// than nothing at all: a door answering with a run that has no head — one
// uploaded whole, whose tape is a file — has to say so in JSON.
func raw(text string) json.RawMessage {
	if text == "" {
		return json.RawMessage("null")
	}
	return json.RawMessage(text)
}

// Tape is a recording's own file: what a playback is handed.
//
// For a run that was uploaded whole that is the tape verbatim, byte for byte as
// it arrived — the game's decoder is what reads it (`decodeTape`), and a tape
// this server re-encoded would be a second opinion about a format that already
// has a version.
//
// For a run that arrived in slices it is the head and the slices *pasted
// together*: the head's four things, then the length the slices add up to, then
// their records one list after another and their edits the same way — a record
// is a row or a pause wherever it sits, and an edit carries the step it belongs
// to. A playback therefore reads exactly the frames it would have read out of
// the same run uploaded whole and unsliced.
//
// A recording that is not there answers `ErrNotFound`, which the API turns into
// a 404, and so does a live run that has not been played a step yet: there is
// nothing in it to hand anybody.
func (s *Store) Tape(id string) (string, error) {
	var (
		head  string
		tape  string
		steps int
	)
	err := s.db.QueryRow(`SELECT head, tape, steps FROM recordings WHERE id = ?`, id).Scan(&head, &tape, &steps)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("recording %s: %w", id, err)
	}
	if tape != "" {
		return tape, nil
	}
	slices, err := s.slices(id, -1)
	if err != nil {
		return "", err
	}
	if head == "" || steps == 0 {
		return "", fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	return assemble(head, steps, slices), nil
}

// slices is a run's own slices after the one numbered `after`, in the order they
// were played: the body of `Tape` and most of the body of `Chunks`.
func (s *Store) slices(id string, after int) ([]Chunk, error) {
	rows, err := s.db.Query(`
		SELECT seq, steps, frames, edits FROM chunks
		WHERE recording_id = ? AND seq > ? ORDER BY seq`, id, after)
	if err != nil {
		return nil, fmt.Errorf("slices of %s: %w", id, err)
	}
	defer rows.Close()
	list := []Chunk{}
	for rows.Next() {
		var (
			c      Chunk
			frames string
			edits  string
		)
		if err := rows.Scan(&c.Seq, &c.Steps, &frames, &edits); err != nil {
			return nil, fmt.Errorf("slices of %s: %w", id, err)
		}
		c.Frames, c.Edits = raw(frames), raw(edits)
		list = append(list, c)
	}
	return list, rows.Err()
}

// assemble is a run's own file out of the head it was opened with, the length
// its slices add up to, and the slices themselves. The head is written without
// its closing brace, because the length, the frames and the edits are
// appended to it; the two lists are pasted rather than read and written again,
// which is what keeps a slice's own bytes — and so a playback's own reading of
// them — exactly as they arrived.
func assemble(head string, steps int, slices []Chunk) string {
	frames, edits := make([]string, 0, len(slices)), make([]string, 0, len(slices))
	for _, slice := range slices {
		frames, edits = append(frames, string(slice.Frames)), append(edits, string(slice.Edits))
	}
	var body strings.Builder
	body.WriteString(strings.TrimSuffix(strings.TrimSpace(head), "}"))
	if body.Len() > 0 {
		body.WriteString(",")
	}
	fmt.Fprintf(&body, `"steps":%d,"frames":[%s],"edits":[%s]}`, steps, inside(frames), inside(edits))
	return body.String()
}

// inside is several arrays as the inside of one: joining two lists of records
// needs the records and not the brackets that make each of them a list.
func inside(arrays []string) string {
	parts := make([]string, 0, len(arrays))
	for _, array := range arrays {
		if inner := trimArray(array); inner != "" {
			parts = append(parts, inner)
		}
	}
	return strings.Join(parts, ",")
}

// trimArray is an array's own text without the brackets that make it one. What
// arrives from a caller is checked to be an array before it is stored
// (`readChunk` in `internal/api`), so a text that is not one here is an empty
// list rather than a mistake to report.
func trimArray(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) < 2 || trimmed[0] != '[' || trimmed[len(trimmed)-1] != ']' {
		return ""
	}
	return trimmed[1 : len(trimmed)-1]
}

// OpenRecording starts a run that will arrive as it is played: the name and the
// author a list shows, the moment it started, and the *head* of the tape it will
// be — its format, its step, its seed and its stage, and no events, because none
// have happened yet.
//
// The run is live from this moment and has no steps: its length is the sum of
// the slices that arrive next (`AppendChunk`), and until one does there is
// nothing in it to play. The head is stored exactly as it was sent and is what
// `Tape` pastes the slices onto, so a head that could not become a tape is
// refused on the way in (`readHead` in `internal/api`) rather than when somebody
// finally tries to watch the run.
func (s *Store) OpenRecording(r Recording, head string, now int64) (Recording, error) {
	r.Steps, r.Bytes, r.Live, r.EndedMs = 0, len(head), true, now
	_, err := s.db.Exec(`
		INSERT INTO recordings (id, name, author_id, steps, step_ms, seed, bytes, recorded_ms, uploaded_ms, tape, head, live, ended_ms, label, message_id)
		VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, '', ?, 1, ?, '', 0)`,
		r.ID, r.Name, r.AuthorID, r.StepMs, r.Seed, r.Bytes, r.RecordedMs, r.UploadedMs, head, now)
	if err != nil {
		return Recording{}, fmt.Errorf("open recording %s: %w", r.ID, err)
	}
	return r, nil
}

// AppendChunk files one slice of a live run and answers with the run as it
// stands: how long it is now, and whether it is still being played.
//
// The length and the size are *counted* from the slices rather than added up, so
// that a slice sent twice — a player retrying a request whose answer it never
// saw — leaves the run exactly as long as it is: a slice's number is the primary
// key with its run, and the second write replaces the first.
//
// `ended` says this slice is the last one: the run stops being live, and the
// moment the slice arrived becomes its own end. A slice after that, and any
// slice at all offered to a run that was uploaded whole, is `ErrSealed`.
func (s *Store) AppendChunk(id string, chunk Chunk, ended bool, now int64) (Recording, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Recording{}, fmt.Errorf("append to recording %s: %w", id, err)
	}
	// However this goes, the transaction ends with it: it is committed only once
	// the run's own numbers have been counted from its slices.
	defer tx.Rollback()
	var (
		tape string
		live bool
	)
	err = tx.QueryRow(`SELECT tape, live FROM recordings WHERE id = ?`, id).Scan(&tape, &live)
	if errors.Is(err, sql.ErrNoRows) {
		return Recording{}, fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Recording{}, fmt.Errorf("append to recording %s: %w", id, err)
	}
	if tape != "" || !live {
		return Recording{}, fmt.Errorf("recording %s: %w", id, ErrSealed)
	}
	if _, err := tx.Exec(`
		INSERT OR REPLACE INTO chunks (recording_id, seq, steps, frames, edits, sent_ms)
		VALUES (?, ?, ?, ?, ?, ?)`,
		id, chunk.Seq, chunk.Steps, string(chunk.Frames), string(chunk.Edits), now); err != nil {
		return Recording{}, fmt.Errorf("append to recording %s: %w", id, err)
	}
	// The moment a slice arrived is the moment the run was last heard from, and
	// what the slice says about there being more is the only other thing that
	// changes: `live` is the caller's word for it.
	if _, err := tx.Exec(`
		UPDATE recordings SET
			steps = (SELECT COALESCE(SUM(steps), 0) FROM chunks WHERE recording_id = ?),
			bytes = LENGTH(head) + (SELECT COALESCE(SUM(LENGTH(frames) + LENGTH(edits)), 0)
			                        FROM chunks WHERE recording_id = ?),
			live = ?, ended_ms = ?
		WHERE id = ?`, id, id, !ended, now, id); err != nil {
		return Recording{}, fmt.Errorf("append to recording %s: %w", id, err)
	}
	run, err := readRecording(tx, id, now)
	if err != nil {
		return Recording{}, err
	}
	if err := tx.Commit(); err != nil {
		return Recording{}, fmt.Errorf("append to recording %s: %w", id, err)
	}
	return run, nil
}

// Chunks is a run's slices after the one numbered `after`, in the order they
// were played, together with the head its tape will have and the run's own row:
// everything a window needs to watch a run as it is being played, and to keep
// watching it as it grows.
//
// `after` is the number of the last slice the viewer already has; `-1` (or
// anything less) is a viewer that has none — one that has just arrived, and so
// watches the run from its own beginning even though the run began before.
func (s *Store) Chunks(id string, after int, now int64) (Stream, error) {
	run, err := readRecording(s.db, id, now)
	if err != nil {
		return Stream{}, err
	}
	var head string
	if err := s.db.QueryRow(`SELECT head FROM recordings WHERE id = ?`, id).Scan(&head); err != nil {
		return Stream{}, fmt.Errorf("recording %s: %w", id, err)
	}
	slices, err := s.slices(id, after)
	if err != nil {
		return Stream{}, err
	}
	return Stream{Recording: run, Head: raw(head), Chunks: slices}, nil
}

// messageLimit is how many lines one read of the log answers with: the newest
// fifty of what was asked about, never more. A window is sent the tail of a
// conversation — what somebody arriving can still be part of — rather than the
// whole of it, and a catch-up (`after`) asks about seconds rather than
// histories, so the limit is a page's own guard against a log years long
// rather than a rule a reader ever notices.
const messageLimit = 50

// Messages is the log of one conversation: the lines written on a recording
// (its id) or the lines of the lobby (an empty tape), in the order they were
// written, starting after `after` — and never more than the newest
// `messageLimit` of them.
//
// One query answers either, because a line's recording is a column rather than a
// table: the lobby is the conversation with no recording, not a second kind of
// thing. `after` is a message id rather than a time, so that a window catching
// up cannot miss a line written in the same millisecond as the last one it saw.
func (s *Store) Messages(tape string, after int64) ([]Message, error) {
	// Newest first off the database, so that the limit takes the tail rather
	// than the head; the list is turned around before it is answered, because
	// the order it is read in is the order it was said in.
	rows, err := s.db.Query(`
		SELECT m.id, COALESCE(m.tape, ''), m.at_step, m.user_id,
			COALESCE(u.nick, ''), COALESCE(u.icon, '-'), m.ghost, m.parts, m.sent_ms
		FROM messages m LEFT JOIN users u ON u.id = m.user_id
		WHERE COALESCE(m.tape, '') = ? AND m.id > ?
		ORDER BY m.id DESC
		LIMIT ?`, tape, after, messageLimit)
	if err != nil {
		return nil, fmt.Errorf("messages: %w", err)
	}
	defer rows.Close()
	list := []Message{}
	for rows.Next() {
		var (
			m    Message
			step sql.NullInt64
			body string
		)
		if err := rows.Scan(&m.ID, &m.Tape, &step, &m.UserID, &m.Nick, &m.Icon, &m.Ghost, &body, &m.SentMs); err != nil {
			return nil, fmt.Errorf("messages: %w", err)
		}
		if step.Valid {
			at := int(step.Int64)
			m.AtStep = &at
		}
		if err := json.Unmarshal([]byte(body), &m.Parts); err != nil {
			return nil, fmt.Errorf("message %d: its parts are not readable: %w", m.ID, err)
		}
		if m.Parts == nil {
			m.Parts = []Part{}
		}
		list = append(list, m)
	}
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	return list, rows.Err()
}

// AddMessage writes one line and answers with it as `Messages` would report it:
// the line the caller wrote, with the id and the time this server gave it.
func (s *Store) AddMessage(m Message) (Message, error) {
	parts, err := json.Marshal(m.Parts)
	if err != nil {
		return Message{}, fmt.Errorf("the parts are not writable: %w", err)
	}
	// A line with no recording is the lobby, and SQLite says that with NULL
	// rather than with an empty string.
	var tape any
	if m.Tape != "" {
		tape = m.Tape
	}
	result, err := s.db.Exec(`
		INSERT INTO messages (tape, at_step, user_id, ghost, parts, sent_ms)
		VALUES (?, ?, ?, ?, ?, ?)`,
		tape, m.AtStep, m.UserID, m.Ghost, string(parts), m.SentMs)
	if err != nil {
		return Message{}, fmt.Errorf("add message: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Message{}, fmt.Errorf("add message: %w", err)
	}
	m.ID = id
	return m, nil
}

// Steps is how long a recording is, in its own steps, without reading its tape:
// what a message may be anchored within, and how far a playback will reach.
func (s *Store) Steps(id string) (int, error) {
	var steps int
	err := s.db.QueryRow(`SELECT steps FROM recordings WHERE id = ?`, id).Scan(&steps)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("recording %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return 0, fmt.Errorf("recording %s: %w", id, err)
	}
	return steps, nil
}
