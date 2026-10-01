// Command garden-server is the hall's own server: the recordings players send in,
// the chat they write against them, and the reactions they leave — all of it in
// one SQLite file (`internal/store`) behind one HTTP API (`internal/api`).
//
// It is one binary and one file on purpose. The game is a page of static files
// that any web server can hand out; the only thing a page cannot do for itself
// is remember what other players said, and that is what this is. So it needs
// nothing beside its database but the site it belongs to, and is run as:
//
//	garden-server -addr :8080 -db data/garden.db \
//		-auth-url https://plllasma.ru/api/user-by-token.php
//
// Behind a reverse proxy it wants nothing of its own: no TLS here, no domain
// here — the proxy terminates both, and this server speaks plain HTTP to a
// socket only the proxy can reach. The two things it does take from a request
// are the JSON body of a tape and the body of a message, and both are capped
// (`internal/api`), so a proxy's own body limit is a second lock rather than
// the only one.
//
// The auth URL is the one thing it cannot run without: every door but the
// monitor's takes a token — the site's own browser session — and asks that
// address whose it is (`internal/api/auth.go`). The flag reads the
// `GARDEN_AUTH_URL` environment variable as its default, which is how the
// docker development stack hands one over without a flag at all.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"garden/backend/internal/api"
	"garden/backend/internal/store"
)

func main() {
	addr := flag.String("addr", ":8080", "the address to listen on")
	path := flag.String("db", filepath.Join("data", "garden.db"), "the SQLite file to keep everything in")
	authURL := flag.String("auth-url", os.Getenv("GARDEN_AUTH_URL"),
		"the site's own api/user-by-token.php, the door every token is asked about at")
	flag.Parse()

	// A server that cannot ask the site about a token cannot answer for anybody,
	// and every door but the monitor's needs it: refusing to start, with a
	// sentence that says what is missing, beats running as a hall nobody can
	// talk their way into.
	if strings.TrimSpace(*authURL) == "" {
		log.Fatal("garden-server: -auth-url (or GARDEN_AUTH_URL) is required — " +
			"the address of the site's api/user-by-token.php")
	}
	options := []api.Option{api.WithAuthURL(*authURL)}

	// The database's directory is the server's business: a first run on a
	// fresh machine has no `data/` yet, and a server that refuses to start
	// because its own folder is missing is a server with a chore.
	if dir := filepath.Dir(*path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("garden-server: cannot make %s: %v", dir, err)
		}
	}

	db, err := store.Open(*path)
	if err != nil {
		log.Fatalf("garden-server: %v", err)
	}
	defer db.Close()

	server := &http.Server{
		Addr:    *addr,
		Handler: api.New(db, options...),
		// A header that never finishes arriving is the cheapest way to hold a
		// connection open, and this server has one thread of attention per
		// connection; the timeouts are what it costs to keep that true.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       5 * time.Minute,
	}

	// The listener is a goroutine so that the main one can wait for a signal:
	// a server that is killed mid-write is a database that has to recover, and
	// a chat's afternoon is worth a graceful stop.
	done := make(chan error, 1)
	go func() {
		log.Printf("garden-server: listening on %s, keeping everything in %s", *addr, *path)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			done <- err
			return
		}
		done <- nil
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-done:
		if err != nil {
			log.Fatalf("garden-server: %v", err)
		}
	case signal := <-stop:
		log.Printf("garden-server: %s — stopping", signal)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("garden-server: shutdown: %v", err)
		}
	}
	fmt.Println("garden-server: stopped")
}
