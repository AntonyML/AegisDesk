package ui

import (
	"testing"
	"time"
)

func TestIsSafeURL(t *testing.T) {
	safe := []string{
		"https://aegisdesk.tonyml.com/tickets",
		"https://example.com/help?id=123",
		"mailto:soporte@example.test",
		"tel:+50622223333",
		"tel:22223333",
	}
	for _, u := range safe {
		if !IsSafeURL(u) {
			t.Errorf("expected %q to be safe", u)
		}
	}

	unsafe := []string{
		"http://insecure.test",
		"file:///C:/Windows/System32/calc.exe",
		"powershell.exe -enc ...",
		"javascript:alert(1)",
		"cmd.exe /c del /f",
		"shell:startup",
		"",
		"   ",
		"data:text/html,<html>",
	}
	for _, u := range unsafe {
		if IsSafeURL(u) {
			t.Errorf("expected %q to be rejected as unsafe", u)
		}
	}
}

func TestFormatCycleDate(t *testing.T) {
	date := "2027-01-28T15:04:05.000Z"
	formatted := FormatCycleDate(&date)
	if formatted != "28 ene 2027" {
		t.Fatalf("expected '28 ene 2027', got %q", formatted)
	}

	// Null / invalid tests
	if got := FormatCycleDate(nil); got != "" {
		t.Fatalf("expected empty for nil, got %q", got)
	}
	zero := "0001-01-01T00:00:00Z"
	if got := FormatCycleDate(&zero); got != "" {
		t.Fatalf("expected empty for zero date, got %q", got)
	}
	invalid := "invalid-date"
	if got := FormatCycleDate(&invalid); got != "" {
		t.Fatalf("expected empty for invalid date, got %q", got)
	}
}

func TestFormatRelativeSync(t *testing.T) {
	now := time.Date(2027, 1, 28, 12, 0, 0, 0, time.UTC)

	justNow := now.Add(-30 * time.Second).Format(time.RFC3339)
	if got := FormatRelativeSync(&justNow, now); got != "Hace un momento" {
		t.Fatalf("expected 'Hace un momento', got %q", got)
	}

	twoMins := now.Add(-2 * time.Minute).Format(time.RFC3339)
	if got := FormatRelativeSync(&twoMins, now); got != "Hace 2 min" {
		t.Fatalf("expected 'Hace 2 min', got %q", got)
	}

	threeHours := now.Add(-3 * time.Hour).Format(time.RFC3339)
	if got := FormatRelativeSync(&threeHours, now); got != "Hace 3 horas" {
		t.Fatalf("expected 'Hace 3 horas', got %q", got)
	}
}
