package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

// now is a moment after every recording these tests write and after every slice
// they send, so that a run that nobody is playing is not called live by accident.
const now = 1_900_000_000_000

// tape is a tape that never goes through the API: the store writes what it is
// given and reads it back whole, so all a test needs of one is that it is
// recognisable and that it is long enough to notice a byte of it going missing.
func tape() string {
	return `{"format":"garden-tape/2","step":20,"steps":150,"seed":42,` +
		`"stage":{"doll":"marionette"},"frames":[[1,2,3],[0,0,0],5],"edits":[[0,"doll","a","Аня","a"]]}`
}

// open is a store on a file of its own, in this test's own directory: a chat is
// a database, and no two tests should be able to see each other's.
func open(t *testing.T) *Store {
	t.Helper()
	st, err := Open(filepath.Join(t.TempDir(), "chat.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

// player writes one of the site's own players down, the way the door does
// (`UpsertUser`): these tests' players are Марго (id 9, no userpic — the minus
// file) and Аня (id 7, userpic 7.gif).
func player(t *testing.T, st *Store, id int64, nick, icon string) {
	t.Helper()
	if err := st.UpsertUser(id, nick, icon, 1_700_000_000_000); err != nil {
		t.Fatalf("write %s down: %v", nick, err)
	}
}

// margo and anya are the two players the tests below play as.
func margo(t *testing.T, st *Store) { player(t, st, 9, "Марго", "-") }
func anya(t *testing.T, st *Store)  { player(t, st, 7, "Аня", "7") }

// recording is one run, named and of a known length, played by Марго on the
// store it is given.
func recording(t *testing.T, st *Store, id string, steps int) Recording {
	t.Helper()
	margo(t, st)
	saved, err := st.SaveRecording(Recording{
		ID:         id,
		Name:       "Прогон " + id,
		AuthorID:   9,
		Author:     "Марго",
		Steps:      steps,
		StepMs:     20,
		Seed:       42,
		Bytes:      len(tape()),
		RecordedMs: 1_700_000_000_000,
		UploadedMs: 1_700_000_100_000,
	}, tape())
	if err != nil {
		t.Fatalf("save %s: %v", id, err)
	}
	return saved
}

// head is the head of a live run's tape: the four things a tape says about
// itself, which is all a run has when it starts.
func head() string {
	return `{"format":"garden-tape/2","step":20,"seed":42,"stage":{"doll":"marionette"}}`
}

// live is a run that is being played, opened on the store it is given by Марго:
// a name and a head, and no steps until a slice arrives.
func live(t *testing.T, st *Store, id string, at int64) Recording {
	t.Helper()
	margo(t, st)
	opened, err := st.OpenRecording(Recording{
		ID:         id,
		Name:       "Прогон " + id,
		AuthorID:   9,
		Author:     "Марго",
		StepMs:     20,
		Seed:       42,
		RecordedMs: 1_700_000_000_000,
		UploadedMs: at,
	}, head(), at)
	if err != nil {
		t.Fatalf("open %s: %v", id, err)
	}
	return opened
}

// slice is one slice of a run, as the recorder of one writes it: the steps it
// covers, its frames and its edits.
func slice(seq, steps int, frames, edits string) Chunk {
	return Chunk{Seq: seq, Steps: steps, Frames: json.RawMessage(frames), Edits: json.RawMessage(edits)}
}

func TestStoreReadsBackTheTapeItWasGiven(t *testing.T) {
	st := open(t)
	recording(t, st, "run-1", 150)

	got, err := st.Tape("run-1")
	if err != nil {
		t.Fatalf("tape: %v", err)
	}
	if got != tape() {
		t.Fatalf("the tape came back changed:\n got %s\nwant %s", got, tape())
	}
	steps, err := st.Steps("run-1")
	if err != nil {
		t.Fatalf("steps: %v", err)
	}
	if steps != 150 {
		t.Fatalf("steps = %d, want 150", steps)
	}
}

func TestStoreSaysWhatIsNotThere(t *testing.T) {
	st := open(t)
	if _, err := st.Tape("nothing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("tape of nothing: %v, want ErrNotFound", err)
	}
	if _, err := st.Steps("nothing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("steps of nothing: %v, want ErrNotFound", err)
	}
}

func TestRecordingsAreNewestFirst(t *testing.T) {
	st := open(t)
	if list, err := st.Recordings(now); err != nil || len(list) != 0 {
		t.Fatalf("an empty hall: %v, %d recordings, want none and no error", err, len(list))
	}
	recording(t, st, "old", 10)
	anya(t, st)
	saved, err := st.SaveRecording(Recording{
		ID: "new", Name: "Последний", AuthorID: 7, Author: "Аня", Steps: 300, StepMs: 20,
		Seed: 7, Bytes: 12, RecordedMs: 1_700_000_200_000, UploadedMs: 1_700_000_200_000,
	}, `{"a":1}`)
	if err != nil {
		t.Fatalf("save new: %v", err)
	}
	list, err := st.Recordings(now)
	if err != nil {
		t.Fatalf("recordings: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("%d recordings, want 2", len(list))
	}
	if list[0].ID != "new" || list[1].ID != "old" {
		t.Fatalf("the list is %s, %s; want new first", list[0].ID, list[1].ID)
	}
	if seconds := saved.Seconds(); seconds != 6 {
		t.Fatalf("300 steps of 20 ms is %v seconds, want 6", seconds)
	}
}

// say is one line written by hand, so that the tests below are about the log
// rather than about the API's own checks (`internal/api` has those).
func say(t *testing.T, st *Store, m Message) Message {
	t.Helper()
	written, err := st.AddMessage(m)
	if err != nil {
		t.Fatalf("say: %v", err)
	}
	return written
}

func TestMessagesAreOneLogPerConversation(t *testing.T) {
	st := open(t)
	recording(t, st, "run-1", 150)
	anya(t, st)

	lobby := say(t, st, Message{UserID: 7, Parts: []Part{{Kind: "text", Text: "кто на сцене?"}}, SentMs: 1})
	onRun := say(t, st, Message{Tape: "run-1", UserID: 9,
		Parts: []Part{{Kind: "text", Text: "я"}}, SentMs: 2})
	step := 90
	atStep := say(t, st, Message{Tape: "run-1", AtStep: &step, UserID: 9,
		Parts: []Part{{Kind: "gif", File: "assets/chat/heart.gif", Alt: "сердечко"}}, SentMs: 3})

	if onRun.ID <= lobby.ID || atStep.ID <= onRun.ID {
		t.Fatalf("the ids are %d, %d, %d; want them in the order they were written",
			lobby.ID, onRun.ID, atStep.ID)
	}

	lobbyLines, err := st.Messages("", 0)
	if err != nil {
		t.Fatalf("the lobby: %v", err)
	}
	if len(lobbyLines) != 1 || lobbyLines[0].Nick != "Аня" || lobbyLines[0].UserID != 7 {
		t.Fatalf("the lobby holds %d lines, want Аня's one: %+v", len(lobbyLines), lobbyLines)
	}
	// The nick beside the line is the player's own row, not anything carried
	// with the message: a player the site has renamed is renamed here too, the
	// next time anybody reads a line of theirs.
	if err := st.UpsertUser(7, "Аня!", "7", 1_700_000_000_500); err != nil {
		t.Fatalf("rename Аня: %v", err)
	}
	renamed, err := st.Messages("", 0)
	if err != nil {
		t.Fatalf("the lobby again: %v", err)
	}
	if len(renamed) != 1 || renamed[0].Nick != "Аня!" {
		t.Fatalf("a line by a renamed player reads %+v", renamed[0])
	}
	if lobbyLines[0].Tape != "" || lobbyLines[0].AtStep != nil {
		t.Fatalf("a lobby line came back with a recording: %+v", lobbyLines[0])
	}

	runLines, err := st.Messages("run-1", 0)
	if err != nil {
		t.Fatalf("the run: %v", err)
	}
	if len(runLines) != 2 {
		t.Fatalf("the run holds %d lines, want 2", len(runLines))
	}
	if runLines[1].AtStep == nil || *runLines[1].AtStep != 90 {
		t.Fatalf("the anchored line sits at %v, want 90", runLines[1].AtStep)
	}
	if runLines[1].Parts[0].Kind != "gif" || runLines[1].Parts[0].Alt != "сердечко" {
		t.Fatalf("the gif came back as %+v", runLines[1].Parts[0])
	}

	// `after` is what a window that has seen everything up to a line asks for
	// next: the lines written since it, and nothing it has already drawn.
	catchUp, err := st.Messages("run-1", onRun.ID)
	if err != nil {
		t.Fatalf("catching up: %v", err)
	}
	if len(catchUp) != 1 || catchUp[0].ID != atStep.ID {
		t.Fatalf("catching up after %d gave %d lines", onRun.ID, len(catchUp))
	}
}

func TestALiveRunGrowsASliceAtATime(t *testing.T) {
	st := open(t)
	opened := live(t, st, "live-1", 1_700_000_000_000)
	if opened.Steps != 0 || !opened.Live || opened.Bytes != len(head()) {
		t.Fatalf("a run that has just been opened: %+v", opened)
	}

	first, err := st.AppendChunk("live-1", slice(0, 60, `[[1,2,3]]`, `[[0,"doll","a","Аня","a"]]`), false, 1_700_000_001_000)
	if err != nil {
		t.Fatalf("the first slice: %v", err)
	}
	if first.Steps != 60 || !first.Live {
		t.Fatalf("after one slice of 60 steps: %+v", first)
	}
	second, err := st.AppendChunk("live-1", slice(1, 90, `[[4,5,6],[0,0,0]]`, `[]`), true, 1_700_000_002_000)
	if err != nil {
		t.Fatalf("the second slice: %v", err)
	}
	if second.Steps != 150 || second.Live {
		t.Fatalf("after a last slice: %+v", second)
	}
	if second.EndedMs != 1_700_000_002_000 {
		t.Fatalf("the run ended at %d, want the moment its last slice arrived", second.EndedMs)
	}
	// The tape of a run played in slices is its head and its slices read as one
	// file, so a playback of it reads the records in the order they happened.
	body, err := st.Tape("live-1")
	if err != nil {
		t.Fatalf("the tape of a run played in slices: %v", err)
	}
	var assembled struct {
		Format string            `json:"format"`
		Steps  int               `json:"steps"`
		Seed   int64             `json:"seed"`
		Stage  json.RawMessage   `json:"stage"`
		Frames []json.RawMessage `json:"frames"`
		Edits  []json.RawMessage `json:"edits"`
	}
	if err := json.Unmarshal([]byte(body), &assembled); err != nil {
		t.Fatalf("the assembled tape is not a tape: %v\n%s", err, body)
	}
	if assembled.Format != "garden-tape/2" || assembled.Steps != 150 || assembled.Seed != 42 {
		t.Fatalf("the head of the assembled tape: %+v (from %s)", assembled, body)
	}
	if len(assembled.Stage) == 0 || len(assembled.Frames) != 3 || len(assembled.Edits) != 1 {
		t.Fatalf("the body of the assembled tape: %+v (from %s)", assembled, body)
	}
}

func TestASliceSentTwiceLeavesTheRunAsLongAsItIs(t *testing.T) {
	st := open(t)
	live(t, st, "live-1", 1_700_000_000_000)
	one := slice(3, 60, `[[1,2,3]]`, `[]`)
	if _, err := st.AppendChunk("live-1", one, false, 1_700_000_001_000); err != nil {
		t.Fatalf("the slice: %v", err)
	}
	// A player that never saw the answer sends the same slice again under the
	// same number: the run is as long as it is, and as long as it was.
	sent, err := st.AppendChunk("live-1", one, false, 1_700_000_001_500)
	if err != nil {
		t.Fatalf("the same slice again: %v", err)
	}
	if sent.Steps != 60 {
		t.Fatalf("a slice sent twice left the run %d steps long, want 60", sent.Steps)
	}
	stream, err := st.Chunks("live-1", -1, 1_700_000_002_000)
	if err != nil {
		t.Fatalf("chunks: %v", err)
	}
	if len(stream.Chunks) != 1 {
		t.Fatalf("%d slices came back, want the one", len(stream.Chunks))
	}
}

func TestSlicesAreAnsweredAfterTheOneAViewerHas(t *testing.T) {
	st := open(t)
	live(t, st, "live-1", 1_700_000_000_000)
	for seq := 0; seq < 3; seq++ {
		if _, err := st.AppendChunk("live-1", slice(seq, 20, `[]`, `[]`), false, int64(1_700_000_001_000+seq)); err != nil {
			t.Fatalf("slice %d: %v", seq, err)
		}
	}
	whole, err := st.Chunks("live-1", -1, 1_700_000_010_000)
	if err != nil {
		t.Fatalf("chunks: %v", err)
	}
	if string(whole.Head) != head() {
		t.Fatalf("the head came back as %s", whole.Head)
	}
	if !whole.Recording.Live || whole.Recording.Steps != 60 {
		t.Fatalf("a run whose last slice has just arrived: %+v", whole.Recording)
	}
	if len(whole.Chunks) != 3 || whole.Chunks[0].Seq != 0 || whole.Chunks[1].Steps != 20 {
		t.Fatalf("a viewer with no slices is handed %+v, want all three", whole.Chunks)
	}
	// A window that watched up to the second asks for what is after the second.
	catchUp, err := st.Chunks("live-1", 1, 1_700_000_010_000)
	if err != nil {
		t.Fatalf("chunks after 1: %v", err)
	}
	if len(catchUp.Chunks) != 1 || catchUp.Chunks[0].Seq != 2 {
		t.Fatalf("after slice 1 a viewer is handed %+v, want slice 2 alone", catchUp.Chunks)
	}
	// A window asking for something that has not arrived yet is handed nothing
	// rather than an error: the run is simply not there yet.
	none, err := st.Chunks("live-1", 9, 1_700_000_010_000)
	if err != nil {
		t.Fatalf("chunks after 9: %v", err)
	}
	if len(none.Chunks) != 0 {
		t.Fatalf("after slice 9 a viewer is handed %+v, want none", none.Chunks)
	}
}

func TestARunThatStoppedSendingIsNotBeingPlayed(t *testing.T) {
	st := open(t)
	live(t, st, "live-1", 1_700_000_000_000)
	if _, err := st.AppendChunk("live-1", slice(0, 20, `[]`, `[]`), false, 1_700_000_001_000); err != nil {
		t.Fatalf("slice: %v", err)
	}
	list, err := st.Recordings(1_700_000_001_000 + liveGraceMs)
	if err != nil {
		t.Fatalf("recordings: %v", err)
	}
	if list[0].Live {
		t.Fatal("a run that has sent nothing for two minutes is not being played")
	}
	// What it is not is empty: the steps it did send are still there to be
	// watched, which is the point of sending them as they are played.
	if list[0].Steps != 20 {
		t.Fatalf("the run is %d steps long, want the 20 it has", list[0].Steps)
	}
}

func TestASliceOfARunThatTakesNoMoreSlices(t *testing.T) {
	st := open(t)
	recording(t, st, "whole", 150)
	if _, err := st.AppendChunk("whole", slice(0, 20, `[]`, `[]`), false, now); !errors.Is(err, ErrSealed) {
		t.Fatalf("a slice of a run uploaded whole: %v, want ErrSealed", err)
	}
	live(t, st, "live-1", 1_700_000_000_000)
	if _, err := st.AppendChunk("live-1", slice(0, 20, `[]`, `[]`), true, 1_700_000_001_000); err != nil {
		t.Fatalf("the last slice: %v", err)
	}
	if _, err := st.AppendChunk("live-1", slice(1, 20, `[]`, `[]`), false, 1_700_000_002_000); !errors.Is(err, ErrSealed) {
		t.Fatalf("a slice after the last one: %v, want ErrSealed", err)
	}
	if _, err := st.AppendChunk("nothing", slice(0, 20, `[]`, `[]`), false, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a slice of a run that is not here: %v, want ErrNotFound", err)
	}
}

func TestALiveRunWithNothingInItHasNoTapeYet(t *testing.T) {
	st := open(t)
	live(t, st, "live-1", 1_700_000_000_000)
	if _, err := st.Tape("live-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the tape of a run that has played nothing: %v, want ErrNotFound", err)
	}
	if _, err := st.Chunks("nothing", -1, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the slices of a run that is not here: %v, want ErrNotFound", err)
	}
}

// TestADatabaseOfTheOldTapeIsEmptiedRatherThanCarried is the one break the store
// makes on purpose: a file written by the older shapes of this server holds runs
// of a codec this build refuses to play, and is emptied out once — the version in
// the file says whether that has happened, and a file that says so is left alone.
func TestADatabaseOfTheOldTapeIsEmptiedRatherThanCarried(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chat.db")
	{
		st, err := Open(path)
		if err != nil {
			t.Fatalf("open: %v", err)
		}
		recording(t, st, "old", 150)
		live(t, st, "live-1", 1_700_000_000_000)
		if _, err := st.AppendChunk("live-1", slice(0, 60, `[[1,2,3]]`, `[]`), false, 1_700_000_001_000); err != nil {
			t.Fatalf("slice: %v", err)
		}
		say(t, st, Message{Tape: "old", UserID: 9, Parts: []Part{{Kind: "text", Text: "старое"}}, SentMs: 1})
		if err := st.Close(); err != nil {
			t.Fatalf("close: %v", err)
		}
	}
	// The file is made to say it is of an older shape, which is what a database
	// written before there was a version marker reads as.
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatalf("open by hand: %v", err)
	}
	if _, err := db.Exec(`PRAGMA user_version = 0`); err != nil {
		t.Fatalf("unmark the shape: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close by hand: %v", err)
	}

	// Reopened, the file is emptied of its old runs and the messages said about
	// them, and works from there as a store of this shape.
	st, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	list, err := st.Recordings(now)
	if err != nil || len(list) != 0 {
		t.Fatalf("after the clearing the hall holds %d recordings (%v), want none", len(list), err)
	}
	if _, err := st.Tape("old"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an old run came back: %v, want ErrNotFound", err)
	}
	if lines, err := st.Messages("old", 0); err != nil || len(lines) != 0 {
		t.Fatalf("the messages of an old run came back: %d lines (%v)", len(lines), err)
	}
	// ...and it takes new work: a run and a live slice round trip on the same
	// file, and reopening again leaves them alone.
	recording(t, st, "new", 150)
	live(t, st, "live-2", 1_800_000_000_000)
	if _, err := st.AppendChunk("live-2", slice(0, 60, `[[1,2,3]]`, `[]`), false, 1_800_000_001_000); err != nil {
		t.Fatalf("slice of a new run: %v", err)
	}
	if err := st.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	again, err := Open(path)
	if err != nil {
		t.Fatalf("reopen again: %v", err)
	}
	t.Cleanup(func() { again.Close() })
	if kept, err := again.Recordings(now); err != nil || len(kept) != 2 {
		t.Fatalf("a reopened store of this shape holds %d recordings (%v), want the two", len(kept), err)
	}
}
