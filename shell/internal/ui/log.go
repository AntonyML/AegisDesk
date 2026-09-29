package ui

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	maxLogSize = 5 * 1024 * 1024
	maxLogAge  = 90 * 24 * time.Hour
)

var sensitiveLogPattern = regexp.MustCompile(`(?i)(bearer\s+)[^\s]+|[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+`)

type Logger struct {
	mu   sync.Mutex
	file *os.File
}

func NewLogger(root string) (*Logger, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create log directory: %w", err)
	}
	if err := rotateLog(root); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(root, "shell.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open shell log: %w", err)
	}
	return &Logger{file: file}, nil
}

func (l *Logger) Printf(format string, args ...any) {
	if l == nil || l.file == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	message := fmt.Sprintf(format, args...)
	message = sensitiveLogPattern.ReplaceAllStringFunc(message, func(value string) string {
		if strings.HasPrefix(strings.ToLower(value), "bearer") {
			return "Bearer [REDACTED]"
		}
		return "[REDACTED]"
	})
	log.New(l.file, "", log.LstdFlags|log.LUTC).Println(message)
}

func rotateLog(root string) error {
	path := filepath.Join(root, "shell.log")
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("stat shell log: %w", err)
	}
	if info.Size() < maxLogSize && time.Since(info.ModTime()) < maxLogAge {
		return nil
	}
	rotated := filepath.Join(root, "shell.log.1")
	_ = os.Remove(rotated)
	if err := os.Rename(path, rotated); err != nil {
		return fmt.Errorf("rotate shell log: %w", err)
	}
	return nil
}

func (l *Logger) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	return l.file.Close()
}
