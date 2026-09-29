package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

var ErrNotConfigured = errors.New("aegisdesk is not configured")

type Store struct {
	Root string
}

func DefaultStore() Store {
	root := os.Getenv("ProgramData")
	if root == "" {
		root = `C:\ProgramData`
	}
	return Store{Root: filepath.Join(root, "AegisDesk")}
}

func (s Store) Ensure() error {
	if err := os.MkdirAll(s.Root, 0o700); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	return nil
}

func (s Store) LoadConfig() (Config, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "config.json"))
	if errors.Is(err, os.ErrNotExist) {
		return Config{}, ErrNotConfigured
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	if config.WorkerBaseURL == "" || config.InstallID == "" || config.Token == "" || config.SIDCTarget == "" {
		return Config{}, fmt.Errorf("config is incomplete")
	}
	return config, nil
}

func (s Store) SaveConfig(config Config) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("config.json", config)
}

func (s Store) LoadCache() (string, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "state.jwt"))
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotConfigured
	}
	if err != nil {
		return "", fmt.Errorf("read state cache: %w", err)
	}
	return string(data), nil
}

func (s Store) SaveCache(token string) error {
	if token == "" || len(token) > 128*1024 {
		return fmt.Errorf("state token has invalid size")
	}
	if err := s.Ensure(); err != nil {
		return err
	}
	tmp := filepath.Join(s.Root, ".state.jwt.tmp")
	if err := os.WriteFile(tmp, []byte(token), 0o600); err != nil {
		return fmt.Errorf("write state cache: %w", err)
	}
	if err := replaceFile(tmp, filepath.Join(s.Root, "state.jwt")); err != nil {
		return fmt.Errorf("replace state cache: %w", err)
	}
	return nil
}

func (s Store) LoadShellConfig() (ShellConfig, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "shell_config.json"))
	if errors.Is(err, os.ErrNotExist) {
		return ShellConfig{}, ErrNotConfigured
	}
	if err != nil {
		return ShellConfig{}, fmt.Errorf("read shell config cache: %w", err)
	}
	var config ShellConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return ShellConfig{}, fmt.Errorf("parse shell config cache: %w", err)
	}
	return config, nil
}

func (s Store) SaveShellConfig(config ShellConfig) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("shell_config.json", config)
}

func (s Store) atomicJSON(name string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	tmp := filepath.Join(s.Root, "."+name+".tmp")
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	if err := replaceFile(tmp, filepath.Join(s.Root, name)); err != nil {
		return fmt.Errorf("replace %s: %w", name, err)
	}
	return nil
}

func replaceFile(source, destination string) error {
	if err := os.Remove(destination); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(source, destination)
}
