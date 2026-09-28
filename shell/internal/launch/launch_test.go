package launch

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateTargetRequiresExecutableFile(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "SIDC test.exe")
	if err := os.WriteFile(target, []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := ValidateTarget(target)
	if err != nil || got != target {
		t.Fatalf("expected valid target, got %q %v", got, err)
	}
	if _, err := ValidateTarget(filepath.Join(root, "missing.exe")); err == nil {
		t.Fatal("expected missing target error")
	}
}
