package ui

import (
	"fmt"
	"strings"
	"time"
)

var spanishMonths = []string{
	"", "ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "set", "oct", "nov", "dic",
}

// FormatCycleDate formats an ISO 8601 date string into a friendly Spanish date (e.g., "28 ene 2027").
// Returns an empty string if dateStr is nil, empty, or unparseable.
func FormatCycleDate(dateStr *string) string {
	if dateStr == nil {
		return ""
	}
	raw := strings.TrimSpace(*dateStr)
	if raw == "" || raw == "null" || raw == "undefined" || strings.HasPrefix(raw, "0001-01-01") {
		return ""
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", raw)
		if err != nil {
			t, err = time.Parse("2006-01-02", raw)
			if err != nil {
				return ""
			}
		}
	}
	if t.Year() <= 1 {
		return ""
	}
	m := int(t.Month())
	monthName := t.Month().String()
	if m >= 1 && m <= 12 {
		monthName = spanishMonths[m]
	}
	return fmt.Sprintf("%d %s %d", t.Day(), monthName, t.Year())
}

// FormatRelativeSync returns a friendly relative timestamp in Spanish (e.g. "Hace 2 min").
func FormatRelativeSync(dateStr *string, now time.Time) string {
	if dateStr == nil {
		return ""
	}
	raw := strings.TrimSpace(*dateStr)
	if raw == "" || raw == "null" || raw == "undefined" || strings.HasPrefix(raw, "0001-01-01") {
		return ""
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", raw)
		if err != nil {
			return ""
		}
	}
	if t.Year() <= 1 {
		return ""
	}

	diff := now.Sub(t)
	if diff < 0 {
		diff = 0
	}
	if diff < time.Minute {
		return "Hace un momento"
	}
	if diff < time.Hour {
		mins := int(diff.Minutes())
		if mins == 1 {
			return "Hace 1 min"
		}
		return fmt.Sprintf("Hace %d min", mins)
	}
	if diff < 24*time.Hour {
		hrs := int(diff.Hours())
		if hrs == 1 {
			return "Hace 1 hora"
		}
		return fmt.Sprintf("Hace %d horas", hrs)
	}
	return FormatCycleDate(dateStr)
}
