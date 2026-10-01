// These tests are the API as a browser meets it: a real server on a real socket
// and the answers read the way the window reads them.
//
// Nothing here is mocked. The store is a database in the test's own directory
// (`t.TempDir`), the clock stands still so that two lines can be compared, and
// the ids are handed out in order — which is what lets a test talk about "the
// first recording" without having to ask for it.
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"garden/backend/internal/store"
)

// tape is a run of the world as the game writes one (`Tape` in
// `frontend/src/game/tape.ts`): short, but with every part of the format
// anything reads — the header, a stage, two frames and a pause.
func tape() string {
	return `{"format":"garden-tape/2","step":20,"steps":150,"seed":42,` +
		`"stage":{"engine":{"speed":1,"gravity":0.1,"fric":0.99,"clamp":true},"dolls":[],"ropes":[]},` +
		`"frames":[[1,2,3],[0,0,0],5],"edits":[[0,"doll","a","Аня","a"]]}`
}

// uploadBody is the body a recording arrives in: the name, the author, when it
// was played, and the tape nested in it as the game writes it.
func uploadBody(name, author string) string {
	return `{"name":"` + name + `","author":"` + author + `",` +
		`"recorded_ms":1700000000000,"tape":` + tape() + `}`
}

// hall is a server of its own and the client that speaks to it. Every test is a
// hall, so no two of them can see each other's chat.
type hall struct {
	t      *testing.T
	server *httptest.Server
	client *http.Client
}

func newHall(t *testing.T) *hall {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "chat.db"))
	if err != nil {
		t.Fatalf("open the database: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	// A clock that stands still, and a counter instead of randomness: an answer
	// that carries a time or a name is then a value a test can write down.
	clock := time.UnixMilli(1_700_000_000_000)
	ids := 0
	server := httptest.NewServer(New(st,
		WithClock(func() time.Time { return clock }),
		WithIDs(func() string { ids++; return "id-" + string(rune('0'+ids)) })))
	t.Cleanup(server.Close)
	return &hall{t: t, server: server, client: server.Client()}
}

// call is one request and the answer to it: the status and the body.
type call struct {
	status int
	body   []byte
}

// do is a request to the hall. A string body is sent as it is — the tests about
// a body being malformed need that — and anything else is encoded for them.
func (h *hall) do(client *http.Client, method, path string, body any) call {
	h.t.Helper()
	var in io.Reader
	switch wrote := body.(type) {
	case nil:
	case string:
		in = strings.NewReader(wrote)
	default:
		encoded, err := json.Marshal(wrote)
		if err != nil {
			h.t.Fatalf("encode the body: %v", err)
		}
		in = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, h.server.URL+path, in)
	if err != nil {
		h.t.Fatalf("build the request: %v", err)
	}
	request.Header.Set("content-type", "application/json")
	answer, err := client.Do(request)
	if err != nil {
		h.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer answer.Body.Close()
	raw, err := io.ReadAll(answer.Body)
	if err != nil {
		h.t.Fatalf("read the answer to %s %s: %v", method, path, err)
	}
	return call{status: answer.StatusCode, body: raw}
}

// read is an answer as one of the API's own shapes, decoded the way the window
// would decode it.
func read[T any](t *testing.T, c call) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(c.body, &value); err != nil {
		t.Fatalf("the answer is not JSON (%v): %s", err, c.body)
	}
	return value
}

// The API's answers, in the shapes the tests below read them by.
type (
	recordings struct {
		Recordings []store.Recording `json:"recordings"`
	}
	recordingAnswer struct {
		Recording store.Recording `json:"recording"`
	}
	messages struct {
		Messages []store.Message `json:"messages"`
	}
	messageAnswer struct {
		Message store.Message `json:"message"`
	}
	refusal struct {
		Error string `json:"error"`
	}
)

// messageBody is a line as it is posted: the fields the API reads, and no more.
type messageBody struct {
	Tape   string       `json:"tape"`
	AtStep *int         `json:"at_step"`
	Nick   string       `json:"nick"`
	Badge  string       `json:"badge"`
	Ghost  bool         `json:"ghost"`
	Parts  []store.Part `json:"parts"`
}

// text is a body of one run of text, which is the whole of what the player's
// field produces (`frontend/src/chat/messages.ts`).
func text(said string) []store.Part {
	return []store.Part{{Kind: "text", Text: said}}
}

// uploaded puts one run on the wall and answers with it, for the tests that are
// about the chat rather than about the upload.
func (h *hall) uploaded(client *http.Client) store.Recording {
	h.t.Helper()
	c := h.do(client, "POST", "/api/recordings", uploadBody("Вечер", "Марго"))
	if c.status != http.StatusCreated {
		h.t.Fatalf("upload: %d %s, want 201", c.status, c.body)
	}
	return read[recordingAnswer](h.t, c).Recording
}

func TestHealthAnswers(t *testing.T) {
	h := newHall(t)
	c := h.do(h.client, "GET", "/api/health", nil)
	if c.status != http.StatusOK {
		t.Fatalf("health: %d, want 200", c.status)
	}
	if got := read[map[string]bool](t, c); !got["ok"] {
		t.Fatalf("health answered %s", c.body)
	}
}

func TestUploadKeepsTheTapeWordForWord(t *testing.T) {
	h := newHall(t)
	c := h.do(h.client, "POST", "/api/recordings", uploadBody("Вечер", "Марго"))
	if c.status != http.StatusCreated {
		t.Fatalf("upload: %d %s, want 201", c.status, c.body)
	}
	saved := read[recordingAnswer](t, c).Recording
	if saved.ID == "" || saved.Steps != 150 || saved.StepMs != 20 || saved.Seed != 42 {
		t.Fatalf("the recording came back as %+v", saved)
	}
	if saved.Name != "Вечер" || saved.Author != "Марго" || saved.RecordedMs != 1_700_000_000_000 {
		t.Fatalf("the recording came back as %+v", saved)
	}
	if saved.UploadedMs != 1_700_000_000_000 {
		t.Fatalf("uploaded at %d, want the clock's own 1700000000000", saved.UploadedMs)
	}

	// The tape comes back exactly as it went in: the game's decoder is what reads
	// it, and a byte of difference is a different run.
	back := h.do(h.client, "GET", "/api/recordings/"+saved.ID, nil)
	if back.status != http.StatusOK {
		t.Fatalf("the tape: %d, want 200", back.status)
	}
	if string(back.body) != tape() {
		t.Fatalf("the tape came back changed:\n got %s\nwant %s", back.body, tape())
	}

	list := read[recordings](t, h.do(h.client, "GET", "/api/recordings", nil)).Recordings
	if len(list) != 1 || list[0].ID != saved.ID {
		t.Fatalf("the list holds %d recordings: %+v", len(list), list)
	}
	if missing := h.do(h.client, "GET", "/api/recordings/nothing", nil); missing.status != http.StatusNotFound {
		t.Fatalf("a tape that is not there: %d, want 404", missing.status)
	}
}

func TestUploadRefusesARunThatCouldNotBePlayed(t *testing.T) {
	h := newHall(t)
	for _, bad := range []struct {
		why  string
		tape string
	}{
		{"another format", `{"format":"garden-tape/3","step":20,"steps":10,"seed":1,` +
			`"stage":{},"frames":[],"edits":[]}`},
		{"another step", `{"format":"garden-tape/2","step":16,"steps":10,"seed":1,` +
			`"stage":{},"frames":[],"edits":[]}`},
		{"no steps at all", `{"format":"garden-tape/2","step":20,"steps":0,"seed":1,` +
			`"stage":{},"frames":[],"edits":[]}`},
		{"no frames", `{"format":"garden-tape/2","step":20,"steps":10,"seed":1,"stage":{},"frames":[]}`},
		{"no stage", `{"format":"garden-tape/2","step":20,"steps":10,"seed":1,"frames":[],"edits":[]}`},
		{"not JSON", `{`},
	} {
		body := `{"name":"Прогон","author":"Марго","recorded_ms":1,"tape":` + bad.tape + `}`
		c := h.do(h.client, "POST", "/api/recordings", body)
		if c.status != http.StatusBadRequest {
			t.Fatalf("a tape of %s: %d %s, want 400", bad.why, c.status, c.body)
		}
		if said := read[refusal](t, c).Error; said == "" {
			t.Fatalf("a tape of %s was refused without saying why", bad.why)
		}
	}
	// A run with no name is a row the list could not draw, so it is refused too.
	nameless := `{"name":"   ","author":"Марго","recorded_ms":1,"tape":` + tape() + `}`
	if c := h.do(h.client, "POST", "/api/recordings", nameless); c.status != http.StatusBadRequest {
		t.Fatalf("a nameless recording: %d %s, want 400", c.status, c.body)
	}
	// And an author who did not say who they are is still an author.
	c := h.do(h.client, "POST", "/api/recordings", `{"name":"Прогон","recorded_ms":1,"tape":`+tape()+`}`)
	if c.status != http.StatusCreated {
		t.Fatalf("an anonymous upload: %d %s, want 201", c.status, c.body)
	}
	if author := read[recordingAnswer](t, c).Recording.Author; author == "" {
		t.Fatal("an anonymous recording came back with no author at all")
	}
}

func TestLinesGoIntoTheLobbyOrOntoARun(t *testing.T) {
	h := newHall(t)
	client := h.client
	run := h.uploaded(client)

	lobby := h.do(client, "POST", "/api/messages",
		messageBody{Nick: "Аня", Badge: "badge-anya.gif", Parts: text("кто на сцене?")})
	if lobby.status != http.StatusCreated {
		t.Fatalf("a line in the lobby: %d %s, want 201", lobby.status, lobby.body)
	}
	said := read[messageAnswer](t, lobby).Message
	if said.ID == 0 || said.Tape != "" || said.AtStep != nil {
		t.Fatalf("a lobby line came back as %+v", said)
	}
	if said.SentMs != 1_700_000_000_000 {
		t.Fatalf("sent at %d, want the clock's own 1700000000000", said.SentMs)
	}

	// A line about the run itself, and a line about a moment of it: the two are
	// different places in the same conversation.
	aboutRun := h.do(client, "POST", "/api/messages",
		messageBody{Tape: run.ID, Nick: "Марго", Parts: text("смотрите финал")})
	if aboutRun.status != http.StatusCreated {
		t.Fatalf("a line about the run: %d %s, want 201", aboutRun.status, aboutRun.body)
	}
	whole := read[messageAnswer](t, aboutRun).Message
	if whole.Tape != run.ID || whole.AtStep != nil {
		t.Fatalf("a line about the whole run came back as %+v", whole)
	}
	step := 90
	anchored := h.do(client, "POST", "/api/messages", messageBody{
		Tape: run.ID, AtStep: &step, Nick: "Марго", Badge: "badge-margo.gif", Ghost: true,
		Parts: []store.Part{{Kind: "gif", File: "assets/chat/heart.gif", Alt: "сердечко"}},
	})
	if anchored.status != http.StatusCreated {
		t.Fatalf("an anchored line: %d %s, want 201", anchored.status, anchored.body)
	}
	moment := read[messageAnswer](t, anchored).Message
	if moment.AtStep == nil || *moment.AtStep != 90 {
		t.Fatalf("an anchored line sits at %v, want 90", moment.AtStep)
	}
	if !moment.Ghost || moment.Parts[0].Kind != "gif" || moment.Parts[0].Alt != "сердечко" {
		t.Fatalf("an anchored line came back as %+v", moment)
	}

	// The two conversations are one table and two answers: the lobby holds the
	// lobby's line, and the run holds its own two.
	room := read[messages](t, h.do(client, "GET", "/api/messages", nil)).Messages
	if len(room) != 1 || room[0].ID != said.ID {
		t.Fatalf("the lobby holds %d lines: %+v", len(room), room)
	}
	onRun := read[messages](t, h.do(client, "GET", "/api/messages?tape="+run.ID, nil)).Messages
	if len(onRun) != 2 || onRun[0].ID != whole.ID || onRun[1].ID != moment.ID {
		t.Fatalf("the run holds %d lines: %+v", len(onRun), onRun)
	}
	// Catching up: what a window that has drawn everything up to a line asks for
	// next is the lines after it, and nothing it already has.
	catchUp := read[messages](t, h.do(client, "GET",
		fmt.Sprintf("/api/messages?tape=%s&after=%d", run.ID, whole.ID), nil)).Messages
	if len(catchUp) != 1 || catchUp[0].ID != moment.ID {
		t.Fatalf("catching up after the first of two lines gave %d lines", len(catchUp))
	}
	if c := h.do(client, "GET", "/api/messages?tape=nothing", nil); c.status != http.StatusNotFound {
		t.Fatalf("the log of a recording that is not here: %d, want 404", c.status)
	}
}

func TestPostRefusesWhatNoPlaybackCouldShow(t *testing.T) {
	h := newHall(t)
	client := h.client
	run := h.uploaded(client)
	last, past, before := run.Steps, run.Steps+1, -1

	for _, bad := range []struct {
		why  string
		body any
	}{
		{"a step with no recording", messageBody{AtStep: &last, Nick: "Аня", Parts: text("тут")}},
		{"a step past the end of the run", messageBody{Tape: run.ID, AtStep: &past, Nick: "Аня", Parts: text("тут")}},
		{"a step before the run began", messageBody{Tape: run.ID, AtStep: &before, Nick: "Аня", Parts: text("тут")}},
		{"no nickname", messageBody{Parts: text("тут")}},
		{"no body at all", messageBody{Nick: "Аня"}},
		{"a part of another kind", messageBody{Nick: "Аня", Parts: []store.Part{{Kind: "video", File: "a.mp4"}}}},
		{"a gif with no picture", messageBody{Nick: "Аня", Parts: []store.Part{{Kind: "gif", Alt: "сердечко"}}}},
		{"a nickname longer than a nickname",
			messageBody{Nick: strings.Repeat("я", maxNick+1), Parts: text("тут")}},
		{"a body that is not JSON", "["},
	} {
		c := h.do(client, "POST", "/api/messages", bad.body)
		if c.status != http.StatusBadRequest {
			t.Fatalf("a line of %s: %d %s, want 400", bad.why, c.status, c.body)
		}
		if said := read[refusal](t, c).Error; said == "" {
			t.Fatalf("a line of %s was refused without saying why", bad.why)
		}
	}

	// A recording that is not here is a 404 rather than a bad request: the line
	// is fine, and the run is what is missing.
	missing := h.do(client, "POST", "/api/messages", messageBody{Tape: "nothing", Nick: "Аня", Parts: text("тут")})
	if missing.status != http.StatusNotFound {
		t.Fatalf("a line on a recording that is not here: %d %s, want 404", missing.status, missing.body)
	}
	// The last step of a run is a moment a playback does reach, so the end of a
	// tape is a place a line can sit.
	accepted := h.do(client, "POST", "/api/messages",
		messageBody{Tape: run.ID, AtStep: &last, Nick: "Аня", Parts: text("финал")})
	if accepted.status != http.StatusCreated {
		t.Fatalf("a line at the last step: %d %s, want 201", accepted.status, accepted.body)
	}
	// An empty run of text is a body still — a gif is often the whole of what
	// somebody had to say — and it is stored as it was written.
	empty := h.do(client, "POST", "/api/messages",
		messageBody{Nick: "Аня", Parts: []store.Part{{Kind: "text", Text: ""}}})
	if empty.status != http.StatusCreated {
		t.Fatalf("a line with an empty run of text: %d %s, want 201", empty.status, empty.body)
	}
}

// headBody is a run that is opened rather than uploaded: its name, its author,
// and the head of the tape it will be — the four things a tape says about
// itself, and none of what its slices carry.
func headBody(name, author string) string {
	return `{"name":"` + name + `","author":"` + author + `","recorded_ms":1700000000000,` +
		`"head":{"format":"garden-tape/2","step":20,"seed":42,"stage":{"engine":{"speed":1,"gravity":0.0011,"fric":0.9993,"clamp":true},"doll":"marionette"}}}`
}

// sliceBody is a few seconds of a live run as the recorder writes it.
func sliceBody(seq, steps int, frames, edits string, last bool) string {
	return fmt.Sprintf(`{"seq":%d,"steps":%d,"frames":%s,"edits":%s,"last":%t}`,
		seq, steps, frames, edits, last)
}

// live opens a run that is to arrive in slices and answers with it, for the tests
// that are about what happens as it is played.
func (h *hall) live(client *http.Client) store.Recording {
	h.t.Helper()
	c := h.do(client, "POST", "/api/recordings/live", headBody("Живой", "Марго"))
	if c.status != http.StatusCreated {
		h.t.Fatalf("open a live run: %d %s, want 201", c.status, c.body)
	}
	return read[recordingAnswer](h.t, c).Recording
}

// stream is a live run as one viewer is handed it, and played is one of its
// tapes as a playback reads it.
type (
	stream struct {
		Recording store.Recording `json:"recording"`
		Head      json.RawMessage `json:"head"`
		Chunks    []store.Chunk   `json:"chunks"`
	}
	played struct {
		Format string            `json:"format"`
		Steps  int               `json:"steps"`
		Seed   int64             `json:"seed"`
		Stage  json.RawMessage   `json:"stage"`
		Frames []json.RawMessage `json:"frames"`
		Edits  []json.RawMessage `json:"edits"`
	}
)

func TestARunThatIsBeingPlayedArrivesInSlices(t *testing.T) {
	h := newHall(t)
	client := h.client

	opened := h.live(client)
	// A run that has just been opened has a name, a head and no length at all:
	// nothing has been played yet, and the list says so.
	if opened.Steps != 0 || !opened.Live || opened.Seed != 42 || opened.StepMs != 20 {
		t.Fatalf("a run that has just been opened came back as %+v", opened)
	}
	if list := read[recordings](t, h.do(client, "GET", "/api/recordings", nil)).Recordings; len(list) != 1 || !list[0].Live {
		t.Fatalf("the list of a run being played: %+v", list)
	}

	// The first few seconds of play, and the run is longer by them.
	first := h.do(client, "POST", "/api/recordings/"+opened.ID+"/chunks",
		sliceBody(0, 60, `[[0,0,0]]`, `[[0,"doll","a","Аня","a"]]`, false))
	if first.status != http.StatusOK {
		t.Fatalf("the first slice: %d %s, want 200", first.status, first.body)
	}
	if grew := read[recordingAnswer](t, first).Recording; grew.Steps != 60 || !grew.Live {
		t.Fatalf("after a slice of 60 steps: %+v", grew)
	}

	// A window that has just arrived is handed the head and every slice there
	// is — which is how a run that began before it arrived is still watched
	// from the run's own beginning.
	watching := read[stream](t, h.do(client, "GET", "/api/recordings/"+opened.ID+"/chunks", nil))
	if len(watching.Chunks) != 1 || watching.Chunks[0].Seq != 0 || watching.Chunks[0].Steps != 60 {
		t.Fatalf("a viewer with no slices is handed %+v", watching.Chunks)
	}
	if !strings.Contains(string(watching.Head), `"seed":42`) {
		t.Fatalf("the head came back as %s", watching.Head)
	}
	if !watching.Recording.Live || watching.Recording.Steps != 60 {
		t.Fatalf("the run came back with the slices as %+v", watching.Recording)
	}
	// A window that has the first slice asks for what is after it.
	caught := read[stream](t, h.do(client, "GET", "/api/recordings/"+opened.ID+"/chunks?after=0", nil))
	if len(caught.Chunks) != 0 {
		t.Fatalf("a viewer that has slice 0 is handed %+v, want none", caught.Chunks)
	}

	// The last slice ends the run, and the tape is the head and the slices read
	// as one file, so a playback of it reads the records in the order they
	// happened.
	last := h.do(client, "POST", "/api/recordings/"+opened.ID+"/chunks",
		sliceBody(1, 90, `[[4,5,6],[7,8,9]]`, `[[50,"doll","a","Аня","a"]]`, true))
	if last.status != http.StatusOK {
		t.Fatalf("the last slice: %d %s, want 200", last.status, last.body)
	}
	if ended := read[recordingAnswer](t, last).Recording; ended.Steps != 150 || ended.Live {
		t.Fatalf("after the last slice: %+v", ended)
	}
	whole := h.do(client, "GET", "/api/recordings/"+opened.ID, nil)
	if whole.status != http.StatusOK {
		t.Fatalf("the tape of a run played in slices: %d %s, want 200", whole.status, whole.body)
	}
	assembled := read[played](t, whole)
	if assembled.Format != "garden-tape/2" || assembled.Steps != 150 || assembled.Seed != 42 {
		t.Fatalf("the assembled tape came back as %+v (from %s)", assembled, whole.body)
	}
	if len(assembled.Stage) == 0 || len(assembled.Frames) != 3 || len(assembled.Edits) != 2 {
		t.Fatalf("the body of the assembled tape: %+v (from %s)", assembled, whole.body)
	}

	// The run is over, so a slice arriving now is refused — and so is one of a
	// run that was uploaded whole, which was over before it arrived.
	late := h.do(client, "POST", "/api/recordings/"+opened.ID+"/chunks", sliceBody(2, 20, `[]`, `[]`, false))
	if late.status != http.StatusConflict {
		t.Fatalf("a slice after the last one: %d %s, want 409", late.status, late.body)
	}
	uploaded := h.uploaded(client)
	sealed := h.do(client, "POST", "/api/recordings/"+uploaded.ID+"/chunks", sliceBody(0, 20, `[]`, `[]`, false))
	if sealed.status != http.StatusConflict {
		t.Fatalf("a slice of a run uploaded whole: %d %s, want 409", sealed.status, sealed.body)
	}
	// A run that is not here is not here however it is asked about.
	if missing := h.do(client, "POST", "/api/recordings/nothing/chunks", sliceBody(0, 20, `[]`, `[]`, false)); missing.status != http.StatusNotFound {
		t.Fatalf("a slice of no run: %d, want 404", missing.status)
	}
	if none := h.do(client, "GET", "/api/recordings/nothing/chunks", nil); none.status != http.StatusNotFound {
		t.Fatalf("the slices of no run: %d, want 404", none.status)
	}
}

func TestAnOpenedRunRefusesAHeadThatCouldNotBecomeATape(t *testing.T) {
	h := newHall(t)
	for _, bad := range []struct {
		why  string
		body string
	}{
		{"another format", `{"name":"Прогон","head":{"format":"garden-tape/3","step":20,"seed":1,"stage":{}}}`},
		{"another step", `{"name":"Прогон","head":{"format":"garden-tape/2","step":16,"seed":1,"stage":{}}}`},
		{"no stage", `{"name":"Прогон","head":{"format":"garden-tape/2","step":20,"seed":1}}`},
		{"a length in the head", `{"name":"Прогон","head":{"format":"garden-tape/2","step":20,"seed":1,"stage":{},"steps":10}}`},
		{"frames in the head", `{"name":"Прогон","head":{"format":"garden-tape/2","step":20,"seed":1,"stage":{},"frames":[]}}`},
		{"no head at all", `{"name":"Прогон"}`},
		{"no name", `{"head":{"format":"garden-tape/2","step":20,"seed":1,"stage":{}}}`},
		{"not JSON", `{`},
	} {
		c := h.do(h.client, "POST", "/api/recordings/live", bad.body)
		if c.status != http.StatusBadRequest {
			t.Fatalf("a run of %s: %d %s, want 400", bad.why, c.status, c.body)
		}
		if said := read[refusal](t, c).Error; said == "" {
			t.Fatalf("a run of %s was refused without saying why", bad.why)
		}
	}
	// A head that could: a run with nothing in it yet, and a name on the wall.
	c := h.do(h.client, "POST", "/api/recordings/live", headBody("Живой", "Марго"))
	if c.status != http.StatusCreated {
		t.Fatalf("a run opened: %d %s, want 201", c.status, c.body)
	}
	if opened := read[recordingAnswer](t, c).Recording; opened.Author != "Марго" || !opened.Live {
		t.Fatalf("the run came back as %+v", opened)
	}
	// One whose author said nothing is anonymous, like a whole upload's.
	quiet := h.do(h.client, "POST", "/api/recordings/live",
		`{"name":"Живой","head":{"format":"garden-tape/2","step":20,"seed":1,"stage":{}}}`)
	if quiet.status != http.StatusCreated {
		t.Fatalf("an anonymous live run: %d %s, want 201", quiet.status, quiet.body)
	}
	if author := read[recordingAnswer](t, quiet).Recording.Author; author == "" {
		t.Fatal("an anonymous live run came back with no author at all")
	}
}

func TestAnEndingThatOwesNothingIsStillAnEnding(t *testing.T) {
	h := newHall(t)
	client := h.client
	run := h.live(client)
	// The run's whole few seconds go out in one slice.
	if c := h.do(client, "POST", "/api/recordings/"+run.ID+"/chunks",
		sliceBody(0, 40, `[[1,2,3]]`, `[]`, false)); c.status != http.StatusOK {
		t.Fatalf("the only slice: %d %s, want 200", c.status, c.body)
	}
	// A slice with nothing in it that ends nothing is a mistake: an empty slice
	// says one thing, and it is said only by the last one.
	if c := h.do(client, "POST", "/api/recordings/"+run.ID+"/chunks",
		sliceBody(1, 0, `[]`, `[]`, false)); c.status != http.StatusBadRequest {
		t.Fatalf("an empty slice that ends nothing: %d, want 400", c.status)
	}
	// The ending arrives with nothing in it but the word that the run is over — a
	// page closed a moment after its last second went out — and the word is the
	// payload: the run ends, as long as it was, and is not held open by the grace
	// for want of anything to carry the ending.
	if c := h.do(client, "POST", "/api/recordings/"+run.ID+"/chunks",
		sliceBody(1, 0, `[]`, `[]`, true)); c.status != http.StatusOK {
		t.Fatalf("an ending with nothing in it: %d %s, want 200", c.status, c.body)
	}
	// The word added nothing: the run is as long as its one slice made it, and
	// the list no longer calls it live.
	list := read[recordings](t, h.do(client, "GET", "/api/recordings", nil)).Recordings
	if len(list) != 1 || list[0].Live || list[0].Steps != 40 {
		t.Fatalf("after an empty ending the list reads %+v", list)
	}
}

func TestASliceThatIsNotASlice(t *testing.T) {
	h := newHall(t)
	run := h.live(h.client)
	for _, bad := range []struct {
		why  string
		body string
	}{
		{"no number", `{"steps":20,"frames":[],"edits":[]}`},
		{"a number of its own choosing", `{"seq":-1,"steps":20,"frames":[],"edits":[]}`},
		{"no steps", `{"seq":0,"steps":0,"frames":[],"edits":[]}`},
		{"frames that are not a list", `{"seq":0,"steps":20,"frames":{},"edits":[]}`},
		{"edits that are not a list", `{"seq":0,"steps":20,"frames":[],"edits":"no"}`},
		{"not JSON", `{`},
	} {
		c := h.do(h.client, "POST", "/api/recordings/"+run.ID+"/chunks", bad.body)
		if c.status != http.StatusBadRequest {
			t.Fatalf("a slice of %s: %d %s, want 400", bad.why, c.status, c.body)
		}
	}
	// A slice that says nothing about its frames or its edits is a few
	// seconds in which nothing happened, which is a slice like any other.
	c := h.do(h.client, "POST", "/api/recordings/"+run.ID+"/chunks", `{"seq":0,"steps":20}`)
	if c.status != http.StatusOK {
		t.Fatalf("a slice with nothing in it: %d %s, want 200", c.status, c.body)
	}
	if said := read[recordingAnswer](t, c).Recording; said.Steps != 20 {
		t.Fatalf("after a slice that says nothing of its own: %+v", said)
	}
	// The same slice under the same number again is the same few seconds: a
	// player that never saw the answer sends it again, and the run does not
	// grow twice.
	again := h.do(h.client, "POST", "/api/recordings/"+run.ID+"/chunks",
		sliceBody(0, 20, `[[1,2,3]]`, `[]`, false))
	if again.status != http.StatusOK {
		t.Fatalf("the same slice again: %d %s, want 200", again.status, again.body)
	}
	if said := read[recordingAnswer](t, again).Recording; said.Steps != 20 {
		t.Fatalf("a slice sent twice left the run %d steps long, want 20", said.Steps)
	}
	// `after` is the number of a slice too, and one that is not a number is
	// refused rather than read as none.
	if c := h.do(h.client, "GET", "/api/recordings/"+run.ID+"/chunks?after=soon", nil); c.status != http.StatusBadRequest {
		t.Fatalf("after=soon: %d, want 400", c.status)
	}
}
