package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// User is one of the site's own players, as the site answered about them: the
// id and the nickname the whole site knows them by, and the name of their
// userpic — the file the site keeps at `/i/<icon>.gif`, which is the page's
// business to read and this server's to pass on untouched.
//
// The token that asked for them is the browser session's own (`logkey` in the
// site's `tbl_users`, handed out at login and kept in the `contortion_key`
// cookie): the page sends it here as `X-Auth-Token`, and this server asks the
// site about it rather than the site's database — the site's own door
// (`api/user-by-token.php`) is the one place that knows what a token means, and
// a second opinion about it here would be a copy of the site that drifts.
type User struct {
	ID   int64  `json:"id"`
	Nick string `json:"nick"`
	Icon string `json:"icon"`
}

// errNoAuth is a caller the site would not answer for: no token at all, or one
// that is nobody's. It is what a handler turns into a 401 — the same word the
// site's own door uses, so a page that is not signed in reads one refusal
// wherever it knocks.
var errNoAuth = errors.New("the site did not answer for this token")

// tokenOf reads the token off a request: the one header every door of this
// server takes it from, which is also the one the site's own door names first.
func tokenOf(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get("X-Auth-Token"))
}

// authTTL is how long this server remembers what the site said about a token,
// so that a chat polling every two seconds is not a question about a session
// every two seconds. A minute is many polls and a short life for a guess: the
// site's own sessions live a week, and a token that stops being answered for
// is forgotten within the minute.
const authTTL = time.Minute

// siteAuth is the site's own door as this server calls it: a URL, a client
// that gives up quickly, and the answers it has asked for lately.
//
// The call is the server-to-server kind the site's door was written for: no
// cookies, no rotating of the token — the browser session the token belongs to
// must keep working after the game has asked about it — and the token goes in
// the `X-Auth-Token` header.
type siteAuth struct {
	url    string
	client *http.Client
	mu     sync.Mutex
	known  map[string]knownUser
}

// knownUser is one answer of the site's, and how much longer this server
// stands by it.
type knownUser struct {
	user User
	until time.Time
}

// newSiteAuth is the asking itself, as a `Server` wants it (`WithAuthURL`): a
// function from a token to the user the site says owns it.
func newSiteAuth(url string) func(string) (User, error) {
	s := siteAuth{
		url:    url,
		client: &http.Client{Timeout: 10 * time.Second},
		known:  map[string]knownUser{},
	}
	return s.user
}

// user is who a token belongs to, as the site says and as this server
// remembers it.
func (s *siteAuth) user(token string) (User, error) {
	if token == "" {
		return User{}, errNoAuth
	}
	s.mu.Lock()
	known, fresh := s.known[token]
	s.mu.Unlock()
	if fresh && time.Now().Before(known.until) {
		return known.user, nil
	}

	request, err := http.NewRequest(http.MethodGet, s.url, nil)
	if err != nil {
		return User{}, fmt.Errorf("the site could not be asked about the token: %w", err)
	}
	request.Header.Set("X-Auth-Token", token)
	answer, err := s.client.Do(request)
	if err != nil {
		return User{}, fmt.Errorf("the site could not be asked about the token: %w", err)
	}
	defer answer.Body.Close()
	if answer.StatusCode == http.StatusUnauthorized {
		return User{}, errNoAuth
	}
	if answer.StatusCode != http.StatusOK {
		return User{}, fmt.Errorf("the site answered %d about a token", answer.StatusCode)
	}

	// The site's own answer: the fields it names are its camelCase ones
	// (`api/user-by-token.php`), including the address of the userpics folder —
	// which is the page's to build for itself and this server's to drop.
	var body struct {
		UserID    int64  `json:"userId"`
		Nick      string `json:"nick"`
		Icon      string `json:"icon"`
		IconsPath string `json:"iconsPath"`
	}
	if err := json.NewDecoder(io.LimitReader(answer.Body, 1<<16)).Decode(&body); err != nil {
		return User{}, fmt.Errorf("the site's answer about a token is not readable: %w", err)
	}
	if body.UserID == 0 || strings.TrimSpace(body.Nick) == "" {
		return User{}, fmt.Errorf("the site answered about a token without saying who it is")
	}
	user := User{ID: body.UserID, Nick: body.Nick, Icon: body.Icon}
	if user.Icon == "" {
		// The site's own word for a player with no userpic is the minus file,
		// and a page that draws `/i/<icon>.gif` needs one name or the other.
		user.Icon = "-"
	}

	s.mu.Lock()
	s.known[token] = knownUser{user: user, until: time.Now().Add(authTTL)}
	s.mu.Unlock()
	return user, nil
}
