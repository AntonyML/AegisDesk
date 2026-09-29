package ui

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/pkg/browser"
)

// IsSafeURL verifies that a URL uses an explicitly allowed safe protocol:
// https:, mailto:, or tel:.
// Rejects file:, powershell:, cmd:, javascript:, shell:, plain http, and arbitrary schemes.
func IsSafeURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	switch scheme {
	case "https", "mailto", "tel":
		return true
	default:
		return false
	}
}

// OpenSafeURL opens a URL in the user's default browser or handler only if safe.
func OpenSafeURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if !IsSafeURL(raw) {
		return fmt.Errorf("insecure or unsupported URL scheme: %q", raw)
	}
	return browser.OpenURL(raw)
}
