// Package api is the server's own door: the few endpoints the game and its
// chat speak to, and the rules about what a request may say.
//
// The doors are these:
//
//	GET  /api/health                   a line for a monitor: is anything alive
//	POST /api/auth                     one token, and the player the site says owns it
//	GET  /api/recordings               the list, newest first
//	POST /api/recordings               one run's tape, uploaded whole
//	POST /api/recordings/live          a run that arrives as it is played
//	GET  /api/recordings/{id}          one tape, for a live or a stored playback
//	GET  /api/recordings/{id}/chunks   the slices of a live run, as they arrive
//	POST /api/recordings/{id}/chunks   one slice of a live run
//	GET  /api/messages                 the log of a recording, or of the lobby — its newest fifty lines
//	POST /api/messages                 one line, anchored or not
//
// Everything is JSON, and the one exception is deliberate: a tape is answered
// byte for byte as it was uploaded, because the game's own decoder is what
// reads it (`decodeTape`) and a server that re-wrote it would be a second
// opinion about a format that already has a version.
//
// A run reaches this server one of two ways, and both end up as the same tape. A
// finished run arrives whole, in one upload. A run that is being played is
// *opened* first — its name, its nickname and the head of the tape it will be,
// and then a slice of its own few seconds of play per request, sent as it is
// played. The slices are what a window watches the run through while it is still
// going, and what keeps the run if that window is closed halfway through: a tape
// is the head and the slices read as one file (`store.Tape`), so a playback of a
// run being played and a playback of the same run uploaded when it was over read
// the same events.
//
// There is no signing in *here*, but nobody is a nickname of their own choosing
// either: every door but the monitor's takes a token in `X-Auth-Token` — the
// browser session's own, the `contortion_key` cookie the site's login leaves —
// and this server asks the site about it (`auth.go`, the site's own
// `api/user-by-token.php`) rather than taking the caller's word for who they
// are. What a caller is remembered as is the site's answer: a message is signed
// by the player the token belongs to (`users` in `internal/store`), whoever
// their nickname said they were, and the one thing they may still choose for a
// line of their own is to write it as the ghost. Nothing is set on the browser
// and the token is not rotated, so the session the token came from goes on
// working however much the game asks about it.
//
// The rules that are about a *request* rather than about the log live here: how
// big a body may be, and how far into a recording a message may be anchored — a
// line at step 4000 of a run that is 3000 steps long is a mistake rather than a
// message, because no playback could ever reach it.
package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"garden/backend/internal/store"
)

const (
	// tokenBytes is how much randomness a new name is made of: 128 bits of it,
	// which is a name nobody guesses.
	tokenBytes = 16

	// maxBody is the largest request this server will read. A tape is the
	// reason it is not smaller: a minute of busy play is a couple of hundred
	// kilobytes, and an upload is that file as a JSON body.
	maxBody = 8 << 20
	// maxTape is the largest *tape* that will be stored: the body may be a
	// little bigger than this, since it also carries the name and the author.
	maxTape = 6 << 20
	// maxChunk is the largest slice of a live run this server will take, and it
	// is a ceiling rather than a budget: a few seconds of play are a couple of
	// kilobytes of JSON, and a very busy few seconds are tens of them. What it
	// is really for is a caller that has misunderstood by a long way and is
	// sending a whole run through the door for slices.
	maxChunk = 1 << 20

	// A message's own arithmetic: a run's name is short whatever alphabet it is
	// written in, and a body is one line of a chat rather than an essay.
	maxNick  = 40
	maxParts = 20
	maxText  = 500
	maxAlt   = 100
	// maxFile is how long a gif's own path may be: an asset of the app's
	// (`assets/chat/heart.gif`) rather than a file the caller's machine has.
	maxFile = 300

	// tapeFormat and tapeStepMs are the tape this server will accept, and they
	// are copies of `TAPE_FORMAT` and `TAPE_STEP_MS` in
	// `frontend/src/game/tape.ts` on purpose: a tape of another format, or one
	// counted in another step, is a run this server cannot describe — and
	// saying so on the way in is cheaper than a playback saying so.
	tapeFormat = "garden-tape/2"
	tapeStepMs = 20
)

// Server is the API over a store. It is a `http.Handler`, so a test is one
// `httptest.NewServer` away from it and a monitor is a `curl`.
//
// The router is the server: nothing stands between a request and the door it
// names (`routes`), because there is nothing to decide about a caller beyond
// the one question every door asks anyway — whose token is this (`userOf`).
type Server struct {
	*http.ServeMux
	store *store.Store
	now   func() time.Time
	newID func() string
	// who is what a token is worth: the player the site says owns it. The
	// default asks nothing and answers nothing — a server built without an
	// auth endpoint refuses every caller, honestly rather than by accident —
	// and a real one is built by `WithAuthURL` from the site's own door.
	who func(token string) (User, error)
}

// Option is one of the things a test or a main decides for itself: what time it
// is, what a new name is, and what a token is worth. Everything else a test
// changes, it changes by asking the store.
type Option func(*Server)

// WithClock is the server's clock. The default is `time.Now`; a test hands it
// a clock that stands still, so that two messages can be compared.
func WithClock(now func() time.Time) Option {
	return func(s *Server) { s.now = now }
}

// WithIDs is where a new name comes from — a recording's id, which nobody
// outside this server chooses. The default is 128 random bits; a test hands it a
// counter, so that what it asks for next is a string it already knows.
func WithIDs(newID func() string) Option {
	return func(s *Server) { s.newID = newID }
}

// WithAuth is what a token is worth, decided by the caller: a test hands it a
// table of its own players, because a test has no site to ask.
func WithAuth(who func(token string) (User, error)) Option {
	return func(s *Server) { s.who = who }
}

// WithAuthURL is the site's own door about tokens (`api/user-by-token.php`) at
// the address the site answers it at. It is what a real server runs with; see
// `auth.go` for the asking and its caching.
func WithAuthURL(url string) Option {
	return func(s *Server) { s.who = newSiteAuth(url) }
}

// New is the API over a store, with every door hung on it.
func New(st *store.Store, options ...Option) *Server {
	s := &Server{
		ServeMux: http.NewServeMux(),
		store:    st,
		now:      time.Now,
		newID:    newToken,
		who: func(string) (User, error) {
			return User{}, errors.New("no auth endpoint is configured: start with -auth-url")
		},
	}
	for _, option := range options {
		option(s)
	}
	s.routes()
	return s
}

// routes is where a door is named. The patterns are method and path together
// (`net/http`'s own routing): a GET of a path that is a POST only answers 405
// rather than falling through to something else.
func (s *Server) routes() {
	s.HandleFunc("GET /api/health", s.health)
	s.HandleFunc("POST /api/auth", s.auth)
	s.HandleFunc("GET /api/recordings", s.recordings)
	s.HandleFunc("POST /api/recordings", s.upload)
	s.HandleFunc("POST /api/recordings/live", s.open)
	s.HandleFunc("GET /api/recordings/{id}", s.tape)
	s.HandleFunc("GET /api/recordings/{id}/chunks", s.chunks)
	s.HandleFunc("POST /api/recordings/{id}/chunks", s.appendChunk)
	s.HandleFunc("GET /api/messages", s.messages)
	s.HandleFunc("POST /api/messages", s.post)
}

// newToken is a name for something new — a recording's id: 128 bits of
// randomness, hex.
func newToken() string {
	buf := make([]byte, tokenBytes)
	if _, err := rand.Read(buf); err != nil {
		// A machine with no randomness cannot name a recording. Nothing about
		// a request is at fault, so there is nothing to answer: panicking is
		// the honest end of a server that cannot name what it is given to keep.
		panic(fmt.Sprintf("no randomness for a token: %v", err))
	}
	return hex.EncodeToString(buf)
}

// writeJSON is every answer of the API: a status, and one JSON value.
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	// A caller who has stopped listening cannot be told anything, and the
	// status is already out: there is nothing left but to send it and let the
	// write fail where it fails.
	_ = json.NewEncoder(w).Encode(value)
}

// fail is a refusal the caller can read: a status, and a sentence about what
// was wrong with the request. The sentences are English, like every string this
// project's code writes, because they are for whoever is holding the other end
// of the wire rather than for the player.
func fail(w http.ResponseWriter, status int, format string, args ...any) {
	writeJSON(w, status, map[string]string{"error": fmt.Sprintf(format, args...)})
}

// readJSON reads a request body into a value: one JSON object, no more than
// `maxBody` bytes. The limiter sits in front of the decoder, so a body claiming
// to be enormous is cut off rather than read.
func readJSON(w http.ResponseWriter, r *http.Request, into any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("the request has no body")
		}
		return fmt.Errorf("the body is not JSON: %w", err)
	}
	return nil
}

// number reads a whole number off the wire, or says what was wrong with it.
func number(name, value string) (int64, error) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s is not a number: %q", name, value)
	}
	return parsed, nil
}

// health is the line a monitor reads, and the first thing a person checks when
// the chat seems not to work: the server is up if this answers at all.
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// userOf is the one question every door but the monitor's asks: whose token is
// this. It has already answered — with a refusal in the caller's own hand —
// when it answers false, which is why a handler that gets past it need not
// think about a caller it does not know the name of.
func (s *Server) userOf(w http.ResponseWriter, r *http.Request) (User, bool) {
	user, err := s.who(tokenOf(r))
	switch {
	case err == nil:
		return user, true
	case errors.Is(err, errNoAuth):
		fail(w, http.StatusUnauthorized, "auth")
		return User{}, false
	default:
		// The site being unreachable is not the caller's fault, but it is not
		// this server's to forgive either: the token cannot be asked about, so
		// the door stays shut and the sentence says whose end of the wire it
		// shut on.
		fail(w, http.StatusBadGateway, "%v", err)
		return User{}, false
	}
}

// auth is the door a page comes to first: the token out of the site's cookie,
// and the player the site says owns it. It is the handshake the page waits out
// on its black screen, and the one place a player's row is written down
// (`UpsertUser`) — every door after it takes the token for granted and asks
// about it only as often as the cache does (`auth.go`).
func (s *Server) auth(w http.ResponseWriter, r *http.Request) {
	user, ok := s.userOf(w, r)
	if !ok {
		return
	}
	if err := s.store.UpsertUser(user.ID, user.Nick, user.Icon, s.now().UnixMilli()); err != nil {
		fail(w, http.StatusInternalServerError, "%v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// recordings is the list the window draws: every run this server holds, newest
// first, each with the numbers a list needs to show (how long it lasts, how big
// it is, whether it is still being played) and without the tapes themselves.
func (s *Server) recordings(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.userOf(w, r); !ok {
		return
	}
	list, err := s.store.Recordings(s.now().UnixMilli())
	if err != nil {
		fail(w, http.StatusInternalServerError, "the recordings could not be read: %v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recordings": list})
}

// tapeHeader is the part of a tape this server reads: the four things it says
// about itself (its format, its step, how long it is, the world's seed) and the
// three things it must have (a stage, frames, edits). Everything else in the
// file — what is inside those frames — is the game's business and is stored
// without being looked at.
type tapeHeader struct {
	Format string            `json:"format"`
	Step   int               `json:"step"`
	Steps  int               `json:"steps"`
	Seed   int64             `json:"seed"`
	Stage  json.RawMessage   `json:"stage"`
	Frames []json.RawMessage `json:"frames"`
	Edits  []json.RawMessage `json:"edits"`
}

// readTape is a tape off the wire, checked as it is read.
//
// A tape of another format, or one counted in another step, is a run this server
// cannot describe — and saying so on the way in is cheaper than a playback
// saying so later. The checks are the ones `decodeTape` makes in
// `frontend/src/game/tape.ts`, and deliberately so: a server that stored a tape
// the game cannot decode would be handing the game something it must refuse.
func (s *Server) readTape(raw json.RawMessage) (tapeHeader, error) {
	var header tapeHeader
	if len(raw) == 0 {
		return header, errors.New("no tape was sent")
	}
	if len(raw) > maxTape {
		return header, fmt.Errorf("the tape is %d bytes; this server takes tapes up to %d", len(raw), maxTape)
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		return header, fmt.Errorf("the tape is not JSON: %w", err)
	}
	if header.Format != tapeFormat {
		return header, fmt.Errorf("not a %s tape: %q", tapeFormat, header.Format)
	}
	if header.Step != tapeStepMs {
		return header, fmt.Errorf("the tape steps at %d ms; this server plays %d ms steps", header.Step, tapeStepMs)
	}
	if header.Steps < 1 {
		return header, fmt.Errorf("the tape is %d steps long; a run is at least one step", header.Steps)
	}
	if len(header.Stage) == 0 || header.Frames == nil || header.Edits == nil {
		return header, errors.New("the tape is missing its stage, its frames or its edits")
	}
	return header, nil
}

// readHead is the head of a live run's tape off the wire, checked as it is read.
//
// A head is a tape without a length, without frames and without edits: the
// four things a tape says about itself, which is all that is known when a run
// starts. The checks are `readTape`'s, for the same reason — a run whose head
// could not become a tape is refused now rather than when somebody finally tries
// to watch it — plus one check of its own: a head that carried a length or a
// list would assemble into a tape with two of them.
func (s *Server) readHead(raw json.RawMessage) (tapeHeader, error) {
	var header tapeHeader
	if len(raw) == 0 {
		return header, errors.New("no head was sent")
	}
	if len(raw) > maxTape {
		return header, fmt.Errorf("the head is %d bytes; this server takes tapes up to %d", len(raw), maxTape)
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		return header, fmt.Errorf("the head is not JSON: %w", err)
	}
	if header.Format != tapeFormat {
		return header, fmt.Errorf("not a %s tape: %q", tapeFormat, header.Format)
	}
	if header.Step != tapeStepMs {
		return header, fmt.Errorf("the head steps at %d ms; this server plays %d ms steps", header.Step, tapeStepMs)
	}
	if len(header.Stage) == 0 {
		return header, errors.New("the head is missing its stage")
	}
	if header.Steps != 0 || header.Frames != nil || header.Edits != nil {
		return header, errors.New("a head is a run's format, its step, its seed and its stage: " +
			"its length, its frames and its edits arrive as slices")
	}
	return header, nil
}

// cleanRun is a run's name off the wire, checked as it is read: a run needs a
// name, as short as a nickname for the same reason a nickname is. Who played it
// is not the wire's to say — the token is, and it has already been answered for
// (`userOf`).
func cleanRun(name string) (cleanName string, err error) {
	cleanName = strings.TrimSpace(name)
	if cleanName == "" {
		return "", errors.New("a recording needs a name")
	}
	if len(cleanName) > maxNick {
		return "", fmt.Errorf("the name is %d characters; this server takes %d", len(cleanName), maxNick)
	}
	return cleanName, nil
}

// readChunk is one slice of a live run off the wire, checked as it is read.
//
// A slice covers at least one step — except the last one, which may carry
// nothing but the word that the run is over: a player whose final second went
// out a moment before the run ended has nothing left to send with that word,
// and a run held open for its grace because its ending had no room in it is a
// run the ending was for. The slice also says *which* slice it is, and that
// number is the caller's rather than this server's: a player that never saw the
// answer to a slice sends the same slice again under the same number, and that
// is what stops the run growing twice for one few seconds of play.
func readChunk(seq *int, steps int, frames, edits json.RawMessage, last bool) (store.Chunk, error) {
	var chunk store.Chunk
	if seq == nil || *seq < 0 {
		return chunk, errors.New("a slice says which slice it is: seq is a number counted from zero")
	}
	if steps < 0 || (steps == 0 && !last) {
		return chunk, fmt.Errorf("a slice is %d steps long; a slice is at least one step", steps)
	}
	if len(frames) > maxChunk || len(edits) > maxChunk {
		return chunk, fmt.Errorf("a slice with %d bytes of frames and %d of edits is more than this server takes (%d each)",
			len(frames), len(edits), maxChunk)
	}
	frames, err := list(frames)
	if err != nil {
		return chunk, err
	}
	edits, err = list(edits)
	if err != nil {
		return chunk, err
	}
	chunk.Seq, chunk.Steps, chunk.Frames, chunk.Edits = *seq, steps, frames, edits
	return chunk, nil
}

// list is a slice's own frames or edits, checked to be a list. A request
// that says nothing about one of them — an absent key, or an empty value — is a
// slice in which none were written rather than a mistake: a few seconds in which
// nothing happened is a slice like any other.
func list(raw json.RawMessage) (json.RawMessage, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return json.RawMessage("[]"), nil
	}
	if trimmed[0] != '[' || trimmed[len(trimmed)-1] != ']' {
		return nil, errors.New("a slice's frames and edits are both lists")
	}
	return json.RawMessage(trimmed), nil
}

// upload takes one run: the name it was given, when it was recorded, and the
// tape itself as the game wrote it — played, like everything else here, by
// whoever the token says is asking. The answer is the recording as the list
// will show it — which is where the window learns the id a playback of it will
// be asked for by.
func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	user, ok := s.userOf(w, r)
	if !ok {
		return
	}
	if err := s.store.UpsertUser(user.ID, user.Nick, user.Icon, s.now().UnixMilli()); err != nil {
		fail(w, http.StatusInternalServerError, "%v", err)
		return
	}
	var body struct {
		Name       string          `json:"name"`
		RecordedMs int64           `json:"recorded_ms"`
		Tape       json.RawMessage `json:"tape"`
	}
	if err := readJSON(w, r, &body); err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	header, err := s.readTape(body.Tape)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	name, err := cleanRun(body.Name)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	recording := store.Recording{
		ID:         s.newID(),
		Name:       name,
		AuthorID:   user.ID,
		Author:     user.Nick,
		Steps:      header.Steps,
		StepMs:     header.Step,
		Seed:       header.Seed,
		Bytes:      len(body.Tape),
		RecordedMs: body.RecordedMs,
		UploadedMs: s.now().UnixMilli(),
	}
	if _, err := s.store.SaveRecording(recording, string(body.Tape)); err != nil {
		fail(w, http.StatusInternalServerError, "the recording could not be written: %v", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"recording": recording})
}

// open starts a run that is to be sent in as it is played: the name a list
// shows, when it started, and the head of the tape it will be — played by the
// caller the token names. The answer is the run as the list shows it, carrying
// the id its slices are sent to.
//
// Nothing is played here and nothing is stored but the head: a live run has no
// steps until its first slice arrives, and a run whose player closed the window
// before sending one is a run with nothing in it.
func (s *Server) open(w http.ResponseWriter, r *http.Request) {
	user, ok := s.userOf(w, r)
	if !ok {
		return
	}
	if err := s.store.UpsertUser(user.ID, user.Nick, user.Icon, s.now().UnixMilli()); err != nil {
		fail(w, http.StatusInternalServerError, "%v", err)
		return
	}
	var body struct {
		Name       string          `json:"name"`
		RecordedMs int64           `json:"recorded_ms"`
		Head       json.RawMessage `json:"head"`
	}
	if err := readJSON(w, r, &body); err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	header, err := s.readHead(body.Head)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	name, err := cleanRun(body.Name)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	now := s.now().UnixMilli()
	recording := store.Recording{
		ID:         s.newID(),
		Name:       name,
		AuthorID:   user.ID,
		Author:     user.Nick,
		StepMs:     header.Step,
		Seed:       header.Seed,
		RecordedMs: body.RecordedMs,
		UploadedMs: now,
	}
	opened, err := s.store.OpenRecording(recording, string(body.Head), now)
	if err != nil {
		fail(w, http.StatusInternalServerError, "the recording could not be opened: %v", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"recording": opened})
}

// appendChunk takes one slice of a live run: the steps it covers, the frames and
// the edits written inside them, and whether that slice was the last one.
// The answer is the run as it stands — how long it is now, and whether it is
// still being played — which is what the window that sent the slice shows while
// the run goes on.
//
// A slice of a run this server does not hold is a 404, and a slice of a run that
// has ended — or of one that was uploaded whole, which was over before it
// arrived — is a 409: the run is the right one and it takes no more.
func (s *Server) appendChunk(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.userOf(w, r); !ok {
		return
	}
	id := r.PathValue("id")
	var body struct {
		Seq    *int            `json:"seq"`
		Steps  int             `json:"steps"`
		Frames json.RawMessage `json:"frames"`
		Edits  json.RawMessage `json:"edits"`
		Last   bool            `json:"last"`
	}
	if err := readJSON(w, r, &body); err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	chunk, err := readChunk(body.Seq, body.Steps, body.Frames, body.Edits, body.Last)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	recording, err := s.store.AppendChunk(id, chunk, body.Last, s.now().UnixMilli())
	switch {
	case errors.Is(err, store.ErrNotFound):
		fail(w, http.StatusNotFound, "no recording %s", id)
		return
	case errors.Is(err, store.ErrSealed):
		fail(w, http.StatusConflict, "%v", err)
		return
	case err != nil:
		fail(w, http.StatusInternalServerError, "the slice could not be written: %v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recording": recording})
}

// chunks is a live run as one viewer watches it: the head of its tape, the
// slices it has after the one the viewer already has, and the run's own row —
// which is what says how long it is now and whether it is still being played.
//
// This is asked for over and over, by the window that is recording the run and
// by the windows watching it. `after` is the number of the last slice the caller
// has; without it every slice the run has is answered, which is how a run that
// began before somebody arrived is watched from its own beginning.
func (s *Server) chunks(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.userOf(w, r); !ok {
		return
	}
	id := r.PathValue("id")
	after := -1
	if raw := strings.TrimSpace(r.URL.Query().Get("after")); raw != "" {
		parsed, err := number("after", raw)
		if err != nil {
			fail(w, http.StatusBadRequest, "after is the number of the last slice you saw, not %q", raw)
			return
		}
		after = int(parsed)
	}
	stream, err := s.store.Chunks(id, after, s.now().UnixMilli())
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusNotFound, "no recording %s", id)
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, "the recording could not be read: %v", err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

// tape is one recording's own file, and the one thing this API answers that is
// not JSON: byte for byte what was uploaded, because the game's decoder is what
// reads it (`decodeTape`) and a re-encoded tape would be this server's second
// opinion about a format that already has a version.
//
// A run that arrived in slices has no file of its own until it is over — or
// until somebody asks for one, which is the same thing read once: its head and
// its slices are answered as one tape (`store.Tape`), so a playback of a run
// that is still being played is a playback of the run so far.
func (s *Server) tape(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.userOf(w, r); !ok {
		return
	}
	id := r.PathValue("id")
	body, err := s.store.Tape(id)
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusNotFound, "no recording %s", id)
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, "the tape could not be read: %v", err)
		return
	}
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("content-length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, body)
}

// messages is the log of one conversation: `tape` names the recording and an
// absent one means the lobby, and `after` asks for what has been written since
// the last line the caller saw, so that a window catching up never has to ask
// about a line twice. What comes back is the tail of it — the newest fifty
// lines (`store.messageLimit`) — because a conversation is read, not archived.
func (s *Server) messages(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.userOf(w, r); !ok {
		return
	}
	query := r.URL.Query()
	after := int64(0)
	if raw := strings.TrimSpace(query.Get("after")); raw != "" {
		parsed, err := number("after", raw)
		if err != nil || parsed < 0 {
			fail(w, http.StatusBadRequest, "after is the id of the last line you saw, not %q", raw)
			return
		}
		after = parsed
	}
	tape := strings.TrimSpace(query.Get("tape"))
	if tape != "" {
		// The recording has to be one this server holds: a window asking about a
		// run that is not here is looking at nothing, which is a 404 rather than
		// an empty log.
		if _, err := s.store.Steps(tape); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				fail(w, http.StatusNotFound, "no recording %s", tape)
				return
			}
			fail(w, http.StatusInternalServerError, "the recording could not be read: %v", err)
			return
		}
	}
	list, err := s.store.Messages(tape, after)
	if err != nil {
		fail(w, http.StatusInternalServerError, "the messages could not be read: %v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": list})
}

// post writes one line: into the lobby, onto a recording, or anchored at a step
// of one — as the player the token names, which is the only byline a line
// carries any more.
//
// The anchor is the part that needs checking rather than reading. A playback can
// only ever reach the steps of the run it is playing, so a line at step 4000 of a
// run 3000 steps long is a mistake rather than a message — it would be a line
// no playback ever showed, and every window would have to decide for itself what
// to do with it. The lobby has no timeline at all, so a line in it is about the
// lobby.
func (s *Server) post(w http.ResponseWriter, r *http.Request) {
	user, ok := s.userOf(w, r)
	if !ok {
		return
	}
	if err := s.store.UpsertUser(user.ID, user.Nick, user.Icon, s.now().UnixMilli()); err != nil {
		fail(w, http.StatusInternalServerError, "%v", err)
		return
	}
	var body struct {
		Tape   string       `json:"tape"`
		AtStep *int         `json:"at_step"`
		Ghost  bool         `json:"ghost"`
		Parts  []store.Part `json:"parts"`
	}
	if err := readJSON(w, r, &body); err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	tape := strings.TrimSpace(body.Tape)
	switch {
	case tape == "" && body.AtStep != nil:
		fail(w, http.StatusBadRequest, "a line with no recording has no step to sit at")
		return
	case tape != "":
		steps, err := s.store.Steps(tape)
		if errors.Is(err, store.ErrNotFound) {
			fail(w, http.StatusNotFound, "no recording %s", tape)
			return
		}
		if err != nil {
			fail(w, http.StatusInternalServerError, "the recording could not be read: %v", err)
			return
		}
		if body.AtStep != nil && (*body.AtStep < 0 || *body.AtStep > steps) {
			fail(w, http.StatusBadRequest,
				"the run is %d steps long, so step %d is a moment no playback reaches", steps, *body.AtStep)
			return
		}
	}
	parts, err := cleanParts(body.Parts)
	if err != nil {
		fail(w, http.StatusBadRequest, "%v", err)
		return
	}
	message := store.Message{
		Tape:   tape,
		AtStep: body.AtStep,
		UserID: user.ID,
		Nick:   user.Nick,
		Icon:   user.Icon,
		Ghost:  body.Ghost,
		Parts:  parts,
		SentMs: s.now().UnixMilli(),
	}
	written, err := s.store.AddMessage(message)
	if err != nil {
		fail(w, http.StatusInternalServerError, "the message could not be written: %v", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"message": written})
}

// cleanParts is a body off the wire, checked as it is read: a handful of parts,
// each of them either a run of text or a gif.
//
// The two kinds are the two the window draws (`MessagePart` in
// `frontend/src/chat/messages.ts`), and a part of any other kind is a message
// nobody could draw — so it is refused here rather than stored and skipped
// there. A gif is named by its path under the app rather than by any file the
// caller's machine may have: the window draws what the app ships.
//
// A part may be empty of text — a gif is often the whole of what somebody had to
// say — but a body may not be empty of parts: a line with nothing in it is a
// mistake, and this is the last place that can say so.
func cleanParts(parts []store.Part) ([]store.Part, error) {
	if len(parts) == 0 {
		return nil, errors.New("a message has to have something in it")
	}
	if len(parts) > maxParts {
		return nil, fmt.Errorf("a message is up to %d parts; this one has %d", maxParts, len(parts))
	}
	clean := make([]store.Part, 0, len(parts))
	for i, part := range parts {
		switch part.Kind {
		case "text":
			if len(part.Text) > maxText {
				return nil, fmt.Errorf("part %d is %d characters; a run of text is up to %d",
					i+1, len(part.Text), maxText)
			}
			clean = append(clean, store.Part{Kind: "text", Text: part.Text})
		case "gif":
			file := strings.TrimSpace(part.File)
			if file == "" || len(file) > maxFile {
				return nil, fmt.Errorf("part %d is a gif with no picture in it", i+1)
			}
			if len(part.Alt) > maxAlt {
				return nil, fmt.Errorf("part %d says %d characters about its gif; a description is up to %d",
					i+1, len(part.Alt), maxAlt)
			}
			clean = append(clean, store.Part{Kind: "gif", File: file, Alt: part.Alt})
		default:
			return nil, fmt.Errorf("part %d is a %q, and a message is made of text and gifs", i+1, part.Kind)
		}
	}
	return clean, nil
}
