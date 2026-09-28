package launch

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func ValidateTarget(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("SIDC target is empty")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve SIDC target: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("stat SIDC target: %w", err)
	}
	if info.IsDir() || !strings.EqualFold(filepath.Ext(abs), ".exe") {
		return "", fmt.Errorf("SIDC target is not an executable")
	}
	return abs, nil
}

func Start(ctx context.Context, target string) error {
	abs, err := ValidateTarget(target)
	if err != nil {
		return err
	}
	command := exec.CommandContext(ctx, abs)
	command.Dir = filepath.Dir(abs)
	if err := command.Start(); err != nil {
		return fmt.Errorf("start SIDC: %w", err)
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("release SIDC process: %w", err)
	}
	return nil
}
