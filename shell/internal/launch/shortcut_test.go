package launch

import (
	"os"
	"path/filepath"
	"testing"
)

func TestShortcutIconSelectionPriority(t *testing.T) {
	tempDir := t.TempDir()
	exePath := filepath.Join(tempDir, "AegisDesk.exe")
	if err := os.WriteFile(exePath, []byte("fake-exe"), 0o755); err != nil {
		t.Fatal(err)
	}

	shellIco := filepath.Join(tempDir, "aegis_shell.ico")
	setupIco := filepath.Join(tempDir, "aegisdesk.ico")

	if err := os.WriteFile(setupIco, []byte("fake-setup-ico"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(shellIco, []byte("fake-shell-ico"), 0o644); err != nil {
		t.Fatal(err)
	}

	candidates := []string{
		filepath.Join(tempDir, "aegis_shell.ico"),
		filepath.Join(tempDir, "assets", "aegis_shell.ico"),
		filepath.Join(tempDir, "aegisdesk.ico"),
	}

	selected := exePath
	for _, c := range candidates {
		if fileExists(c) {
			selected = c
			break
		}
	}

	if selected != shellIco {
		t.Fatalf("expected aegis_shell.ico to be prioritized over aegisdesk.ico, got %s", selected)
	}
}
